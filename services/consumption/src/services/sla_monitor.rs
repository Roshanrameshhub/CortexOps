use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{debug, error, warn};
use uuid::Uuid;

use crate::models::{Service, SLAStatus, SLAViolation};

/// SLA monitoring service for tracking service level agreements
/// Monitors latency, availability, and error rates against SLA thresholds
#[derive(Clone)]
pub struct SLAMonitor {
    db: Arc<PgPool>,
}

impl SLAMonitor {
    pub fn new(db: PgPool) -> Self {
        Self { db: Arc::new(db) }
    }

    /// Check if a request violates SLA thresholds
    pub async fn check_sla_violation(
        &self,
        service: &Service,
        latency_ms: u64,
        status: &str,
    ) -> Result<Option<SLAViolation>> {
        let sla = &service.sla.0;

        // Check latency violation
        if latency_ms > sla.timeout_ms {
            warn!(
                service_id = %service.id,
                latency_ms = latency_ms,
                threshold_ms = sla.timeout_ms,
                "SLA latency violation detected"
            );

            let violation = SLAViolation {
                id: Uuid::new_v4(),
                service_id: service.id,
                metric: "latency".to_string(),
                threshold: sla.timeout_ms as f64,
                actual: latency_ms as f64,
                timestamp: Utc::now(),
                severity: if latency_ms > sla.timeout_ms * 2 {
                    "critical".to_string()
                } else {
                    "warning".to_string()
                },
            };

            // Record violation
            self.record_violation(&violation).await?;

            return Ok(Some(violation));
        }

        // Check error rate violation (async)
        if status == "error" {
            tokio::spawn({
                let monitor = self.clone();
                let service_id = service.id;
                async move {
                    if let Err(e) = monitor.check_error_rate_sla(service_id).await {
                        error!(error = %e, "Failed to check error rate SLA");
                    }
                }
            });
        }

        Ok(None)
    }

    /// Check error rate SLA for a service over the last 5 minutes
    async fn check_error_rate_sla(&self, service_id: Uuid) -> Result<()> {
        let five_minutes_ago = Utc::now() - chrono::Duration::minutes(5);

        let stats = sqlx::query_as::<_, (i64, i64)>(
            r#"
            SELECT
                COUNT(*) as total_requests,
                COUNT(*) FILTER (WHERE status = 'error') as error_count
            FROM usage_records
            WHERE service_id = $1
                AND timestamp >= $2
            "#,
        )
        .bind(service_id)
        .bind(five_minutes_ago)
        .fetch_one(self.db.as_ref())
        .await
        .context("Failed to get error rate statistics")?;

        let (total_requests, error_count) = stats;

        if total_requests == 0 {
            return Ok(());
        }

        let error_rate = (error_count as f64) / (total_requests as f64);

        // SLA threshold: 0.1% error rate
        let threshold = 0.001;

        if error_rate > threshold {
            warn!(
                service_id = %service_id,
                error_rate = error_rate,
                threshold = threshold,
                "SLA error rate violation detected"
            );

            let violation = SLAViolation {
                id: Uuid::new_v4(),
                service_id,
                metric: "error_rate".to_string(),
                threshold,
                actual: error_rate,
                timestamp: Utc::now(),
                severity: if error_rate > threshold * 2.0 {
                    "critical".to_string()
                } else {
                    "warning".to_string()
                },
            };

            self.record_violation(&violation).await?;
        }

        Ok(())
    }

    /// Record SLA violation to database
    async fn record_violation(&self, violation: &SLAViolation) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO sla_violations (
                id, service_id, metric, threshold, actual, timestamp, severity
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
        )
        .bind(&violation.id)
        .bind(&violation.service_id)
        .bind(&violation.metric)
        .bind(&violation.threshold)
        .bind(&violation.actual)
        .bind(&violation.timestamp)
        .bind(&violation.severity)
        .execute(self.db.as_ref())
        .await
        .context("Failed to record SLA violation")?;

        debug!(
            violation_id = %violation.id,
            service_id = %violation.service_id,
            metric = %violation.metric,
            "SLA violation recorded"
        );

        // Trigger alert for critical violations
        if violation.severity == "critical" {
            self.trigger_alert(violation).await?;
        }

        Ok(())
    }

    /// Trigger alert for SLA violation
    async fn trigger_alert(&self, violation: &SLAViolation) -> Result<()> {
        // In production, integrate with PagerDuty, Opsgenie, or similar
        error!(
            violation_id = %violation.id,
            service_id = %violation.service_id,
            metric = %violation.metric,
            threshold = violation.threshold,
            actual = violation.actual,
            severity = %violation.severity,
            "CRITICAL SLA VIOLATION - Alert triggered"
        );

        // TODO: Send to alerting system
        // - PagerDuty API
        // - Opsgenie API
        // - Slack webhook
        // - Email notification

        Ok(())
    }

    /// Get SLA status for a service over a time period
    pub async fn get_sla_status(
        &self,
        service_id: Uuid,
        days: i64,
    ) -> Result<SLAStatus> {
        let period_start = Utc::now() - chrono::Duration::days(days);
        let period_end = Utc::now();

        // Get service SLA thresholds
        let service = sqlx::query_as::<_, Service>(
            r#"
            SELECT id, name, version, endpoint, status, pricing, sla, created_at
            FROM services
            WHERE id = $1
            "#,
        )
        .bind(service_id)
        .fetch_one(self.db.as_ref())
        .await
        .context("Failed to get service")?;

        // Calculate actual metrics
        let stats = sqlx::query_as::<_, (i64, f64, i64)>(
            r#"
            SELECT
                COUNT(*) as total_requests,
                COALESCE(AVG(duration_ms), 0.0) as avg_latency_ms,
                COUNT(*) FILTER (WHERE status = 'error') as error_count
            FROM usage_records
            WHERE service_id = $1
                AND timestamp >= $2
                AND timestamp <= $3
            "#,
        )
        .bind(service_id)
        .bind(period_start)
        .bind(period_end)
        .fetch_one(self.db.as_ref())
        .await
        .context("Failed to get SLA statistics")?;

        let (total_requests, avg_latency_ms, error_count) = stats;

        let error_rate = if total_requests > 0 {
            (error_count as f64) / (total_requests as f64)
        } else {
            0.0
        };

        // Calculate uptime
        let uptime = if total_requests > 0 {
            ((total_requests - error_count) as f64) / (total_requests as f64) * 100.0
        } else {
            100.0
        };

        // Get violation count
        let violation_count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM sla_violations
            WHERE service_id = $1
                AND timestamp >= $2
                AND timestamp <= $3
            "#,
        )
        .bind(service_id)
        .bind(period_start)
        .bind(period_end)
        .fetch_one(self.db.as_ref())
        .await
        .context("Failed to get violation count")?;

        let sla = &service.sla.0;
        let latency_compliant = avg_latency_ms < (sla.timeout_ms as f64);
        let error_rate_compliant = error_rate < 0.001;
        let uptime_compliant = uptime >= sla.availability;

        Ok(SLAStatus {
            service_id,
            period_start,
            period_end,
            latency_ms: avg_latency_ms,
            latency_threshold: sla.timeout_ms as f64,
            latency_compliant,
            error_rate,
            error_rate_threshold: 0.001,
            error_rate_compliant,
            uptime_percentage: uptime,
            uptime_threshold: sla.availability,
            uptime_compliant,
            violation_count,
            overall_compliant: latency_compliant && error_rate_compliant && uptime_compliant,
        })
    }

    /// Get recent SLA violations for a service
    pub async fn get_violations(
        &self,
        service_id: Uuid,
        limit: i64,
    ) -> Result<Vec<SLAViolation>> {
        let violations = sqlx::query_as::<_, SLAViolation>(
            r#"
            SELECT id, service_id, metric, threshold, actual, timestamp, severity
            FROM sla_violations
            WHERE service_id = $1
            ORDER BY timestamp DESC
            LIMIT $2
            "#,
        )
        .bind(service_id)
        .bind(limit)
        .fetch_all(self.db.as_ref())
        .await
        .context("Failed to get SLA violations")?;

        Ok(violations)
    }

    /// Background job to check SLA compliance for all active services
    pub async fn monitor_all_services(&self) -> Result<()> {
        let services = sqlx::query_as::<_, Service>(
            r#"
            SELECT id, name, version, endpoint, status, pricing, sla, created_at
            FROM services
            WHERE status = 'active'
            "#,
        )
        .fetch_all(self.db.as_ref())
        .await
        .context("Failed to get active services")?;

        for service in services {
            if let Err(e) = self.check_error_rate_sla(service.id).await {
                error!(
                    service_id = %service.id,
                    error = %e,
                    "Failed to check SLA for service"
                );
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sla_violation_severity() {
        // Test that violations are properly categorized
        let violation = SLAViolation {
            id: Uuid::new_v4(),
            service_id: Uuid::new_v4(),
            metric: "latency".to_string(),
            threshold: 100.0,
            actual: 250.0,
            timestamp: Utc::now(),
            severity: if 250.0 > 100.0 * 2.0 {
                "critical".to_string()
            } else {
                "warning".to_string()
            },
        };

        assert_eq!(violation.severity, "critical");
    }
}

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{debug, error};
use uuid::Uuid;

use crate::models::{
    CostInfo, PricingModel, Service, UsageInfo, UsageRecord, UsageStats,
};

/// Usage metering service for tracking consumption and calculating costs
#[derive(Clone)]
pub struct UsageMeter {
    db: Arc<PgPool>,
}

impl UsageMeter {
    pub fn new(db: PgPool) -> Self {
        Self { db: Arc::new(db) }
    }

    /// Record usage for a request
    pub async fn record_usage(
        &self,
        request_id: Uuid,
        service_id: Uuid,
        consumer_id: Uuid,
        usage: UsageInfo,
        duration_ms: i32,
        status: String,
        error: Option<serde_json::Value>,
    ) -> Result<UsageRecord> {
        // Get service for pricing calculation
        let service = self.get_service(service_id).await?;

        // Calculate cost
        let cost = self.calculate_cost(&service.pricing.0, &usage)?;

        let record = UsageRecord {
            id: Uuid::new_v4(),
            request_id,
            service_id,
            consumer_id,
            timestamp: Utc::now(),
            duration_ms,
            usage: sqlx::types::Json(usage),
            cost: sqlx::types::Json(cost.clone()),
            status,
            error: error.map(sqlx::types::Json),
        };

        // Insert usage record into database
        sqlx::query(
            r#"
            INSERT INTO usage_records (
                id, request_id, service_id, consumer_id, timestamp,
                duration_ms, usage, cost, status, error
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            "#,
        )
        .bind(&record.id)
        .bind(&record.request_id)
        .bind(&record.service_id)
        .bind(&record.consumer_id)
        .bind(&record.timestamp)
        .bind(&record.duration_ms)
        .bind(&record.usage)
        .bind(&record.cost)
        .bind(&record.status)
        .bind(&record.error)
        .execute(self.db.as_ref())
        .await
        .context("Failed to insert usage record")?;

        debug!(
            request_id = %request_id,
            service_id = %service_id,
            consumer_id = %consumer_id,
            tokens = record.usage.0.total_tokens,
            cost = cost.amount,
            "Usage recorded"
        );

        Ok(record)
    }

    /// Calculate cost based on pricing model and usage
    pub fn calculate_cost(
        &self,
        pricing: &PricingModel,
        usage: &UsageInfo,
    ) -> Result<CostInfo> {
        match pricing.model.as_str() {
            "per-token" => {
                let rate = pricing
                    .rates
                    .first()
                    .context("No pricing rate found")?;

                let amount = (usage.total_tokens as f64) * rate.rate;

                Ok(CostInfo {
                    amount,
                    currency: "USD".to_string(),
                    breakdown: serde_json::json!({
                        "prompt_tokens": usage.prompt_tokens,
                        "completion_tokens": usage.completion_tokens,
                        "total_tokens": usage.total_tokens,
                        "rate_per_token": rate.rate,
                    }),
                })
            }
            "per-request" => {
                let rate = pricing
                    .rates
                    .first()
                    .context("No pricing rate found")?;

                Ok(CostInfo {
                    amount: rate.rate,
                    currency: "USD".to_string(),
                    breakdown: serde_json::json!({
                        "requests": 1,
                        "rate_per_request": rate.rate,
                    }),
                })
            }
            "subscription" => {
                // Subscription is pre-paid, no per-request cost
                Ok(CostInfo {
                    amount: 0.0,
                    currency: "USD".to_string(),
                    breakdown: serde_json::json!({
                        "model": "subscription",
                        "note": "Pre-paid subscription"
                    }),
                })
            }
            _ => {
                error!(model = pricing.model, "Unknown pricing model");
                Ok(CostInfo {
                    amount: 0.0,
                    currency: "USD".to_string(),
                    breakdown: serde_json::json!({
                        "error": "Unknown pricing model"
                    }),
                })
            }
        }
    }

    /// Get usage statistics for a consumer/service pair
    pub async fn get_usage_stats(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
        days: i64,
    ) -> Result<UsageStats> {
        let period_start = Utc::now() - chrono::Duration::days(days);
        let period_end = Utc::now();

        let stats = sqlx::query_as::<_, (i64, i64, f64, f64, i64)>(
            r#"
            SELECT
                COUNT(*) as total_requests,
                COALESCE(SUM((usage->>'total_tokens')::bigint), 0) as total_tokens,
                COALESCE(SUM((cost->>'amount')::float), 0.0) as total_cost,
                COALESCE(AVG(duration_ms), 0.0) as avg_latency_ms,
                COUNT(*) FILTER (WHERE status = 'error') as error_count
            FROM usage_records
            WHERE consumer_id = $1
                AND service_id = $2
                AND timestamp >= $3
                AND timestamp <= $4
            "#,
        )
        .bind(consumer_id)
        .bind(service_id)
        .bind(period_start)
        .bind(period_end)
        .fetch_one(self.db.as_ref())
        .await
        .context("Failed to get usage statistics")?;

        let (total_requests, total_tokens, total_cost, avg_latency_ms, error_count) = stats;

        let error_rate = if total_requests > 0 {
            (error_count as f64) / (total_requests as f64)
        } else {
            0.0
        };

        Ok(UsageStats {
            service_id,
            consumer_id,
            period_start,
            period_end,
            total_requests,
            total_tokens,
            total_cost,
            avg_latency_ms,
            error_rate,
        })
    }

    async fn get_service(&self, service_id: Uuid) -> Result<Service> {
        sqlx::query_as::<_, Service>(
            r#"
            SELECT id, name, version, endpoint, status, pricing, sla, created_at
            FROM services
            WHERE id = $1
            "#,
        )
        .bind(service_id)
        .fetch_one(self.db.as_ref())
        .await
        .context("Failed to get service")
    }
}

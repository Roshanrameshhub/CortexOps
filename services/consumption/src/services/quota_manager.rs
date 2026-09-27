use anyhow::{Context, Result};
use chrono::{DateTime, Datelike, Duration, Utc};
use redis::{aio::ConnectionManager, AsyncCommands};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::models::{QuotaStatus, ServiceTier, UsageInfo};

/// Quota manager for tracking and enforcing usage limits
#[derive(Clone)]
pub struct QuotaManager {
    redis: Arc<ConnectionManager>,
    db: Arc<PgPool>,
}

impl QuotaManager {
    pub fn new(redis: ConnectionManager, db: PgPool) -> Self {
        Self {
            redis: Arc::new(redis),
            db: Arc::new(db),
        }
    }

    /// Check if quota is available
    pub async fn check_quota(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
        tier: &ServiceTier,
    ) -> Result<QuotaStatus> {
        let key = self.quota_key(consumer_id, service_id);
        let mut conn = self.redis.as_ref().clone();

        // Get current usage from Redis cache
        let used_tokens: Option<i64> = conn
            .get(&key)
            .await
            .context("Failed to get quota from Redis")?;

        let used_tokens = used_tokens.unwrap_or(0);
        let total_tokens = tier.quota_limit();
        let remaining_tokens = total_tokens - used_tokens;
        let exceeded = remaining_tokens <= 0;

        let reset_at = self.get_quota_reset_time();

        debug!(
            consumer_id = %consumer_id,
            service_id = %service_id,
            used_tokens = used_tokens,
            total_tokens = total_tokens,
            exceeded = exceeded,
            "Quota check"
        );

        Ok(QuotaStatus {
            service_id,
            consumer_id,
            tier: tier.clone(),
            used_tokens,
            total_tokens,
            remaining_tokens,
            reset_at,
            exceeded,
        })
    }

    /// Update quota after consumption
    pub async fn update_quota(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
        usage: &UsageInfo,
    ) -> Result<()> {
        let key = self.quota_key(consumer_id, service_id);
        let mut conn = self.redis.as_ref().clone();

        let tokens_used = usage.total_tokens as i64;

        // Increment usage in Redis
        conn.incr(&key, tokens_used)
            .await
            .context("Failed to increment quota")?;

        // Set expiry to end of month if not set
        let ttl: i64 = conn
            .ttl(&key)
            .await
            .context("Failed to get TTL")?;

        if ttl == -1 {
            let reset_time = self.get_quota_reset_time();
            let seconds_until_reset = (reset_time - Utc::now()).num_seconds();
            conn.expire(&key, seconds_until_reset as usize)
                .await
                .context("Failed to set expiry")?;
        }

        debug!(
            consumer_id = %consumer_id,
            service_id = %service_id,
            tokens_used = tokens_used,
            "Quota updated"
        );

        Ok(())
    }

    /// Reset quota (admin function)
    pub async fn reset_quota(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
    ) -> Result<()> {
        let key = self.quota_key(consumer_id, service_id);
        let mut conn = self.redis.as_ref().clone();

        conn.del(&key)
            .await
            .context("Failed to reset quota")?;

        debug!(
            consumer_id = %consumer_id,
            service_id = %service_id,
            "Quota reset"
        );

        Ok(())
    }

    /// Persist quota data from Redis to PostgreSQL (background job)
    pub async fn persist_quotas(&self) -> Result<()> {
        let mut conn = self.redis.as_ref().clone();

        // Scan for all quota keys
        let pattern = "quota:*";
        let keys: Vec<String> = conn
            .keys(pattern)
            .await
            .context("Failed to scan quota keys")?;

        for key in keys {
            let used_tokens: i64 = conn
                .get(&key)
                .await
                .unwrap_or(0);

            // Parse key to extract consumer_id and service_id
            if let Some((consumer_id, service_id)) = self.parse_quota_key(&key) {
                // Insert or update quota record in database
                sqlx::query(
                    r#"
                    INSERT INTO quota_usage (consumer_id, service_id, month, used_tokens, updated_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (consumer_id, service_id, month)
                    DO UPDATE SET used_tokens = $4, updated_at = NOW()
                    "#
                )
                .bind(consumer_id)
                .bind(service_id)
                .bind(self.current_month())
                .bind(used_tokens)
                .execute(self.db.as_ref())
                .await
                .context("Failed to persist quota")?;
            }
        }

        debug!(keys_persisted = keys.len(), "Quotas persisted to database");

        Ok(())
    }

    /// Load quotas from database to Redis (on startup)
    pub async fn load_quotas(&self) -> Result<()> {
        let records = sqlx::query_as::<_, (Uuid, Uuid, String, i64)>(
            r#"
            SELECT consumer_id, service_id, month, used_tokens
            FROM quota_usage
            WHERE month = $1
            "#
        )
        .bind(self.current_month())
        .fetch_all(self.db.as_ref())
        .await
        .context("Failed to load quotas from database")?;

        let mut conn = self.redis.as_ref().clone();

        for (consumer_id, service_id, _, used_tokens) in records {
            let key = self.quota_key(consumer_id, service_id);
            conn.set(&key, used_tokens)
                .await
                .context("Failed to set quota in Redis")?;

            let reset_time = self.get_quota_reset_time();
            let seconds_until_reset = (reset_time - Utc::now()).num_seconds();
            conn.expire(&key, seconds_until_reset as usize)
                .await
                .context("Failed to set expiry")?;
        }

        debug!(quotas_loaded = records.len(), "Quotas loaded from database");

        Ok(())
    }

    fn quota_key(&self, consumer_id: Uuid, service_id: Uuid) -> String {
        format!("quota:{}:{}", consumer_id, service_id)
    }

    fn parse_quota_key(&self, key: &str) -> Option<(Uuid, Uuid)> {
        let parts: Vec<&str> = key.split(':').collect();
        if parts.len() == 3 {
            let consumer_id = Uuid::parse_str(parts[1]).ok()?;
            let service_id = Uuid::parse_str(parts[2]).ok()?;
            Some((consumer_id, service_id))
        } else {
            None
        }
    }

    fn get_quota_reset_time(&self) -> DateTime<Utc> {
        let now = Utc::now();
        let year = now.year();
        let month = now.month();

        // First day of next month
        if month == 12 {
            Utc.with_ymd_and_hms(year + 1, 1, 1, 0, 0, 0).unwrap()
        } else {
            Utc.with_ymd_and_hms(year, month + 1, 1, 0, 0, 0).unwrap()
        }
    }

    fn current_month(&self) -> String {
        let now = Utc::now();
        format!("{}-{:02}", now.year(), now.month())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quota_key_parsing() {
        let manager = QuotaManager {
            redis: Arc::new(redis::Client::open("redis://localhost").unwrap().get_tokio_connection_manager()),
            db: Arc::new(PgPool::connect_lazy("postgres://localhost").unwrap()),
        };

        let consumer_id = Uuid::new_v4();
        let service_id = Uuid::new_v4();
        let key = manager.quota_key(consumer_id, service_id);

        let (parsed_consumer, parsed_service) = manager.parse_quota_key(&key).unwrap();
        assert_eq!(consumer_id, parsed_consumer);
        assert_eq!(service_id, parsed_service);
    }
}

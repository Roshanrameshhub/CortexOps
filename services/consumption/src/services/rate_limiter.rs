use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use redis::{aio::ConnectionManager, AsyncCommands, Script};
use std::sync::Arc;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::models::{RateLimitStatus, ServiceTier};

/// Redis-backed distributed rate limiter using token bucket algorithm
#[derive(Clone)]
pub struct RateLimiter {
    redis: Arc<ConnectionManager>,
}

impl RateLimiter {
    pub fn new(redis: ConnectionManager) -> Self {
        Self {
            redis: Arc::new(redis),
        }
    }

    /// Check rate limit using token bucket algorithm
    /// Returns Ok(RateLimitStatus) if allowed, Err if exceeded
    pub async fn check_rate_limit(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
        tier: &ServiceTier,
    ) -> Result<RateLimitStatus> {
        let key = format!("ratelimit:{}:{}", consumer_id, service_id);
        let rate = tier.rate_limit();
        let capacity = tier.burst_capacity();

        // Token bucket algorithm implemented in Lua for atomicity
        let script = Script::new(
            r"
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local rate = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])
            local requested = tonumber(ARGV[4])

            local bucket = redis.call('HMGET', key, 'tokens', 'last_update')
            local tokens = tonumber(bucket[1])
            local last_update = tonumber(bucket[2])

            if tokens == nil then
                tokens = capacity
                last_update = now
            end

            -- Calculate tokens to add based on time passed
            local delta = math.max(0, now - last_update)
            local tokens_to_add = delta * rate
            tokens = math.min(capacity, tokens + tokens_to_add)

            local allowed = 0
            local retry_after = 0

            if tokens >= requested then
                tokens = tokens - requested
                allowed = 1
            else
                retry_after = math.ceil((requested - tokens) / rate)
            end

            redis.call('HSET', key, 'tokens', tokens, 'last_update', now)
            redis.call('EXPIRE', key, 3600)

            return {allowed, tokens, retry_after}
            ",
        );

        let now = Utc::now().timestamp();
        let mut conn = self.redis.as_ref().clone();

        let result: Vec<i64> = script
            .key(&key)
            .arg(capacity)
            .arg(rate)
            .arg(now)
            .arg(1) // Request 1 token
            .invoke_async(&mut conn)
            .await
            .context("Failed to execute rate limit script")?;

        let allowed = result[0] == 1;
        let remaining = result[1] as u32;
        let retry_after = result[2] as u64;

        let reset_at = Utc::now() + Duration::seconds(60);

        debug!(
            consumer_id = %consumer_id,
            service_id = %service_id,
            allowed = allowed,
            remaining = remaining,
            "Rate limit check"
        );

        Ok(RateLimitStatus {
            exceeded: !allowed,
            retry_after_seconds: if allowed { None } else { Some(retry_after) },
            limit: rate,
            remaining,
            reset_at,
        })
    }

    /// Reset rate limit for a consumer/service pair (admin function)
    pub async fn reset_rate_limit(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
    ) -> Result<()> {
        let key = format!("ratelimit:{}:{}", consumer_id, service_id);
        let mut conn = self.redis.as_ref().clone();

        conn.del(&key)
            .await
            .context("Failed to reset rate limit")?;

        debug!(
            consumer_id = %consumer_id,
            service_id = %service_id,
            "Rate limit reset"
        );

        Ok(())
    }

    /// Get current rate limit status without consuming tokens
    pub async fn get_status(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
        tier: &ServiceTier,
    ) -> Result<RateLimitStatus> {
        let key = format!("ratelimit:{}:{}", consumer_id, service_id);
        let mut conn = self.redis.as_ref().clone();

        let bucket: Vec<Option<String>> = conn
            .hget(&key, &["tokens", "last_update"])
            .await
            .context("Failed to get rate limit status")?;

        let tokens = bucket[0]
            .as_ref()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(tier.burst_capacity() as f64);

        let reset_at = Utc::now() + Duration::seconds(60);

        Ok(RateLimitStatus {
            exceeded: tokens < 1.0,
            retry_after_seconds: None,
            limit: tier.rate_limit(),
            remaining: tokens as u32,
            reset_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter() {
        // This test requires Redis to be running
        // Skip in CI environments
        if std::env::var("CI").is_ok() {
            return;
        }

        let redis = redis::Client::open("redis://localhost:6379")
            .unwrap()
            .get_tokio_connection_manager()
            .await
            .unwrap();

        let limiter = RateLimiter::new(redis);
        let consumer_id = Uuid::new_v4();
        let service_id = Uuid::new_v4();
        let tier = ServiceTier::Basic;

        // First request should succeed
        let status = limiter
            .check_rate_limit(consumer_id, service_id, &tier)
            .await
            .unwrap();
        assert!(!status.exceeded);

        // Reset for clean state
        limiter
            .reset_rate_limit(consumer_id, service_id)
            .await
            .unwrap();
    }
}

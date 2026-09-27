use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

/// Service tier for rate limiting
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ServiceTier {
    Basic,
    Premium,
    Enterprise,
}

impl ServiceTier {
    /// Get rate limit for tier (requests per second)
    pub fn rate_limit(&self) -> u64 {
        match self {
            ServiceTier::Basic => 10,
            ServiceTier::Premium => 100,
            ServiceTier::Enterprise => 1000,
        }
    }

    /// Get burst capacity for tier
    pub fn burst_capacity(&self) -> u32 {
        match self {
            ServiceTier::Basic => 20,
            ServiceTier::Premium => 200,
            ServiceTier::Enterprise => 2000,
        }
    }

    /// Get quota limit (tokens per month)
    pub fn quota_limit(&self) -> i64 {
        match self {
            ServiceTier::Basic => 100_000,
            ServiceTier::Premium => 10_000_000,
            ServiceTier::Enterprise => 1_000_000_000,
        }
    }
}

/// API key model
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiKey {
    pub id: Uuid,
    pub key_hash: String,
    pub consumer_id: Uuid,
    pub service_id: Uuid,
    pub tier: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub metadata: sqlx::types::Json<serde_json::Value>,
}

impl ApiKey {
    pub fn is_valid(&self) -> bool {
        if self.revoked_at.is_some() {
            return false;
        }

        if let Some(expires_at) = self.expires_at {
            if Utc::now() > expires_at {
                return false;
            }
        }

        true
    }

    pub fn get_tier(&self) -> ServiceTier {
        match self.tier.to_lowercase().as_str() {
            "basic" => ServiceTier::Basic,
            "premium" => ServiceTier::Premium,
            "enterprise" => ServiceTier::Enterprise,
            _ => ServiceTier::Basic,
        }
    }
}

/// Service information
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Service {
    pub id: Uuid,
    pub name: String,
    pub version: String,
    pub endpoint: String,
    pub status: String,
    pub pricing: sqlx::types::Json<PricingModel>,
    pub sla: sqlx::types::Json<SlaConfig>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingModel {
    pub model: String, // per-token, per-request, subscription
    pub rates: Vec<PricingRate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingRate {
    pub tier: String,
    pub rate: f64,
    pub unit: String, // token, request, month
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlaConfig {
    pub availability: f64,
    pub max_latency_ms: u64,
    pub timeout_ms: u64,
}

/// Consumption request
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ConsumeRequest {
    #[validate(length(min = 1))]
    pub prompt: String,

    #[serde(default)]
    pub max_tokens: Option<u32>,

    #[serde(default = "default_temperature")]
    pub temperature: f32,

    #[serde(default)]
    pub metadata: serde_json::Value,
}

fn default_temperature() -> f32 {
    0.7
}

/// Consumption response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumeResponse {
    pub request_id: Uuid,
    pub response: serde_json::Value,
    pub usage: UsageInfo,
    pub cost: CostInfo,
    pub latency_ms: u64,
}

/// Usage information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageInfo {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Cost information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostInfo {
    pub amount: f64,
    pub currency: String,
    pub breakdown: serde_json::Value,
}

/// Usage record for database
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UsageRecord {
    pub id: Uuid,
    pub request_id: Uuid,
    pub service_id: Uuid,
    pub consumer_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub duration_ms: i32,
    pub usage: sqlx::types::Json<UsageInfo>,
    pub cost: sqlx::types::Json<CostInfo>,
    pub status: String,
    pub error: Option<sqlx::types::Json<serde_json::Value>>,
}

/// Quota status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaStatus {
    pub service_id: Uuid,
    pub consumer_id: Uuid,
    pub tier: ServiceTier,
    pub used_tokens: i64,
    pub total_tokens: i64,
    pub remaining_tokens: i64,
    pub reset_at: DateTime<Utc>,
    pub exceeded: bool,
}

/// Rate limit status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitStatus {
    pub exceeded: bool,
    pub retry_after_seconds: Option<u64>,
    pub limit: u64,
    pub remaining: u32,
    pub reset_at: DateTime<Utc>,
}

/// Create API key request
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateApiKeyRequest {
    #[validate(length(min = 1))]
    pub service_id: String,

    pub tier: ServiceTier,

    #[serde(default)]
    pub expires_in_days: Option<i64>,
}

/// API key response (includes plaintext key once)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyResponse {
    pub id: Uuid,
    pub key: String, // Only returned on creation
    pub service_id: Uuid,
    pub tier: ServiceTier,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub service_id: Uuid,
    pub consumer_id: Uuid,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub total_requests: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub avg_latency_ms: f64,
    pub error_rate: f64,
}

/// SLA violation record
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SLAViolation {
    pub id: Uuid,
    pub service_id: Uuid,
    pub metric: String,
    pub threshold: f64,
    pub actual: f64,
    pub timestamp: DateTime<Utc>,
    pub severity: String,
}

/// SLA status for a service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SLAStatus {
    pub service_id: Uuid,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub latency_ms: f64,
    pub latency_threshold: f64,
    pub latency_compliant: bool,
    pub error_rate: f64,
    pub error_rate_threshold: f64,
    pub error_rate_compliant: bool,
    pub uptime_percentage: f64,
    pub uptime_threshold: f64,
    pub uptime_compliant: bool,
    pub violation_count: i64,
    pub overall_compliant: bool,
}

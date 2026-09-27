//! LLM-Shield Consumer Adapter
//!
//! Thin runtime adapter for consuming filter packs, safety rule modules,
//! and shielding metadata from LLM-Shield. This module provides read-only
//! access to shield configurations without modifying upstream shield state.
//!
//! Phase 2B: Runtime consumption integration only - no schema modifications.

use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, warn};
use uuid::Uuid;

/// Shield client for consuming filter packs and safety rules
/// from the LLM-Shield service.
#[derive(Clone)]
pub struct ShieldClient {
    client: Arc<Client>,
    shield_url: String,
}

/// Filter pack consumed from LLM-Shield
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterPack {
    pub pack_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub filters: Vec<Filter>,
    pub enabled: bool,
    pub priority: i32,
    pub metadata: serde_json::Value,
}

/// Individual filter within a filter pack
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    pub filter_id: String,
    pub filter_type: FilterType,
    pub name: String,
    pub pattern: Option<String>,
    pub action: FilterAction,
    pub severity: Severity,
    pub enabled: bool,
}

/// Types of content filters
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FilterType {
    ContentModeration,
    PiiDetection,
    MalwareDetection,
    PromptInjection,
    JailbreakDetection,
    ToxicityFilter,
    BiasDetection,
    CustomRegex,
}

/// Actions to take when filter matches
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FilterAction {
    Block,
    Warn,
    Redact,
    Log,
    Allow,
}

/// Severity levels for safety rules
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

/// Safety rule module from LLM-Shield
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyRuleModule {
    pub module_id: String,
    pub name: String,
    pub version: String,
    pub category: SafetyCategory,
    pub rules: Vec<SafetyRule>,
    pub enabled: bool,
    pub enforcement_mode: EnforcementMode,
}

/// Categories of safety rules
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SafetyCategory {
    ContentSafety,
    DataProtection,
    AccessControl,
    RateLimiting,
    AuditLogging,
    Compliance,
}

/// Individual safety rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyRule {
    pub rule_id: String,
    pub name: String,
    pub condition: String,
    pub action: FilterAction,
    pub message: String,
    pub metadata: serde_json::Value,
}

/// Enforcement mode for safety rules
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnforcementMode {
    Enforce,
    Audit,
    Disabled,
}

/// Shielding metadata for a service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShieldingMetadata {
    pub service_id: Uuid,
    pub shield_profile: String,
    pub active_filter_packs: Vec<String>,
    pub active_safety_modules: Vec<String>,
    pub last_updated: String,
    pub scan_results: Option<ScanResults>,
}

/// Results from shield scanning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResults {
    pub scanned_at: String,
    pub threats_detected: u32,
    pub threats_blocked: u32,
    pub risk_score: f64,
    pub categories: Vec<ThreatCategory>,
}

/// Threat categories detected
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatCategory {
    pub category: String,
    pub count: u32,
    pub severity: Severity,
}

/// Content scan request for real-time filtering
#[derive(Debug, Serialize)]
pub struct ContentScanRequest {
    pub content: String,
    pub content_type: ContentType,
    pub context: ScanContext,
}

/// Type of content being scanned
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    Prompt,
    Response,
    System,
    Context,
}

/// Context for content scanning
#[derive(Debug, Serialize)]
pub struct ScanContext {
    pub service_id: Uuid,
    pub consumer_id: Uuid,
    pub session_id: Option<String>,
}

/// Content scan response
#[derive(Debug, Clone, Deserialize)]
pub struct ContentScanResponse {
    pub allowed: bool,
    pub action: FilterAction,
    pub matches: Vec<FilterMatch>,
    pub risk_score: f64,
    pub processing_time_ms: u64,
}

/// Filter match details
#[derive(Debug, Clone, Deserialize)]
pub struct FilterMatch {
    pub filter_id: String,
    pub filter_type: FilterType,
    pub severity: Severity,
    pub matched_content: Option<String>,
    pub message: String,
}

/// Response wrapper for shield queries
#[derive(Debug, Deserialize)]
struct ShieldResponse<T> {
    data: T,
    #[serde(default)]
    metadata: serde_json::Value,
}

impl ShieldClient {
    /// Create a new shield client with the specified shield URL
    pub fn new(shield_url: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_millis(200)) // Shield checks must be fast
            .pool_max_idle_per_host(50)
            .pool_idle_timeout(Duration::from_secs(60))
            .build()
            .expect("Failed to create HTTP client for LLM-Shield");

        Self {
            client: Arc::new(client),
            shield_url,
        }
    }

    /// Fetch all active filter packs for a service
    pub async fn get_filter_packs(&self, service_id: Uuid) -> Result<Vec<FilterPack>> {
        let start = std::time::Instant::now();

        debug!(service_id = %service_id, "Fetching filter packs from shield");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/services/{}/filter-packs",
                self.shield_url, service_id
            ))
            .send()
            .await
            .context("Failed to fetch filter packs from shield")?;

        let latency = start.elapsed();

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch filter packs"
            );
            return Ok(vec![]);
        }

        let shield_response: ShieldResponse<Vec<FilterPack>> = response
            .json()
            .await
            .context("Failed to parse filter packs response")?;

        debug!(
            service_id = %service_id,
            pack_count = shield_response.data.len(),
            latency_ms = latency.as_millis(),
            "Filter packs fetched successfully"
        );

        Ok(shield_response.data)
    }

    /// Fetch safety rule modules for a service
    pub async fn get_safety_modules(&self, service_id: Uuid) -> Result<Vec<SafetyRuleModule>> {
        let start = std::time::Instant::now();

        debug!(service_id = %service_id, "Fetching safety modules from shield");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/services/{}/safety-modules",
                self.shield_url, service_id
            ))
            .send()
            .await
            .context("Failed to fetch safety modules from shield")?;

        let latency = start.elapsed();

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch safety modules"
            );
            return Ok(vec![]);
        }

        let shield_response: ShieldResponse<Vec<SafetyRuleModule>> = response
            .json()
            .await
            .context("Failed to parse safety modules response")?;

        debug!(
            service_id = %service_id,
            module_count = shield_response.data.len(),
            latency_ms = latency.as_millis(),
            "Safety modules fetched successfully"
        );

        Ok(shield_response.data)
    }

    /// Fetch shielding metadata for a service
    pub async fn get_shielding_metadata(
        &self,
        service_id: Uuid,
    ) -> Result<Option<ShieldingMetadata>> {
        let start = std::time::Instant::now();

        debug!(service_id = %service_id, "Fetching shielding metadata");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/services/{}/metadata",
                self.shield_url, service_id
            ))
            .send()
            .await
            .context("Failed to fetch shielding metadata")?;

        let latency = start.elapsed();

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            debug!(
                service_id = %service_id,
                latency_ms = latency.as_millis(),
                "No shielding metadata found"
            );
            return Ok(None);
        }

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch shielding metadata"
            );
            return Ok(None);
        }

        let shield_response: ShieldResponse<ShieldingMetadata> = response
            .json()
            .await
            .context("Failed to parse shielding metadata")?;

        debug!(
            service_id = %service_id,
            latency_ms = latency.as_millis(),
            "Shielding metadata fetched successfully"
        );

        Ok(Some(shield_response.data))
    }

    /// Scan content in real-time against active filters
    pub async fn scan_content(
        &self,
        content: &str,
        content_type: ContentType,
        service_id: Uuid,
        consumer_id: Uuid,
    ) -> Result<ContentScanResponse> {
        let start = std::time::Instant::now();

        debug!(
            service_id = %service_id,
            consumer_id = %consumer_id,
            content_type = ?content_type,
            "Scanning content with shield"
        );

        let scan_request = ContentScanRequest {
            content: content.to_string(),
            content_type,
            context: ScanContext {
                service_id,
                consumer_id,
                session_id: None,
            },
        };

        let response = self
            .client
            .post(&format!("{}/api/v1/scan", self.shield_url))
            .json(&scan_request)
            .send()
            .await
            .context("Failed to scan content with shield")?;

        let latency = start.elapsed();

        if !response.status().is_success() {
            error!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Shield scan failed"
            );

            // Fail-open: allow content if shield is unavailable
            warn!("Shield unavailable, failing open");
            return Ok(ContentScanResponse {
                allowed: true,
                action: FilterAction::Allow,
                matches: vec![],
                risk_score: 0.0,
                processing_time_ms: latency.as_millis() as u64,
            });
        }

        let scan_response: ContentScanResponse = response
            .json()
            .await
            .context("Failed to parse scan response")?;

        debug!(
            service_id = %service_id,
            allowed = scan_response.allowed,
            matches = scan_response.matches.len(),
            risk_score = scan_response.risk_score,
            latency_ms = latency.as_millis(),
            "Content scan complete"
        );

        if !scan_response.allowed {
            warn!(
                service_id = %service_id,
                consumer_id = %consumer_id,
                action = ?scan_response.action,
                matches = scan_response.matches.len(),
                "Content blocked by shield"
            );
        }

        Ok(scan_response)
    }

    /// Check if a service has shield protection enabled
    pub async fn is_protected(&self, service_id: Uuid) -> Result<bool> {
        match self.get_shielding_metadata(service_id).await? {
            Some(metadata) => Ok(!metadata.active_filter_packs.is_empty()
                || !metadata.active_safety_modules.is_empty()),
            None => Ok(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_shield_client_creation() {
        let client = ShieldClient::new("http://localhost:8082".to_string());
        assert_eq!(client.shield_url, "http://localhost:8082");
    }

    #[test]
    fn test_filter_type_serialization() {
        let filter_type = FilterType::PromptInjection;
        let json = serde_json::to_string(&filter_type).unwrap();
        assert_eq!(json, "\"prompt_injection\"");
    }

    #[test]
    fn test_filter_action_serialization() {
        let action = FilterAction::Block;
        let json = serde_json::to_string(&action).unwrap();
        assert_eq!(json, "\"block\"");
    }

    #[test]
    fn test_severity_serialization() {
        let severity = Severity::Critical;
        let json = serde_json::to_string(&severity).unwrap();
        assert_eq!(json, "\"critical\"");
    }
}

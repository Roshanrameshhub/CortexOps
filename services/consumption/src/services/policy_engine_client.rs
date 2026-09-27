//! LLM-Policy-Engine Consumer Adapter
//!
//! Thin runtime adapter for consuming policy bundles, enforcement metadata,
//! and compliance rules from LLM-Policy-Engine. This module provides read-only
//! access to policy configurations without modifying upstream policy state.
//!
//! Phase 2B: Runtime consumption integration only - no schema modifications.
//!
//! Note: This adapter complements the existing policy_client.rs which handles
//! real-time policy validation. This module focuses on policy bundle consumption
//! and compliance rule retrieval.

use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, warn};
use uuid::Uuid;

/// Policy Engine client for consuming policy bundles and compliance rules
/// from the LLM-Policy-Engine service.
#[derive(Clone)]
pub struct PolicyEngineClient {
    client: Arc<Client>,
    policy_engine_url: String,
}

/// Policy bundle consumed from LLM-Policy-Engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyBundle {
    pub bundle_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub policies: Vec<PolicyDefinition>,
    pub effective_from: String,
    pub effective_until: Option<String>,
    pub priority: i32,
    pub metadata: serde_json::Value,
}

/// Individual policy definition within a bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDefinition {
    pub policy_id: String,
    pub name: String,
    pub policy_type: PolicyType,
    pub rules: Vec<PolicyRule>,
    pub enforcement: EnforcementConfig,
    pub enabled: bool,
}

/// Types of policies
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PolicyType {
    AccessControl,
    RateLimiting,
    ContentFiltering,
    DataResidency,
    CostControl,
    UsageQuota,
    Compliance,
    Custom,
}

/// Individual policy rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub rule_id: String,
    pub condition: String,
    pub action: PolicyAction,
    pub parameters: serde_json::Value,
}

/// Actions that can be taken by policy rules
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PolicyAction {
    Allow,
    Deny,
    Throttle,
    Audit,
    Alert,
    Transform,
}

/// Enforcement configuration for policies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnforcementConfig {
    pub mode: EnforcementMode,
    pub fail_action: PolicyAction,
    pub audit_enabled: bool,
    pub alert_threshold: Option<u32>,
}

/// Enforcement modes
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnforcementMode {
    Enforce,
    Audit,
    Shadow,
    Disabled,
}

/// Enforcement metadata for a service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnforcementMetadata {
    pub service_id: Uuid,
    pub active_bundles: Vec<String>,
    pub enforcement_mode: EnforcementMode,
    pub last_policy_sync: String,
    pub policy_version: String,
    pub evaluation_stats: EvaluationStats,
}

/// Statistics about policy evaluations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationStats {
    pub total_evaluations: u64,
    pub allowed: u64,
    pub denied: u64,
    pub throttled: u64,
    pub errors: u64,
    pub avg_evaluation_time_ms: f64,
}

/// Compliance rule from policy engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceRule {
    pub rule_id: String,
    pub name: String,
    pub framework: ComplianceFramework,
    pub requirement: String,
    pub controls: Vec<Control>,
    pub severity: ComplianceSeverity,
    pub enabled: bool,
}

/// Compliance frameworks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ComplianceFramework {
    Gdpr,
    Hipaa,
    Sox,
    Pci,
    Iso27001,
    Nist,
    Custom,
}

/// Compliance control
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Control {
    pub control_id: String,
    pub name: String,
    pub description: String,
    pub test_procedure: String,
    pub evidence_required: Vec<String>,
}

/// Compliance severity levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ComplianceSeverity {
    Critical,
    Major,
    Minor,
    Informational,
}

/// Compliance status for a service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceStatus {
    pub service_id: Uuid,
    pub frameworks: Vec<FrameworkStatus>,
    pub overall_compliant: bool,
    pub last_assessment: String,
    pub next_assessment: Option<String>,
    pub findings: Vec<ComplianceFinding>,
}

/// Status for a specific framework
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameworkStatus {
    pub framework: ComplianceFramework,
    pub compliant: bool,
    pub controls_passed: u32,
    pub controls_failed: u32,
    pub controls_not_applicable: u32,
}

/// Compliance finding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceFinding {
    pub finding_id: String,
    pub rule_id: String,
    pub severity: ComplianceSeverity,
    pub description: String,
    pub remediation: String,
    pub status: FindingStatus,
}

/// Status of a compliance finding
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FindingStatus {
    Open,
    InProgress,
    Resolved,
    Accepted,
    Deferred,
}

/// Response wrapper for policy engine queries
#[derive(Debug, Deserialize)]
struct PolicyEngineResponse<T> {
    data: T,
    #[serde(default)]
    metadata: serde_json::Value,
}

impl PolicyEngineClient {
    /// Create a new policy engine client with the specified URL
    pub fn new(policy_engine_url: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_millis(300)) // Policy lookups should be reasonably fast
            .pool_max_idle_per_host(25)
            .pool_idle_timeout(Duration::from_secs(60))
            .build()
            .expect("Failed to create HTTP client for LLM-Policy-Engine");

        Self {
            client: Arc::new(client),
            policy_engine_url,
        }
    }

    /// Fetch policy bundles for a service
    pub async fn get_policy_bundles(&self, service_id: Uuid) -> Result<Vec<PolicyBundle>> {
        let start = std::time::Instant::now();

        debug!(service_id = %service_id, "Fetching policy bundles");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/services/{}/bundles",
                self.policy_engine_url, service_id
            ))
            .send()
            .await
            .context("Failed to fetch policy bundles")?;

        let latency = start.elapsed();

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch policy bundles"
            );
            return Ok(vec![]);
        }

        let policy_response: PolicyEngineResponse<Vec<PolicyBundle>> = response
            .json()
            .await
            .context("Failed to parse policy bundles response")?;

        debug!(
            service_id = %service_id,
            bundle_count = policy_response.data.len(),
            latency_ms = latency.as_millis(),
            "Policy bundles fetched successfully"
        );

        Ok(policy_response.data)
    }

    /// Fetch enforcement metadata for a service
    pub async fn get_enforcement_metadata(
        &self,
        service_id: Uuid,
    ) -> Result<Option<EnforcementMetadata>> {
        let start = std::time::Instant::now();

        debug!(service_id = %service_id, "Fetching enforcement metadata");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/services/{}/enforcement",
                self.policy_engine_url, service_id
            ))
            .send()
            .await
            .context("Failed to fetch enforcement metadata")?;

        let latency = start.elapsed();

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            debug!(
                service_id = %service_id,
                latency_ms = latency.as_millis(),
                "No enforcement metadata found"
            );
            return Ok(None);
        }

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch enforcement metadata"
            );
            return Ok(None);
        }

        let policy_response: PolicyEngineResponse<EnforcementMetadata> = response
            .json()
            .await
            .context("Failed to parse enforcement metadata")?;

        debug!(
            service_id = %service_id,
            latency_ms = latency.as_millis(),
            "Enforcement metadata fetched successfully"
        );

        Ok(Some(policy_response.data))
    }

    /// Fetch compliance rules for a service
    pub async fn get_compliance_rules(&self, service_id: Uuid) -> Result<Vec<ComplianceRule>> {
        let start = std::time::Instant::now();

        debug!(service_id = %service_id, "Fetching compliance rules");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/services/{}/compliance/rules",
                self.policy_engine_url, service_id
            ))
            .send()
            .await
            .context("Failed to fetch compliance rules")?;

        let latency = start.elapsed();

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch compliance rules"
            );
            return Ok(vec![]);
        }

        let policy_response: PolicyEngineResponse<Vec<ComplianceRule>> = response
            .json()
            .await
            .context("Failed to parse compliance rules response")?;

        debug!(
            service_id = %service_id,
            rule_count = policy_response.data.len(),
            latency_ms = latency.as_millis(),
            "Compliance rules fetched successfully"
        );

        Ok(policy_response.data)
    }

    /// Fetch compliance status for a service
    pub async fn get_compliance_status(&self, service_id: Uuid) -> Result<Option<ComplianceStatus>> {
        let start = std::time::Instant::now();

        debug!(service_id = %service_id, "Fetching compliance status");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/services/{}/compliance/status",
                self.policy_engine_url, service_id
            ))
            .send()
            .await
            .context("Failed to fetch compliance status")?;

        let latency = start.elapsed();

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            debug!(
                service_id = %service_id,
                latency_ms = latency.as_millis(),
                "No compliance status found"
            );
            return Ok(None);
        }

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch compliance status"
            );
            return Ok(None);
        }

        let policy_response: PolicyEngineResponse<ComplianceStatus> = response
            .json()
            .await
            .context("Failed to parse compliance status")?;

        debug!(
            service_id = %service_id,
            compliant = policy_response.data.overall_compliant,
            latency_ms = latency.as_millis(),
            "Compliance status fetched successfully"
        );

        Ok(Some(policy_response.data))
    }

    /// Fetch a specific policy bundle by ID
    pub async fn get_bundle(&self, bundle_id: &str) -> Result<Option<PolicyBundle>> {
        let start = std::time::Instant::now();

        debug!(bundle_id = %bundle_id, "Fetching policy bundle");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/bundles/{}",
                self.policy_engine_url, bundle_id
            ))
            .send()
            .await
            .context("Failed to fetch policy bundle")?;

        let latency = start.elapsed();

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            debug!(
                bundle_id = %bundle_id,
                latency_ms = latency.as_millis(),
                "Policy bundle not found"
            );
            return Ok(None);
        }

        if !response.status().is_success() {
            error!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch policy bundle"
            );
            anyhow::bail!("Policy bundle lookup failed with status: {}", response.status());
        }

        let policy_response: PolicyEngineResponse<PolicyBundle> = response
            .json()
            .await
            .context("Failed to parse policy bundle response")?;

        debug!(
            bundle_id = %bundle_id,
            version = %policy_response.data.version,
            latency_ms = latency.as_millis(),
            "Policy bundle fetched successfully"
        );

        Ok(Some(policy_response.data))
    }

    /// Check if a service has active policy enforcement
    pub async fn has_active_policies(&self, service_id: Uuid) -> Result<bool> {
        match self.get_enforcement_metadata(service_id).await? {
            Some(metadata) => Ok(!metadata.active_bundles.is_empty()
                && metadata.enforcement_mode != EnforcementMode::Disabled),
            None => Ok(false),
        }
    }

    /// Check if a service is compliant with all applicable frameworks
    pub async fn is_compliant(&self, service_id: Uuid) -> Result<bool> {
        match self.get_compliance_status(service_id).await? {
            Some(status) => Ok(status.overall_compliant),
            None => Ok(true), // No compliance requirements configured
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_policy_engine_client_creation() {
        let client = PolicyEngineClient::new("http://localhost:8083".to_string());
        assert_eq!(client.policy_engine_url, "http://localhost:8083");
    }

    #[test]
    fn test_policy_type_serialization() {
        let policy_type = PolicyType::DataResidency;
        let json = serde_json::to_string(&policy_type).unwrap();
        assert_eq!(json, "\"data_residency\"");
    }

    #[test]
    fn test_enforcement_mode_serialization() {
        let mode = EnforcementMode::Enforce;
        let json = serde_json::to_string(&mode).unwrap();
        assert_eq!(json, "\"enforce\"");
    }

    #[test]
    fn test_compliance_framework_serialization() {
        let framework = ComplianceFramework::Gdpr;
        let json = serde_json::to_string(&framework).unwrap();
        assert_eq!(json, "\"GDPR\"");
    }

    #[test]
    fn test_policy_action_serialization() {
        let action = PolicyAction::Deny;
        let json = serde_json::to_string(&action).unwrap();
        assert_eq!(json, "\"deny\"");
    }
}

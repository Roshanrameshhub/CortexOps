use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, warn};
use uuid::Uuid;

use crate::models::{ConsumeRequest, Service};

/// Policy Engine integration client for consumption validation
/// Validates requests against organizational policies before routing
#[derive(Clone)]
pub struct PolicyClient {
    client: Arc<Client>,
    policy_engine_url: String,
}

#[derive(Debug, Serialize)]
struct PolicyValidationRequest {
    consumer_id: Uuid,
    service_id: Uuid,
    service_category: String,
    request_data: PolicyRequestData,
    metadata: PolicyMetadata,
}

#[derive(Debug, Serialize)]
struct PolicyRequestData {
    prompt: String,
    max_tokens: u32,
    temperature: Option<f32>,
}

#[derive(Debug, Serialize)]
struct PolicyMetadata {
    ip_address: Option<String>,
    user_agent: Option<String>,
    timestamp: String,
}

#[derive(Debug, Deserialize)]
pub struct PolicyValidationResponse {
    pub allowed: bool,
    pub reason: Option<String>,
    pub violations: Vec<PolicyViolation>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Deserialize, Clone)]
pub struct PolicyViolation {
    pub policy_id: String,
    pub policy_name: String,
    pub severity: String,
    pub message: String,
}

impl PolicyClient {
    pub fn new(policy_engine_url: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_millis(100)) // Fast timeout for low latency
            .pool_max_idle_per_host(50)
            .pool_idle_timeout(Duration::from_secs(90))
            .build()
            .expect("Failed to create HTTP client for Policy Engine");

        Self {
            client: Arc::new(client),
            policy_engine_url,
        }
    }

    /// Validate consumption request against policies
    pub async fn validate_consumption(
        &self,
        consumer_id: Uuid,
        service: &Service,
        request: &ConsumeRequest,
        ip_address: Option<String>,
        user_agent: Option<String>,
    ) -> Result<PolicyValidationResponse> {
        let start = std::time::Instant::now();

        let validation_request = PolicyValidationRequest {
            consumer_id,
            service_id: service.id,
            service_category: "llm".to_string(), // From service metadata
            request_data: PolicyRequestData {
                prompt: request.prompt.clone(),
                max_tokens: request.max_tokens.unwrap_or(100),
                temperature: request.temperature,
            },
            metadata: PolicyMetadata {
                ip_address,
                user_agent,
                timestamp: chrono::Utc::now().to_rfc3339(),
            },
        };

        debug!(
            consumer_id = %consumer_id,
            service_id = %service.id,
            "Validating consumption with Policy Engine"
        );

        let response = self
            .client
            .post(&format!("{}/api/v1/validate/consumption", self.policy_engine_url))
            .json(&validation_request)
            .send()
            .await
            .context("Failed to send request to Policy Engine")?;

        let status = response.status();
        let latency = start.elapsed();

        if !status.is_success() {
            error!(
                status = %status,
                latency_ms = latency.as_millis(),
                "Policy Engine returned error"
            );

            // Fail-open in case of Policy Engine unavailability
            // In production, configure fail-closed for stricter security
            warn!("Policy Engine unavailable, failing open");
            return Ok(PolicyValidationResponse {
                allowed: true,
                reason: Some("Policy Engine unavailable - fail-open".to_string()),
                violations: vec![],
                metadata: serde_json::json!({"failover": true}),
            });
        }

        let validation_response: PolicyValidationResponse = response
            .json()
            .await
            .context("Failed to parse Policy Engine response")?;

        debug!(
            consumer_id = %consumer_id,
            service_id = %service.id,
            allowed = validation_response.allowed,
            latency_ms = latency.as_millis(),
            "Policy validation complete"
        );

        if !validation_response.allowed {
            warn!(
                consumer_id = %consumer_id,
                service_id = %service.id,
                violations = validation_response.violations.len(),
                "Policy validation failed"
            );
        }

        Ok(validation_response)
    }

    /// Check if consumer has access to service
    pub async fn check_access(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
    ) -> Result<bool> {
        let response = self
            .client
            .get(&format!("{}/api/v1/access/check", self.policy_engine_url))
            .query(&[
                ("consumer_id", consumer_id.to_string()),
                ("service_id", service_id.to_string()),
            ])
            .send()
            .await
            .context("Failed to check access")?;

        if !response.status().is_success() {
            // Fail-open for access checks
            warn!("Policy Engine access check failed, failing open");
            return Ok(true);
        }

        #[derive(Deserialize)]
        struct AccessResponse {
            allowed: bool,
        }

        let access_response: AccessResponse = response
            .json()
            .await
            .context("Failed to parse access response")?;

        Ok(access_response.allowed)
    }

    /// Check data residency compliance
    pub async fn check_data_residency(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
        data_location: &str,
    ) -> Result<bool> {
        let response = self
            .client
            .post(&format!("{}/api/v1/compliance/data-residency", self.policy_engine_url))
            .json(&serde_json::json!({
                "consumer_id": consumer_id,
                "service_id": service_id,
                "data_location": data_location,
            }))
            .send()
            .await
            .context("Failed to check data residency")?;

        if !response.status().is_success() {
            warn!("Data residency check failed, failing open");
            return Ok(true);
        }

        #[derive(Deserialize)]
        struct ResidencyResponse {
            compliant: bool,
        }

        let residency_response: ResidencyResponse = response
            .json()
            .await
            .context("Failed to parse residency response")?;

        Ok(residency_response.compliant)
    }

    /// Report policy violation for audit trail
    pub async fn report_violation(
        &self,
        consumer_id: Uuid,
        service_id: Uuid,
        violation: &PolicyViolation,
    ) -> Result<()> {
        let response = self
            .client
            .post(&format!("{}/api/v1/violations/report", self.policy_engine_url))
            .json(&serde_json::json!({
                "consumer_id": consumer_id,
                "service_id": service_id,
                "policy_id": violation.policy_id,
                "policy_name": violation.policy_name,
                "severity": violation.severity,
                "message": violation.message,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }))
            .send()
            .await
            .context("Failed to report violation")?;

        if !response.status().is_success() {
            error!("Failed to report violation to Policy Engine");
        }

        Ok(())
    }

    /// Sync policy updates from Policy Engine
    pub async fn sync_policies(&self) -> Result<Vec<Policy>> {
        let response = self
            .client
            .get(&format!("{}/api/v1/policies", self.policy_engine_url))
            .send()
            .await
            .context("Failed to sync policies")?;

        if !response.status().is_success() {
            anyhow::bail!("Failed to sync policies from Policy Engine");
        }

        #[derive(Deserialize)]
        struct PoliciesResponse {
            policies: Vec<Policy>,
        }

        let policies_response: PoliciesResponse = response
            .json()
            .await
            .context("Failed to parse policies response")?;

        debug!(
            count = policies_response.policies.len(),
            "Synced policies from Policy Engine"
        );

        Ok(policies_response.policies)
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct Policy {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub severity: String,
    pub rules: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_policy_client_creation() {
        let client = PolicyClient::new("http://localhost:8080".to_string());
        assert_eq!(client.policy_engine_url, "http://localhost:8080");
    }

    #[test]
    fn test_policy_violation_structure() {
        let violation = PolicyViolation {
            policy_id: "pol_001".to_string(),
            policy_name: "Data Classification".to_string(),
            severity: "high".to_string(),
            message: "Sensitive data detected in prompt".to_string(),
        };

        assert_eq!(violation.severity, "high");
    }
}

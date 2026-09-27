//! LLM-Registry Consumer Adapter
//!
//! Thin runtime adapter for consuming registered model metadata, version information,
//! and exchangeable assets from LLM-Registry. This module provides read-only access
//! to registry data without modifying upstream registry state.
//!
//! Phase 2B: Runtime consumption integration only - no schema modifications.

use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, warn};
use uuid::Uuid;

/// Registry client for consuming model metadata and version information
/// from the LLM-Registry service.
#[derive(Clone)]
pub struct RegistryClient {
    client: Arc<Client>,
    registry_url: String,
}

/// Registered model metadata consumed from LLM-Registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMetadata {
    pub model_id: String,
    pub name: String,
    pub version: String,
    pub provider: String,
    pub capabilities: Vec<String>,
    pub context_window: u32,
    pub max_tokens: u32,
    pub pricing_tier: String,
    pub status: ModelStatus,
    pub metadata: serde_json::Value,
}

/// Model registration status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModelStatus {
    Active,
    Deprecated,
    Experimental,
    Retired,
}

/// Version information for a registered model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelVersion {
    pub version: String,
    pub release_date: String,
    pub changelog: Option<String>,
    pub breaking_changes: bool,
    pub minimum_sdk_version: Option<String>,
    pub deprecated: bool,
    pub deprecation_date: Option<String>,
}

/// Exchangeable asset metadata from registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExchangeableAsset {
    pub asset_id: String,
    pub asset_type: AssetType,
    pub name: String,
    pub version: String,
    pub checksum: String,
    pub size_bytes: u64,
    pub download_url: Option<String>,
    pub metadata: serde_json::Value,
}

/// Types of exchangeable assets
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssetType {
    ModelWeights,
    Adapter,
    Tokenizer,
    Config,
    Embedding,
    FineTune,
    Plugin,
}

/// Response wrapper for registry queries
#[derive(Debug, Deserialize)]
struct RegistryResponse<T> {
    data: T,
    #[serde(default)]
    metadata: serde_json::Value,
}

impl RegistryClient {
    /// Create a new registry client with the specified registry URL
    pub fn new(registry_url: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_millis(500)) // Registry lookups should be fast
            .pool_max_idle_per_host(25)
            .pool_idle_timeout(Duration::from_secs(60))
            .build()
            .expect("Failed to create HTTP client for LLM-Registry");

        Self {
            client: Arc::new(client),
            registry_url,
        }
    }

    /// Fetch model metadata by model ID
    pub async fn get_model_metadata(&self, model_id: &str) -> Result<Option<ModelMetadata>> {
        let start = std::time::Instant::now();

        debug!(model_id = %model_id, "Fetching model metadata from registry");

        let response = self
            .client
            .get(&format!("{}/api/v1/models/{}", self.registry_url, model_id))
            .send()
            .await
            .context("Failed to fetch model metadata from registry")?;

        let latency = start.elapsed();

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            debug!(
                model_id = %model_id,
                latency_ms = latency.as_millis(),
                "Model not found in registry"
            );
            return Ok(None);
        }

        if !response.status().is_success() {
            error!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Registry returned error for model lookup"
            );
            anyhow::bail!("Registry lookup failed with status: {}", response.status());
        }

        let registry_response: RegistryResponse<ModelMetadata> = response
            .json()
            .await
            .context("Failed to parse model metadata response")?;

        debug!(
            model_id = %model_id,
            version = %registry_response.data.version,
            latency_ms = latency.as_millis(),
            "Model metadata fetched successfully"
        );

        Ok(Some(registry_response.data))
    }

    /// Fetch all versions for a model
    pub async fn get_model_versions(&self, model_id: &str) -> Result<Vec<ModelVersion>> {
        let start = std::time::Instant::now();

        debug!(model_id = %model_id, "Fetching model versions from registry");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/models/{}/versions",
                self.registry_url, model_id
            ))
            .send()
            .await
            .context("Failed to fetch model versions from registry")?;

        let latency = start.elapsed();

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch model versions"
            );
            return Ok(vec![]);
        }

        let registry_response: RegistryResponse<Vec<ModelVersion>> = response
            .json()
            .await
            .context("Failed to parse model versions response")?;

        debug!(
            model_id = %model_id,
            version_count = registry_response.data.len(),
            latency_ms = latency.as_millis(),
            "Model versions fetched successfully"
        );

        Ok(registry_response.data)
    }

    /// Fetch exchangeable assets for a model
    pub async fn get_model_assets(&self, model_id: &str) -> Result<Vec<ExchangeableAsset>> {
        let start = std::time::Instant::now();

        debug!(model_id = %model_id, "Fetching model assets from registry");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/models/{}/assets",
                self.registry_url, model_id
            ))
            .send()
            .await
            .context("Failed to fetch model assets from registry")?;

        let latency = start.elapsed();

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch model assets"
            );
            return Ok(vec![]);
        }

        let registry_response: RegistryResponse<Vec<ExchangeableAsset>> = response
            .json()
            .await
            .context("Failed to parse model assets response")?;

        debug!(
            model_id = %model_id,
            asset_count = registry_response.data.len(),
            latency_ms = latency.as_millis(),
            "Model assets fetched successfully"
        );

        Ok(registry_response.data)
    }

    /// Validate that a model exists and is active in the registry
    pub async fn validate_model(&self, model_id: &str) -> Result<bool> {
        match self.get_model_metadata(model_id).await? {
            Some(metadata) => Ok(metadata.status == ModelStatus::Active),
            None => Ok(false),
        }
    }

    /// Fetch metadata for a service by service ID (marketplace integration)
    pub async fn get_service_registry_info(
        &self,
        service_id: Uuid,
    ) -> Result<Option<ServiceRegistryInfo>> {
        let start = std::time::Instant::now();

        debug!(service_id = %service_id, "Fetching service registry info");

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/services/{}",
                self.registry_url, service_id
            ))
            .send()
            .await
            .context("Failed to fetch service registry info")?;

        let latency = start.elapsed();

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            debug!(
                service_id = %service_id,
                latency_ms = latency.as_millis(),
                "Service not found in registry"
            );
            return Ok(None);
        }

        if !response.status().is_success() {
            warn!(
                status = %response.status(),
                latency_ms = latency.as_millis(),
                "Failed to fetch service registry info"
            );
            return Ok(None);
        }

        let registry_response: RegistryResponse<ServiceRegistryInfo> = response
            .json()
            .await
            .context("Failed to parse service registry info")?;

        debug!(
            service_id = %service_id,
            latency_ms = latency.as_millis(),
            "Service registry info fetched successfully"
        );

        Ok(Some(registry_response.data))
    }
}

/// Service registration information from registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceRegistryInfo {
    pub service_id: Uuid,
    pub model_id: String,
    pub model_version: String,
    pub registered_at: String,
    pub last_verified: String,
    pub verification_status: VerificationStatus,
    pub capabilities: Vec<String>,
    pub rate_limits: RateLimitConfig,
}

/// Verification status for registered services
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VerificationStatus {
    Verified,
    Pending,
    Failed,
    Expired,
}

/// Rate limit configuration from registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub requests_per_second: u32,
    pub burst_size: u32,
    pub tokens_per_minute: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_registry_client_creation() {
        let client = RegistryClient::new("http://localhost:8081".to_string());
        assert_eq!(client.registry_url, "http://localhost:8081");
    }

    #[test]
    fn test_model_status_serialization() {
        let status = ModelStatus::Active;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"active\"");
    }

    #[test]
    fn test_asset_type_serialization() {
        let asset_type = AssetType::ModelWeights;
        let json = serde_json::to_string(&asset_type).unwrap();
        assert_eq!(json, "\"model_weights\"");
    }
}

use anyhow::{Context, Result};
use reqwest::{Client, StatusCode};
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, warn};
use uuid::Uuid;

use crate::models::{ConsumeRequest, Service, UsageInfo};

/// Request router for proxying requests to LLM services
#[derive(Clone)]
pub struct RequestRouter {
    client: Arc<Client>,
}

impl RequestRouter {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .pool_max_idle_per_host(100)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(60))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client: Arc::new(client),
        }
    }

    /// Route a request to the LLM service
    pub async fn route_request(
        &self,
        service: &Service,
        request: &ConsumeRequest,
        request_id: Uuid,
        consumer_id: Uuid,
    ) -> Result<(Value, UsageInfo, u64)> {
        let start = std::time::Instant::now();

        debug!(
            service_id = %service.id,
            request_id = %request_id,
            endpoint = %service.endpoint,
            "Routing request to LLM service"
        );

        // Build request payload
        let payload = serde_json::json!({
            "prompt": request.prompt,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "metadata": request.metadata,
        });

        // Make request with retries
        let response = self
            .client
            .post(&service.endpoint)
            .header("X-Request-ID", request_id.to_string())
            .header("X-Consumer-ID", consumer_id.to_string())
            .header("Content-Type", "application/json")
            .timeout(Duration::from_millis(service.sla.0.timeout_ms))
            .json(&payload)
            .send()
            .await
            .context("Failed to send request to LLM service")?;

        let status = response.status();
        let latency_ms = start.elapsed().as_millis() as u64;

        if !status.is_success() {
            error!(
                service_id = %service.id,
                request_id = %request_id,
                status = %status,
                "LLM service returned error"
            );

            let error_body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            anyhow::bail!("LLM service error: {} - {}", status, error_body);
        }

        let body: Value = response
            .json()
            .await
            .context("Failed to parse LLM service response")?;

        // Extract usage information
        let usage = self.extract_usage(&body)?;

        debug!(
            service_id = %service.id,
            request_id = %request_id,
            latency_ms = latency_ms,
            tokens = usage.total_tokens,
            "Request completed successfully"
        );

        Ok((body, usage, latency_ms))
    }

    /// Route request with circuit breaker pattern
    pub async fn route_with_circuit_breaker(
        &self,
        service: &Service,
        request: &ConsumeRequest,
        request_id: Uuid,
        consumer_id: Uuid,
    ) -> Result<(Value, UsageInfo, u64)> {
        // Implement circuit breaker logic
        // For now, just call the basic route_request
        // In production, use a proper circuit breaker library

        const MAX_RETRIES: u32 = 3;
        let mut last_error = None;

        for attempt in 1..=MAX_RETRIES {
            match self
                .route_request(service, request, request_id, consumer_id)
                .await
            {
                Ok(result) => return Ok(result),
                Err(e) => {
                    warn!(
                        service_id = %service.id,
                        request_id = %request_id,
                        attempt = attempt,
                        error = %e,
                        "Request failed, retrying"
                    );
                    last_error = Some(e);

                    if attempt < MAX_RETRIES {
                        // Exponential backoff
                        let delay = Duration::from_millis(100 * 2_u64.pow(attempt - 1));
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }

        Err(last_error.unwrap())
    }

    /// Extract usage information from LLM service response
    fn extract_usage(&self, response: &Value) -> Result<UsageInfo> {
        // Standard OpenAI-like response format
        if let Some(usage) = response.get("usage") {
            let prompt_tokens = usage
                .get("prompt_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;

            let completion_tokens = usage
                .get("completion_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;

            let total_tokens = usage
                .get("total_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or((prompt_tokens + completion_tokens) as u64) as u32;

            return Ok(UsageInfo {
                prompt_tokens,
                completion_tokens,
                total_tokens,
            });
        }

        // Fallback: estimate based on response
        warn!("No usage information in response, estimating");

        let response_text = response.to_string();
        let estimated_tokens = (response_text.len() / 4) as u32; // Rough estimate

        Ok(UsageInfo {
            prompt_tokens: 0,
            completion_tokens: estimated_tokens,
            total_tokens: estimated_tokens,
        })
    }
}

impl Default for RequestRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_usage() {
        let router = RequestRouter::new();

        let response = serde_json::json!({
            "choices": [{"text": "Hello world"}],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30
            }
        });

        let usage = router.extract_usage(&response).unwrap();
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 20);
        assert_eq!(usage.total_tokens, 30);
    }

    #[test]
    fn test_extract_usage_fallback() {
        let router = RequestRouter::new();

        let response = serde_json::json!({
            "choices": [{"text": "Hello world"}]
        });

        let usage = router.extract_usage(&response).unwrap();
        assert!(usage.total_tokens > 0);
    }
}

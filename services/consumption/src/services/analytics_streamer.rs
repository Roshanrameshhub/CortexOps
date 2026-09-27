use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info};
use uuid::Uuid;

use crate::models::{CostInfo, UsageInfo};

/// Analytics Hub integration for real-time metrics streaming
/// Uses async channel with batching for high throughput
#[derive(Clone)]
pub struct AnalyticsStreamer {
    sender: mpsc::Sender<AnalyticsEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type")]
pub enum AnalyticsEvent {
    #[serde(rename = "consumption_request")]
    ConsumptionRequest {
        request_id: Uuid,
        service_id: Uuid,
        consumer_id: Uuid,
        timestamp: String,
        latency_ms: u64,
        usage: UsageInfo,
        cost: CostInfo,
        status: String,
        metadata: serde_json::Value,
    },
    #[serde(rename = "rate_limit_exceeded")]
    RateLimitExceeded {
        service_id: Uuid,
        consumer_id: Uuid,
        timestamp: String,
        tier: String,
        limit: u32,
    },
    #[serde(rename = "quota_exceeded")]
    QuotaExceeded {
        service_id: Uuid,
        consumer_id: Uuid,
        timestamp: String,
        tier: String,
        used_tokens: u64,
        total_tokens: u64,
    },
    #[serde(rename = "sla_violation")]
    SLAViolation {
        service_id: Uuid,
        timestamp: String,
        metric: String,
        threshold: f64,
        actual: f64,
        severity: String,
    },
    #[serde(rename = "policy_violation")]
    PolicyViolation {
        service_id: Uuid,
        consumer_id: Uuid,
        timestamp: String,
        policy_id: String,
        policy_name: String,
        severity: String,
        message: String,
    },
    #[serde(rename = "api_key_created")]
    ApiKeyCreated {
        consumer_id: Uuid,
        service_id: Uuid,
        tier: String,
        timestamp: String,
    },
    #[serde(rename = "api_key_revoked")]
    ApiKeyRevoked {
        consumer_id: Uuid,
        service_id: Uuid,
        timestamp: String,
        reason: String,
    },
}

impl AnalyticsStreamer {
    /// Create new analytics streamer with background worker
    pub fn new(buffer_size: usize) -> Self {
        let (sender, receiver) = mpsc::channel(buffer_size);

        // Spawn background worker to process events
        tokio::spawn(async move {
            Self::process_events(receiver).await;
        });

        Self { sender }
    }

    /// Send event to analytics hub (non-blocking)
    pub async fn send(&self, event: AnalyticsEvent) -> Result<()> {
        // Non-blocking send - if buffer is full, log warning and drop event
        if let Err(e) = self.sender.try_send(event.clone()) {
            error!(
                error = %e,
                event_type = ?event,
                "Failed to send analytics event - buffer full"
            );
            // Don't fail the request if analytics fails
            return Ok(());
        }

        Ok(())
    }

    /// Record consumption request
    pub async fn record_consumption(
        &self,
        request_id: Uuid,
        service_id: Uuid,
        consumer_id: Uuid,
        latency_ms: u64,
        usage: UsageInfo,
        cost: CostInfo,
        status: String,
    ) -> Result<()> {
        let event = AnalyticsEvent::ConsumptionRequest {
            request_id,
            service_id,
            consumer_id,
            timestamp: Utc::now().to_rfc3339(),
            latency_ms,
            usage,
            cost,
            status,
            metadata: serde_json::json!({}),
        };

        self.send(event).await
    }

    /// Record rate limit exceeded
    pub async fn record_rate_limit_exceeded(
        &self,
        service_id: Uuid,
        consumer_id: Uuid,
        tier: String,
        limit: u32,
    ) -> Result<()> {
        let event = AnalyticsEvent::RateLimitExceeded {
            service_id,
            consumer_id,
            timestamp: Utc::now().to_rfc3339(),
            tier,
            limit,
        };

        self.send(event).await
    }

    /// Record quota exceeded
    pub async fn record_quota_exceeded(
        &self,
        service_id: Uuid,
        consumer_id: Uuid,
        tier: String,
        used_tokens: u64,
        total_tokens: u64,
    ) -> Result<()> {
        let event = AnalyticsEvent::QuotaExceeded {
            service_id,
            consumer_id,
            timestamp: Utc::now().to_rfc3339(),
            tier,
            used_tokens,
            total_tokens,
        };

        self.send(event).await
    }

    /// Record SLA violation
    pub async fn record_sla_violation(
        &self,
        service_id: Uuid,
        metric: String,
        threshold: f64,
        actual: f64,
        severity: String,
    ) -> Result<()> {
        let event = AnalyticsEvent::SLAViolation {
            service_id,
            timestamp: Utc::now().to_rfc3339(),
            metric,
            threshold,
            actual,
            severity,
        };

        self.send(event).await
    }

    /// Record policy violation
    pub async fn record_policy_violation(
        &self,
        service_id: Uuid,
        consumer_id: Uuid,
        policy_id: String,
        policy_name: String,
        severity: String,
        message: String,
    ) -> Result<()> {
        let event = AnalyticsEvent::PolicyViolation {
            service_id,
            consumer_id,
            timestamp: Utc::now().to_rfc3339(),
            policy_id,
            policy_name,
            severity,
            message,
        };

        self.send(event).await
    }

    /// Background worker to batch and send events to Analytics Hub
    async fn process_events(mut receiver: mpsc::Receiver<AnalyticsEvent>) {
        info!("Analytics streamer worker started");

        let mut batch: Vec<AnalyticsEvent> = Vec::with_capacity(100);
        let batch_interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
        tokio::pin!(batch_interval);

        loop {
            tokio::select! {
                // Receive events
                Some(event) = receiver.recv() => {
                    batch.push(event);

                    // Flush batch if it reaches max size
                    if batch.len() >= 100 {
                        Self::flush_batch(&mut batch).await;
                    }
                }
                // Flush batch periodically
                _ = batch_interval.tick() => {
                    if !batch.is_empty() {
                        Self::flush_batch(&mut batch).await;
                    }
                }
                // Channel closed
                else => {
                    info!("Analytics channel closed, flushing remaining events");
                    if !batch.is_empty() {
                        Self::flush_batch(&mut batch).await;
                    }
                    break;
                }
            }
        }

        info!("Analytics streamer worker stopped");
    }

    /// Flush batch of events to Analytics Hub
    async fn flush_batch(batch: &mut Vec<AnalyticsEvent>) {
        let count = batch.len();
        debug!(count = count, "Flushing analytics batch");

        // In production, send to Kafka or Analytics Hub API
        if let Err(e) = Self::send_to_analytics_hub(batch).await {
            error!(
                error = %e,
                count = count,
                "Failed to send analytics batch"
            );
        } else {
            debug!(count = count, "Analytics batch sent successfully");
        }

        batch.clear();
    }

    /// Send batch to Analytics Hub
    /// In production, this would use Kafka producer or HTTP API
    async fn send_to_analytics_hub(events: &[AnalyticsEvent]) -> Result<()> {
        // TODO: Implement actual Kafka producer or HTTP client
        // For now, log events

        let analytics_hub_url = std::env::var("ANALYTICS_HUB_URL")
            .unwrap_or_else(|_| "http://localhost:9092".to_string());

        let kafka_topic = std::env::var("KAFKA_TOPIC")
            .unwrap_or_else(|_| "marketplace.consumption.events".to_string());

        debug!(
            url = %analytics_hub_url,
            topic = %kafka_topic,
            count = events.len(),
            "Would send events to Analytics Hub"
        );

        // Kafka integration would be:
        // ```rust
        // use rdkafka::producer::{FutureProducer, FutureRecord};
        //
        // let producer: FutureProducer = ClientConfig::new()
        //     .set("bootstrap.servers", &analytics_hub_url)
        //     .create()?;
        //
        // for event in events {
        //     let payload = serde_json::to_string(event)?;
        //     producer.send(
        //         FutureRecord::to(&kafka_topic)
        //             .payload(&payload)
        //             .key(&event.service_id.to_string()),
        //         Duration::from_secs(0)
        //     ).await?;
        // }
        // ```

        // For development, just log
        for event in events {
            debug!(event = ?event, "Analytics event");
        }

        Ok(())
    }

    /// Get channel capacity and current length (for monitoring)
    pub fn metrics(&self) -> ChannelMetrics {
        ChannelMetrics {
            capacity: self.sender.capacity(),
            current_length: self.sender.max_capacity() - self.sender.capacity(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ChannelMetrics {
    pub capacity: usize,
    pub current_length: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_analytics_streamer_creation() {
        let streamer = AnalyticsStreamer::new(1000);
        let metrics = streamer.metrics();
        assert_eq!(metrics.capacity, 1000);
    }

    #[tokio::test]
    async fn test_send_consumption_event() {
        let streamer = AnalyticsStreamer::new(1000);

        let result = streamer
            .record_consumption(
                Uuid::new_v4(),
                Uuid::new_v4(),
                Uuid::new_v4(),
                95,
                UsageInfo {
                    prompt_tokens: 10,
                    completion_tokens: 20,
                    total_tokens: 30,
                },
                CostInfo {
                    amount: 0.025,
                    currency: "USD".to_string(),
                    breakdown: serde_json::json!({}),
                },
                "success".to_string(),
            )
            .await;

        assert!(result.is_ok());

        // Allow background worker to process
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }
}

use axum::{
    body::Body,
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounterVec, Opts, Registry, TextEncoder,
};
use std::sync::Arc;
use std::time::Instant;
use tracing::error;

lazy_static::lazy_static! {
    static ref HTTP_REQUESTS_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("http_requests_total", "Total number of HTTP requests"),
        &["method", "path", "status"]
    )
    .expect("Failed to create HTTP_REQUESTS_TOTAL metric");

    static ref HTTP_REQUEST_DURATION_SECONDS: HistogramVec = HistogramVec::new(
        HistogramOpts::new(
            "http_request_duration_seconds",
            "HTTP request duration in seconds"
        )
        .buckets(vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]),
        &["method", "path", "status"]
    )
    .expect("Failed to create HTTP_REQUEST_DURATION_SECONDS metric");

    static ref CONSUMPTION_REQUESTS_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("consumption_requests_total", "Total consumption requests"),
        &["service_id", "status"]
    )
    .expect("Failed to create CONSUMPTION_REQUESTS_TOTAL metric");

    static ref TOKENS_CONSUMED_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("tokens_consumed_total", "Total tokens consumed"),
        &["service_id", "consumer_id"]
    )
    .expect("Failed to create TOKENS_CONSUMED_TOTAL metric");

    static ref RATE_LIMITS_EXCEEDED_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("rate_limits_exceeded_total", "Total rate limit exceeded events"),
        &["service_id", "tier"]
    )
    .expect("Failed to create RATE_LIMITS_EXCEEDED_TOTAL metric");

    static ref QUOTA_EXCEEDED_TOTAL: IntCounterVec = IntCounterVec::new(
        Opts::new("quota_exceeded_total", "Total quota exceeded events"),
        &["service_id", "tier"]
    )
    .expect("Failed to create QUOTA_EXCEEDED_TOTAL metric");
}

/// Initialize Prometheus registry with metrics
pub fn init_metrics() -> Registry {
    let registry = Registry::new();

    registry
        .register(Box::new(HTTP_REQUESTS_TOTAL.clone()))
        .expect("Failed to register HTTP_REQUESTS_TOTAL");

    registry
        .register(Box::new(HTTP_REQUEST_DURATION_SECONDS.clone()))
        .expect("Failed to register HTTP_REQUEST_DURATION_SECONDS");

    registry
        .register(Box::new(CONSUMPTION_REQUESTS_TOTAL.clone()))
        .expect("Failed to register CONSUMPTION_REQUESTS_TOTAL");

    registry
        .register(Box::new(TOKENS_CONSUMED_TOTAL.clone()))
        .expect("Failed to register TOKENS_CONSUMED_TOTAL");

    registry
        .register(Box::new(RATE_LIMITS_EXCEEDED_TOTAL.clone()))
        .expect("Failed to register RATE_LIMITS_EXCEEDED_TOTAL");

    registry
        .register(Box::new(QUOTA_EXCEEDED_TOTAL.clone()))
        .expect("Failed to register QUOTA_EXCEEDED_TOTAL");

    registry
}

/// Metrics middleware - records HTTP metrics
pub async fn metrics_middleware(
    request: Request,
    next: Next,
) -> Response {
    let start = Instant::now();
    let method = request.method().to_string();
    let path = request.uri().path().to_string();

    let response = next.run(request).await;

    let duration = start.elapsed().as_secs_f64();
    let status = response.status().as_u16().to_string();

    HTTP_REQUESTS_TOTAL
        .with_label_values(&[&method, &path, &status])
        .inc();

    HTTP_REQUEST_DURATION_SECONDS
        .with_label_values(&[&method, &path, &status])
        .observe(duration);

    response
}

/// Handler to expose Prometheus metrics
pub async fn metrics_handler() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();

    let mut buffer = Vec::new();
    if let Err(e) = encoder.encode(&metric_families, &mut buffer) {
        error!(error = %e, "Failed to encode metrics");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to encode metrics".to_string(),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        [("content-type", encoder.format_type())],
        buffer,
    )
        .into_response()
}

/// Helper functions to record specific metrics
pub mod record {
    use super::*;
    use uuid::Uuid;

    pub fn consumption_request(service_id: Uuid, success: bool) {
        let status = if success { "success" } else { "error" };
        CONSUMPTION_REQUESTS_TOTAL
            .with_label_values(&[&service_id.to_string(), status])
            .inc();
    }

    pub fn tokens_consumed(service_id: Uuid, consumer_id: Uuid, tokens: u32) {
        TOKENS_CONSUMED_TOTAL
            .with_label_values(&[&service_id.to_string(), &consumer_id.to_string()])
            .inc_by(tokens as u64);
    }

    pub fn rate_limit_exceeded(service_id: Uuid, tier: &str) {
        RATE_LIMITS_EXCEEDED_TOTAL
            .with_label_values(&[&service_id.to_string(), tier])
            .inc();
    }

    pub fn quota_exceeded(service_id: Uuid, tier: &str) {
        QUOTA_EXCEEDED_TOTAL
            .with_label_values(&[&service_id.to_string(), tier])
            .inc();
    }
}

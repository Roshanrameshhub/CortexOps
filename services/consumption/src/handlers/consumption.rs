use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use tracing::{debug, error, info, instrument};
use uuid::Uuid;
use validator::Validate;

use crate::{
    models::{ConsumeRequest, ConsumeResponse},
    services::{QuotaManager, RateLimiter, RequestRouter, UsageMeter},
    AppState, Result,
};

/// Main consumption endpoint - proxies request to LLM service
#[instrument(skip(state, request))]
pub async fn consume_service(
    State(state): State<AppState>,
    Path(service_id): Path<Uuid>,
    consumer_id: Uuid, // Injected by auth middleware
    Json(request): Json<ConsumeRequest>,
) -> Result<Json<ConsumeResponse>> {
    // Validate request
    request
        .validate()
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid request: {}", e)))?;

    info!(
        service_id = %service_id,
        consumer_id = %consumer_id,
        "Processing consumption request"
    );

    // Get service details
    let service = sqlx::query_as(
        r#"
        SELECT id, name, version, endpoint, status, pricing, sla, created_at
        FROM services
        WHERE id = $1
        "#,
    )
    .bind(service_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "Database error");
        (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
    })?
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            format!("Service {} not found", service_id),
        )
    })?;

    // Get API key to determine tier
    // In production, this would come from authentication middleware
    let api_key = sqlx::query_as(
        r#"
        SELECT id, key_hash, consumer_id, service_id, tier,
               created_at, expires_at, revoked_at, metadata
        FROM api_keys
        WHERE consumer_id = $1 AND service_id = $2
        AND revoked_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(consumer_id)
    .bind(service_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!(error = %e, "Failed to get API key");
        (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
    })?
    .ok_or_else(|| {
        (
            StatusCode::FORBIDDEN,
            "No valid API key found for this service".to_string(),
        )
    })?;

    let tier = api_key.get_tier();

    // Check rate limit
    let rate_limit_status = state
        .rate_limiter
        .check_rate_limit(consumer_id, service_id, &tier)
        .await
        .map_err(|e| {
            error!(error = %e, "Rate limit check failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Rate limit check failed".to_string(),
            )
        })?;

    if rate_limit_status.exceeded {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            format!(
                "Rate limit exceeded. Retry after {} seconds",
                rate_limit_status.retry_after_seconds.unwrap_or(60)
            ),
        ));
    }

    // Check quota
    let quota_status = state
        .quota_manager
        .check_quota(consumer_id, service_id, &tier)
        .await
        .map_err(|e| {
            error!(error = %e, "Quota check failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Quota check failed".to_string(),
            )
        })?;

    if quota_status.exceeded {
        return Err((
            StatusCode::PAYMENT_REQUIRED,
            format!(
                "Quota exceeded. Used {}/{} tokens. Resets at {}",
                quota_status.used_tokens, quota_status.total_tokens, quota_status.reset_at
            ),
        ));
    }

    // Route request to LLM service
    let request_id = Uuid::new_v4();
    let (response_data, usage, latency_ms) = state
        .request_router
        .route_with_circuit_breaker(&service, &request, request_id, consumer_id)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to route request");
            (
                StatusCode::BAD_GATEWAY,
                format!("Service error: {}", e),
            )
        })?;

    // Calculate cost
    let cost = state
        .usage_meter
        .calculate_cost(&service.pricing.0, &usage)
        .map_err(|e| {
            error!(error = %e, "Failed to calculate cost");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Cost calculation failed".to_string(),
            )
        })?;

    // Record usage
    state
        .usage_meter
        .record_usage(
            request_id,
            service_id,
            consumer_id,
            usage.clone(),
            latency_ms as i32,
            "success".to_string(),
            None,
        )
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to record usage");
            // Don't fail the request if usage recording fails
        })
        .ok();

    // Update quota
    state
        .quota_manager
        .update_quota(consumer_id, service_id, &usage)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to update quota");
            // Don't fail the request if quota update fails
        })
        .ok();

    info!(
        request_id = %request_id,
        service_id = %service_id,
        consumer_id = %consumer_id,
        latency_ms = latency_ms,
        tokens = usage.total_tokens,
        cost = cost.amount,
        "Request completed successfully"
    );

    Ok(Json(ConsumeResponse {
        request_id,
        response: response_data,
        usage,
        cost,
        latency_ms,
    }))
}

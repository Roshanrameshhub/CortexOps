use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use tracing::{error, instrument};
use uuid::Uuid;

use crate::{
    models::QuotaStatus,
    services::QuotaManager,
    AppState, Result,
};

/// Get quota status for a service
#[instrument(skip(state))]
pub async fn get_quota_status(
    State(state): State<AppState>,
    Path(service_id): Path<Uuid>,
    consumer_id: Uuid, // Injected by auth middleware
) -> Result<Json<QuotaStatus>> {
    // Get API key to determine tier
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

    let quota_status = state
        .quota_manager
        .check_quota(consumer_id, service_id, &tier)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to check quota");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Quota check failed".to_string(),
            )
        })?;

    Ok(Json(quota_status))
}

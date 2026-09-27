use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use tracing::{error, info, instrument};
use uuid::Uuid;
use validator::Validate;

use crate::{
    models::{ApiKey, ApiKeyResponse, CreateApiKeyRequest},
    services::ApiKeyManager,
    AppState, Result,
};

/// Create a new API key
#[instrument(skip(state, request))]
pub async fn create_api_key(
    State(state): State<AppState>,
    consumer_id: Uuid, // Injected by auth middleware
    Json(request): Json<CreateApiKeyRequest>,
) -> Result<Json<ApiKeyResponse>> {
    // Validate request
    request
        .validate()
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid request: {}", e)))?;

    info!(
        consumer_id = %consumer_id,
        service_id = %request.service_id,
        tier = ?request.tier,
        "Creating API key"
    );

    let api_key_response = state
        .api_key_manager
        .create_api_key(consumer_id, request)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to create API key");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to create API key: {}", e),
            )
        })?;

    Ok(Json(api_key_response))
}

/// Revoke an API key
#[instrument(skip(state))]
pub async fn revoke_api_key(
    State(state): State<AppState>,
    Path(key_id): Path<Uuid>,
    consumer_id: Uuid, // Injected by auth middleware
) -> Result<StatusCode> {
    info!(
        consumer_id = %consumer_id,
        key_id = %key_id,
        "Revoking API key"
    );

    state
        .api_key_manager
        .revoke_key(key_id, consumer_id)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to revoke API key");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to revoke API key: {}", e),
            )
        })?;

    Ok(StatusCode::NO_CONTENT)
}

/// List all API keys for the authenticated consumer
#[instrument(skip(state))]
pub async fn list_api_keys(
    State(state): State<AppState>,
    consumer_id: Uuid, // Injected by auth middleware
) -> Result<Json<Vec<ApiKey>>> {
    let keys = state
        .api_key_manager
        .list_keys(consumer_id)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to list API keys");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to retrieve API keys".to_string(),
            )
        })?;

    Ok(Json(keys))
}

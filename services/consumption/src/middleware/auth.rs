use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use tracing::{debug, warn};
use uuid::Uuid;

use crate::AppState;

/// Authentication middleware - extracts and validates API key
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, (StatusCode, String)> {
    // Extract API key from Authorization header
    let api_key = request
        .headers()
        .get("Authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            if value.starts_with("Bearer ") {
                Some(value[7..].to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Missing or invalid Authorization header".to_string(),
            )
        })?;

    debug!(api_key_prefix = &api_key[..10.min(api_key.len())], "Validating API key");

    // Validate API key
    let api_key_record = state
        .api_key_manager
        .validate_key(&api_key)
        .await
        .map_err(|e| {
            warn!(error = %e, "API key validation failed");
            (StatusCode::UNAUTHORIZED, "Invalid API key".to_string())
        })?;

    // Insert consumer_id into request extensions for use in handlers
    request.extensions_mut().insert(api_key_record.consumer_id);

    debug!(
        consumer_id = %api_key_record.consumer_id,
        service_id = %api_key_record.service_id,
        "Authentication successful"
    );

    Ok(next.run(request).await)
}

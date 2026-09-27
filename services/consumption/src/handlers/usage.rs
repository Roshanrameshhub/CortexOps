use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use tracing::{error, instrument};
use uuid::Uuid;

use crate::{
    models::UsageStats,
    services::UsageMeter,
    AppState, Result,
};

#[derive(Debug, Deserialize)]
pub struct UsageQuery {
    #[serde(default = "default_days")]
    days: i64,
}

fn default_days() -> i64 {
    30
}

/// Get usage statistics for a service
#[instrument(skip(state))]
pub async fn get_usage_stats(
    State(state): State<AppState>,
    Path(service_id): Path<Uuid>,
    Query(query): Query<UsageQuery>,
    consumer_id: Uuid, // Injected by auth middleware
) -> Result<Json<UsageStats>> {
    let stats = state
        .usage_meter
        .get_usage_stats(consumer_id, service_id, query.days)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to get usage stats");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to retrieve usage statistics".to_string(),
            )
        })?;

    Ok(Json(stats))
}

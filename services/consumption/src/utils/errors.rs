use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use std::fmt;
use thiserror::Error;

/// Application-wide error type
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("Authentication failed: {0}")]
    Authentication(String),

    #[error("Authorization failed: {0}")]
    Authorization(String),

    #[error("Rate limit exceeded: {0}")]
    RateLimitExceeded(String),

    #[error("Quota exceeded: {0}")]
    QuotaExceeded(String),

    #[error("Service not found: {0}")]
    ServiceNotFound(String),

    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Internal server error: {0}")]
    Internal(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Timeout: {0}")]
    Timeout(String),
}

/// Error response payload
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    pub status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl AppError {
    /// Get the HTTP status code for this error
    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Redis(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Authentication(_) => StatusCode::UNAUTHORIZED,
            AppError::Authorization(_) => StatusCode::FORBIDDEN,
            AppError::RateLimitExceeded(_) => StatusCode::TOO_MANY_REQUESTS,
            AppError::QuotaExceeded(_) => StatusCode::PAYMENT_REQUIRED,
            AppError::ServiceNotFound(_) => StatusCode::NOT_FOUND,
            AppError::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            AppError::InvalidRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            AppError::Timeout(_) => StatusCode::GATEWAY_TIMEOUT,
        }
    }

    /// Get error type string
    pub fn error_type(&self) -> &str {
        match self {
            AppError::Database(_) => "database_error",
            AppError::Redis(_) => "redis_error",
            AppError::Authentication(_) => "authentication_error",
            AppError::Authorization(_) => "authorization_error",
            AppError::RateLimitExceeded(_) => "rate_limit_exceeded",
            AppError::QuotaExceeded(_) => "quota_exceeded",
            AppError::ServiceNotFound(_) => "service_not_found",
            AppError::ServiceUnavailable(_) => "service_unavailable",
            AppError::InvalidRequest(_) => "invalid_request",
            AppError::Internal(_) => "internal_error",
            AppError::Validation(_) => "validation_error",
            AppError::Timeout(_) => "timeout",
        }
    }

    /// Convert to error response
    pub fn to_response(&self) -> ErrorResponse {
        ErrorResponse {
            error: self.error_type().to_string(),
            message: self.to_string(),
            status: self.status_code().as_u16(),
            details: None,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let body = Json(self.to_response());

        (status, body).into_response()
    }
}

/// Result type alias for application errors
pub type AppResult<T> = std::result::Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_status_codes() {
        assert_eq!(
            AppError::Authentication("test".into()).status_code(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            AppError::RateLimitExceeded("test".into()).status_code(),
            StatusCode::TOO_MANY_REQUESTS
        );
        assert_eq!(
            AppError::QuotaExceeded("test".into()).status_code(),
            StatusCode::PAYMENT_REQUIRED
        );
    }

    #[test]
    fn test_error_types() {
        assert_eq!(
            AppError::Authentication("test".into()).error_type(),
            "authentication_error"
        );
        assert_eq!(
            AppError::RateLimitExceeded("test".into()).error_type(),
            "rate_limit_exceeded"
        );
    }
}

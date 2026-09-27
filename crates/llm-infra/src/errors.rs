//! Standardized error types for LLM-Dev-Ops services.
//!
//! Provides a comprehensive error hierarchy with HTTP status code mapping
//! and structured error responses.

use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

/// Result type alias for InfraError
pub type InfraResult<T> = Result<T, InfraError>;

/// HTTP status codes for errors
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u16)]
pub enum HttpStatus {
    /// 400 Bad Request
    BadRequest = 400,
    /// 401 Unauthorized
    Unauthorized = 401,
    /// 402 Payment Required (quota exceeded)
    PaymentRequired = 402,
    /// 403 Forbidden
    Forbidden = 403,
    /// 404 Not Found
    NotFound = 404,
    /// 409 Conflict
    Conflict = 409,
    /// 422 Unprocessable Entity
    UnprocessableEntity = 422,
    /// 429 Too Many Requests
    TooManyRequests = 429,
    /// 500 Internal Server Error
    InternalServerError = 500,
    /// 502 Bad Gateway
    BadGateway = 502,
    /// 503 Service Unavailable
    ServiceUnavailable = 503,
    /// 504 Gateway Timeout
    GatewayTimeout = 504,
}

impl HttpStatus {
    /// Get the numeric status code
    pub fn as_u16(&self) -> u16 {
        *self as u16
    }
}

/// Error codes for structured error handling
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    /// Validation error
    ValidationError,
    /// Authentication error
    AuthenticationError,
    /// Authorization error
    AuthorizationError,
    /// Resource not found
    NotFound,
    /// Conflict error
    Conflict,
    /// Business rule error
    BusinessRuleError,
    /// Rate limit exceeded
    RateLimitExceeded,
    /// Quota exceeded
    QuotaExceeded,
    /// Internal server error
    InternalError,
    /// Database error
    DatabaseError,
    /// Cache error
    CacheError,
    /// External service error
    ExternalServiceError,
    /// Service unavailable
    ServiceUnavailable,
    /// Timeout error
    Timeout,
    /// Configuration error
    ConfigurationError,
    /// Policy violation
    PolicyViolation,
}

/// Main error type for LLM-Dev-Ops infrastructure
#[derive(Debug, Error)]
pub struct InfraError {
    /// Error code
    pub code: ErrorCode,
    /// HTTP status code
    pub status: HttpStatus,
    /// Human-readable error message
    pub message: String,
    /// Additional error details
    #[source]
    pub source: Option<Box<dyn std::error::Error + Send + Sync>>,
    /// Whether this is an operational error (expected) vs programming error
    pub is_operational: bool,
    /// Retry-after seconds (for rate limiting)
    pub retry_after_seconds: Option<u64>,
    /// Additional context
    pub details: Option<serde_json::Value>,
}

impl fmt::Display for InfraError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{:?}] {}", self.code, self.message)
    }
}

impl InfraError {
    /// Create a new InfraError
    pub fn new(code: ErrorCode, status: HttpStatus, message: impl Into<String>) -> Self {
        Self {
            code,
            status,
            message: message.into(),
            source: None,
            is_operational: true,
            retry_after_seconds: None,
            details: None,
        }
    }

    /// Add a source error
    pub fn with_source(mut self, source: impl std::error::Error + Send + Sync + 'static) -> Self {
        self.source = Some(Box::new(source));
        self
    }

    /// Add details
    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }

    /// Mark as non-operational (programming error)
    pub fn non_operational(mut self) -> Self {
        self.is_operational = false;
        self
    }

    /// Add retry-after header value
    pub fn with_retry_after(mut self, seconds: u64) -> Self {
        self.retry_after_seconds = Some(seconds);
        self
    }

    // ========================================================================
    // 4xx Client Errors
    // ========================================================================

    /// Create a validation error (400)
    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::ValidationError, HttpStatus::BadRequest, message)
    }

    /// Create an authentication error (401)
    pub fn authentication(message: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::AuthenticationError,
            HttpStatus::Unauthorized,
            message,
        )
    }

    /// Create an authorization error (403)
    pub fn authorization(message: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::AuthorizationError,
            HttpStatus::Forbidden,
            message,
        )
    }

    /// Create a not found error (404)
    pub fn not_found(resource: &str, identifier: &str) -> Self {
        Self::new(
            ErrorCode::NotFound,
            HttpStatus::NotFound,
            format!("{} '{}' not found", resource, identifier),
        )
        .with_details(serde_json::json!({
            "resource": resource,
            "identifier": identifier
        }))
    }

    /// Create a conflict error (409)
    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Conflict, HttpStatus::Conflict, message)
    }

    /// Create a business rule error (422)
    pub fn business_rule(message: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::BusinessRuleError,
            HttpStatus::UnprocessableEntity,
            message,
        )
    }

    /// Create a rate limit error (429)
    pub fn rate_limit(retry_after_seconds: Option<u64>) -> Self {
        let mut error = Self::new(
            ErrorCode::RateLimitExceeded,
            HttpStatus::TooManyRequests,
            "Rate limit exceeded",
        );
        if let Some(seconds) = retry_after_seconds {
            error = error.with_retry_after(seconds);
        }
        error
    }

    /// Create a quota exceeded error (402)
    pub fn quota_exceeded(message: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::QuotaExceeded,
            HttpStatus::PaymentRequired,
            message,
        )
    }

    // ========================================================================
    // 5xx Server Errors
    // ========================================================================

    /// Create an internal error (500)
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::InternalError,
            HttpStatus::InternalServerError,
            message,
        )
        .non_operational()
    }

    /// Create a database error (500)
    pub fn database(message: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::DatabaseError,
            HttpStatus::InternalServerError,
            message,
        )
    }

    /// Create a cache error (500)
    pub fn cache(message: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::CacheError,
            HttpStatus::InternalServerError,
            message,
        )
    }

    /// Create an external service error (502)
    pub fn external_service(service: &str, message: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::ExternalServiceError,
            HttpStatus::BadGateway,
            format!("{}: {}", service, message.into()),
        )
        .with_details(serde_json::json!({ "service": service }))
    }

    /// Create a service unavailable error (503)
    pub fn service_unavailable(message: impl Into<String>, retry_after: Option<u64>) -> Self {
        let mut error = Self::new(
            ErrorCode::ServiceUnavailable,
            HttpStatus::ServiceUnavailable,
            message,
        );
        if let Some(seconds) = retry_after {
            error = error.with_retry_after(seconds);
        }
        error
    }

    /// Create a timeout error (504)
    pub fn timeout(service: Option<&str>) -> Self {
        let message = match service {
            Some(s) => format!("Request to {} timed out", s),
            None => "Request timed out".to_string(),
        };
        Self::new(ErrorCode::Timeout, HttpStatus::GatewayTimeout, message)
    }

    /// Create a configuration error (500)
    pub fn configuration(message: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::ConfigurationError,
            HttpStatus::InternalServerError,
            message,
        )
        .non_operational()
    }

    /// Create a policy violation error (403)
    pub fn policy_violation(message: impl Into<String>, violations: Vec<String>) -> Self {
        Self::new(
            ErrorCode::PolicyViolation,
            HttpStatus::Forbidden,
            message,
        )
        .with_details(serde_json::json!({ "violations": violations }))
    }

    /// Convert to JSON response
    pub fn to_response(&self) -> ErrorResponse {
        ErrorResponse {
            error: self.code.clone(),
            message: self.message.clone(),
            status: self.status.as_u16(),
            details: self.details.clone(),
            retry_after: self.retry_after_seconds,
        }
    }
}

/// Error response structure for HTTP responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    /// Error code
    pub error: ErrorCode,
    /// Error message
    pub message: String,
    /// HTTP status code
    pub status: u16,
    /// Additional details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    /// Retry after seconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after: Option<u64>,
}

// ============================================================================
// Conversions from common error types
// ============================================================================

impl From<std::io::Error> for InfraError {
    fn from(err: std::io::Error) -> Self {
        InfraError::internal(format!("IO error: {}", err)).with_source(err)
    }
}

impl From<serde_json::Error> for InfraError {
    fn from(err: serde_json::Error) -> Self {
        InfraError::validation(format!("JSON error: {}", err)).with_source(err)
    }
}

#[cfg(feature = "config")]
impl From<config::ConfigError> for InfraError {
    fn from(err: config::ConfigError) -> Self {
        InfraError::configuration(format!("Configuration error: {}", err))
    }
}

#[cfg(feature = "cache")]
impl From<redis::RedisError> for InfraError {
    fn from(err: redis::RedisError) -> Self {
        InfraError::cache(format!("Redis error: {}", err)).with_source(err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_not_found_error() {
        let err = InfraError::not_found("User", "123");
        assert_eq!(err.code, ErrorCode::NotFound);
        assert_eq!(err.status, HttpStatus::NotFound);
        assert!(err.message.contains("User '123' not found"));
    }

    #[test]
    fn test_rate_limit_error() {
        let err = InfraError::rate_limit(Some(60));
        assert_eq!(err.code, ErrorCode::RateLimitExceeded);
        assert_eq!(err.status, HttpStatus::TooManyRequests);
        assert_eq!(err.retry_after_seconds, Some(60));
    }

    #[test]
    fn test_error_response() {
        let err = InfraError::validation("Invalid input");
        let response = err.to_response();
        assert_eq!(response.status, 400);
        assert_eq!(response.message, "Invalid input");
    }
}

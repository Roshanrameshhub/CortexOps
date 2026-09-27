//! # llm-infra
//!
//! Shared infrastructure utilities for LLM-Dev-Ops ecosystem.
//!
//! This crate provides common infrastructure components used across LLM-Dev-Ops services:
//!
//! - **Configuration**: Type-safe configuration loading from environment variables
//! - **Logging**: Structured logging with tracing integration
//! - **Tracing**: Distributed tracing with OpenTelemetry and Jaeger support
//! - **Caching**: Redis-based caching with connection pooling
//! - **Retry**: Retry logic with exponential backoff and circuit breaker
//! - **Rate Limiting**: Distributed rate limiting using token bucket algorithm
//! - **Errors**: Standardized error types with HTTP status code mapping
//!
//! ## Feature Flags
//!
//! - `default`: Includes `config`, `logging`, and `errors`
//! - `full`: Includes all features
//! - `config`: Configuration loading utilities
//! - `logging`: Structured logging with tracing
//! - `tracing`: Distributed tracing with OpenTelemetry
//! - `cache`: Redis caching utilities
//! - `retry`: Retry logic and circuit breaker
//! - `rate-limit`: Distributed rate limiting
//! - `errors`: Standardized error types
//!
//! ## Quick Start
//!
//! ```rust,ignore
//! use llm_infra::{config, logging, errors};
//!
//! // Load configuration
//! let config = config::load_from_env()?;
//!
//! // Initialize logging
//! logging::init(&config)?;
//!
//! // Use structured errors
//! fn example() -> Result<(), errors::InfraError> {
//!     Err(errors::InfraError::not_found("User", "123"))
//! }
//! ```

#![warn(missing_docs)]
#![warn(rustdoc::missing_crate_level_docs)]

#[cfg(feature = "config")]
pub mod config;

#[cfg(feature = "logging")]
pub mod logging;

#[cfg(feature = "tracing")]
pub mod tracing_utils;

#[cfg(feature = "cache")]
pub mod cache;

#[cfg(feature = "retry")]
pub mod retry;

#[cfg(feature = "rate-limit")]
pub mod rate_limit;

#[cfg(feature = "errors")]
pub mod errors;

/// Version of the llm-infra crate
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Re-export commonly used types
pub mod prelude {
    #[cfg(feature = "errors")]
    pub use crate::errors::{InfraError, InfraResult};

    #[cfg(feature = "config")]
    pub use crate::config::InfraConfig;

    #[cfg(feature = "logging")]
    pub use crate::logging::{debug, error, info, trace, warn};

    #[cfg(feature = "retry")]
    pub use crate::retry::{with_retry, RetryConfig};

    #[cfg(feature = "cache")]
    pub use crate::cache::CacheClient;
}

//! Structured logging utilities for LLM-Dev-Ops services.
//!
//! Provides tracing-based logging with structured context and JSON output.

use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
};

pub use tracing::{debug, error, info, trace, warn, instrument, span, Level};

/// Initialize logging with the given configuration
pub fn init(config: &crate::config::InfraConfig) -> Result<(), crate::errors::InfraError> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        let level = match config.log_level {
            crate::config::LogLevel::Trace => "trace",
            crate::config::LogLevel::Debug => "debug",
            crate::config::LogLevel::Info => "info",
            crate::config::LogLevel::Warn => "warn",
            crate::config::LogLevel::Error => "error",
        };
        EnvFilter::new(level)
    });

    let is_production = matches!(config.environment, crate::config::Environment::Production);

    if is_production {
        // JSON output for production
        let fmt_layer = fmt::layer()
            .json()
            .with_target(true)
            .with_line_number(true)
            .with_thread_ids(true)
            .with_span_events(FmtSpan::CLOSE);

        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .try_init()
            .map_err(|e| crate::errors::InfraError::configuration(format!("Failed to initialize logging: {}", e)))?;
    } else {
        // Pretty output for development
        let fmt_layer = fmt::layer()
            .pretty()
            .with_target(true)
            .with_line_number(true)
            .with_span_events(FmtSpan::CLOSE);

        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .try_init()
            .map_err(|e| crate::errors::InfraError::configuration(format!("Failed to initialize logging: {}", e)))?;
    }

    info!(
        service = %config.service_name,
        version = %config.service_version,
        environment = ?config.environment,
        "Logging initialized"
    );

    Ok(())
}

/// Initialize logging with defaults (for simple cases)
pub fn init_default() -> Result<(), crate::errors::InfraError> {
    let config = crate::config::load_from_env()?;
    init(&config)
}

/// Log a request start
#[macro_export]
macro_rules! log_request {
    ($request_id:expr, $method:expr, $path:expr) => {
        tracing::info!(
            request_id = %$request_id,
            method = %$method,
            path = %$path,
            "Request started"
        );
    };
    ($request_id:expr, $method:expr, $path:expr, $($field:tt)*) => {
        tracing::info!(
            request_id = %$request_id,
            method = %$method,
            path = %$path,
            $($field)*,
            "Request started"
        );
    };
}

/// Log a request completion
#[macro_export]
macro_rules! log_response {
    ($request_id:expr, $status:expr, $duration_ms:expr) => {
        tracing::info!(
            request_id = %$request_id,
            status = $status,
            duration_ms = $duration_ms,
            "Request completed"
        );
    };
}

/// Log an external service call
#[macro_export]
macro_rules! log_external_call {
    ($service:expr, $method:expr, $url:expr, $success:expr, $duration_ms:expr) => {
        if $success {
            tracing::info!(
                service = %$service,
                method = %$method,
                url = %$url,
                success = true,
                duration_ms = $duration_ms,
                "External call completed"
            );
        } else {
            tracing::warn!(
                service = %$service,
                method = %$method,
                url = %$url,
                success = false,
                duration_ms = $duration_ms,
                "External call failed"
            );
        }
    };
}

/// Log a cache operation
#[macro_export]
macro_rules! log_cache {
    ($operation:expr, $key:expr, $hit:expr) => {
        tracing::debug!(
            operation = %$operation,
            key = %$key,
            hit = $hit,
            "Cache operation"
        );
    };
}

/// Log an authentication event
#[macro_export]
macro_rules! log_auth {
    ($action:expr, $user_id:expr, $success:expr) => {
        if $success {
            tracing::info!(
                action = %$action,
                user_id = %$user_id,
                success = true,
                "Authentication event"
            );
        } else {
            tracing::warn!(
                action = %$action,
                user_id = %$user_id,
                success = false,
                "Authentication event"
            );
        }
    };
}

/// Log an audit event
#[macro_export]
macro_rules! log_audit {
    ($user_id:expr, $action:expr, $resource:expr) => {
        tracing::info!(
            user_id = %$user_id,
            action = %$action,
            resource = %$resource,
            "Audit event"
        );
    };
    ($user_id:expr, $action:expr, $resource:expr, $resource_id:expr) => {
        tracing::info!(
            user_id = %$user_id,
            action = %$action,
            resource = %$resource,
            resource_id = %$resource_id,
            "Audit event"
        );
    };
}

/// Log a metric
#[macro_export]
macro_rules! log_metric {
    ($name:expr, $value:expr) => {
        tracing::info!(
            metric = %$name,
            value = $value,
            "Metric recorded"
        );
    };
    ($name:expr, $value:expr, $unit:expr) => {
        tracing::info!(
            metric = %$name,
            value = $value,
            unit = %$unit,
            "Metric recorded"
        );
    };
}

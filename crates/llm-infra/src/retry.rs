//! Retry utilities with exponential backoff and circuit breaker.
//!
//! Provides robust retry logic for handling transient failures.

use std::future::Future;
use std::time::Duration;
use tokio::time::sleep;

/// Retry configuration
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retries
    pub max_retries: u32,
    /// Initial delay in milliseconds
    pub initial_delay_ms: u64,
    /// Maximum delay in milliseconds
    pub max_delay_ms: u64,
    /// Backoff multiplier
    pub backoff_multiplier: f64,
    /// Add jitter to delays
    pub jitter: bool,
    /// Timeout per attempt in milliseconds
    pub timeout_ms: u64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay_ms: 100,
            max_delay_ms: 10000,
            backoff_multiplier: 2.0,
            jitter: true,
            timeout_ms: 30000,
        }
    }
}

/// Calculate delay with exponential backoff
pub fn calculate_delay(attempt: u32, config: &RetryConfig) -> Duration {
    let base_delay = config.initial_delay_ms as f64 * config.backoff_multiplier.powi(attempt as i32);
    let capped_delay = base_delay.min(config.max_delay_ms as f64);

    let final_delay = if config.jitter {
        let jitter_factor = 1.0 + rand::random::<f64>() * 0.25;
        capped_delay * jitter_factor
    } else {
        capped_delay
    };

    Duration::from_millis(final_delay as u64)
}

/// Check if an error is retryable (default implementation)
pub fn is_retryable_error(error: &dyn std::error::Error) -> bool {
    let message = error.to_string().to_lowercase();

    // Network errors
    if message.contains("connection refused")
        || message.contains("connection reset")
        || message.contains("timed out")
        || message.contains("socket hang up")
        || message.contains("network error")
    {
        return true;
    }

    // Check for HTTP status codes in error message
    if message.contains("500")
        || message.contains("502")
        || message.contains("503")
        || message.contains("504")
        || message.contains("429")
    {
        return true;
    }

    false
}

/// Execute a future with retry logic
pub async fn with_retry<F, Fut, T, E>(
    mut f: F,
    config: &RetryConfig,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::error::Error,
{
    let mut last_error: Option<E> = None;

    for attempt in 0..=config.max_retries {
        match tokio::time::timeout(Duration::from_millis(config.timeout_ms), f()).await {
            Ok(Ok(result)) => return Ok(result),
            Ok(Err(e)) => {
                if !is_retryable_error(&e) || attempt >= config.max_retries {
                    return Err(e);
                }

                let delay = calculate_delay(attempt, config);
                tracing::warn!(
                    attempt = attempt + 1,
                    max_retries = config.max_retries,
                    delay_ms = delay.as_millis() as u64,
                    error = %e,
                    "Retrying after error"
                );

                sleep(delay).await;
                last_error = Some(e);
            }
            Err(_timeout) => {
                if attempt >= config.max_retries {
                    return Err(last_error.expect("No error captured"));
                }

                let delay = calculate_delay(attempt, config);
                tracing::warn!(
                    attempt = attempt + 1,
                    max_retries = config.max_retries,
                    delay_ms = delay.as_millis() as u64,
                    "Retrying after timeout"
                );

                sleep(delay).await;
            }
        }
    }

    Err(last_error.expect("No error captured"))
}

/// Circuit breaker state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, requests flow normally
    Closed,
    /// Circuit is open, requests are rejected
    Open,
    /// Circuit is half-open, testing if service recovered
    HalfOpen,
}

/// Circuit breaker configuration
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening
    pub failure_threshold: u32,
    /// Time before attempting to close (milliseconds)
    pub reset_timeout_ms: u64,
    /// Successes needed in half-open to close
    pub success_threshold: u32,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            reset_timeout_ms: 30000,
            success_threshold: 3,
        }
    }
}

/// Circuit breaker for protecting against cascading failures
pub struct CircuitBreaker {
    name: String,
    config: CircuitBreakerConfig,
    state: std::sync::atomic::AtomicU8,
    failures: std::sync::atomic::AtomicU32,
    successes: std::sync::atomic::AtomicU32,
    last_failure_time: std::sync::atomic::AtomicU64,
}

impl CircuitBreaker {
    /// Create a new circuit breaker
    pub fn new(name: impl Into<String>, config: CircuitBreakerConfig) -> Self {
        Self {
            name: name.into(),
            config,
            state: std::sync::atomic::AtomicU8::new(0), // Closed
            failures: std::sync::atomic::AtomicU32::new(0),
            successes: std::sync::atomic::AtomicU32::new(0),
            last_failure_time: std::sync::atomic::AtomicU64::new(0),
        }
    }

    /// Get current state
    pub fn state(&self) -> CircuitState {
        match self.state.load(std::sync::atomic::Ordering::SeqCst) {
            0 => CircuitState::Closed,
            1 => CircuitState::Open,
            _ => CircuitState::HalfOpen,
        }
    }

    /// Check if circuit allows request
    pub fn allow_request(&self) -> bool {
        let state = self.state();

        if state == CircuitState::Closed {
            return true;
        }

        if state == CircuitState::Open {
            let last_failure = self.last_failure_time.load(std::sync::atomic::Ordering::SeqCst);
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            if now - last_failure >= self.config.reset_timeout_ms {
                self.state.store(2, std::sync::atomic::Ordering::SeqCst); // HalfOpen
                self.successes.store(0, std::sync::atomic::Ordering::SeqCst);
                return true;
            }

            return false;
        }

        // HalfOpen - allow limited requests
        true
    }

    /// Record a successful call
    pub fn record_success(&self) {
        self.failures.store(0, std::sync::atomic::Ordering::SeqCst);

        if self.state() == CircuitState::HalfOpen {
            let successes = self.successes.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            if successes >= self.config.success_threshold {
                self.state.store(0, std::sync::atomic::Ordering::SeqCst); // Closed
                tracing::info!(name = %self.name, "Circuit breaker closed");
            }
        }
    }

    /// Record a failed call
    pub fn record_failure(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        self.last_failure_time.store(now, std::sync::atomic::Ordering::SeqCst);

        if self.state() == CircuitState::HalfOpen {
            self.state.store(1, std::sync::atomic::Ordering::SeqCst); // Open
            tracing::warn!(name = %self.name, "Circuit breaker opened (failure in half-open)");
            return;
        }

        let failures = self.failures.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        if failures >= self.config.failure_threshold {
            self.state.store(1, std::sync::atomic::Ordering::SeqCst); // Open
            tracing::warn!(name = %self.name, failures = failures, "Circuit breaker opened");
        }
    }

    /// Execute a function through the circuit breaker
    pub async fn execute<F, Fut, T, E>(&self, f: F) -> Result<T, crate::errors::InfraError>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<T, E>>,
        E: std::error::Error,
    {
        if !self.allow_request() {
            return Err(crate::errors::InfraError::service_unavailable(
                format!("Circuit breaker {} is open", self.name),
                Some(self.config.reset_timeout_ms / 1000),
            ));
        }

        match f().await {
            Ok(result) => {
                self.record_success();
                Ok(result)
            }
            Err(e) => {
                self.record_failure();
                Err(crate::errors::InfraError::external_service(
                    &self.name,
                    e.to_string(),
                ))
            }
        }
    }

    /// Reset the circuit breaker
    pub fn reset(&self) {
        self.state.store(0, std::sync::atomic::Ordering::SeqCst);
        self.failures.store(0, std::sync::atomic::Ordering::SeqCst);
        self.successes.store(0, std::sync::atomic::Ordering::SeqCst);
        tracing::info!(name = %self.name, "Circuit breaker reset");
    }
}

// Simple random for jitter (avoiding external rand dependency for minimal builds)
mod rand {
    pub fn random<T: RandomValue>() -> T {
        T::random()
    }

    pub trait RandomValue {
        fn random() -> Self;
    }

    impl RandomValue for f64 {
        fn random() -> Self {
            use std::time::{SystemTime, UNIX_EPOCH};
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .subsec_nanos();
            (nanos as f64) / (u32::MAX as f64)
        }
    }
}

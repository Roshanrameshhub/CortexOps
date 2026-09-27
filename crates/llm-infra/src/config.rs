//! Configuration loading utilities for LLM-Dev-Ops services.
//!
//! Provides type-safe configuration loading from environment variables
//! with defaults and validation.

use serde::{Deserialize, Serialize};

/// Base configuration for all LLM-Dev-Ops services
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfraConfig {
    /// Service name
    pub service_name: String,
    /// Service version
    pub service_version: String,
    /// Environment (development, staging, production)
    pub environment: Environment,
    /// Log level
    pub log_level: LogLevel,
    /// Server host
    pub host: String,
    /// Server port
    pub port: u16,
}

/// Environment type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Environment {
    /// Development environment
    Development,
    /// Staging environment
    Staging,
    /// Production environment
    Production,
    /// Test environment
    Test,
}

impl Default for Environment {
    fn default() -> Self {
        Self::Development
    }
}

impl std::str::FromStr for Environment {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "development" | "dev" => Ok(Self::Development),
            "staging" | "stage" => Ok(Self::Staging),
            "production" | "prod" => Ok(Self::Production),
            "test" => Ok(Self::Test),
            _ => Err(format!("Unknown environment: {}", s)),
        }
    }
}

/// Log level
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    /// Trace level
    Trace,
    /// Debug level
    Debug,
    /// Info level
    Info,
    /// Warn level
    Warn,
    /// Error level
    Error,
}

impl Default for LogLevel {
    fn default() -> Self {
        Self::Info
    }
}

impl std::str::FromStr for LogLevel {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "trace" => Ok(Self::Trace),
            "debug" => Ok(Self::Debug),
            "info" => Ok(Self::Info),
            "warn" | "warning" => Ok(Self::Warn),
            "error" => Ok(Self::Error),
            _ => Err(format!("Unknown log level: {}", s)),
        }
    }
}

/// Database configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    /// Database host
    pub host: String,
    /// Database port
    pub port: u16,
    /// Database name
    pub database: String,
    /// Database username
    pub username: String,
    /// Database password
    pub password: String,
    /// Enable SSL
    pub ssl: bool,
    /// Minimum pool size
    pub pool_min: u32,
    /// Maximum pool size
    pub pool_max: u32,
    /// Idle timeout in milliseconds
    pub idle_timeout_ms: u64,
    /// Connection timeout in milliseconds
    pub connection_timeout_ms: u64,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            host: "localhost".to_string(),
            port: 5432,
            database: "llm_marketplace".to_string(),
            username: "postgres".to_string(),
            password: "".to_string(),
            ssl: false,
            pool_min: 2,
            pool_max: 20,
            idle_timeout_ms: 30000,
            connection_timeout_ms: 5000,
        }
    }
}

impl DatabaseConfig {
    /// Build a connection URL
    pub fn url(&self) -> String {
        let ssl_mode = if self.ssl { "?sslmode=require" } else { "" };
        format!(
            "postgres://{}:{}@{}:{}/{}{}",
            self.username, self.password, self.host, self.port, self.database, ssl_mode
        )
    }
}

/// Redis configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    /// Redis host
    pub host: String,
    /// Redis port
    pub port: u16,
    /// Redis password
    pub password: Option<String>,
    /// Redis database number
    pub db: u8,
    /// Key prefix
    pub key_prefix: String,
    /// Max retries per request
    pub max_retries: u32,
    /// Connect timeout in milliseconds
    pub connect_timeout_ms: u64,
    /// Command timeout in milliseconds
    pub command_timeout_ms: u64,
}

impl Default for RedisConfig {
    fn default() -> Self {
        Self {
            host: "localhost".to_string(),
            port: 6379,
            password: None,
            db: 0,
            key_prefix: "".to_string(),
            max_retries: 3,
            connect_timeout_ms: 5000,
            command_timeout_ms: 1000,
        }
    }
}

impl RedisConfig {
    /// Build a connection URL
    pub fn url(&self) -> String {
        match &self.password {
            Some(pass) => format!("redis://:{}@{}:{}/{}", pass, self.host, self.port, self.db),
            None => format!("redis://{}:{}/{}", self.host, self.port, self.db),
        }
    }
}

/// Telemetry configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryConfig {
    /// Enable telemetry
    pub enabled: bool,
    /// Service name for telemetry
    pub service_name: String,
    /// Jaeger endpoint
    pub jaeger_endpoint: Option<String>,
    /// Sample rate (0.0 to 1.0)
    pub sample_rate: f64,
    /// Export interval in milliseconds
    pub export_interval_ms: u64,
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            service_name: "llm-dev-ops".to_string(),
            jaeger_endpoint: None,
            sample_rate: 1.0,
            export_interval_ms: 5000,
        }
    }
}

/// LLM-Dev-Ops upstream services configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpstreamServicesConfig {
    /// LLM Registry URL
    pub registry_url: String,
    /// LLM Registry timeout in milliseconds
    pub registry_timeout_ms: u64,
    /// LLM Shield URL
    pub shield_url: String,
    /// LLM Shield timeout in milliseconds
    pub shield_timeout_ms: u64,
    /// Policy Engine URL
    pub policy_engine_url: String,
    /// Policy Engine timeout in milliseconds
    pub policy_engine_timeout_ms: u64,
}

impl Default for UpstreamServicesConfig {
    fn default() -> Self {
        Self {
            registry_url: "http://localhost:8081".to_string(),
            registry_timeout_ms: 500,
            shield_url: "http://localhost:8082".to_string(),
            shield_timeout_ms: 200,
            policy_engine_url: "http://localhost:8080".to_string(),
            policy_engine_timeout_ms: 300,
        }
    }
}

/// Load configuration from environment variables
pub fn load_from_env() -> Result<InfraConfig, crate::errors::InfraError> {
    dotenvy::dotenv().ok();

    let environment = std::env::var("NODE_ENV")
        .or_else(|_| std::env::var("ENVIRONMENT"))
        .unwrap_or_else(|_| "development".to_string())
        .parse()
        .unwrap_or_default();

    let log_level = std::env::var("LOG_LEVEL")
        .unwrap_or_else(|_| "info".to_string())
        .parse()
        .unwrap_or_default();

    Ok(InfraConfig {
        service_name: std::env::var("SERVICE_NAME")
            .unwrap_or_else(|_| "llm-dev-ops-service".to_string()),
        service_version: std::env::var("SERVICE_VERSION").unwrap_or_else(|_| "1.0.0".to_string()),
        environment,
        log_level,
        host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
        port: std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000),
    })
}

/// Load database configuration from environment
pub fn load_database_config() -> Result<DatabaseConfig, crate::errors::InfraError> {
    // Check for DATABASE_URL first
    if let Ok(url) = std::env::var("DATABASE_URL") {
        return parse_database_url(&url);
    }

    Ok(DatabaseConfig {
        host: std::env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string()),
        port: std::env::var("DB_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(5432),
        database: std::env::var("DB_NAME").unwrap_or_else(|_| "llm_marketplace".to_string()),
        username: std::env::var("DB_USER").unwrap_or_else(|_| "postgres".to_string()),
        password: std::env::var("DB_PASSWORD").unwrap_or_default(),
        ssl: std::env::var("DB_SSL")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false),
        ..Default::default()
    })
}

/// Parse a DATABASE_URL into DatabaseConfig
fn parse_database_url(url: &str) -> Result<DatabaseConfig, crate::errors::InfraError> {
    let url = url::Url::parse(url)
        .map_err(|e| crate::errors::InfraError::configuration(format!("Invalid DATABASE_URL: {}", e)))?;

    Ok(DatabaseConfig {
        host: url.host_str().unwrap_or("localhost").to_string(),
        port: url.port().unwrap_or(5432),
        database: url.path().trim_start_matches('/').to_string(),
        username: url.username().to_string(),
        password: url.password().unwrap_or("").to_string(),
        ssl: url.query_pairs().any(|(k, v)| k == "sslmode" && v != "disable"),
        ..Default::default()
    })
}

/// Load Redis configuration from environment
pub fn load_redis_config() -> Result<RedisConfig, crate::errors::InfraError> {
    // Check for REDIS_URL first
    if let Ok(url) = std::env::var("REDIS_URL") {
        return parse_redis_url(&url);
    }

    Ok(RedisConfig {
        host: std::env::var("REDIS_HOST").unwrap_or_else(|_| "localhost".to_string()),
        port: std::env::var("REDIS_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(6379),
        password: std::env::var("REDIS_PASSWORD").ok(),
        db: std::env::var("REDIS_DB")
            .ok()
            .and_then(|d| d.parse().ok())
            .unwrap_or(0),
        key_prefix: std::env::var("REDIS_KEY_PREFIX").unwrap_or_default(),
        ..Default::default()
    })
}

/// Parse a REDIS_URL into RedisConfig
fn parse_redis_url(url: &str) -> Result<RedisConfig, crate::errors::InfraError> {
    let url = url::Url::parse(url)
        .map_err(|e| crate::errors::InfraError::configuration(format!("Invalid REDIS_URL: {}", e)))?;

    Ok(RedisConfig {
        host: url.host_str().unwrap_or("localhost").to_string(),
        port: url.port().unwrap_or(6379),
        password: url.password().map(|s| s.to_string()),
        db: url
            .path()
            .trim_start_matches('/')
            .parse()
            .unwrap_or(0),
        ..Default::default()
    })
}

/// Load upstream services configuration from environment
pub fn load_upstream_services_config() -> UpstreamServicesConfig {
    UpstreamServicesConfig {
        registry_url: std::env::var("LLM_REGISTRY_URL")
            .unwrap_or_else(|_| "http://localhost:8081".to_string()),
        registry_timeout_ms: std::env::var("LLM_REGISTRY_TIMEOUT_MS")
            .ok()
            .and_then(|t| t.parse().ok())
            .unwrap_or(500),
        shield_url: std::env::var("LLM_SHIELD_URL")
            .unwrap_or_else(|_| "http://localhost:8082".to_string()),
        shield_timeout_ms: std::env::var("LLM_SHIELD_TIMEOUT_MS")
            .ok()
            .and_then(|t| t.parse().ok())
            .unwrap_or(200),
        policy_engine_url: std::env::var("POLICY_ENGINE_URL")
            .unwrap_or_else(|_| "http://localhost:8080".to_string()),
        policy_engine_timeout_ms: std::env::var("POLICY_ENGINE_TIMEOUT_MS")
            .ok()
            .and_then(|t| t.parse().ok())
            .unwrap_or(300),
    }
}

/// Get a required environment variable
pub fn require_env(name: &str) -> Result<String, crate::errors::InfraError> {
    std::env::var(name)
        .map_err(|_| crate::errors::InfraError::configuration(format!("Required environment variable {} is not set", name)))
}

/// Get an optional environment variable with default
pub fn get_env(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

/// Get a boolean environment variable
pub fn get_bool_env(name: &str, default: bool) -> bool {
    std::env::var(name)
        .map(|v| v == "true" || v == "1")
        .unwrap_or(default)
}

/// Get a numeric environment variable
pub fn get_num_env<T: std::str::FromStr>(name: &str, default: T) -> T {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

mod handlers;
mod middleware;
mod models;
mod services;

use axum::{
    extract::FromRef,
    http::StatusCode,
    middleware as axum_middleware,
    routing::{delete, get, post},
    Router,
};
use redis::aio::ConnectionManager;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::{error, info};

use services::{
    AnalyticsStreamer, ApiKeyManager, PolicyClient, PolicyEngineClient, QuotaManager,
    RateLimiter, RegistryClient, RequestRouter, SLAMonitor, ShieldClient, UsageMeter,
};

/// Application state shared across handlers
#[derive(Clone, FromRef)]
pub struct AppState {
    pub db: PgPool,
    pub redis: ConnectionManager,
    pub rate_limiter: RateLimiter,
    pub quota_manager: QuotaManager,
    pub usage_meter: UsageMeter,
    pub api_key_manager: ApiKeyManager,
    pub request_router: RequestRouter,
    pub sla_monitor: SLAMonitor,
    pub policy_client: PolicyClient,
    pub analytics_streamer: AnalyticsStreamer,
    // Phase 2B: Runtime consumption adapters for upstream LLM-Dev-Ops services
    pub registry_client: RegistryClient,
    pub shield_client: ShieldClient,
    pub policy_engine_client: PolicyEngineClient,
}

/// Custom result type for handlers
pub type Result<T> = std::result::Result<T, (StatusCode, String)>;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load environment variables
    dotenv::dotenv().ok();

    // Initialize tracing
    middleware::init_tracing()
        .map_err(|e| anyhow::anyhow!("Failed to initialize tracing: {}", e))?;

    info!("Starting LLM Marketplace Consumption Service");

    // Initialize Prometheus metrics
    let _registry = middleware::init_metrics();

    // Database connection
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://localhost/llm_marketplace".to_string());

    info!("Connecting to database: {}", database_url);

    let db = PgPoolOptions::new()
        .max_connections(100)
        .min_connections(10)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&database_url)
        .await?;

    info!("Database connection established");

    // Redis connection
    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://localhost:6379".to_string());

    info!("Connecting to Redis: {}", redis_url);

    let redis_client = redis::Client::open(redis_url)?;
    let redis = redis_client.get_tokio_connection_manager().await?;

    info!("Redis connection established");

    // Initialize services
    let rate_limiter = RateLimiter::new(redis.clone());
    let quota_manager = QuotaManager::new(redis.clone(), db.clone());
    let usage_meter = UsageMeter::new(db.clone());
    let api_key_manager = ApiKeyManager::new(db.clone());
    let request_router = RequestRouter::new();
    let sla_monitor = SLAMonitor::new(db.clone());

    // Initialize Policy Engine client (existing - for real-time validation)
    let policy_engine_url = std::env::var("POLICY_ENGINE_URL")
        .unwrap_or_else(|_| "http://localhost:8080".to_string());
    let policy_client = PolicyClient::new(policy_engine_url.clone());

    // Initialize Analytics streamer
    let analytics_streamer = AnalyticsStreamer::new(10000); // 10K event buffer

    // Phase 2B: Initialize upstream LLM-Dev-Ops service consumers
    // These are thin adapters for runtime consumption of metadata and rules

    // LLM-Registry: Model metadata, versions, and exchangeable assets
    let registry_url = std::env::var("LLM_REGISTRY_URL")
        .unwrap_or_else(|_| "http://localhost:8081".to_string());
    let registry_client = RegistryClient::new(registry_url);
    info!("LLM-Registry client initialized");

    // LLM-Shield: Filter packs, safety rules, and shielding metadata
    let shield_url = std::env::var("LLM_SHIELD_URL")
        .unwrap_or_else(|_| "http://localhost:8082".to_string());
    let shield_client = ShieldClient::new(shield_url);
    info!("LLM-Shield client initialized");

    // LLM-Policy-Engine: Policy bundles, enforcement metadata, and compliance rules
    let policy_engine_client = PolicyEngineClient::new(policy_engine_url);
    info!("LLM-Policy-Engine client initialized");

    // Load quotas from database to Redis on startup
    info!("Loading quotas from database");
    quota_manager.load_quotas().await?;

    // Spawn background SLA monitoring task
    let sla_monitor_clone = sla_monitor.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(300)); // 5 minutes
        loop {
            interval.tick().await;
            if let Err(e) = sla_monitor_clone.monitor_all_services().await {
                error!(error = %e, "SLA monitoring task failed");
            }
        }
    });

    // Create application state
    let state = AppState {
        db,
        redis,
        rate_limiter,
        quota_manager,
        usage_meter,
        api_key_manager,
        request_router,
        sla_monitor,
        policy_client,
        analytics_streamer,
        // Phase 2B: Upstream LLM-Dev-Ops service consumers
        registry_client,
        shield_client,
        policy_engine_client,
    };

    // Build application router
    let app = Router::new()
        // Health check endpoint (no auth)
        .route("/health", get(health_check))
        .route("/metrics", get(middleware::metrics_handler))
        // API endpoints (require authentication)
        .route(
            "/api/v1/consume/:serviceId",
            post(handlers::consume_service),
        )
        .route("/api/v1/quota/:serviceId", get(handlers::get_quota_status))
        .route("/api/v1/usage/:serviceId", get(handlers::get_usage_stats))
        .route("/api/v1/keys", post(handlers::create_api_key))
        .route("/api/v1/keys", get(handlers::list_api_keys))
        .route("/api/v1/keys/:keyId", delete(handlers::revoke_api_key))
        // Apply middleware
        .layer(
            ServiceBuilder::new()
                .layer(axum_middleware::from_fn_with_state(
                    state.clone(),
                    middleware::auth_middleware,
                ))
                .layer(axum_middleware::from_fn(middleware::metrics_middleware))
                .layer(TraceLayer::new_for_http())
                .layer(CompressionLayer::new())
                .layer(
                    CorsLayer::new()
                        .allow_origin(Any)
                        .allow_methods(Any)
                        .allow_headers(Any),
                ),
        )
        .with_state(state);

    // Start server
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse::<u16>()?;

    let addr = format!("0.0.0.0:{}", port);
    info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;

    axum::serve(listener, app)
        .await?;

    // Shutdown tracing
    middleware::shutdown_tracing();

    Ok(())
}

/// Health check endpoint
async fn health_check() -> &'static str {
    "OK"
}

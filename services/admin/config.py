"""
Configuration Module for Admin Service
Handles environment variables and application settings
"""

from pydantic_settings import BaseSettings
from pydantic import Field, PostgresDsn, RedisDsn
from typing import List, Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application Settings"""

    # Environment
    environment: str = Field(default="development", alias="ENVIRONMENT")
    debug: bool = Field(default=False)

    # Server
    port: int = Field(default=3004, alias="PORT")
    host: str = Field(default="0.0.0.0", alias="HOST")

    # Database
    database_url: str = Field(
        default="postgresql://marketplace_user:marketplace_password@localhost:5432/llm_marketplace",
        alias="DATABASE_URL"
    )
    database_pool_size: int = Field(default=10, alias="DATABASE_POOL_SIZE")
    database_max_overflow: int = Field(default=20, alias="DATABASE_MAX_OVERFLOW")

    # Redis Cache
    redis_url: str = Field(
        default="redis://:redis_password@localhost:6379/0",
        alias="REDIS_URL"
    )
    cache_ttl: int = Field(default=300, alias="CACHE_TTL")  # 5 minutes

    # Kafka
    kafka_brokers: List[str] = Field(
        default=["localhost:29092"],
        alias="KAFKA_BROKERS"
    )
    kafka_topic_prefix: str = Field(default="marketplace", alias="KAFKA_TOPIC_PREFIX")

    # JWT Authentication
    jwt_secret: str = Field(
        default="dev-secret-change-in-production",
        alias="JWT_SECRET"
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expiration_minutes: int = Field(default=1440, alias="JWT_EXPIRATION_MINUTES")  # 24 hours

    # CORS
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:3001", "http://localhost:3004"],
        alias="CORS_ORIGINS"
    )

    # Service URLs
    registry_url: str = Field(
        default="http://localhost:4000",
        alias="REGISTRY_URL"
    )
    policy_engine_url: str = Field(
        default="http://localhost:4001",
        alias="POLICY_ENGINE_URL"
    )
    analytics_hub_url: str = Field(
        default="http://localhost:4002",
        alias="ANALYTICS_HUB_URL"
    )
    governance_dashboard_url: str = Field(
        default="http://localhost:4003",
        alias="GOVERNANCE_DASHBOARD_URL"
    )
    publishing_service_url: str = Field(
        default="http://localhost:3001",
        alias="PUBLISHING_SERVICE_URL"
    )
    discovery_service_url: str = Field(
        default="http://localhost:3002",
        alias="DISCOVERY_SERVICE_URL"
    )
    consumption_service_url: str = Field(
        default="http://localhost:3003",
        alias="CONSUMPTION_SERVICE_URL"
    )

    # API Keys for integrations
    registry_api_key: str = Field(default="dev-registry-key", alias="REGISTRY_API_KEY")
    policy_engine_api_key: str = Field(default="dev-policy-key", alias="POLICY_ENGINE_API_KEY")
    analytics_hub_api_key: str = Field(default="dev-analytics-key", alias="ANALYTICS_HUB_API_KEY")
    governance_api_key: str = Field(default="dev-governance-key", alias="GOVERNANCE_API_KEY")

    # Monitoring
    health_check_interval: int = Field(default=30, alias="HEALTH_CHECK_INTERVAL")  # seconds
    metrics_aggregation_interval: int = Field(default=60, alias="METRICS_AGGREGATION_INTERVAL")  # seconds

    # Workflow
    workflow_approval_timeout: int = Field(default=86400, alias="WORKFLOW_APPROVAL_TIMEOUT")  # 24 hours
    workflow_auto_approve_threshold: int = Field(default=3, alias="WORKFLOW_AUTO_APPROVE_THRESHOLD")

    # Analytics
    analytics_batch_size: int = Field(default=1000, alias="ANALYTICS_BATCH_SIZE")
    analytics_retention_days: int = Field(default=90, alias="ANALYTICS_RETENTION_DAYS")

    # Pagination
    default_page_size: int = Field(default=20, alias="DEFAULT_PAGE_SIZE")
    max_page_size: int = Field(default=100, alias="MAX_PAGE_SIZE")

    # Logging
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_format: str = Field(default="json", alias="LOG_FORMAT")

    # OpenTelemetry
    otel_enabled: bool = Field(default=True, alias="OTEL_ENABLED")
    jaeger_endpoint: str = Field(
        default="http://localhost:14268/api/traces",
        alias="JAEGER_ENDPOINT"
    )

    # Prometheus
    prometheus_enabled: bool = Field(default=True, alias="PROMETHEUS_ENABLED")
    prometheus_port: int = Field(default=9094, alias="PROMETHEUS_PORT")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Export settings instance
settings = get_settings()

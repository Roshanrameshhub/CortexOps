"""
FastAPI dependencies for ML Recommendations service
"""
import logging
from typing import Optional
from functools import lru_cache

from ml_recommendations.core.recommender_service import RecommenderService
from ml_recommendations.features.feature_store import FeatureStore
from ml_recommendations.ab_testing.ab_test_manager import ABTestManager

logger = logging.getLogger(__name__)

# Singleton instances
_recommender_service: Optional[RecommenderService] = None
_feature_store: Optional[FeatureStore] = None
_ab_test_manager: Optional[ABTestManager] = None


@lru_cache()
def get_model_config() -> dict:
    """
    Get model configuration

    Returns:
        Model configuration dictionary
    """
    # In production: load from config file or environment
    return {
        "svd": {
            "enabled": True,
            "n_factors": 50,
            "weight": 0.3
        },
        "als": {
            "enabled": True,
            "factors": 50,
            "weight": 0.3
        },
        "nmf": {
            "enabled": True,
            "n_components": 50,
            "weight": 0.2
        },
        "neural_cf": {
            "enabled": False,  # Enable when model is trained
            "weight": 0.2
        },
        "hybrid": {
            "enabled": True,
            "diversity_weight": 0.1,
            "novelty_weight": 0.1
        },
        "cache": {
            "ttl": 3600,
            "enabled": True
        }
    }


def get_recommender_service() -> RecommenderService:
    """
    Get or create RecommenderService singleton

    Returns:
        RecommenderService instance
    """
    global _recommender_service

    if _recommender_service is None:
        logger.info("Initializing RecommenderService singleton...")

        config = get_model_config()
        feature_store = get_feature_store()

        # Initialize cache client if enabled
        cache_client = None
        if config.get("cache", {}).get("enabled"):
            cache_client = get_cache_client()

        _recommender_service = RecommenderService(
            model_config=config,
            feature_store=feature_store,
            cache_client=cache_client
        )

        logger.info("RecommenderService singleton initialized")

    return _recommender_service


def get_feature_store() -> Optional[FeatureStore]:
    """
    Get or create FeatureStore singleton

    Returns:
        FeatureStore instance or None
    """
    global _feature_store

    if _feature_store is None:
        try:
            logger.info("Initializing FeatureStore singleton...")
            _feature_store = FeatureStore()
            logger.info("FeatureStore singleton initialized")
        except Exception as e:
            logger.warning(f"FeatureStore initialization failed: {e}")
            _feature_store = None

    return _feature_store


def get_ab_test_manager() -> Optional[ABTestManager]:
    """
    Get or create ABTestManager singleton

    Returns:
        ABTestManager instance or None
    """
    global _ab_test_manager

    if _ab_test_manager is None:
        try:
            logger.info("Initializing ABTestManager singleton...")
            _ab_test_manager = ABTestManager()
            logger.info("ABTestManager singleton initialized")
        except Exception as e:
            logger.warning(f"ABTestManager initialization failed: {e}")
            _ab_test_manager = None

    return _ab_test_manager


@lru_cache()
def get_cache_client():
    """
    Get Redis cache client

    Returns:
        Redis client or None
    """
    try:
        import redis

        # In production: load from environment variables
        client = redis.Redis(
            host='localhost',
            port=6379,
            db=0,
            decode_responses=True
        )

        # Test connection
        client.ping()
        logger.info("Redis cache client connected")
        return client

    except ImportError:
        logger.warning("redis-py not installed, caching disabled")
        return None
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}, caching disabled")
        return None


def get_database_connection():
    """
    Get database connection

    Returns:
        Database connection
    """
    # Placeholder for database connection
    # In production: use SQLAlchemy engine
    logger.debug("Database connection requested")
    return None


async def get_current_user(token: Optional[str] = None) -> Optional[dict]:
    """
    Get current user from authentication token

    Args:
        token: JWT token or API key

    Returns:
        User information dictionary
    """
    # Placeholder for authentication
    # In production: validate JWT token and return user info
    if token:
        return {
            "user_id": "user_123",
            "roles": ["user"],
            "tier": "premium"
        }
    return None


def reset_singletons():
    """
    Reset all singleton instances (for testing)
    """
    global _recommender_service, _feature_store, _ab_test_manager

    _recommender_service = None
    _feature_store = None
    _ab_test_manager = None

    logger.info("Singletons reset")

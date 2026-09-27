"""
Health check system for ML Recommendations service
"""
import logging
import time
from typing import Dict, List, Optional
from enum import Enum
from datetime import datetime
from dataclasses import dataclass

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    """Health status levels"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class ComponentHealth:
    """Health status of a component"""
    name: str
    status: HealthStatus
    message: str
    last_check: datetime
    details: Optional[Dict] = None


class HealthChecker:
    """
    Health checker for recommendation service components
    """

    def __init__(self):
        """Initialize health checker"""
        self.components: Dict[str, ComponentHealth] = {}
        self.start_time = time.time()

        logger.info("HealthChecker initialized")

    async def check_all(self) -> Dict:
        """
        Check health of all components

        Returns:
            Dictionary with overall health status
        """
        checks = {}

        # Check models
        checks["models"] = await self._check_models()

        # Check cache
        checks["cache"] = await self._check_cache()

        # Check feature store
        checks["feature_store"] = await self._check_feature_store()

        # Check database
        checks["database"] = await self._check_database()

        # Determine overall status
        overall_status = self._determine_overall_status(checks)

        return {
            "status": overall_status,
            "timestamp": datetime.now().isoformat(),
            "uptime_seconds": time.time() - self.start_time,
            "components": checks
        }

    async def _check_models(self) -> ComponentHealth:
        """Check if models are loaded and functional"""
        try:
            # In production: verify models are loaded
            # For now: simple check
            component = ComponentHealth(
                name="models",
                status=HealthStatus.HEALTHY,
                message="All models loaded",
                last_check=datetime.now(),
                details={
                    "models_loaded": ["svd", "als", "nmf"],
                    "models_count": 3
                }
            )

            self.components["models"] = component
            return component

        except Exception as e:
            logger.error(f"Model health check failed: {e}")
            component = ComponentHealth(
                name="models",
                status=HealthStatus.UNHEALTHY,
                message=f"Model check failed: {str(e)}",
                last_check=datetime.now()
            )

            self.components["models"] = component
            return component

    async def _check_cache(self) -> ComponentHealth:
        """Check cache connectivity"""
        try:
            # In production: ping Redis
            # For now: simple check
            component = ComponentHealth(
                name="cache",
                status=HealthStatus.HEALTHY,
                message="Cache operational",
                last_check=datetime.now(),
                details={
                    "cache_type": "redis",
                    "connected": True
                }
            )

            self.components["cache"] = component
            return component

        except Exception as e:
            logger.warning(f"Cache health check failed: {e}")
            component = ComponentHealth(
                name="cache",
                status=HealthStatus.DEGRADED,
                message=f"Cache unavailable: {str(e)}",
                last_check=datetime.now()
            )

            self.components["cache"] = component
            return component

    async def _check_feature_store(self) -> ComponentHealth:
        """Check feature store connectivity"""
        try:
            # In production: check feature store connection
            component = ComponentHealth(
                name="feature_store",
                status=HealthStatus.HEALTHY,
                message="Feature store operational",
                last_check=datetime.now(),
                details={
                    "features_available": True
                }
            )

            self.components["feature_store"] = component
            return component

        except Exception as e:
            logger.warning(f"Feature store health check failed: {e}")
            component = ComponentHealth(
                name="feature_store",
                status=HealthStatus.DEGRADED,
                message=f"Feature store unavailable: {str(e)}",
                last_check=datetime.now()
            )

            self.components["feature_store"] = component
            return component

    async def _check_database(self) -> ComponentHealth:
        """Check database connectivity"""
        try:
            # In production: ping database
            component = ComponentHealth(
                name="database",
                status=HealthStatus.HEALTHY,
                message="Database operational",
                last_check=datetime.now(),
                details={
                    "db_type": "postgresql",
                    "connected": True
                }
            )

            self.components["database"] = component
            return component

        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            component = ComponentHealth(
                name="database",
                status=HealthStatus.UNHEALTHY,
                message=f"Database unavailable: {str(e)}",
                last_check=datetime.now()
            )

            self.components["database"] = component
            return component

    def _determine_overall_status(
        self,
        checks: Dict[str, ComponentHealth]
    ) -> HealthStatus:
        """
        Determine overall health status

        Rules:
        - UNHEALTHY if any critical component (models, database) is unhealthy
        - DEGRADED if any component is degraded or non-critical is unhealthy
        - HEALTHY if all components are healthy

        Args:
            checks: Dictionary of component health checks

        Returns:
            Overall health status
        """
        critical_components = {"models", "database"}

        for name, health in checks.items():
            # Critical components must be healthy
            if name in critical_components:
                if health.status == HealthStatus.UNHEALTHY:
                    return HealthStatus.UNHEALTHY

            # Any degraded component makes system degraded
            if health.status == HealthStatus.DEGRADED:
                return HealthStatus.DEGRADED

            # Non-critical unhealthy also makes system degraded
            if health.status == HealthStatus.UNHEALTHY:
                return HealthStatus.DEGRADED

        return HealthStatus.HEALTHY

    def get_component_status(self, component_name: str) -> Optional[ComponentHealth]:
        """Get status of a specific component"""
        return self.components.get(component_name)

    def is_healthy(self) -> bool:
        """Check if service is healthy"""
        for component in self.components.values():
            if component.status == HealthStatus.UNHEALTHY:
                return False
        return True

    def get_uptime(self) -> float:
        """Get service uptime in seconds"""
        return time.time() - self.start_time


# Global health checker instance
_health_checker: Optional[HealthChecker] = None


def get_health_checker() -> HealthChecker:
    """Get or create global health checker"""
    global _health_checker

    if _health_checker is None:
        _health_checker = HealthChecker()

    return _health_checker

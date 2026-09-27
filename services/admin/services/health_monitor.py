"""
Health Monitoring Service
Monitors health of all marketplace services and aggregates metrics
"""

import asyncio
import aiohttp
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import ServiceHealth, ServiceHealthStatus, ServiceMetrics
from schemas import ServiceHealthCheck, ServiceHealthSummary
from config import settings

logger = logging.getLogger(__name__)


class HealthMonitor:
    """Service health monitoring and aggregation"""

    def __init__(self):
        self.services = {
            "publishing": settings.publishing_service_url,
            "discovery": settings.discovery_service_url,
            "consumption": settings.consumption_service_url,
            "registry": settings.registry_url,
            "policy_engine": settings.policy_engine_url,
            "analytics_hub": settings.analytics_hub_url,
            "governance_dashboard": settings.governance_dashboard_url,
        }
        self.check_interval = settings.health_check_interval
        self._running = False

    async def check_service_health(
        self,
        service_name: str,
        service_url: str,
        timeout: int = 5
    ) -> ServiceHealthCheck:
        """
        Check health of a single service

        Args:
            service_name: Name of the service
            service_url: Base URL of the service
            timeout: Request timeout in seconds

        Returns:
            ServiceHealthCheck object with health status
        """
        health_endpoint = f"{service_url}/health"
        start_time = datetime.utcnow()

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    health_endpoint,
                    timeout=aiohttp.ClientTimeout(total=timeout)
                ) as response:
                    elapsed_ms = (datetime.utcnow() - start_time).total_seconds() * 1000

                    if response.status == 200:
                        data = await response.json()
                        status = ServiceHealthStatus.HEALTHY
                        health_data = data
                        error_message = None
                    else:
                        status = ServiceHealthStatus.DEGRADED
                        health_data = {"status_code": response.status}
                        error_message = f"HTTP {response.status}"

        except asyncio.TimeoutError:
            elapsed_ms = timeout * 1000
            status = ServiceHealthStatus.DOWN
            health_data = {}
            error_message = "Health check timeout"

        except aiohttp.ClientError as e:
            elapsed_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
            status = ServiceHealthStatus.DOWN
            health_data = {}
            error_message = f"Connection error: {str(e)}"

        except Exception as e:
            elapsed_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
            status = ServiceHealthStatus.UNKNOWN
            health_data = {}
            error_message = f"Unexpected error: {str(e)}"
            logger.exception(f"Error checking health of {service_name}")

        return ServiceHealthCheck(
            service_name=service_name,
            service_url=service_url,
            status=status,
            response_time_ms=elapsed_ms,
            health_data=health_data,
            error_message=error_message,
            checked_at=datetime.utcnow()
        )

    async def check_all_services(self) -> Dict[str, ServiceHealthCheck]:
        """
        Check health of all registered services concurrently

        Returns:
            Dictionary mapping service names to health check results
        """
        tasks = [
            self.check_service_health(name, url)
            for name, url in self.services.items()
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        health_checks = {}
        for i, result in enumerate(results):
            service_name = list(self.services.keys())[i]
            if isinstance(result, Exception):
                logger.error(f"Failed to check {service_name}: {result}")
                health_checks[service_name] = ServiceHealthCheck(
                    service_name=service_name,
                    service_url=self.services[service_name],
                    status=ServiceHealthStatus.UNKNOWN,
                    error_message=str(result),
                    checked_at=datetime.utcnow()
                )
            else:
                health_checks[service_name] = result

        return health_checks

    def save_health_checks(self, db: Session, health_checks: Dict[str, ServiceHealthCheck]) -> None:
        """
        Save health check results to database

        Args:
            db: Database session
            health_checks: Dictionary of health check results
        """
        try:
            for service_name, check in health_checks.items():
                health_record = ServiceHealth(
                    service_name=service_name,
                    service_url=check.service_url,
                    status=check.status,
                    response_time_ms=check.response_time_ms,
                    health_data=check.health_data,
                    error_message=check.error_message,
                    checked_at=check.checked_at
                )
                db.add(health_record)

            db.commit()
            logger.info(f"Saved {len(health_checks)} health check records")

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to save health checks: {e}")
            raise

    def get_health_summary(self, db: Session) -> ServiceHealthSummary:
        """
        Get summary of service health status

        Args:
            db: Database session

        Returns:
            ServiceHealthSummary with counts and latest status
        """
        # Get latest health check for each service
        subquery = (
            db.query(
                ServiceHealth.service_name,
                func.max(ServiceHealth.checked_at).label('max_checked_at')
            )
            .group_by(ServiceHealth.service_name)
            .subquery()
        )

        latest_checks = (
            db.query(ServiceHealth)
            .join(
                subquery,
                (ServiceHealth.service_name == subquery.c.service_name) &
                (ServiceHealth.checked_at == subquery.c.max_checked_at)
            )
            .all()
        )

        # Count by status
        status_counts = {
            ServiceHealthStatus.HEALTHY: 0,
            ServiceHealthStatus.DEGRADED: 0,
            ServiceHealthStatus.DOWN: 0,
            ServiceHealthStatus.UNKNOWN: 0,
        }

        services = []
        for check in latest_checks:
            status_counts[check.status] += 1
            services.append(ServiceHealthCheck(
                service_name=check.service_name,
                service_url=check.service_url,
                status=check.status,
                response_time_ms=check.response_time_ms,
                health_data=check.health_data,
                error_message=check.error_message,
                checked_at=check.checked_at
            ))

        return ServiceHealthSummary(
            total_services=len(latest_checks),
            healthy=status_counts[ServiceHealthStatus.HEALTHY],
            degraded=status_counts[ServiceHealthStatus.DEGRADED],
            down=status_counts[ServiceHealthStatus.DOWN],
            unknown=status_counts[ServiceHealthStatus.UNKNOWN],
            services=services
        )

    def get_service_health_history(
        self,
        db: Session,
        service_name: str,
        hours: int = 24
    ) -> List[ServiceHealthCheck]:
        """
        Get health check history for a specific service

        Args:
            db: Database session
            service_name: Name of the service
            hours: Number of hours of history to retrieve

        Returns:
            List of ServiceHealthCheck objects
        """
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)

        checks = (
            db.query(ServiceHealth)
            .filter(
                ServiceHealth.service_name == service_name,
                ServiceHealth.checked_at >= cutoff_time
            )
            .order_by(ServiceHealth.checked_at.desc())
            .all()
        )

        return [
            ServiceHealthCheck(
                service_name=check.service_name,
                service_url=check.service_url,
                status=check.status,
                response_time_ms=check.response_time_ms,
                health_data=check.health_data,
                error_message=check.error_message,
                checked_at=check.checked_at
            )
            for check in checks
        ]

    def cleanup_old_health_records(self, db: Session, retention_days: int = 7) -> int:
        """
        Clean up old health check records

        Args:
            db: Database session
            retention_days: Number of days to retain records

        Returns:
            Number of records deleted
        """
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

        try:
            deleted = (
                db.query(ServiceHealth)
                .filter(ServiceHealth.checked_at < cutoff_date)
                .delete()
            )
            db.commit()
            logger.info(f"Cleaned up {deleted} old health records")
            return deleted

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to cleanup health records: {e}")
            raise

    async def start_monitoring(self, db_session_factory):
        """
        Start continuous health monitoring

        Args:
            db_session_factory: Factory function to create database sessions
        """
        self._running = True
        logger.info("Starting health monitoring service")

        while self._running:
            try:
                # Check all services
                health_checks = await self.check_all_services()

                # Save to database
                with db_session_factory() as db:
                    self.save_health_checks(db, health_checks)

                # Log summary
                healthy = sum(1 for c in health_checks.values() if c.status == ServiceHealthStatus.HEALTHY)
                logger.info(f"Health check completed: {healthy}/{len(health_checks)} services healthy")

                # Wait for next check interval
                await asyncio.sleep(self.check_interval)

            except Exception as e:
                logger.exception(f"Error in health monitoring loop: {e}")
                await asyncio.sleep(self.check_interval)

    def stop_monitoring(self):
        """Stop continuous health monitoring"""
        self._running = False
        logger.info("Stopping health monitoring service")


# Global health monitor instance
health_monitor = HealthMonitor()

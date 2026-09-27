"""
Analytics Hub Integration Client
Communicates with Analytics Hub for metrics and events
"""

import logging
import httpx
from typing import Dict, Any, List, Optional
from datetime import datetime
from uuid import UUID

from config import settings

logger = logging.getLogger(__name__)


class AnalyticsHubClient:
    """Client for Analytics Hub integration"""

    def __init__(self):
        self.base_url = settings.analytics_hub_url
        self.api_key = settings.analytics_hub_api_key
        self.timeout = 10.0

    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with authentication"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-Service": "admin-service"
        }

    async def track_event(
        self,
        event_type: str,
        event_data: Dict[str, Any],
        user_id: Optional[UUID] = None,
        service_id: Optional[UUID] = None
    ) -> bool:
        """
        Track an event in Analytics Hub

        Args:
            event_type: Type of event
            event_data: Event payload
            user_id: Optional user ID
            service_id: Optional service ID

        Returns:
            True if successful
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/events",
                    headers=self._get_headers(),
                    json={
                        "event_type": event_type,
                        "timestamp": datetime.utcnow().isoformat(),
                        "user_id": str(user_id) if user_id else None,
                        "service_id": str(service_id) if service_id else None,
                        "data": event_data
                    },
                    timeout=self.timeout
                )

                if response.status_code == 200:
                    logger.debug(f"Event tracked: {event_type}")
                    return True
                else:
                    logger.warning(f"Failed to track event: {response.status_code}")
                    return False

        except Exception as e:
            logger.error(f"Error tracking event: {e}")
            return False

    async def get_metrics(
        self,
        metric_name: str,
        service_id: Optional[UUID] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get metrics from Analytics Hub

        Args:
            metric_name: Name of the metric
            service_id: Optional service ID filter
            start_time: Start of time range
            end_time: End of time range

        Returns:
            Metrics data or None
        """
        try:
            params = {
                "metric": metric_name,
            }

            if service_id:
                params["service_id"] = str(service_id)
            if start_time:
                params["start_time"] = start_time.isoformat()
            if end_time:
                params["end_time"] = end_time.isoformat()

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/metrics",
                    headers=self._get_headers(),
                    params=params,
                    timeout=self.timeout
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    logger.warning(f"Failed to get metrics: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Error getting metrics: {e}")
            return None

    async def get_service_analytics(
        self,
        service_id: UUID,
        time_window: str = "24h"
    ) -> Optional[Dict[str, Any]]:
        """
        Get analytics for a specific service

        Args:
            service_id: Service ID
            time_window: Time window (e.g., '1h', '24h', '7d')

        Returns:
            Service analytics data or None
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/services/{service_id}/analytics",
                    headers=self._get_headers(),
                    params={"window": time_window},
                    timeout=self.timeout
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    logger.warning(f"Failed to get service analytics: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Error getting service analytics: {e}")
            return None


# Global client instance
analytics_client = AnalyticsHubClient()

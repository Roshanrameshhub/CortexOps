"""
Analytics Processing Service
Processes and aggregates analytics data using pandas
"""

import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from models import AggregatedMetrics, ServiceMetrics, ServiceHealth
from schemas import AnalyticsQuery, AggregatedMetric, ServiceStatistics
from config import settings

logger = logging.getLogger(__name__)


class AnalyticsProcessor:
    """Analytics data processing and aggregation"""

    def __init__(self):
        self.batch_size = settings.analytics_batch_size
        self.retention_days = settings.analytics_retention_days

    def aggregate_metrics(
        self,
        db: Session,
        metric_type: str,
        metric_name: str,
        time_window: str,
        service_id: Optional[UUID] = None,
        service_name: Optional[str] = None,
        window_start: Optional[datetime] = None,
        window_end: Optional[datetime] = None,
        raw_data: Optional[List[Dict[str, Any]]] = None
    ) -> AggregatedMetrics:
        """
        Aggregate metrics data

        Args:
            db: Database session
            metric_type: Type of metric (e.g., 'performance', 'usage')
            metric_name: Name of the metric
            time_window: Time window (e.g., '1h', '24h', '7d')
            service_id: Optional service ID
            service_name: Optional service name
            window_start: Start of time window
            window_end: End of time window
            raw_data: Raw data points to aggregate

        Returns:
            AggregatedMetrics object
        """
        if not window_start:
            window_start = datetime.utcnow() - self._parse_time_window(time_window)
        if not window_end:
            window_end = datetime.utcnow()

        if not raw_data:
            raw_data = []

        # Convert to pandas DataFrame for efficient processing
        if raw_data:
            df = pd.DataFrame(raw_data)

            # Calculate aggregations
            value = df['value'].sum() if 'value' in df.columns else 0
            count = len(df)
            min_value = df['value'].min() if 'value' in df.columns and len(df) > 0 else None
            max_value = df['value'].max() if 'value' in df.columns and len(df) > 0 else None
            avg_value = df['value'].mean() if 'value' in df.columns and len(df) > 0 else None
            p50_value = df['value'].quantile(0.50) if 'value' in df.columns and len(df) > 0 else None
            p95_value = df['value'].quantile(0.95) if 'value' in df.columns and len(df) > 0 else None
            p99_value = df['value'].quantile(0.99) if 'value' in df.columns and len(df) > 0 else None
        else:
            value = count = 0
            min_value = max_value = avg_value = p50_value = p95_value = p99_value = None

        try:
            # Check if metric already exists
            existing = db.query(AggregatedMetrics).filter(
                AggregatedMetrics.metric_type == metric_type,
                AggregatedMetrics.metric_name == metric_name,
                AggregatedMetrics.time_window == time_window,
                AggregatedMetrics.window_start == window_start,
                AggregatedMetrics.service_id == service_id
            ).first()

            if existing:
                # Update existing metric
                existing.value = value
                existing.count = count
                existing.min_value = min_value
                existing.max_value = max_value
                existing.avg_value = avg_value
                existing.p50_value = p50_value
                existing.p95_value = p95_value
                existing.p99_value = p99_value
                existing.window_end = window_end
                metric = existing
            else:
                # Create new metric
                metric = AggregatedMetrics(
                    metric_type=metric_type,
                    metric_name=metric_name,
                    service_id=service_id,
                    service_name=service_name,
                    time_window=time_window,
                    value=value,
                    count=count,
                    min_value=min_value,
                    max_value=max_value,
                    avg_value=avg_value,
                    p50_value=p50_value,
                    p95_value=p95_value,
                    p99_value=p99_value,
                    window_start=window_start,
                    window_end=window_end
                )
                db.add(metric)

            db.commit()
            db.refresh(metric)
            return metric

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to aggregate metrics: {e}")
            raise

    def query_metrics(
        self,
        db: Session,
        query: AnalyticsQuery
    ) -> List[AggregatedMetric]:
        """
        Query aggregated metrics

        Args:
            db: Database session
            query: Analytics query parameters

        Returns:
            List of aggregated metrics
        """
        db_query = db.query(AggregatedMetrics)

        # Apply filters
        if query.metric_type:
            db_query = db_query.filter(AggregatedMetrics.metric_type == query.metric_type)

        if query.metric_names:
            db_query = db_query.filter(AggregatedMetrics.metric_name.in_(query.metric_names))

        if query.service_id:
            db_query = db_query.filter(AggregatedMetrics.service_id == query.service_id)

        if query.service_name:
            db_query = db_query.filter(AggregatedMetrics.service_name == query.service_name)

        if query.time_window:
            db_query = db_query.filter(AggregatedMetrics.time_window == query.time_window)

        if query.start_date:
            db_query = db_query.filter(AggregatedMetrics.window_start >= query.start_date)

        if query.end_date:
            db_query = db_query.filter(AggregatedMetrics.window_end <= query.end_date)

        # Order by time
        db_query = db_query.order_by(AggregatedMetrics.window_start.desc())

        results = db_query.all()

        return [AggregatedMetric.model_validate(r) for r in results]

    def calculate_service_statistics(
        self,
        db: Session,
        service_name: str,
        hours: int = 24
    ) -> ServiceStatistics:
        """
        Calculate comprehensive statistics for a service

        Args:
            db: Database session
            service_name: Name of the service
            hours: Time window in hours

        Returns:
            ServiceStatistics object
        """
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)

        # Get service metrics
        metrics = db.query(ServiceMetrics).filter(
            ServiceMetrics.service_name == service_name,
            ServiceMetrics.collected_at >= cutoff_time
        ).all()

        if not metrics:
            return ServiceStatistics(
                service_name=service_name,
                total_requests=0,
                total_errors=0,
                error_rate=0.0,
                avg_response_time_ms=0.0,
                active_users=0,
                uptime_percentage=0.0
            )

        # Convert to DataFrame
        df = pd.DataFrame([
            {
                'request_count': m.request_count,
                'error_count': m.error_count,
                'avg_response_time_ms': m.avg_response_time_ms,
                'p95_response_time_ms': m.p95_response_time_ms,
                'p99_response_time_ms': m.p99_response_time_ms,
                'active_users': m.active_users,
            }
            for m in metrics
        ])

        # Calculate statistics
        total_requests = df['request_count'].sum()
        total_errors = df['error_count'].sum()
        error_rate = (total_errors / total_requests * 100) if total_requests > 0 else 0.0
        avg_response_time = df['avg_response_time_ms'].mean()
        p95_response_time = df['p95_response_time_ms'].mean()
        p99_response_time = df['p99_response_time_ms'].mean()
        active_users = int(df['active_users'].max())

        # Calculate uptime from health checks
        health_checks = db.query(ServiceHealth).filter(
            ServiceHealth.service_name == service_name,
            ServiceHealth.checked_at >= cutoff_time
        ).all()

        if health_checks:
            from models import ServiceHealthStatus
            healthy_count = sum(1 for h in health_checks if h.status == ServiceHealthStatus.HEALTHY)
            uptime_percentage = (healthy_count / len(health_checks)) * 100
        else:
            uptime_percentage = 0.0

        return ServiceStatistics(
            service_name=service_name,
            total_requests=int(total_requests),
            total_errors=int(total_errors),
            error_rate=float(error_rate),
            avg_response_time_ms=float(avg_response_time),
            p95_response_time_ms=float(p95_response_time) if not pd.isna(p95_response_time) else None,
            p99_response_time_ms=float(p99_response_time) if not pd.isna(p99_response_time) else None,
            active_users=active_users,
            uptime_percentage=float(uptime_percentage)
        )

    def generate_trend_analysis(
        self,
        db: Session,
        metric_name: str,
        service_id: Optional[UUID] = None,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        Generate trend analysis for a metric

        Args:
            db: Database session
            metric_name: Name of the metric to analyze
            service_id: Optional service ID filter
            days: Number of days to analyze

        Returns:
            Dictionary with trend analysis
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)

        query = db.query(AggregatedMetrics).filter(
            AggregatedMetrics.metric_name == metric_name,
            AggregatedMetrics.window_start >= cutoff_date
        )

        if service_id:
            query = query.filter(AggregatedMetrics.service_id == service_id)

        metrics = query.order_by(AggregatedMetrics.window_start.asc()).all()

        if not metrics:
            return {
                "metric_name": metric_name,
                "trend": "unknown",
                "change_percentage": 0.0,
                "data_points": 0
            }

        # Convert to DataFrame
        df = pd.DataFrame([
            {
                'timestamp': m.window_start,
                'value': m.value,
                'avg_value': m.avg_value
            }
            for m in metrics
        ])

        # Calculate trend
        first_value = df['value'].iloc[0]
        last_value = df['value'].iloc[-1]
        change_percentage = ((last_value - first_value) / first_value * 100) if first_value != 0 else 0

        if change_percentage > 10:
            trend = "increasing"
        elif change_percentage < -10:
            trend = "decreasing"
        else:
            trend = "stable"

        # Calculate additional statistics
        volatility = df['value'].std()
        mean_value = df['value'].mean()

        return {
            "metric_name": metric_name,
            "trend": trend,
            "change_percentage": float(change_percentage),
            "data_points": len(df),
            "first_value": float(first_value),
            "last_value": float(last_value),
            "mean_value": float(mean_value),
            "volatility": float(volatility),
            "min_value": float(df['value'].min()),
            "max_value": float(df['value'].max())
        }

    def cleanup_old_metrics(self, db: Session, retention_days: Optional[int] = None) -> int:
        """
        Clean up old aggregated metrics

        Args:
            db: Database session
            retention_days: Number of days to retain (uses config default if not specified)

        Returns:
            Number of records deleted
        """
        if retention_days is None:
            retention_days = self.retention_days

        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

        try:
            deleted = db.query(AggregatedMetrics).filter(
                AggregatedMetrics.created_at < cutoff_date
            ).delete()

            db.commit()
            logger.info(f"Cleaned up {deleted} old metric records")
            return deleted

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to cleanup metrics: {e}")
            raise

    def _parse_time_window(self, time_window: str) -> timedelta:
        """Parse time window string to timedelta"""
        if time_window.endswith('h'):
            hours = int(time_window[:-1])
            return timedelta(hours=hours)
        elif time_window.endswith('d'):
            days = int(time_window[:-1])
            return timedelta(days=days)
        elif time_window.endswith('m'):
            minutes = int(time_window[:-1])
            return timedelta(minutes=minutes)
        else:
            raise ValueError(f"Invalid time window format: {time_window}")


# Global analytics processor instance
analytics_processor = AnalyticsProcessor()

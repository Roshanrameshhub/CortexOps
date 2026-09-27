"""
Prometheus metrics for ML Recommendations service
"""
import time
import logging
from typing import Dict, Optional
from functools import wraps
from collections import defaultdict
from datetime import datetime

logger = logging.getLogger(__name__)


class MetricsCollector:
    """
    Metrics collector for recommendation service
    Compatible with Prometheus format
    """

    def __init__(self):
        """Initialize metrics collector"""
        # Counter metrics
        self.counters = defaultdict(int)

        # Gauge metrics
        self.gauges = defaultdict(float)

        # Histogram buckets
        self.histograms = defaultdict(list)

        # Summary statistics
        self.summaries = defaultdict(lambda: {"count": 0, "sum": 0.0})

        # Metadata
        self.start_time = time.time()
        self.last_reset = datetime.now()

        logger.info("MetricsCollector initialized")

    # Counter methods

    def increment_counter(self, name: str, value: float = 1.0, labels: Optional[Dict] = None):
        """
        Increment a counter metric

        Args:
            name: Metric name
            value: Increment value
            labels: Metric labels
        """
        key = self._make_key(name, labels)
        self.counters[key] += value

    def get_counter(self, name: str, labels: Optional[Dict] = None) -> float:
        """Get counter value"""
        key = self._make_key(name, labels)
        return self.counters.get(key, 0.0)

    # Gauge methods

    def set_gauge(self, name: str, value: float, labels: Optional[Dict] = None):
        """
        Set a gauge metric

        Args:
            name: Metric name
            value: Gauge value
            labels: Metric labels
        """
        key = self._make_key(name, labels)
        self.gauges[key] = value

    def get_gauge(self, name: str, labels: Optional[Dict] = None) -> float:
        """Get gauge value"""
        key = self._make_key(name, labels)
        return self.gauges.get(key, 0.0)

    # Histogram methods

    def observe_histogram(self, name: str, value: float, labels: Optional[Dict] = None):
        """
        Record a histogram observation

        Args:
            name: Metric name
            value: Observed value
            labels: Metric labels
        """
        key = self._make_key(name, labels)
        self.histograms[key].append(value)

    def get_histogram_stats(self, name: str, labels: Optional[Dict] = None) -> Dict:
        """Get histogram statistics"""
        key = self._make_key(name, labels)
        values = self.histograms.get(key, [])

        if not values:
            return {
                "count": 0,
                "sum": 0.0,
                "min": 0.0,
                "max": 0.0,
                "mean": 0.0
            }

        return {
            "count": len(values),
            "sum": sum(values),
            "min": min(values),
            "max": max(values),
            "mean": sum(values) / len(values)
        }

    # Summary methods

    def observe_summary(self, name: str, value: float, labels: Optional[Dict] = None):
        """
        Record a summary observation

        Args:
            name: Metric name
            value: Observed value
            labels: Metric labels
        """
        key = self._make_key(name, labels)
        self.summaries[key]["count"] += 1
        self.summaries[key]["sum"] += value

    def get_summary_stats(self, name: str, labels: Optional[Dict] = None) -> Dict:
        """Get summary statistics"""
        key = self._make_key(name, labels)
        stats = self.summaries.get(key, {"count": 0, "sum": 0.0})

        mean = stats["sum"] / stats["count"] if stats["count"] > 0 else 0.0

        return {
            "count": stats["count"],
            "sum": stats["sum"],
            "mean": mean
        }

    # Helper methods

    def _make_key(self, name: str, labels: Optional[Dict] = None) -> str:
        """Create metric key with labels"""
        if not labels:
            return name

        label_str = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
        return f"{name}{{{label_str}}}"

    def export_prometheus_format(self) -> str:
        """
        Export metrics in Prometheus text format

        Returns:
            Metrics in Prometheus format
        """
        lines = []

        # Export counters
        for key, value in self.counters.items():
            name = key.split("{")[0]
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{key} {value}")

        # Export gauges
        for key, value in self.gauges.items():
            name = key.split("{")[0]
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{key} {value}")

        # Export histograms
        for key in self.histograms:
            name = key.split("{")[0]
            stats = self.get_histogram_stats(name)

            lines.append(f"# TYPE {name} histogram")
            lines.append(f"{key}_count {stats['count']}")
            lines.append(f"{key}_sum {stats['sum']}")

        # Export summaries
        for key in self.summaries:
            name = key.split("{")[0]
            stats = self.get_summary_stats(name)

            lines.append(f"# TYPE {name} summary")
            lines.append(f"{key}_count {stats['count']}")
            lines.append(f"{key}_sum {stats['sum']}")

        # Add uptime
        uptime = time.time() - self.start_time
        lines.append("# TYPE process_uptime_seconds gauge")
        lines.append(f"process_uptime_seconds {uptime:.2f}")

        return "\n".join(lines)

    def reset(self):
        """Reset all metrics"""
        self.counters.clear()
        self.gauges.clear()
        self.histograms.clear()
        self.summaries.clear()
        self.last_reset = datetime.now()
        logger.info("Metrics reset")

    def get_all_metrics(self) -> Dict:
        """
        Get all metrics as dictionary

        Returns:
            Dictionary of all metrics
        """
        return {
            "counters": dict(self.counters),
            "gauges": dict(self.gauges),
            "histograms": {
                key: self.get_histogram_stats(key.split("{")[0])
                for key in self.histograms
            },
            "summaries": {
                key: self.get_summary_stats(key.split("{")[0])
                for key in self.summaries
            },
            "uptime_seconds": time.time() - self.start_time,
            "last_reset": self.last_reset.isoformat()
        }


# Global metrics collector instance
_metrics_collector: Optional[MetricsCollector] = None


def get_metrics_collector() -> MetricsCollector:
    """Get or create global metrics collector"""
    global _metrics_collector

    if _metrics_collector is None:
        _metrics_collector = MetricsCollector()

    return _metrics_collector


# Decorator for timing functions

def time_execution(metric_name: str, labels: Optional[Dict] = None):
    """
    Decorator to time function execution

    Args:
        metric_name: Name of the metric to record
        labels: Optional labels for the metric

    Example:
        @time_execution("recommendation_latency", {"model": "hybrid"})
        def get_recommendations(user_id):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            collector = get_metrics_collector()
            start_time = time.time()

            try:
                result = await func(*args, **kwargs)
                duration = time.time() - start_time

                # Record successful execution
                collector.observe_histogram(metric_name, duration, labels)
                collector.increment_counter(
                    f"{metric_name}_total",
                    labels={**(labels or {}), "status": "success"}
                )

                return result

            except Exception as e:
                duration = time.time() - start_time

                # Record failed execution
                collector.observe_histogram(metric_name, duration, labels)
                collector.increment_counter(
                    f"{metric_name}_total",
                    labels={**(labels or {}), "status": "error"}
                )

                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            collector = get_metrics_collector()
            start_time = time.time()

            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time

                # Record successful execution
                collector.observe_histogram(metric_name, duration, labels)
                collector.increment_counter(
                    f"{metric_name}_total",
                    labels={**(labels or {}), "status": "success"}
                )

                return result

            except Exception as e:
                duration = time.time() - start_time

                # Record failed execution
                collector.observe_histogram(metric_name, duration, labels)
                collector.increment_counter(
                    f"{metric_name}_total",
                    labels={**(labels or {}), "status": "error"}
                )

                raise

        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


# Decorator for counting function calls

def count_calls(metric_name: str, labels: Optional[Dict] = None):
    """
    Decorator to count function calls

    Args:
        metric_name: Name of the counter metric
        labels: Optional labels for the metric
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            collector = get_metrics_collector()
            collector.increment_counter(metric_name, labels=labels)
            return await func(*args, **kwargs)

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            collector = get_metrics_collector()
            collector.increment_counter(metric_name, labels=labels)
            return func(*args, **kwargs)

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


class RecommendationMetrics:
    """
    Specialized metrics for recommendation service
    """

    def __init__(self, collector: Optional[MetricsCollector] = None):
        """Initialize recommendation metrics"""
        self.collector = collector or get_metrics_collector()

    def track_recommendation_request(
        self,
        user_id: str,
        model: str,
        latency_seconds: float,
        num_recommendations: int,
        cache_hit: bool = False
    ):
        """Track recommendation request"""
        # Latency histogram
        self.collector.observe_histogram(
            "recommendation_latency_seconds",
            latency_seconds,
            labels={"model": model}
        )

        # Request counter
        self.collector.increment_counter(
            "recommendation_requests_total",
            labels={"model": model, "cache_hit": str(cache_hit)}
        )

        # Recommendations count
        self.collector.observe_summary(
            "recommendations_count",
            num_recommendations,
            labels={"model": model}
        )

    def track_model_performance(
        self,
        model_name: str,
        precision: float,
        recall: float,
        ndcg: float
    ):
        """Track model performance metrics"""
        self.collector.set_gauge(
            "model_precision",
            precision,
            labels={"model": model_name}
        )

        self.collector.set_gauge(
            "model_recall",
            recall,
            labels={"model": model_name}
        )

        self.collector.set_gauge(
            "model_ndcg",
            ndcg,
            labels={"model": model_name}
        )

    def track_user_interaction(
        self,
        interaction_type: str,
        service_id: str
    ):
        """Track user interaction"""
        self.collector.increment_counter(
            "user_interactions_total",
            labels={
                "interaction_type": interaction_type,
                "service_id": service_id
            }
        )

    def track_ab_test(
        self,
        experiment_id: str,
        variant: str
    ):
        """Track A/B test assignment"""
        self.collector.increment_counter(
            "ab_test_assignments_total",
            labels={
                "experiment": experiment_id,
                "variant": variant
            }
        )

    def track_cache_performance(
        self,
        operation: str,
        hit: bool,
        latency_seconds: float
    ):
        """Track cache performance"""
        self.collector.increment_counter(
            "cache_operations_total",
            labels={
                "operation": operation,
                "result": "hit" if hit else "miss"
            }
        )

        self.collector.observe_histogram(
            "cache_latency_seconds",
            latency_seconds,
            labels={"operation": operation}
        )

    def track_feature_store_latency(
        self,
        operation: str,
        latency_seconds: float
    ):
        """Track feature store latency"""
        self.collector.observe_histogram(
            "feature_store_latency_seconds",
            latency_seconds,
            labels={"operation": operation}
        )

    def track_model_serving_latency(
        self,
        model_name: str,
        latency_seconds: float
    ):
        """Track model serving latency"""
        self.collector.observe_histogram(
            "model_serving_latency_seconds",
            latency_seconds,
            labels={"model": model_name}
        )

    def get_summary(self) -> Dict:
        """Get metrics summary"""
        return {
            "total_requests": self.collector.get_counter("recommendation_requests_total"),
            "cache_hit_rate": self._calculate_cache_hit_rate(),
            "average_latency": self._calculate_average_latency(),
            "uptime_seconds": time.time() - self.collector.start_time
        }

    def _calculate_cache_hit_rate(self) -> float:
        """Calculate cache hit rate"""
        total_cache_hit = self.collector.get_counter(
            "recommendation_requests_total",
            labels={"cache_hit": "True"}
        )
        total_cache_miss = self.collector.get_counter(
            "recommendation_requests_total",
            labels={"cache_hit": "False"}
        )

        total = total_cache_hit + total_cache_miss
        if total == 0:
            return 0.0

        return total_cache_hit / total

    def _calculate_average_latency(self) -> float:
        """Calculate average recommendation latency"""
        stats = self.collector.get_histogram_stats("recommendation_latency_seconds")
        return stats.get("mean", 0.0)

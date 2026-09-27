//! Benchmark result structures
//!
//! This module defines the canonical `BenchmarkResult` structure that all
//! benchmark targets must return. It provides a standardized format for
//! capturing performance metrics, metadata, and timestamps.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents the result of a single benchmark execution
///
/// This is the canonical structure that all benchmark adapters must return.
/// It captures the target identifier, performance metrics, and execution metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    /// Unique identifier for the benchmark target (e.g., "api-gateway", "redis")
    pub target_id: String,

    /// Performance metrics as key-value pairs (e.g., "latency_p50" => 12.5)
    /// Common metric keys:
    /// - latency_p50, latency_p95, latency_p99 (in milliseconds)
    /// - throughput (operations per second)
    /// - memory_mb (memory usage in megabytes)
    /// - cpu_percent (CPU utilization percentage)
    /// - error_rate (percentage of failed operations)
    pub metrics: HashMap<String, f64>,

    /// Timestamp when the benchmark was executed
    pub timestamp: DateTime<Utc>,

    /// Optional metadata about the benchmark run
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

impl BenchmarkResult {
    /// Creates a new benchmark result with the given target ID and metrics
    ///
    /// The timestamp is automatically set to the current UTC time.
    ///
    /// # Arguments
    ///
    /// * `target_id` - Unique identifier for the benchmark target
    /// * `metrics` - Performance metrics collected during the benchmark
    ///
    /// # Example
    ///
    /// ```
    /// use marketplace_benchmarks::BenchmarkResult;
    /// use std::collections::HashMap;
    ///
    /// let mut metrics = HashMap::new();
    /// metrics.insert("latency_p50".to_string(), 12.5);
    /// metrics.insert("throughput".to_string(), 1000.0);
    ///
    /// let result = BenchmarkResult::new("api-gateway".to_string(), metrics);
    /// assert_eq!(result.target_id, "api-gateway");
    /// ```
    pub fn new(target_id: String, metrics: HashMap<String, f64>) -> Self {
        Self {
            target_id,
            metrics,
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        }
    }

    /// Creates a new benchmark result with metadata
    ///
    /// # Arguments
    ///
    /// * `target_id` - Unique identifier for the benchmark target
    /// * `metrics` - Performance metrics collected during the benchmark
    /// * `metadata` - Additional metadata about the benchmark run
    pub fn with_metadata(
        target_id: String,
        metrics: HashMap<String, f64>,
        metadata: HashMap<String, String>,
    ) -> Self {
        Self {
            target_id,
            metrics,
            timestamp: Utc::now(),
            metadata,
        }
    }

    /// Adds a single metric to the result
    pub fn add_metric(&mut self, key: String, value: f64) {
        self.metrics.insert(key, value);
    }

    /// Adds metadata to the result
    pub fn add_metadata(&mut self, key: String, value: String) {
        self.metadata.insert(key, value);
    }

    /// Gets a metric value by key
    pub fn get_metric(&self, key: &str) -> Option<f64> {
        self.metrics.get(key).copied()
    }

    /// Gets metadata value by key
    pub fn get_metadata(&self, key: &str) -> Option<&String> {
        self.metadata.get(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_benchmark_result() {
        let mut metrics = HashMap::new();
        metrics.insert("latency_p50".to_string(), 12.5);
        metrics.insert("throughput".to_string(), 1000.0);

        let result = BenchmarkResult::new("test-target".to_string(), metrics);

        assert_eq!(result.target_id, "test-target");
        assert_eq!(result.get_metric("latency_p50"), Some(12.5));
        assert_eq!(result.get_metric("throughput"), Some(1000.0));
        assert!(result.metadata.is_empty());
    }

    #[test]
    fn test_with_metadata() {
        let mut metrics = HashMap::new();
        metrics.insert("latency_p50".to_string(), 12.5);

        let mut metadata = HashMap::new();
        metadata.insert("version".to_string(), "1.0.0".to_string());

        let result = BenchmarkResult::with_metadata(
            "test-target".to_string(),
            metrics,
            metadata,
        );

        assert_eq!(result.get_metadata("version"), Some(&"1.0.0".to_string()));
    }

    #[test]
    fn test_add_metric() {
        let mut result = BenchmarkResult::new("test".to_string(), HashMap::new());
        result.add_metric("new_metric".to_string(), 42.0);

        assert_eq!(result.get_metric("new_metric"), Some(42.0));
    }

    #[test]
    fn test_serialization() {
        let mut metrics = HashMap::new();
        metrics.insert("latency_p50".to_string(), 12.5);

        let result = BenchmarkResult::new("test-target".to_string(), metrics);
        let json = serde_json::to_string(&result).unwrap();

        assert!(json.contains("test-target"));
        assert!(json.contains("latency_p50"));
    }
}

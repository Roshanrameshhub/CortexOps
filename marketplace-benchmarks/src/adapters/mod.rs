//! Benchmark adapters module
//!
//! This module defines the BenchTarget trait that all benchmark adapters must implement,
//! and provides a registry of all available benchmark targets.

use crate::benchmarks::result::BenchmarkResult;
use anyhow::Result;

// Marketplace benchmark adapters
pub mod listing_retrieval;
pub mod registry_lookup;
pub mod metadata_validation;
pub mod search_queries;

pub use listing_retrieval::ListingRetrievalBenchmark;
pub use registry_lookup::RegistryLookupBenchmark;
pub use metadata_validation::MetadataValidationBenchmark;
pub use search_queries::SearchQueriesBenchmark;

/// Trait that all benchmark targets must implement
///
/// Each benchmark adapter implements this trait to provide a unique identifier
/// and an execution method that returns standardized results.
pub trait BenchTarget {
    /// Returns the unique identifier for this benchmark target
    ///
    /// This ID is used in filenames, reports, and logs to identify the benchmark.
    /// It should be lowercase with hyphens (e.g., "api-gateway", "redis-cache").
    fn id(&self) -> &str;

    /// Executes the benchmark and returns the result
    ///
    /// This method performs the actual benchmark execution, collects metrics,
    /// and returns a BenchmarkResult with the performance data.
    ///
    /// # Returns
    ///
    /// A `Result` containing the `BenchmarkResult` or an error if the benchmark fails
    fn run(&self) -> Result<BenchmarkResult>;
}

/// Example benchmark target for demonstration and testing
///
/// This is a simple example implementation that can be used as a template
/// for creating new benchmark adapters.
pub struct ExampleBenchmark {
    id: String,
}

impl ExampleBenchmark {
    pub fn new(id: String) -> Self {
        Self { id }
    }
}

impl BenchTarget for ExampleBenchmark {
    fn id(&self) -> &str {
        &self.id
    }

    fn run(&self) -> Result<BenchmarkResult> {
        use std::collections::HashMap;

        log::info!("Running example benchmark: {}", self.id);

        // Simulate collecting metrics
        let mut metrics = HashMap::new();
        metrics.insert("latency_p50".to_string(), 10.5);
        metrics.insert("latency_p95".to_string(), 25.3);
        metrics.insert("latency_p99".to_string(), 45.7);
        metrics.insert("throughput".to_string(), 1500.0);
        metrics.insert("error_rate".to_string(), 0.01);

        // Create result with system metadata
        let mut result = BenchmarkResult::new(self.id.to_string(), metrics);

        // Add system information
        if let Ok(hostname) = hostname::get() {
            if let Some(hostname_str) = hostname.to_str() {
                result.add_metadata("hostname".to_string(), hostname_str.to_string());
            }
        }
        result.add_metadata("cpu_count".to_string(), num_cpus::get().to_string());

        if let Ok(info) = sys_info::os_type() {
            result.add_metadata("os".to_string(), info);
        }

        Ok(result)
    }
}

/// Returns all registered benchmark targets
///
/// This function serves as the central registry for all benchmark adapters.
/// When new benchmark targets are implemented, they should be added to this function.
///
/// # Returns
///
/// A vector of boxed trait objects representing all available benchmark targets
///
/// # Example
///
/// ```
/// use marketplace_benchmarks::all_targets;
///
/// let targets = all_targets();
/// for target in targets {
///     println!("Available benchmark: {}", target.id());
/// }
/// ```
pub fn all_targets() -> Vec<Box<dyn BenchTarget>> {
    vec![
        Box::new(ExampleBenchmark::new("example-benchmark".to_string())),
        // Marketplace operation benchmarks
        Box::new(ListingRetrievalBenchmark::new()),
        Box::new(RegistryLookupBenchmark::new()),
        Box::new(MetadataValidationBenchmark::new()),
        Box::new(SearchQueriesBenchmark::new()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_example_benchmark() {
        let bench = ExampleBenchmark::new("test-bench".to_string());
        assert_eq!(bench.id(), "test-bench");

        let result = bench.run().unwrap();
        assert_eq!(result.target_id, "test-bench");
        assert!(result.get_metric("latency_p50").is_some());
        assert!(result.get_metric("throughput").is_some());
    }

    #[test]
    fn test_all_targets() {
        let targets = all_targets();
        assert!(!targets.is_empty());

        for target in targets {
            assert!(!target.id().is_empty());
        }
    }

    #[test]
    fn test_benchmark_execution() {
        let targets = all_targets();

        for target in targets {
            let result = target.run().unwrap();
            assert_eq!(result.target_id, target.id());
            assert!(!result.metrics.is_empty());
        }
    }
}

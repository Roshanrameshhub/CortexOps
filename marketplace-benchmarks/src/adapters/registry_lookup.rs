//! Registry Lookup Benchmark Adapter
//!
//! Benchmarks model registry lookup and resolution operations.

use crate::benchmarks::result::BenchmarkResult;
use crate::adapters::BenchTarget;
use anyhow::{Context, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::process::Command;
use std::time::Instant;

#[derive(Debug, Deserialize)]
struct CliMetrics {
    operation: String,
    #[serde(rename = "durationMs")]
    duration_ms: f64,
    #[serde(rename = "itemsProcessed")]
    items_processed: usize,
    success: bool,
}

/// Benchmark adapter for model registry lookup operations
pub struct RegistryLookupBenchmark {
    wrapper_path: String,
}

impl RegistryLookupBenchmark {
    pub fn new() -> Self {
        let workspace_root = std::env::var("CARGO_MANIFEST_DIR")
            .unwrap_or_else(|_| ".".to_string());
        let wrapper_path = format!("{}/ts-wrappers/registry-cli.ts", workspace_root);

        Self { wrapper_path }
    }

    fn run_cli_operation(&self, operation: &str, args: &[&str]) -> Result<CliMetrics> {
        let mut cmd_args = vec!["--no-warnings", &self.wrapper_path, operation];
        cmd_args.extend(args);

        let output = Command::new("node")
            .args(&cmd_args)
            .output()
            .context("Failed to execute TypeScript wrapper")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("CLI operation failed: {}", stderr);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let metrics: CliMetrics = serde_json::from_str(&stdout)
            .context("Failed to parse CLI output")?;

        Ok(metrics)
    }

    fn execute_benchmark_suite(&self) -> Result<BenchmarkResult> {
        let mut all_durations = Vec::new();
        let mut total_items = 0;
        let mut operation_count = 0;
        let mut error_count = 0;

        // Test 1: Model lookup by ID (50 iterations)
        log::info!("Running lookup operation...");
        for i in 0..50 {
            let model_id = format!("mdl_{:05}", i * 5);
            let start = Instant::now();
            match self.run_cli_operation("lookup", &[&model_id]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;
                    log::debug!("lookup iteration {}: {} items in {:.2}ms",
                               i, metrics.items_processed, metrics.duration_ms);
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("lookup iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 2: Version resolution (30 iterations)
        log::info!("Running resolve_version operation...");
        for i in 0..30 {
            let model_id = format!("mdl_{:05}", i * 3);
            let version = format!("{}.{}.0", i / 10, i % 10 / 2);
            let start = Instant::now();
            match self.run_cli_operation("resolve_version", &[&model_id, &version]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("resolve_version iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 3: Search models (20 iterations with different filters)
        log::info!("Running search operation...");
        let categories = ["text-generation", "image-classification", "translation", "summarization"];
        for i in 0..20 {
            let category = categories[i % categories.len()];
            let min_score = ((i % 5) * 10 + 50).to_string();
            let start = Instant::now();
            match self.run_cli_operation("search", &[category, &min_score]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("search iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 4: Get model versions (25 iterations)
        log::info!("Running get_versions operation...");
        for i in 0..25 {
            let model_id = format!("mdl_{:05}", i * 4);
            let start = Instant::now();
            match self.run_cli_operation("get_versions", &[&model_id]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("get_versions iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 5: Bulk lookup (10 iterations)
        log::info!("Running bulk_lookup operation...");
        for i in 0..10 {
            let count = ((i + 1) * 20).to_string();
            let start = Instant::now();
            match self.run_cli_operation("bulk_lookup", &[&count]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("bulk_lookup iteration {} failed: {}", i, e);
                }
            }
        }

        // Calculate percentiles
        all_durations.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let len = all_durations.len();

        let p50 = if len > 0 {
            all_durations[len / 2]
        } else {
            0.0
        };

        let p95 = if len > 0 {
            all_durations[(len * 95) / 100]
        } else {
            0.0
        };

        let p99 = if len > 0 {
            all_durations[(len * 99) / 100]
        } else {
            0.0
        };

        let total_duration: f64 = all_durations.iter().sum();
        let throughput_rps = if total_duration > 0.0 {
            (operation_count as f64) / (total_duration / 1000.0)
        } else {
            0.0
        };

        let error_rate = if operation_count + error_count > 0 {
            (error_count as f64) / ((operation_count + error_count) as f64)
        } else {
            0.0
        };

        // Build metrics
        let mut metrics = HashMap::new();
        metrics.insert("latency_p50".to_string(), p50);
        metrics.insert("latency_p95".to_string(), p95);
        metrics.insert("latency_p99".to_string(), p99);
        metrics.insert("throughput_rps".to_string(), throughput_rps);
        metrics.insert("operation_count".to_string(), operation_count as f64);
        metrics.insert("error_rate".to_string(), error_rate);
        metrics.insert("total_items_processed".to_string(), total_items as f64);

        let mut result = BenchmarkResult::new(self.id().to_string(), metrics);

        // Add metadata
        result.add_metadata("wrapper_type".to_string(), "node_cli".to_string());
        result.add_metadata("test_suite".to_string(), "registry_lookup".to_string());
        result.add_metadata("iterations".to_string(), len.to_string());

        if let Ok(hostname) = hostname::get() {
            if let Some(hostname_str) = hostname.to_str() {
                result.add_metadata("hostname".to_string(), hostname_str.to_string());
            }
        }

        Ok(result)
    }
}

impl Default for RegistryLookupBenchmark {
    fn default() -> Self {
        Self::new()
    }
}

impl BenchTarget for RegistryLookupBenchmark {
    fn id(&self) -> &str {
        "marketplace_registry_lookup"
    }

    fn run(&self) -> Result<BenchmarkResult> {
        log::info!("Running registry lookup benchmark");
        self.execute_benchmark_suite()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_benchmark_id() {
        let bench = RegistryLookupBenchmark::new();
        assert_eq!(bench.id(), "marketplace_registry_lookup");
    }
}

//! Metadata Validation Benchmark Adapter
//!
//! Benchmarks service manifest validation and schema checking operations.

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
    #[serde(rename = "validationStats")]
    validation_stats: Option<ValidationStats>,
}

#[derive(Debug, Deserialize)]
struct ValidationStats {
    #[serde(rename = "totalChecks")]
    total_checks: usize,
    passed: usize,
    failed: usize,
    warnings: usize,
}

/// Benchmark adapter for metadata validation operations
pub struct MetadataValidationBenchmark {
    wrapper_path: String,
}

impl MetadataValidationBenchmark {
    pub fn new() -> Self {
        let workspace_root = std::env::var("CARGO_MANIFEST_DIR")
            .unwrap_or_else(|_| ".".to_string());
        let wrapper_path = format!("{}/ts-wrappers/validation-cli.ts", workspace_root);

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
        let mut total_validation_checks = 0;
        let mut total_passed = 0;
        let mut total_failed = 0;
        let mut total_warnings = 0;

        // Test 1: Single valid manifest validation (30 iterations)
        log::info!("Running single validation (valid)...");
        for i in 0..30 {
            let start = Instant::now();
            match self.run_cli_operation("single", &["valid"]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;

                    if let Some(stats) = metrics.validation_stats {
                        total_validation_checks += stats.total_checks;
                        total_passed += stats.passed;
                        total_failed += stats.failed;
                        total_warnings += stats.warnings;
                    }

                    log::debug!("single valid iteration {}: success={}, {:.2}ms",
                               i, metrics.success, metrics.duration_ms);
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("single valid iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 2: Single invalid manifest validation (20 iterations)
        log::info!("Running single validation (invalid)...");
        for i in 0..20 {
            let start = Instant::now();
            match self.run_cli_operation("single", &["invalid"]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;

                    if let Some(stats) = metrics.validation_stats {
                        total_validation_checks += stats.total_checks;
                        total_passed += stats.passed;
                        total_failed += stats.failed;
                        total_warnings += stats.warnings;
                    }
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("single invalid iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 3: Batch validation with varying valid ratios (15 iterations)
        log::info!("Running batch validation...");
        let batch_sizes = [50, 100, 200];
        let valid_ratios = [0.9, 0.8, 0.7, 0.6, 0.5];

        for i in 0..15 {
            let batch_size = batch_sizes[i % batch_sizes.len()].to_string();
            let valid_ratio = valid_ratios[i % valid_ratios.len()].to_string();
            let start = Instant::now();

            match self.run_cli_operation("batch", &[&batch_size, &valid_ratio]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;

                    if let Some(stats) = metrics.validation_stats {
                        total_validation_checks += stats.total_checks;
                        total_passed += stats.passed;
                        total_failed += stats.failed;
                        total_warnings += stats.warnings;
                    }

                    log::debug!("batch iteration {}: {} items in {:.2}ms",
                               i, metrics.items_processed, metrics.duration_ms);
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("batch iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 4: Schema compliance validation (15 iterations)
        log::info!("Running schema compliance validation...");
        for i in 0..15 {
            let mode = if i % 2 == 0 { "strict" } else { "normal" };
            let args = if mode == "strict" {
                vec![mode]
            } else {
                vec![]
            };

            let start = Instant::now();
            match self.run_cli_operation("schema", &args) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("schema iteration {} failed: {}", i, e);
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

        let validation_pass_rate = if total_validation_checks > 0 {
            (total_passed as f64) / (total_validation_checks as f64)
        } else {
            0.0
        };

        let validation_failure_rate = if total_validation_checks > 0 {
            (total_failed as f64) / (total_validation_checks as f64)
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
        metrics.insert("validation_checks_total".to_string(), total_validation_checks as f64);
        metrics.insert("validation_pass_rate".to_string(), validation_pass_rate);
        metrics.insert("validation_failure_rate".to_string(), validation_failure_rate);
        metrics.insert("validation_warnings".to_string(), total_warnings as f64);

        let mut result = BenchmarkResult::new(self.id().to_string(), metrics);

        // Add metadata
        result.add_metadata("wrapper_type".to_string(), "node_cli".to_string());
        result.add_metadata("test_suite".to_string(), "metadata_validation".to_string());
        result.add_metadata("iterations".to_string(), len.to_string());
        result.add_metadata("total_checks".to_string(), total_validation_checks.to_string());

        if let Ok(hostname) = hostname::get() {
            if let Some(hostname_str) = hostname.to_str() {
                result.add_metadata("hostname".to_string(), hostname_str.to_string());
            }
        }

        Ok(result)
    }
}

impl Default for MetadataValidationBenchmark {
    fn default() -> Self {
        Self::new()
    }
}

impl BenchTarget for MetadataValidationBenchmark {
    fn id(&self) -> &str {
        "marketplace_metadata_validation"
    }

    fn run(&self) -> Result<BenchmarkResult> {
        log::info!("Running metadata validation benchmark");
        self.execute_benchmark_suite()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_benchmark_id() {
        let bench = MetadataValidationBenchmark::new();
        assert_eq!(bench.id(), "marketplace_metadata_validation");
    }
}

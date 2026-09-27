//! Search Queries Benchmark Adapter
//!
//! Benchmarks discovery search operations including full-text, faceted, and recommendation queries.

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
    #[serde(rename = "searchStats")]
    search_stats: Option<SearchStats>,
}

#[derive(Debug, Deserialize)]
struct SearchStats {
    #[serde(rename = "totalResults")]
    total_results: usize,
    #[serde(rename = "topScore")]
    top_score: f64,
    #[serde(rename = "avgScore")]
    avg_score: f64,
}

/// Benchmark adapter for discovery search operations
pub struct SearchQueriesBenchmark {
    wrapper_path: String,
}

impl SearchQueriesBenchmark {
    pub fn new() -> Self {
        let workspace_root = std::env::var("CARGO_MANIFEST_DIR")
            .unwrap_or_else(|_| ".".to_string());
        let wrapper_path = format!("{}/ts-wrappers/search-cli.ts", workspace_root);

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
        let mut total_search_results = 0;
        let mut max_top_score = 0.0_f64;
        let mut sum_avg_scores = 0.0_f64;
        let mut score_count = 0;

        // Test 1: Full-text search with different queries (25 iterations)
        log::info!("Running full-text search...");
        let search_queries = [
            "text generation",
            "image processing",
            "speech recognition",
            "data analysis",
            "translation",
            "GPT",
            "BERT",
            "Vision",
            "Audio",
            "nlp",
        ];

        for i in 0..25 {
            let query = search_queries[i % search_queries.len()];
            let limit = ((i % 3) * 10 + 10).to_string();
            let start = Instant::now();

            match self.run_cli_operation("search", &[query, &limit]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;

                    if let Some(stats) = metrics.search_stats {
                        total_search_results += stats.total_results;
                        max_top_score = max_top_score.max(stats.top_score);
                        sum_avg_scores += stats.avg_score;
                        score_count += 1;
                    }

                    log::debug!("search iteration {}: query='{}', {} results in {:.2}ms",
                               i, query, metrics.items_processed, metrics.duration_ms);
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("search iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 2: Faceted search with different filters (20 iterations)
        log::info!("Running faceted search...");
        let categories = ["ai-models", "data-processing", "analytics", "storage", "compute"];
        let tag_sets = ["nlp,vision", "audio", "multimodal,analytics", "nlp"];

        for i in 0..20 {
            let mut args = vec![];

            if i % 3 != 0 {
                args.push(categories[i % categories.len()]);
            }

            if i % 2 == 0 && !args.is_empty() {
                args.push(tag_sets[i % tag_sets.len()]);
            }

            if i % 4 == 0 && !args.is_empty() {
                args.push("4.0");
            }

            let start = Instant::now();
            match self.run_cli_operation("faceted", &args) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;

                    log::debug!("faceted iteration {}: {} results in {:.2}ms",
                               i, metrics.items_processed, metrics.duration_ms);
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("faceted iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 3: Recommendation queries (15 iterations)
        log::info!("Running recommendation queries...");
        for i in 0..15 {
            let user_id = format!("user_{}", i);
            let limit = ((i % 2) * 5 + 10).to_string();
            let start = Instant::now();

            match self.run_cli_operation("recommendations", &[&user_id, &limit]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("recommendations iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 4: Category aggregation (10 iterations)
        log::info!("Running category aggregation...");
        for i in 0..10 {
            let start = Instant::now();

            match self.run_cli_operation("aggregate", &[]) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("aggregate iteration {} failed: {}", i, e);
                }
            }
        }

        // Test 5: Multi-query search (10 iterations)
        log::info!("Running multi-query search...");
        for i in 0..10 {
            let queries = match i % 3 {
                0 => vec!["text", "image", "audio"],
                1 => vec!["nlp", "vision"],
                _ => vec!["generation", "processing", "analysis", "translation"],
            };

            let start = Instant::now();
            match self.run_cli_operation("multi", &queries) {
                Ok(metrics) => {
                    all_durations.push(start.elapsed().as_secs_f64() * 1000.0);
                    total_items += metrics.items_processed;
                    operation_count += 1;

                    log::debug!("multi-query iteration {}: {} total results in {:.2}ms",
                               i, metrics.items_processed, metrics.duration_ms);
                }
                Err(e) => {
                    error_count += 1;
                    log::warn!("multi-query iteration {} failed: {}", i, e);
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

        let avg_search_score = if score_count > 0 {
            sum_avg_scores / (score_count as f64)
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
        metrics.insert("total_search_results".to_string(), total_search_results as f64);
        metrics.insert("max_top_score".to_string(), max_top_score);
        metrics.insert("avg_search_score".to_string(), avg_search_score);

        let mut result = BenchmarkResult::new(self.id().to_string(), metrics);

        // Add metadata
        result.add_metadata("wrapper_type".to_string(), "node_cli".to_string());
        result.add_metadata("test_suite".to_string(), "search_queries".to_string());
        result.add_metadata("iterations".to_string(), len.to_string());
        result.add_metadata("search_types".to_string(), "full_text,faceted,recommendations,aggregation,multi_query".to_string());

        if let Ok(hostname) = hostname::get() {
            if let Some(hostname_str) = hostname.to_str() {
                result.add_metadata("hostname".to_string(), hostname_str.to_string());
            }
        }

        Ok(result)
    }
}

impl Default for SearchQueriesBenchmark {
    fn default() -> Self {
        Self::new()
    }
}

impl BenchTarget for SearchQueriesBenchmark {
    fn id(&self) -> &str {
        "marketplace_search_queries"
    }

    fn run(&self) -> Result<BenchmarkResult> {
        log::info!("Running search queries benchmark");
        self.execute_benchmark_suite()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_benchmark_id() {
        let bench = SearchQueriesBenchmark::new();
        assert_eq!(bench.id(), "marketplace_search_queries");
    }
}

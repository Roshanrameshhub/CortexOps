//! File I/O utilities for benchmark results
//!
//! This module provides functions for saving benchmark results to disk
//! and loading them back. Results are stored as JSON files with timestamps
//! in their filenames for easy tracking and comparison.

use crate::benchmarks::result::BenchmarkResult;
use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

/// Default output directory for raw benchmark results
pub const DEFAULT_RAW_OUTPUT_DIR: &str = "benchmarks/output/raw";

/// Saves a benchmark result to a JSON file
///
/// The file is saved in the raw output directory with a filename format:
/// `{target_id}_{timestamp}.json`
///
/// # Arguments
///
/// * `result` - The benchmark result to save
/// * `output_dir` - Optional custom output directory. If None, uses DEFAULT_RAW_OUTPUT_DIR
///
/// # Returns
///
/// A `Result` containing the path where the file was saved
///
/// # Example
///
/// ```no_run
/// use marketplace_benchmarks::{BenchmarkResult, save_benchmark_result};
/// use std::collections::HashMap;
///
/// let mut metrics = HashMap::new();
/// metrics.insert("latency_p50".to_string(), 12.5);
///
/// let result = BenchmarkResult::new("api-gateway".to_string(), metrics);
/// let path = save_benchmark_result(&result, None).unwrap();
/// println!("Saved to: {:?}", path);
/// ```
pub fn save_benchmark_result(
    result: &BenchmarkResult,
    output_dir: Option<&Path>,
) -> Result<PathBuf> {
    let dir = output_dir
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from(DEFAULT_RAW_OUTPUT_DIR));

    // Ensure the output directory exists
    fs::create_dir_all(&dir)
        .with_context(|| format!("Failed to create output directory: {:?}", dir))?;

    // Generate filename with timestamp
    let timestamp_str = result.timestamp.format("%Y%m%d_%H%M%S");
    let filename = format!("{}_{}.json", result.target_id, timestamp_str);
    let filepath = dir.join(filename);

    // Serialize and write to file
    let json = serde_json::to_string_pretty(result)
        .with_context(|| format!("Failed to serialize result for {}", result.target_id))?;

    fs::write(&filepath, json)
        .with_context(|| format!("Failed to write result to {:?}", filepath))?;

    log::info!("Saved benchmark result to: {:?}", filepath);
    Ok(filepath)
}

/// Loads all benchmark results from a directory
///
/// Scans the specified directory for JSON files and attempts to deserialize
/// them as BenchmarkResult objects.
///
/// # Arguments
///
/// * `input_dir` - Optional directory to load from. If None, uses DEFAULT_RAW_OUTPUT_DIR
///
/// # Returns
///
/// A `Result` containing a vector of successfully loaded benchmark results
///
/// # Example
///
/// ```no_run
/// use marketplace_benchmarks::load_benchmark_results;
///
/// let results = load_benchmark_results(None).unwrap();
/// println!("Loaded {} benchmark results", results.len());
/// ```
pub fn load_benchmark_results(input_dir: Option<&Path>) -> Result<Vec<BenchmarkResult>> {
    let dir = input_dir
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from(DEFAULT_RAW_OUTPUT_DIR));

    if !dir.exists() {
        log::warn!("Input directory does not exist: {:?}", dir);
        return Ok(Vec::new());
    }

    let mut results = Vec::new();

    let entries = fs::read_dir(&dir)
        .with_context(|| format!("Failed to read directory: {:?}", dir))?;

    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to read directory entry in {:?}", dir))?;
        let path = entry.path();

        // Only process JSON files
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }

        match load_benchmark_result(&path) {
            Ok(result) => {
                log::debug!("Loaded benchmark result from: {:?}", path);
                results.push(result);
            }
            Err(e) => {
                log::warn!("Failed to load benchmark result from {:?}: {}", path, e);
            }
        }
    }

    log::info!("Loaded {} benchmark results from {:?}", results.len(), dir);
    Ok(results)
}

/// Loads a single benchmark result from a JSON file
///
/// # Arguments
///
/// * `filepath` - Path to the JSON file
///
/// # Returns
///
/// A `Result` containing the deserialized benchmark result
fn load_benchmark_result(filepath: &Path) -> Result<BenchmarkResult> {
    let contents = fs::read_to_string(filepath)
        .with_context(|| format!("Failed to read file: {:?}", filepath))?;

    let result: BenchmarkResult = serde_json::from_str(&contents)
        .with_context(|| format!("Failed to deserialize JSON from: {:?}", filepath))?;

    Ok(result)
}

/// Saves multiple benchmark results to the output directory
///
/// This is a convenience function that saves each result individually.
///
/// # Arguments
///
/// * `results` - Collection of benchmark results to save
/// * `output_dir` - Optional custom output directory
///
/// # Returns
///
/// A `Result` containing a vector of paths where files were saved
pub fn save_all_results(
    results: &[BenchmarkResult],
    output_dir: Option<&Path>,
) -> Result<Vec<PathBuf>> {
    let mut paths = Vec::with_capacity(results.len());

    for result in results {
        let path = save_benchmark_result(result, output_dir)?;
        paths.push(path);
    }

    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::TempDir;

    #[test]
    fn test_save_and_load_benchmark_result() {
        let temp_dir = TempDir::new().unwrap();
        let output_dir = temp_dir.path();

        let mut metrics = HashMap::new();
        metrics.insert("latency_p50".to_string(), 12.5);
        metrics.insert("throughput".to_string(), 1000.0);

        let result = BenchmarkResult::new("test-target".to_string(), metrics);

        // Save the result
        let saved_path = save_benchmark_result(&result, Some(output_dir)).unwrap();
        assert!(saved_path.exists());

        // Load the result back
        let loaded_result = load_benchmark_result(&saved_path).unwrap();
        assert_eq!(loaded_result.target_id, result.target_id);
        assert_eq!(loaded_result.get_metric("latency_p50"), Some(12.5));
        assert_eq!(loaded_result.get_metric("throughput"), Some(1000.0));
    }

    #[test]
    fn test_load_benchmark_results() {
        let temp_dir = TempDir::new().unwrap();
        let output_dir = temp_dir.path();

        // Save multiple results
        for i in 0..3 {
            let mut metrics = HashMap::new();
            metrics.insert("value".to_string(), i as f64);
            let result = BenchmarkResult::new(format!("target-{}", i), metrics);
            save_benchmark_result(&result, Some(output_dir)).unwrap();
        }

        // Load all results
        let results = load_benchmark_results(Some(output_dir)).unwrap();
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_load_from_nonexistent_directory() {
        let results = load_benchmark_results(Some(Path::new("/nonexistent/path"))).unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_save_all_results() {
        let temp_dir = TempDir::new().unwrap();
        let output_dir = temp_dir.path();

        let mut results_vec = Vec::new();
        for i in 0..3 {
            let mut metrics = HashMap::new();
            metrics.insert("value".to_string(), i as f64);
            let result = BenchmarkResult::new(format!("target-{}", i), metrics);
            results_vec.push(result);
        }

        let paths = save_all_results(&results_vec, Some(output_dir)).unwrap();
        assert_eq!(paths.len(), 3);

        for path in paths {
            assert!(path.exists());
        }
    }
}

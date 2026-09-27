//! Marketplace Benchmarks Library
//!
//! This library provides a comprehensive benchmarking framework for the LLM Marketplace.
//! It includes standardized result structures, report generation, and adapter interfaces
//! for benchmarking various components.

pub mod adapters;
pub mod benchmarks;

// Re-export commonly used types
pub use adapters::{BenchTarget, all_targets};
pub use benchmarks::result::BenchmarkResult;
pub use benchmarks::markdown::generate_markdown_report;
pub use benchmarks::io::{save_benchmark_result, load_benchmark_results};

use anyhow::Result;

/// Main entrypoint to run all registered benchmarks
///
/// This function executes all benchmark targets registered in the system,
/// collects their results, and returns them for further processing.
///
/// # Returns
///
/// A `Result` containing a vector of `BenchmarkResult` for all executed benchmarks,
/// or an error if any benchmark fails critically.
///
/// # Example
///
/// ```no_run
/// use marketplace_benchmarks::run_all_benchmarks;
///
/// fn main() -> anyhow::Result<()> {
///     let results = run_all_benchmarks()?;
///     println!("Completed {} benchmarks", results.len());
///     Ok(())
/// }
/// ```
pub fn run_all_benchmarks() -> Result<Vec<BenchmarkResult>> {
    log::info!("Starting benchmark run for all registered targets");

    let targets = all_targets();
    let mut results = Vec::with_capacity(targets.len());

    for target in targets {
        log::info!("Running benchmark: {}", target.id());
        match target.run() {
            Ok(result) => {
                log::info!("Benchmark {} completed successfully", target.id());
                results.push(result);
            }
            Err(e) => {
                log::error!("Benchmark {} failed: {}", target.id(), e);
                return Err(e);
            }
        }
    }

    log::info!("All benchmarks completed. Total: {}", results.len());
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_library_imports() {
        // Verify that all public exports are accessible
        let _targets = all_targets();
    }
}

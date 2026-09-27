//! Benchmarks module
//!
//! This module contains all benchmark-related functionality including:
//! - Result structures for storing benchmark data
//! - Markdown report generation
//! - File I/O utilities for saving and loading results

pub mod result;
pub mod markdown;
pub mod io;

pub use result::BenchmarkResult;
pub use markdown::generate_markdown_report;
pub use io::{save_benchmark_result, load_benchmark_results};

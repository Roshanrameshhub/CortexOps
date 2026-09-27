# Marketplace Benchmarks

A comprehensive benchmarking framework for the LLM Marketplace, built in Rust.

## Overview

This crate provides a standardized framework for running performance benchmarks across all marketplace components. It includes:

- **Standardized result structures** for consistent metric collection
- **Markdown report generation** for human-readable summaries
- **File I/O utilities** for storing and loading benchmark data
- **Adapter interface** for easily adding new benchmark targets
- **CLI binary** for running benchmarks and generating reports

## Architecture

### Core Components

#### BenchmarkResult

The canonical structure for benchmark results with three required fields:

- `target_id`: Unique identifier for the benchmark target
- `metrics`: HashMap of performance metrics (e.g., latency_p50, throughput)
- `timestamp`: UTC timestamp of when the benchmark was executed

#### BenchTarget Trait

All benchmark adapters implement this trait:

```rust
pub trait BenchTarget {
    fn id(&self) -> &str;
    fn run(&self) -> Result<BenchmarkResult>;
}
```

#### Registry

The `all_targets()` function serves as the central registry for all benchmark targets.

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
marketplace-benchmarks = { path = "../marketplace-benchmarks" }
```

Or build and run directly:

```bash
cd marketplace-benchmarks
cargo build --release
```

## Usage

### Running Benchmarks

#### Run all benchmarks with a report:

```bash
cargo run --bin run_benchmarks -- run --report
```

#### Run benchmarks to a custom directory:

```bash
cargo run --bin run_benchmarks -- run --output-dir ./my-results --report
```

#### Run with verbose logging:

```bash
cargo run --bin run_benchmarks -- -v run --report
```

### Generating Reports

Generate a markdown report from existing results:

```bash
cargo run --bin run_benchmarks -- report
```

With custom paths:

```bash
cargo run --bin run_benchmarks -- report \
  --input-dir ./benchmarks/output/raw \
  --output-path ./custom-report.md
```

### Listing Available Benchmarks

```bash
cargo run --bin run_benchmarks -- list
```

## Using as a Library

### Running all benchmarks:

```rust
use marketplace_benchmarks::run_all_benchmarks;

fn main() -> anyhow::Result<()> {
    let results = run_all_benchmarks()?;
    println!("Completed {} benchmarks", results.len());
    Ok(())
}
```

### Creating a custom benchmark target:

```rust
use marketplace_benchmarks::{BenchTarget, BenchmarkResult};
use anyhow::Result;
use std::collections::HashMap;

pub struct MyBenchmark;

impl BenchTarget for MyBenchmark {
    fn id(&self) -> &str {
        "my-benchmark"
    }

    fn run(&self) -> Result<BenchmarkResult> {
        let mut metrics = HashMap::new();

        // Collect your metrics
        metrics.insert("latency_p50".to_string(), 12.5);
        metrics.insert("throughput".to_string(), 1000.0);

        Ok(BenchmarkResult::new(self.id().to_string(), metrics))
    }
}
```

### Generating reports:

```rust
use marketplace_benchmarks::{generate_markdown_report, save_all_results};

fn main() -> anyhow::Result<()> {
    let results = run_all_benchmarks()?;

    // Save raw results
    save_all_results(&results, None)?;

    // Generate markdown report
    let report = generate_markdown_report(&results)?;
    std::fs::write("report.md", report)?;

    Ok(())
}
```

## Directory Structure

```
marketplace-benchmarks/
├── Cargo.toml
├── README.md
├── src/
│   ├── lib.rs                    # Library entrypoint
│   ├── benchmarks/
│   │   ├── mod.rs
│   │   ├── result.rs             # BenchmarkResult struct
│   │   ├── markdown.rs           # Report generation
│   │   └── io.rs                 # File I/O utilities
│   ├── adapters/
│   │   └── mod.rs                # BenchTarget trait and registry
│   └── bin/
│       └── run_benchmarks.rs     # CLI binary
└── benchmarks/
    └── output/
        ├── summary.md            # Generated markdown report
        └── raw/                  # Raw JSON results
            ├── target1_20250101_120000.json
            └── target2_20250101_120005.json
```

## Output Files

### Raw Results

Individual benchmark results are saved as JSON files:

- Location: `benchmarks/output/raw/`
- Format: `{target_id}_{timestamp}.json`
- Example: `api-gateway_20250101_120000.json`

### Summary Report

A markdown report summarizing all benchmarks:

- Location: `benchmarks/output/summary.md`
- Includes: Executive summary, results table, detailed metrics

## Common Metrics

The framework supports any custom metrics, but these are commonly used:

- `latency_p50`, `latency_p95`, `latency_p99` - Response time percentiles (ms)
- `throughput` - Operations per second
- `memory_mb` - Memory usage in megabytes
- `cpu_percent` - CPU utilization percentage
- `error_rate` - Percentage of failed operations

## Adding New Benchmark Targets

1. Create a new struct that implements `BenchTarget`
2. Implement the `id()` and `run()` methods
3. Add the target to `all_targets()` in `src/adapters/mod.rs`

Example:

```rust
pub struct ApiBenchmark;

impl BenchTarget for ApiBenchmark {
    fn id(&self) -> &str {
        "api-gateway"
    }

    fn run(&self) -> Result<BenchmarkResult> {
        // Your benchmark logic here
        let mut metrics = HashMap::new();
        metrics.insert("latency_p50".to_string(), measure_latency());

        Ok(BenchmarkResult::new(self.id().to_string(), metrics))
    }
}

// In all_targets():
pub fn all_targets() -> Vec<Box<dyn BenchTarget>> {
    vec![
        Box::new(ExampleBenchmark::new("example".to_string())),
        Box::new(ApiBenchmark),  // Add your benchmark
    ]
}
```

## Testing

Run the test suite:

```bash
cargo test
```

Run with verbose output:

```bash
cargo test -- --nocapture
```

## Dependencies

Core dependencies:
- `serde`, `serde_json` - Serialization
- `chrono` - Timestamp handling
- `anyhow`, `thiserror` - Error handling
- `clap` - CLI interface
- `env_logger`, `log` - Logging
- `hostname`, `num_cpus`, `sys-info` - System information
- `criterion` - Benchmarking (dev dependency)

## License

MIT

# Marketplace Benchmark Adapters

This directory contains Rust benchmark adapters that measure the performance of TypeScript marketplace operations through CLI wrappers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Rust Benchmark Framework                  │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │   BenchTarget   │  │ BenchmarkResult │  │   all_targets │ │
│  │     Trait       │  │    Structure    │  │   Registry    │ │
│  └────────────────┘  └────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Marketplace Adapters                        │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────┐    │
│  │ ListingRetrieval     │  │ RegistryLookup           │    │
│  │ Benchmark            │  │ Benchmark                │    │
│  └──────────────────────┘  └──────────────────────────┘    │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────┐    │
│  │ MetadataValidation   │  │ SearchQueries            │    │
│  │ Benchmark            │  │ Benchmark                │    │
│  └──────────────────────┘  └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               TypeScript CLI Wrappers (Node.js)              │
│                                                              │
│  listing-cli.ts  registry-cli.ts  validation-cli.ts  search-cli.ts
└─────────────────────────────────────────────────────────────┘
```

## Adapters

### 1. ListingRetrievalBenchmark (`listing_retrieval.rs`)

**ID:** `marketplace_listing_retrieval`

**Purpose:** Benchmarks service listing and retrieval operations

**Operations Tested:**
- List all services (10 iterations)
- Search by category (20 iterations across 4 categories)
- Get by ID (30 iterations)
- Paginated listing (10 iterations, 20 items/page, 5 pages)

**Metrics Collected:**
- `latency_p50` - Median latency (ms)
- `latency_p95` - 95th percentile latency (ms)
- `latency_p99` - 99th percentile latency (ms)
- `throughput_rps` - Operations per second
- `operation_count` - Total successful operations
- `error_rate` - Percentage of failed operations
- `total_items_processed` - Total services processed

**Sample Output:**
```json
{
  "target_id": "marketplace_listing_retrieval",
  "metrics": {
    "latency_p50": 4.2,
    "latency_p95": 8.7,
    "latency_p99": 12.3,
    "throughput_rps": 142.5,
    "operation_count": 70.0,
    "error_rate": 0.0,
    "total_items_processed": 5250.0
  },
  "metadata": {
    "wrapper_type": "node_cli",
    "test_suite": "listing_retrieval",
    "iterations": "70"
  }
}
```

### 2. RegistryLookupBenchmark (`registry_lookup.rs`)

**ID:** `marketplace_registry_lookup`

**Purpose:** Benchmarks model registry lookup and version resolution

**Operations Tested:**
- Model lookup by ID (50 iterations)
- Version resolution (30 iterations)
- Search models with filters (20 iterations across categories)
- Get model versions (25 iterations)
- Bulk lookup (10 iterations with varying batch sizes)

**Metrics Collected:**
- `latency_p50` - Median latency (ms)
- `latency_p95` - 95th percentile latency (ms)
- `latency_p99` - 99th percentile latency (ms)
- `throughput_rps` - Operations per second
- `operation_count` - Total successful operations
- `error_rate` - Percentage of failed operations
- `total_items_processed` - Total models/versions processed

**Sample Output:**
```json
{
  "target_id": "marketplace_registry_lookup",
  "metrics": {
    "latency_p50": 3.8,
    "latency_p95": 7.2,
    "latency_p99": 10.5,
    "throughput_rps": 215.3,
    "operation_count": 135.0,
    "error_rate": 0.0,
    "total_items_processed": 3850.0
  },
  "metadata": {
    "wrapper_type": "node_cli",
    "test_suite": "registry_lookup",
    "iterations": "135"
  }
}
```

### 3. MetadataValidationBenchmark (`metadata_validation.rs`)

**ID:** `marketplace_metadata_validation`

**Purpose:** Benchmarks service manifest validation and schema compliance

**Operations Tested:**
- Single valid manifest validation (30 iterations)
- Single invalid manifest validation (20 iterations)
- Batch validation with varying valid ratios (15 iterations)
- Schema compliance validation (15 iterations, strict/normal modes)

**Metrics Collected:**
- `latency_p50` - Median latency (ms)
- `latency_p95` - 95th percentile latency (ms)
- `latency_p99` - 99th percentile latency (ms)
- `throughput_rps` - Validations per second
- `operation_count` - Total validation runs
- `error_rate` - Percentage of failed operations
- `total_items_processed` - Total manifests validated
- `validation_checks_total` - Total validation rules executed
- `validation_pass_rate` - Percentage of checks passed
- `validation_failure_rate` - Percentage of checks failed
- `validation_warnings` - Total warnings generated

**Sample Output:**
```json
{
  "target_id": "marketplace_metadata_validation",
  "metrics": {
    "latency_p50": 1.5,
    "latency_p95": 3.2,
    "latency_p99": 4.8,
    "throughput_rps": 425.7,
    "operation_count": 80.0,
    "error_rate": 0.0,
    "total_items_processed": 2150.0,
    "validation_checks_total": 17200.0,
    "validation_pass_rate": 0.87,
    "validation_failure_rate": 0.08,
    "validation_warnings": 860.0
  },
  "metadata": {
    "wrapper_type": "node_cli",
    "test_suite": "metadata_validation",
    "iterations": "80",
    "total_checks": "17200"
  }
}
```

### 4. SearchQueriesBenchmark (`search_queries.rs`)

**ID:** `marketplace_search_queries`

**Purpose:** Benchmarks discovery search operations

**Operations Tested:**
- Full-text search (25 iterations with diverse queries)
- Faceted search (20 iterations with varying filters)
- Recommendation queries (15 iterations)
- Category aggregation (10 iterations)
- Multi-query search (10 iterations with 2-4 queries each)

**Metrics Collected:**
- `latency_p50` - Median latency (ms)
- `latency_p95` - 95th percentile latency (ms)
- `latency_p99` - 99th percentile latency (ms)
- `throughput_rps` - Searches per second
- `operation_count` - Total search operations
- `error_rate` - Percentage of failed operations
- `total_items_processed` - Total results returned
- `total_search_results` - Total matching results found
- `max_top_score` - Highest relevance score
- `avg_search_score` - Average relevance score

**Sample Output:**
```json
{
  "target_id": "marketplace_search_queries",
  "metrics": {
    "latency_p50": 6.3,
    "latency_p95": 14.2,
    "latency_p99": 18.7,
    "throughput_rps": 98.5,
    "operation_count": 80.0,
    "error_rate": 0.0,
    "total_items_processed": 1240.0,
    "total_search_results": 18500.0,
    "max_top_score": 28.5,
    "avg_search_score": 14.3
  },
  "metadata": {
    "wrapper_type": "node_cli",
    "test_suite": "search_queries",
    "iterations": "80",
    "search_types": "full_text,faceted,recommendations,aggregation,multi_query"
  }
}
```

## Implementation Pattern

All adapters follow a consistent implementation pattern:

```rust
use crate::benchmarks::result::BenchmarkResult;
use crate::adapters::BenchTarget;
use anyhow::{Context, Result};
use std::process::Command;
use std::time::Instant;

pub struct MyBenchmark {
    wrapper_path: String,
}

impl MyBenchmark {
    pub fn new() -> Self {
        let workspace_root = std::env::var("CARGO_MANIFEST_DIR")
            .unwrap_or_else(|_| ".".to_string());
        let wrapper_path = format!("{}/ts-wrappers/my-cli.ts", workspace_root);
        Self { wrapper_path }
    }

    fn run_cli_operation(&self, operation: &str, args: &[&str]) -> Result<CliMetrics> {
        let mut cmd_args = vec!["--no-warnings", &self.wrapper_path, operation];
        cmd_args.extend(args);

        let output = Command::new("node")
            .args(&cmd_args)
            .output()
            .context("Failed to execute TypeScript wrapper")?;

        // Parse JSON output and return metrics
    }

    fn execute_benchmark_suite(&self) -> Result<BenchmarkResult> {
        // Run multiple iterations of various operations
        // Collect timing data
        // Calculate percentiles
        // Return BenchmarkResult
    }
}

impl BenchTarget for MyBenchmark {
    fn id(&self) -> &str {
        "my_benchmark_id"
    }

    fn run(&self) -> Result<BenchmarkResult> {
        self.execute_benchmark_suite()
    }
}
```

## Key Design Decisions

### 1. Command Invocation vs HTTP
- **Chosen:** Command invocation using `Command::new("node")`
- **Rationale:** Simpler setup, no server required, measures full operation latency including process startup

### 2. Mock Data
- **Chosen:** TypeScript CLI wrappers contain mock data
- **Rationale:** No modification to existing TypeScript services, repeatable benchmarks, controlled data sets

### 3. Timing Measurement
- **Chosen:** `std::time::Instant` in Rust adapter
- **Rationale:** Measures end-to-end latency including process spawn, IPC, and JSON parsing overhead

### 4. Iteration Counts
- **Chosen:** Varying iterations (10-50) based on operation complexity
- **Rationale:** Balance between statistical significance and execution time

### 5. Percentile Calculation
- **Chosen:** Sort and index-based percentile calculation
- **Rationale:** Simple, accurate, efficient for the sample sizes used

## Usage

### Running Individual Benchmarks

```rust
use marketplace_benchmarks::ListingRetrievalBenchmark;
use marketplace_benchmarks::BenchTarget;

let benchmark = ListingRetrievalBenchmark::new();
let result = benchmark.run()?;

println!("Benchmark: {}", result.target_id);
println!("P50 latency: {:.2}ms", result.get_metric("latency_p50").unwrap());
println!("Throughput: {:.2} ops/sec", result.get_metric("throughput_rps").unwrap());
```

### Running All Benchmarks

```rust
use marketplace_benchmarks::all_targets;

let targets = all_targets();
for target in targets {
    let result = target.run()?;
    println!("{}: {:.2}ms (p50)", result.target_id, result.get_metric("latency_p50").unwrap());
}
```

### Via CLI

```bash
cd marketplace-benchmarks
cargo run --bin run_benchmarks
```

## Testing

Each adapter includes unit tests:

```bash
cargo test --lib adapters::listing_retrieval
cargo test --lib adapters::registry_lookup
cargo test --lib adapters::metadata_validation
cargo test --lib adapters::search_queries
```

## Dependencies

- `serde` / `serde_json` - JSON parsing of CLI output
- `anyhow` - Error handling
- `log` - Logging
- `hostname` - System metadata
- Node.js - Runtime for TypeScript wrappers

## Extending

To add a new benchmark adapter:

1. Create `new_adapter.rs` in this directory
2. Implement `BenchTarget` trait
3. Add corresponding CLI wrapper in `../ts-wrappers/`
4. Register in `mod.rs`:
   ```rust
   pub mod new_adapter;
   pub use new_adapter::NewAdapterBenchmark;
   ```
5. Add to `all_targets()` in `mod.rs`:
   ```rust
   Box::new(NewAdapterBenchmark::new()),
   ```

## Performance Baselines

Expected performance characteristics (will vary by system):

| Adapter | P50 Latency | P95 Latency | Throughput |
|---------|-------------|-------------|------------|
| Listing Retrieval | 3-5ms | 8-12ms | 100-200 ops/s |
| Registry Lookup | 3-5ms | 7-10ms | 150-250 ops/s |
| Metadata Validation | 1-2ms | 3-5ms | 300-500 ops/s |
| Search Queries | 5-8ms | 12-20ms | 80-120 ops/s |

Note: These include Node.js process spawn overhead (typically 1-3ms).

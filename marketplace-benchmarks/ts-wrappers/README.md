# TypeScript CLI Wrappers for Marketplace Benchmarking

This directory contains TypeScript CLI wrappers that expose marketplace operations for benchmarking via Rust adapters.

## Overview

The TypeScript CLI wrappers provide a command-line interface to representative marketplace operations. These wrappers are invoked by Rust benchmark adapters to measure performance characteristics without modifying existing TypeScript code.

## Installation

```bash
npm install
```

## CLI Wrappers

### 1. listing-cli.ts

Simulates service listing and retrieval operations.

**Operations:**
- `list_all` - Retrieve all services from the repository
- `search_category <category>` - Search services by category
- `get_by_id <service_id>` - Get a single service by ID
- `paginated <page_size> <pages>` - Paginated listing with configurable page size

**Usage:**
```bash
node listing-cli.ts list_all
node listing-cli.ts search_category ai-models
node listing-cli.ts get_by_id svc_000000
node listing-cli.ts paginated 20 10
```

**Output:** JSON with operation metrics
```json
{
  "operation": "list_all",
  "durationMs": 5.234,
  "itemsProcessed": 1000,
  "success": true,
  "timestamp": "2025-12-02T..."
}
```

### 2. registry-cli.ts

Simulates model registry lookup and version resolution.

**Operations:**
- `lookup <model_id>` - Lookup model by ID
- `resolve_version <model_id> <version>` - Resolve specific model version
- `search [category] [min_quality_score]` - Search models with filters
- `get_versions <model_id>` - Get all versions of a model
- `bulk_lookup <count>` - Perform bulk model lookups

**Usage:**
```bash
node registry-cli.ts lookup mdl_00000
node registry-cli.ts resolve_version mdl_00000 1.0.0
node registry-cli.ts search text-generation 80
node registry-cli.ts get_versions mdl_00000
node registry-cli.ts bulk_lookup 100
```

**Output:** JSON with operation metrics
```json
{
  "operation": "lookup",
  "durationMs": 3.456,
  "itemsProcessed": 1,
  "success": true,
  "timestamp": "2025-12-02T..."
}
```

### 3. validation-cli.ts

Simulates metadata validation and schema compliance checking.

**Operations:**
- `single [valid|invalid]` - Validate a single manifest
- `batch <count> <valid_ratio>` - Batch validation with configurable valid ratio
- `schema [strict]` - Schema compliance validation

**Usage:**
```bash
node validation-cli.ts single valid
node validation-cli.ts single invalid
node validation-cli.ts batch 100 0.8
node validation-cli.ts schema strict
```

**Output:** JSON with validation metrics
```json
{
  "operation": "validate_single",
  "durationMs": 1.234,
  "itemsProcessed": 1,
  "success": true,
  "timestamp": "2025-12-02T...",
  "validationStats": {
    "totalChecks": 8,
    "passed": 7,
    "failed": 0,
    "warnings": 1
  }
}
```

### 4. search-cli.ts

Simulates discovery search operations including full-text search, faceted search, and recommendations.

**Operations:**
- `search <query> [limit]` - Full-text search
- `faceted [category] [tags] [min_rating]` - Faceted search with filters
- `recommendations <user_id> [limit]` - Get personalized recommendations
- `aggregate` - Category aggregation
- `multi <query1> [query2] [query3]...` - Multi-query search

**Usage:**
```bash
node search-cli.ts search "text generation" 20
node search-cli.ts faceted ai-models nlp,vision 4.0
node search-cli.ts recommendations user_123 10
node search-cli.ts aggregate
node search-cli.ts multi text image audio
```

**Output:** JSON with search metrics
```json
{
  "operation": "full_text_search",
  "durationMs": 7.890,
  "itemsProcessed": 15,
  "success": true,
  "timestamp": "2025-12-02T...",
  "searchStats": {
    "totalResults": 150,
    "topScore": 25.3,
    "avgScore": 12.7
  }
}
```

## Mock Data

All CLI wrappers use mock data to simulate realistic marketplace operations:

- **listing-cli.ts**: 1,000 mock services
- **registry-cli.ts**: 500 mock models with 5 versions each
- **validation-cli.ts**: Dynamically generated manifests with configurable validity
- **search-cli.ts**: 2,000 mock services for search operations

## Integration with Rust Adapters

The Rust benchmark adapters in `../src/adapters/` invoke these CLI wrappers using `Command::new("node")`:

1. **ListingRetrievalBenchmark** → `listing-cli.ts`
2. **RegistryLookupBenchmark** → `registry-cli.ts`
3. **MetadataValidationBenchmark** → `validation-cli.ts`
4. **SearchQueriesBenchmark** → `search-cli.ts`

Each adapter:
- Executes multiple iterations of different operations
- Measures end-to-end latency using `std::time::Instant`
- Calculates percentiles (p50, p95, p99)
- Computes throughput (operations per second)
- Tracks error rates

## Performance Characteristics

The CLI wrappers introduce realistic overhead to simulate actual operations:

- **Database queries**: 1-5ms simulated latency
- **Search operations**: 2-10ms depending on complexity
- **Validation**: 0.5-1ms per manifest
- **Bulk operations**: Scaled latency based on batch size

## Development

To add a new operation:

1. Add the operation handler to the appropriate CLI file
2. Update the switch statement in `main()`
3. Document the operation in this README
4. Add corresponding test cases in the Rust adapter

## Testing

Test individual operations:
```bash
node listing-cli.ts list_all
node registry-cli.ts lookup mdl_00000
node validation-cli.ts batch 50 0.9
node search-cli.ts search nlp
```

All operations should return valid JSON with the standard metrics structure.

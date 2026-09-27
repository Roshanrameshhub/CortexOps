# Discovery Service - Quick Start Guide

Get the Discovery Service running in under 5 minutes.

## Prerequisites

- Docker & Docker Compose installed
- 8GB+ RAM available
- 10GB+ disk space

## Step 1: Clone & Setup

```bash
cd /workspaces/llm-marketplace/services/discovery

# Copy environment file
cp .env.example .env
```

## Step 2: Start Services

```bash
# Start all services (Elasticsearch, Redis, PostgreSQL, Discovery)
make docker-compose-up

# Or manually:
docker-compose up -d
```

Wait ~30 seconds for services to initialize.

## Step 3: Verify Health

```bash
# Check service health
curl http://localhost:8080/health

# Expected output:
# {"status":"healthy","timestamp":"2025-11-18T..."}

# Check readiness (all dependencies)
curl http://localhost:8080/ready
```

## Step 4: Test Search

```bash
# Simple search
curl "http://localhost:8080/api/v1/search?q=language+model&page_size=5"

# Advanced search with filters
curl -X POST http://localhost:8080/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "text generation",
    "filters": {
      "categories": ["text-generation"],
      "min_rating": 4.0
    },
    "pagination": {
      "page": 0,
      "page_size": 10
    }
  }'
```

## Step 5: Explore APIs

```bash
# Get all categories
curl http://localhost:8080/api/v1/categories

# Get autocomplete suggestions
curl "http://localhost:8080/api/v1/autocomplete?q=lang&limit=5"

# Get trending services
curl http://localhost:8080/api/v1/recommendations/trending?max_results=5
```

## Step 6: View Metrics & Traces

Open in browser:

- **Metrics**: http://localhost:9090/metrics
- **Jaeger UI**: http://localhost:16686
- **Grafana**: http://localhost:3000 (admin/admin)

## Common Commands

```bash
# View logs
docker-compose logs -f discovery

# Stop services
make docker-compose-down

# Restart discovery service
docker-compose restart discovery

# Run tests
make test

# Run benchmarks
make benchmark
```

## Troubleshooting

### Elasticsearch not ready

```bash
# Check ES health
curl http://localhost:9200/_cluster/health

# Wait for status: yellow or green
```

### Port conflicts

Edit `docker-compose.yml` to use different ports:

```yaml
ports:
  - "8081:8080"  # Change 8080 to 8081
```

### Out of memory

Increase Docker memory limit to 8GB+ in Docker Desktop settings.

## Next Steps

- Read [README.md](README.md) for detailed documentation
- Check [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md) for benchmarks
- Review [API documentation](README.md#api-endpoints)
- Explore monitoring dashboards

## Need Help?

- GitHub Issues: [Report a bug](https://github.com/llm-marketplace/marketplace/issues)
- Documentation: [docs.llm-marketplace.dev](https://docs.llm-marketplace.dev)
- Discord: [Join community](https://discord.gg/llm-marketplace)

---

Happy searching! 🚀

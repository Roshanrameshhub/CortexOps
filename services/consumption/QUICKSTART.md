# Consumption Service - Quick Start Guide

**Version:** 1.0.0 (Enhanced with Policy Engine, Analytics Hub, and SLA Monitoring)
**Last Updated:** November 18, 2025

Get the LLM Marketplace Consumption Service running in under 5 minutes!

## Prerequisites

- Docker & Docker Compose
- 4GB RAM minimum
- Ports 3000, 5432, 6379, 16686 available

## Quick Start

### 1. Clone and Navigate

```bash
cd /workspaces/llm-marketplace/services/consumption
```

### 2. Start All Services

```bash
docker-compose up -d
```

This starts:
- Consumption service (port 3000)
- PostgreSQL (port 5432)
- Redis (port 6379)
- Jaeger UI (port 16686)
- Prometheus (port 9090)
- Grafana (port 3001)

### 3. Wait for Services

```bash
# Wait ~30 seconds for all services to be healthy
docker-compose ps
```

### 4. Test Health Check

```bash
curl http://localhost:3000/health
# Expected: "OK"
```

### 5. Create API Key

```bash
# Note: In production, use proper authentication
curl -X POST http://localhost:3000/api/v1/keys \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "tier": "premium",
    "expires_in_days": 365
  }'

# Save the returned API key!
```

### 6. Make a Consumption Request

```bash
curl -X POST http://localhost:3000/api/v1/consume/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11 \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing",
    "max_tokens": 500,
    "temperature": 0.7
  }'
```

### 7. View Metrics

```bash
# Prometheus metrics
curl http://localhost:3000/metrics

# Open Jaeger UI
open http://localhost:16686

# Open Grafana
open http://localhost:3001  # admin/admin
```

## Common Commands

```bash
# View logs
docker-compose logs -f consumption

# Restart service
docker-compose restart consumption

# Stop all
docker-compose down

# Stop and remove data
docker-compose down -v
```

## Development Mode

For local Rust development:

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Start only dependencies
docker-compose up -d postgres redis jaeger

# Run migrations
make migrate

# Run service
make run

# Run tests
make test

# Run benchmarks
make bench
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill it or change PORT in docker-compose.yml
```

### Database Connection Error

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres
```

### Redis Connection Error

```bash
# Check Redis is running
docker-compose ps redis

# Test Redis
docker-compose exec redis redis-cli ping
```

## Next Steps

- Read [README.md](README.md) for API documentation
- Read [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md) for benchmarks
- Read [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
- Read [FINAL_REPORT.md](FINAL_REPORT.md) for complete technical details

## Support

- GitHub Issues: https://github.com/org/llm-marketplace/issues
- Email: support@llm-marketplace.example.com

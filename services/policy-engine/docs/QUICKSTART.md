# Policy Engine - Quick Start Guide

Get the Policy Engine running in 5 minutes!

## Prerequisites

- Docker and Docker Compose installed
- OR: Go 1.21+, PostgreSQL 15+, and protoc

## Option 1: Docker Compose (Recommended)

### Step 1: Start All Services

```bash
cd services/policy-engine
docker-compose up -d
```

This starts:
- PostgreSQL database (port 5432)
- Policy Engine gRPC server (port 50051)
- Prometheus metrics (port 9091)
- Grafana dashboards (port 3000)
- Jaeger tracing (port 16686)

### Step 2: Verify Health

```bash
# Check all containers are running
docker-compose ps

# Check logs
docker-compose logs policy-engine

# Test health endpoint (requires grpcurl)
grpcurl -plaintext localhost:50051 \
  policyengine.v1.PolicyEngineService/HealthCheck
```

Expected output:
```json
{
  "status": "SERVING",
  "details": {
    "database": "healthy",
    "version": "1.0.0"
  },
  "timestamp": "2025-11-19T10:30:00Z"
}
```

### Step 3: Test Policy Validation

```bash
# Validate a compliant service
grpcurl -plaintext -d '{
  "service_id": "test-1",
  "name": "Test Service",
  "version": "1.0.0",
  "endpoint": {
    "url": "https://api.example.com",
    "protocol": "rest",
    "authentication": "api-key"
  },
  "compliance": {
    "level": "public",
    "certifications": [],
    "data_residency": ["US"]
  },
  "sla": {
    "availability": 99.9,
    "max_latency": 500,
    "support_level": "basic"
  }
}' localhost:50051 policyengine.v1.PolicyEngineService/ValidateService
```

Expected output:
```json
{
  "compliant": true,
  "violations": [],
  "policyVersion": "1.0.0",
  "validatedAt": "2025-11-19T10:30:00Z",
  "metadata": {
    "policiesEvaluated": 5,
    "policiesPassed": 5,
    "policiesFailed": 0,
    "validationDurationMs": "45"
  }
}
```

### Step 4: View Metrics and Traces

**Prometheus Metrics:**
```bash
open http://localhost:9091
```

**Grafana Dashboards:**
```bash
open http://localhost:3000
# Login: admin / admin
```

**Jaeger Tracing:**
```bash
open http://localhost:16686
```

### Step 5: List Default Policies

```bash
grpcurl -plaintext localhost:50051 \
  policyengine.v1.PolicyEngineService/ListPolicies
```

You should see 5 default policies:
1. data-residency-required
2. restricted-countries
3. confidential-certification-required
4. https-required
5. enterprise-sla-minimum

## Option 2: Local Development

### Step 1: Setup Database

```bash
# Start PostgreSQL
docker run -d \
  --name policy-engine-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=policy_engine \
  -p 5432:5432 \
  postgres:15-alpine
```

### Step 2: Build and Run

```bash
cd services/policy-engine

# Install protoc plugins
make install-tools

# Generate proto files
make proto

# Download dependencies
make deps

# Build
make build

# Run
make run
```

### Step 3: Configure (Optional)

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
vim .env

# Or use config file
vim config.yaml
```

### Step 4: Test

```bash
# Run tests
make test

# Run with coverage
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Next Steps

1. **Read the [README](../README.md)** for detailed documentation
2. **Check [API Documentation](API.md)** for complete API reference
3. **Explore the codebase** to understand policy validation logic
4. **Add custom policies** as needed for your organization

## Common Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f policy-engine

# Restart service
docker-compose restart policy-engine

# Rebuild after code changes
docker-compose up -d --build

# Clean everything
docker-compose down -v
```

## Troubleshooting

### Database Connection Failed

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View database logs
docker-compose logs postgres

# Connect to database directly
docker exec -it policy-engine-postgres psql -U postgres -d policy_engine
```

### Proto Generation Failed

```bash
# Install protoc
# macOS:
brew install protobuf

# Linux:
apt-get install protobuf-compiler

# Install Go plugins
make install-tools

# Regenerate
make proto
```

### gRPC Connection Failed

```bash
# Check if service is running
docker-compose ps policy-engine

# Check logs for errors
docker-compose logs policy-engine

# Test connectivity
grpcurl -plaintext localhost:50051 list
```

## Quick Reference

### Environment Variables

```bash
POLICY_ENGINE_PORT=50051
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=policy_engine
LOG_LEVEL=info
```

### Ports

- **50051:** gRPC server
- **9090:** Prometheus metrics
- **5432:** PostgreSQL database
- **9091:** Prometheus UI
- **3000:** Grafana
- **16686:** Jaeger UI

### Default Credentials

- **Database:** postgres / postgres
- **Grafana:** admin / admin

## Support

- **Documentation:** [README](../README.md), [API Docs](API.md)
- **Issues:** GitHub Issues
- **Logs:** `docker-compose logs policy-engine`

# Quick Start Guide - Publishing Service

Get the Publishing Service running in minutes!

## Prerequisites

- Node.js 20.x LTS
- Docker & Docker Compose (for containerized setup)
- PostgreSQL 15+ (if running locally)
- Redis 7+ (if running locally)

## Option 1: Docker Compose (Recommended)

### Step 1: Start all services

```bash
cd services/publishing
docker-compose up -d
```

This will start:
- Publishing Service (port 3001)
- PostgreSQL (port 5432)
- Redis (port 6379)

### Step 2: Verify services are running

```bash
# Check health
curl http://localhost:3001/health

# View logs
docker-compose logs -f publishing-service
```

### Step 3: Test the API

```bash
# Get a JWT token (mock - in production, use auth service)
export TOKEN="your-jwt-token-here"

# Publish a test service
curl -X POST http://localhost:3001/api/v1/services \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test LLM Service",
    "version": "1.0.0",
    "description": "A test LLM service for demonstration",
    "category": "text-generation",
    "capabilities": [
      {
        "name": "text-completion",
        "description": "Complete text based on prompt",
        "parameters": {
          "maxTokens": 1000
        }
      }
    ],
    "endpoint": {
      "url": "https://api.example.com/v1/completions",
      "protocol": "rest",
      "authentication": "api-key"
    },
    "pricing": {
      "model": "per-token",
      "rates": [
        {
          "tier": "standard",
          "rate": 0.001,
          "unit": "token"
        }
      ],
      "currency": "USD"
    },
    "sla": {
      "availability": 99.9,
      "maxLatency": 500,
      "supportLevel": "basic"
    },
    "compliance": {
      "level": "public",
      "certifications": [],
      "dataResidency": ["US"]
    }
  }'
```

### Step 4: Stop services

```bash
docker-compose down

# To remove volumes as well
docker-compose down -v
```

## Option 2: Local Development Setup

### Step 1: Install dependencies

```bash
cd services/publishing
npm install
```

### Step 2: Configure environment

```bash
cp .env.example .env

# Edit .env with your configuration
# Required: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, REDIS_HOST, JWT_SECRET
```

### Step 3: Set up database

```bash
# Create database
createdb llm_marketplace

# Run schema
psql -U postgres -d llm_marketplace -f schema.sql
```

### Step 4: Start Redis

```bash
redis-server
```

### Step 5: Run the service

```bash
# Development mode (with auto-reload)
npm run dev

# Production build
npm run build
npm start
```

## API Testing with cURL

### 1. Publish a Service

```bash
curl -X POST http://localhost:3001/api/v1/services \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @examples/sample-service.json
```

### 2. Get Service Details

```bash
curl http://localhost:3001/api/v1/services/SERVICE_ID
```

### 3. Update Service

```bash
curl -X PUT http://localhost:3001/api/v1/services/SERVICE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description"
  }'
```

### 4. Create New Version

```bash
curl -X POST http://localhost:3001/api/v1/services/SERVICE_ID/versions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.1.0",
    "changes": {
      "description": "Version 1.1.0 with improvements"
    }
  }'
```

### 5. Check Publishing Status

```bash
curl http://localhost:3001/api/v1/services/SERVICE_ID/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 6. Deprecate Service

```bash
curl -X DELETE http://localhost:3001/api/v1/services/SERVICE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Service replaced by v2.0"
  }'
```

## Generating Test JWT Token (Development Only)

```javascript
// Use this in Node.js REPL or a script
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  {
    id: 'test-provider-id',
    email: 'provider@example.com',
    role: 'provider'
  },
  'your-secret-key-change-in-production',
  { expiresIn: '24h' }
);

console.log('JWT Token:', token);
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm run test:watch
```

## Common Issues & Solutions

### Issue: Database connection failed

**Solution:**
```bash
# Check if PostgreSQL is running
pg_isready

# Verify connection string in .env
# Ensure database exists
psql -U postgres -l | grep llm_marketplace
```

### Issue: Redis connection failed

**Solution:**
```bash
# Check if Redis is running
redis-cli ping

# Should return: PONG
```

### Issue: Port 3001 already in use

**Solution:**
```bash
# Find process using port
lsof -i :3001

# Kill the process or change PORT in .env
export PORT=3002
```

### Issue: JWT verification failed

**Solution:**
- Ensure JWT_SECRET matches between token generation and service
- Check token expiration
- Verify token format: `Bearer <token>`

## Monitoring

### View Logs

```bash
# Docker Compose
docker-compose logs -f publishing-service

# Local development (logs to console)
npm run dev
```

### Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "publishing-service",
  "version": "1.0.0",
  "timestamp": "2025-11-18T10:30:00.000Z"
}
```

## Next Steps

1. **Integrate with other services:**
   - Set up LLM-Registry
   - Configure Policy Engine
   - Connect Governance Dashboard
   - Enable Analytics Hub

2. **Configure production settings:**
   - Set strong JWT_SECRET
   - Enable HTTPS
   - Configure rate limiting
   - Set up monitoring (Prometheus/Grafana)

3. **Deploy to production:**
   - Use Kubernetes manifests
   - Configure CI/CD pipeline
   - Set up auto-scaling
   - Enable distributed tracing

## Support

For issues or questions:
- Check [README.md](./README.md) for detailed documentation
- Review [WORKFLOW_REPORT.md](./WORKFLOW_REPORT.md) for architecture details
- Open an issue on GitHub
- Contact: llm-marketplace@example.com

---

**Last Updated:** 2025-11-18
**Version:** 1.0

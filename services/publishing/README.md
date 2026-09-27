# Publishing Service - LLM Marketplace

The Publishing Service is a core component of the LLM-Marketplace platform, responsible for service registration, validation, versioning, and lifecycle management.

## Overview

The Publishing Service implements a comprehensive publishing pipeline that includes:

- **Service Registration**: OpenAPI 3.1 validation and metadata management
- **Validation Pipeline**: Automated validation, security scanning, and performance testing
- **Policy Compliance**: Integration with Policy Engine for compliance validation
- **Version Management**: Semantic versioning and version lifecycle
- **Integration Workflows**: Synchronization with Registry, Governance Dashboard, and Analytics Hub
- **Workflow Orchestration**: Temporal.io-based workflow management with retries and rollbacks
- **Event-Driven Architecture**: Real-time event publishing via Kafka

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Publishing Service Pipeline                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Authentication & Authorization (OAuth2/JWT)          │
│  2. Service Metadata Validation (JSON Schema/Zod)        │
│  3. OpenAPI 3.1 Specification Validation                 │
│  4. Policy Compliance Check (gRPC → Policy Engine)       │
│  5. Registry Synchronization (REST API)                  │
│  6. Automated Testing Pipeline                           │
│     - Health Check Tests                                 │
│     - Security Vulnerability Scanning                    │
│     - Performance Benchmarking                           │
│  7. Approval Workflow (if required)                      │
│  8. Service Activation                                   │
│  9. Event Publishing (Kafka → Analytics Hub)             │
│ 10. Notification (GraphQL → Governance Dashboard)        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Features

### 1. Service Publishing
- Full OpenAPI 3.1 specification support
- Semantic versioning (SemVer) enforcement
- Automated validation and testing
- Policy compliance verification
- Idempotent operations with transaction support

### 2. Validation Pipeline
- **Service Metadata Validation**: Zod-based schema validation
- **OpenAPI Validation**: Comprehensive spec validation
- **Security Scanning**: Vulnerability detection
- **Performance Testing**: Automated benchmarking
- **Policy Compliance**: Real-time policy validation

### 3. Integration Workflows
- **LLM-Registry**: Service metadata synchronization (REST)
- **Policy Engine**: Compliance validation (gRPC)
- **Governance Dashboard**: Notifications and approvals (GraphQL)
- **Analytics Hub**: Event streaming (Kafka)

### 4. Workflow Orchestration (Temporal.io)
- Publishing workflow with automatic retries
- Testing workflow with parallel execution
- Approval workflow with human tasks
- Rollback and deprecation workflows
- Exponential backoff retry strategy

## API Endpoints

### POST /api/v1/services
Publish a new service to the marketplace.

**Request:**
```json
{
  "name": "GPT-4 Text Generation",
  "version": "1.0.0",
  "description": "Advanced text generation service",
  "category": "text-generation",
  "capabilities": [
    {
      "name": "text-completion",
      "description": "Complete text based on prompt",
      "parameters": {
        "maxTokens": 4096,
        "temperature": 0.7
      }
    }
  ],
  "endpoint": {
    "url": "https://api.openai.com/v1/chat/completions",
    "protocol": "rest",
    "authentication": "api-key"
  },
  "pricing": {
    "model": "per-token",
    "rates": [
      {
        "tier": "standard",
        "rate": 0.03,
        "unit": "token"
      }
    ],
    "currency": "USD"
  },
  "sla": {
    "availability": 99.9,
    "maxLatency": 500,
    "supportLevel": "enterprise"
  },
  "compliance": {
    "level": "internal",
    "certifications": ["SOC2", "ISO27001"],
    "dataResidency": ["US", "EU"],
    "gdprCompliant": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "serviceId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending_approval",
    "message": "Service published successfully and pending approval"
  }
}
```

### PUT /api/v1/services/:id
Update an existing service.

**Request:**
```json
{
  "description": "Updated description",
  "pricing": {
    "model": "per-token",
    "rates": [
      {
        "tier": "standard",
        "rate": 0.025,
        "unit": "token"
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Service updated successfully"
  }
}
```

### POST /api/v1/services/:id/versions
Create a new version of a service.

**Request:**
```json
{
  "version": "1.1.0",
  "changes": {
    "description": "Version 1.1.0 with enhanced features",
    "capabilities": [
      {
        "name": "text-completion",
        "description": "Enhanced text completion",
        "parameters": {
          "maxTokens": 8192
        }
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "serviceId": "660e8400-e29b-41d4-a716-446655440001",
    "version": "1.1.0"
  }
}
```

### DELETE /api/v1/services/:id
Deprecate a service.

**Request:**
```json
{
  "reason": "Service replaced by v2.0"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Service deprecated successfully"
  }
}
```

### GET /api/v1/services/:id/status
Check publishing status of a service.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "active",
    "message": "Service is active and available",
    "publishedAt": "2025-11-18T10:30:00.000Z",
    "approvalRequired": false
  }
}
```

## Installation

### Prerequisites
- Node.js 20.x LTS
- PostgreSQL 15+
- Redis 7+
- Kafka (optional, for Analytics Hub integration)

### Setup

1. Install dependencies:
```bash
cd services/publishing
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Initialize database:
```bash
# Create database schema
psql -U postgres -d llm_marketplace -f schema.sql
```

4. Build the service:
```bash
npm run build
```

5. Run in development:
```bash
npm run dev
```

6. Run in production:
```bash
npm start
```

## Testing

Run unit tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm test -- --coverage
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | Server port | `3001` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `llm_marketplace` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_SECRET` | JWT secret key | (required) |
| `REGISTRY_API_URL` | LLM-Registry API URL | `http://localhost:3010/api/v1` |
| `POLICY_ENGINE_GRPC_URL` | Policy Engine gRPC URL | `localhost:50051` |
| `GOVERNANCE_DASHBOARD_GRAPHQL_URL` | Governance Dashboard GraphQL URL | `http://localhost:3020/graphql` |
| `ANALYTICS_HUB_KAFKA_BROKERS` | Kafka brokers | `localhost:9092` |

## Development

### Project Structure

```
services/publishing/
├── src/
│   ├── config/           # Configuration (DB, Redis)
│   ├── controllers/      # API controllers
│   ├── integrations/     # External service clients
│   ├── middleware/       # Express middleware
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── types/            # TypeScript types
│   ├── utils/            # Utilities (logging, etc.)
│   ├── validators/       # Validation logic
│   ├── workflows/        # Temporal.io workflows
│   ├── __tests__/        # Unit tests
│   └── index.ts          # Entry point
├── dist/                 # Compiled output
├── .env.example          # Environment template
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
└── README.md             # This file
```

### Coding Standards

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with TypeScript plugin
- **Formatting**: Prettier
- **Testing**: Jest with 80%+ coverage
- **Logging**: Structured JSON logging with Winston
- **Error Handling**: Try-catch with proper error propagation

## Deployment

### Docker

Build Docker image:
```bash
docker build -t llm-marketplace/publishing-service:latest .
```

Run container:
```bash
docker run -p 3001:3001 \
  -e DB_HOST=postgres \
  -e REDIS_HOST=redis \
  llm-marketplace/publishing-service:latest
```

### Kubernetes

Deploy to Kubernetes:
```bash
kubectl apply -f k8s/publishing-service.yaml
```

## Monitoring

### Health Check
```bash
curl http://localhost:3001/health
```

### Metrics
Prometheus metrics available at `/metrics` endpoint.

### Logs
Structured JSON logs written to:
- `stdout` (all environments)
- `logs/combined.log` (production)
- `logs/error.log` (production, errors only)

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify PostgreSQL is running
   - Check DB credentials in `.env`
   - Ensure database exists

2. **Redis Connection Failed**
   - Verify Redis is running
   - Check Redis host/port in `.env`

3. **Validation Failures**
   - Check service specification format
   - Verify OpenAPI spec is valid 3.1
   - Review validation error messages

4. **Policy Violations**
   - Review policy requirements
   - Check compliance settings
   - Verify data residency configuration

## Contributing

1. Create a feature branch
2. Make changes with tests
3. Run linting and tests
4. Submit pull request

## License

MIT License - see LICENSE file for details

## Support

For support, contact: llm-marketplace@example.com

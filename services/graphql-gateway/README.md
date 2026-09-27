# GraphQL API Gateway

Enterprise-grade GraphQL API Gateway for the LLM Marketplace platform. Provides a unified, type-safe API layer for accessing all marketplace services.

## Features

- **Unified Schema** - Single GraphQL endpoint for all services
- **Type Safety** - Strict TypeScript implementation with comprehensive type definitions
- **Performance** - DataLoader batching, Redis caching, query optimization
- **Security** - JWT authentication, role-based authorization, rate limiting
- **Real-time** - WebSocket subscriptions for live updates
- **Developer Experience** - GraphQL Playground, introspection, comprehensive documentation

## Architecture

```
Client Applications
        ↓
GraphQL API Gateway (Apollo Server 4)
├─ Schema Stitching
├─ Authentication Middleware
├─ DataLoaders (N+1 prevention)
├─ Redis Cache
└─ REST Data Sources
        ↓
Microservices
├─ Publishing Service (port 3001)
├─ Discovery Service (port 3002)
├─ Consumption Service (port 3003)
└─ Admin Service (port 3004)
```

## Quick Start

### Prerequisites

- Node.js 18+
- Redis 7+
- Running microservices (Publishing, Discovery, Consumption, Admin)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Development

```bash
# Start development server with hot reload
npm run dev

# GraphQL Playground will be available at:
# http://localhost:4000/graphql
```

### Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f graphql-gateway

# Stop
docker-compose down
```

## API Documentation

### Endpoints

- **GraphQL Endpoint**: `POST /graphql`
- **WebSocket Subscriptions**: `ws://localhost:4000/graphql`
- **GraphQL Playground**: `GET /graphql` (development only)

### Authentication

Include JWT token in Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Example Queries

#### Search Services

```graphql
query SearchServices {
  searchServices(
    query: "text generation"
    filter: {
      category: "AI"
      minRating: 4.0
    }
    pagination: {
      limit: 10
    }
  ) {
    services {
      id
      name
      description
      rating
      provider {
        name
        verified
      }
      pricing {
        model
        price
        currency
      }
    }
    total
    took
  }
}
```

#### Get Service Details

```graphql
query GetService($id: ID!) {
  service(id: $id) {
    id
    name
    description
    version
    category
    tags
    provider {
      id
      name
      email
      verified
      rating
    }
    pricing {
      model
      price
      currency
      tiers {
        name
        requestsIncluded
        price
      }
    }
    endpoints {
      url
      method
      description
    }
    rating
    usageCount
    createdAt
    updatedAt
  }
}
```

#### Create Service

```graphql
mutation CreateService($input: CreateServiceInput!) {
  createService(input: $input) {
    ... on Service {
      id
      name
      status
    }
    ... on ValidationError {
      message
      fields {
        field
        message
      }
    }
  }
}
```

#### Subscribe to Service Updates

```graphql
subscription OnServiceUpdated($id: ID!) {
  serviceUpdated(id: $id) {
    id
    name
    status
    updatedAt
  }
}
```

### Directives

#### @auth

Requires user authentication:

```graphql
type Query {
  recommendations: [Service!]! @auth
}
```

#### @requireRole(role: Role!)

Requires specific user role:

```graphql
type Mutation {
  approveService(id: ID!): ApprovalResult! @requireRole(role: ADMIN)
}
```

#### @rateLimit(limit: Int!, window: Int!)

Limits requests per time window:

```graphql
type Query {
  searchServices(query: String!): SearchResult!
    @rateLimit(limit: 200, window: 60)
}
```

#### @cacheControl(maxAge: Int!, scope: CacheControlScope)

Sets cache TTL for responses:

```graphql
type Query {
  categories: [Category!]! @cacheControl(maxAge: 3600)
}
```

## Schema

The schema is organized by domain:

- **Common** - Scalars, pagination, errors, directives
- **Publishing** - Service management and publishing
- **Discovery** - Search, recommendations, categories
- **Consumption** - Usage tracking, quotas, billing
- **Admin** - Analytics, audit logs, user management

### Custom Scalars

- `DateTime` - ISO 8601 date-time string
- `JSON` - Arbitrary JSON value
- `URL` - Valid HTTP/HTTPS URL
- `EmailAddress` - Valid email format
- `PositiveInt` - Integer > 0
- `NonNegativeInt` - Integer >= 0
- `NonNegativeFloat` - Float >= 0

### Error Handling

Errors are returned as union types for explicit handling:

```graphql
union ServiceResult = Service | ValidationError | NotFoundError | AuthorizationError
```

Client can handle different error types:

```graphql
mutation CreateService($input: CreateServiceInput!) {
  createService(input: $input) {
    ... on Service {
      id
      name
    }
    ... on ValidationError {
      message
      fields {
        field
        message
      }
    }
    ... on NotFoundError {
      message
      resourceType
    }
  }
}
```

## Performance

### DataLoader Batching

All relationship fields use DataLoader for automatic batching:

```typescript
// Instead of N+1 queries
services.forEach(service => {
  const provider = await getProvider(service.providerId);
});

// DataLoader batches into single query
const providers = await batchGetProviders(allProviderIds);
```

### Redis Caching

Query responses are automatically cached based on `@cacheControl` directives:

```graphql
type Query {
  categories: [Category!]! @cacheControl(maxAge: 3600)
}
```

Cache headers are set on responses:

```
X-Cache: HIT
X-Response-Time: 5ms
```

### Query Complexity

Maximum query complexity is limited to prevent expensive queries:

```typescript
const MAX_COMPLEXITY = 1000;
```

Queries exceeding the limit are rejected:

```json
{
  "errors": [{
    "message": "Query is too complex: 1250. Maximum allowed: 1000",
    "extensions": {
      "code": "QUERY_TOO_COMPLEX"
    }
  }]
}
```

### Query Depth

Maximum query depth is limited to prevent deeply nested queries:

```typescript
const MAX_DEPTH = 10;
```

## Security

### Authentication

JWT-based authentication with role hierarchy:

- `USER` - Regular user
- `PROVIDER` - Service provider
- `ADMIN` - Administrator
- `SUPER_ADMIN` - Super administrator

### Rate Limiting

Field-level rate limiting prevents abuse:

```graphql
type Query {
  searchServices(query: String!): SearchResult!
    @rateLimit(limit: 200, window: 60)
}
```

Rate limit exceeded errors include retry information:

```json
{
  "errors": [{
    "message": "Rate limit exceeded",
    "extensions": {
      "code": "RATE_LIMIT_EXCEEDED",
      "limit": 200,
      "window": 60,
      "retryAfter": 45
    }
  }]
}
```

### CORS

Configure allowed origins in environment:

```env
ALLOWED_ORIGINS=https://marketplace.example.com,https://admin.example.com
```

## Monitoring

### Metrics

Metrics are collected for every request:

```json
{
  "type": "graphql_request",
  "operation": "SearchServices",
  "status": "success",
  "duration": 125,
  "requestId": "1234567890-abc",
  "userId": "user-123",
  "timestamp": "2025-01-19T10:30:00.000Z"
}
```

### Slow Field Warnings

Fields taking > 100ms are logged:

```json
{
  "type": "slow_field",
  "field": "Query.searchServices",
  "duration": 250,
  "requestId": "1234567890-abc"
}
```

### Health Check

Health endpoint returns system status:

```graphql
query {
  health {
    status
    version
    uptime
    timestamp
    services {
      name
      status
      responseTime
    }
  }
}
```

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment | `development` |
| `API_BASE_URL` | Base URL for microservices | `http://localhost:3000` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | *required* |
| `MAX_QUERY_COMPLEXITY` | Maximum query complexity | `1000` |
| `MAX_QUERY_DEPTH` | Maximum query depth | `10` |

## Troubleshooting

### Connection Refused

If you get connection errors:

1. Ensure Redis is running: `redis-cli ping`
2. Verify microservices are accessible
3. Check `API_BASE_URL` in `.env`

### Authentication Errors

If you get authentication errors:

1. Verify JWT token is valid
2. Check `JWT_SECRET` matches token issuer
3. Ensure token hasn't expired

### Performance Issues

If queries are slow:

1. Check Redis cache is working
2. Enable DataLoader batching
3. Review query complexity
4. Check slow field warnings in logs

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Run linter: `npm run lint`

## License

Proprietary - LLM Marketplace Platform

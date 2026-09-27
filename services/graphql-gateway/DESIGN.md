# GraphQL API Gateway - Design Document

**Version:** 1.0.0
**Status:** ✅ Production Ready
**Last Updated:** 2024-11-19
**Owner:** API Team

---

## Overview

The GraphQL API Gateway provides a unified, type-safe API layer for all LLM Marketplace services. It replaces the current mock GraphQL implementation with a production-grade gateway that aggregates REST microservices into a single GraphQL endpoint.

### Key Objectives

1. **Unified API Access**: Single GraphQL endpoint for all operations
2. **Type Safety**: Strong typing with GraphQL schema
3. **Performance**: Caching, batching, and optimization
4. **Real-time**: WebSocket subscriptions for live updates
5. **Developer Experience**: Introspection, playground, comprehensive docs

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│  (Web Dashboard, Mobile Apps, SDKs, CLI Tools)              │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ GraphQL Queries/Mutations/Subscriptions
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  GraphQL API Gateway                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Apollo Server                                          │ │
│  │  ├─ Schema Stitching                                   │ │
│  │  ├─ Query Parsing & Validation                         │ │
│  │  ├─ Authentication Middleware                          │ │
│  │  ├─ Authorization Directives                           │ │
│  │  ├─ Rate Limiting                                      │ │
│  │  ├─ Query Complexity Analysis                          │ │
│  │  └─ Error Formatting                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Data Layer                                             │ │
│  │  ├─ DataLoaders (N+1 prevention)                       │ │
│  │  ├─ Redis Cache                                        │ │
│  │  ├─ REST Data Sources                                  │ │
│  │  └─ PubSub (Subscriptions)                             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ REST API Calls
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Microservices (REST APIs)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Publishing   │  │ Discovery    │  │ Consumption  │     │
│  │ Service      │  │ Service      │  │ Service      │     │
│  │ :3001        │  │ :3002        │  │ :3003        │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐                       │
│  │ Admin        │  │ Governance   │                       │
│  │ Service      │  │ Service      │                       │
│  │ :3004        │  │ :3005        │                       │
│  └──────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| GraphQL Server | Apollo Server | 4.x | GraphQL runtime |
| Schema | GraphQL SDL | Latest | Type definitions |
| Data Loading | DataLoader | 2.x | Batch & cache |
| Caching | Redis | 7.x | Response caching |
| Subscriptions | GraphQL WS | 5.x | WebSocket support |
| Authentication | JWT | - | Token validation |
| Runtime | Node.js | 20.x | Server runtime |
| Language | TypeScript | 5.x | Type safety |

---

## Schema Design

### Core Principles

1. **Federated Schema**: Each service contributes its domain schema
2. **Type Consistency**: Shared types across all services
3. **Nullable by Default**: Explicit non-null where guaranteed
4. **Pagination**: Cursor-based for all lists
5. **Error Handling**: Union types for explicit errors
6. **Versioning**: Field deprecation over breaking changes

### Schema Organization

```
schema/
├── common/
│   ├── scalars.graphql       # Custom scalars (DateTime, JSON, etc.)
│   ├── pagination.graphql    # Pagination types
│   ├── errors.graphql        # Error types
│   └── directives.graphql    # Custom directives
├── publishing/
│   ├── types.graphql         # Service types
│   ├── queries.graphql       # Query definitions
│   └── mutations.graphql     # Mutation definitions
├── discovery/
│   ├── types.graphql
│   ├── queries.graphql
│   └── subscriptions.graphql # Real-time updates
├── consumption/
│   ├── types.graphql
│   └── queries.graphql
├── admin/
│   ├── types.graphql
│   ├── queries.graphql
│   └── mutations.graphql
└── schema.graphql            # Root schema
```

### Example Schema Structure

```graphql
# Root Query
type Query {
  # Publishing
  service(id: ID!): Service
  services(filter: ServiceFilter, pagination: PaginationInput): ServiceConnection!

  # Discovery
  searchServices(query: String!, filter: SearchFilter): SearchResult!
  recommendations(limit: Int): [Service!]!
  categories: [Category!]!

  # Consumption
  usage(serviceId: ID!, timeRange: TimeRangeInput!): UsageMetrics!
  quota(serviceId: ID!): Quota!
  sla(serviceId: ID!, period: TimeRangeInput): SLAMetrics!

  # Admin
  analytics(period: TimeRangeInput!): Analytics!
  auditLogs(filter: AuditLogFilter): AuditLogConnection!
}

# Root Mutation
type Mutation {
  # Publishing
  createService(input: CreateServiceInput!): ServiceResult!
  updateService(id: ID!, input: UpdateServiceInput!): ServiceResult!
  deleteService(id: ID!): DeleteResult!

  # Admin
  approveService(id: ID!, notes: String): ApprovalResult!
  rejectService(id: ID!, reason: String!): RejectionResult!
}

# Root Subscription
type Subscription {
  # Service updates
  serviceUpdated(id: ID!): Service!

  # Usage monitoring
  usageUpdated(serviceId: ID!): UsageMetrics!

  # Notifications
  notifications: Notification!
}
```

---

## Key Features

### 1. Query Batching & Caching

**DataLoader Pattern**:
```typescript
// Batch multiple requests into single REST call
const serviceLoader = new DataLoader(async (ids) => {
  const services = await restApi.getServicesBatch(ids);
  return ids.map(id => services.find(s => s.id === id));
}, {
  cache: true,
  maxBatchSize: 100
});
```

**Response Caching**:
```typescript
// Redis-based caching with TTL
const cache = new RedisCache({
  ttl: 300, // 5 minutes
  keyPrefix: 'gql:'
});

// Cache at resolver level
@Cached({ ttl: 60 })
async getService(id: string) {
  return this.serviceLoader.load(id);
}
```

### 2. Authentication & Authorization

**JWT Authentication**:
```typescript
// Extract user from JWT token
const user = await verifyToken(req.headers.authorization);

// Add to context
context: ({ req }) => ({
  user: req.user,
  isAuthenticated: !!req.user
})
```

**Custom Directives**:
```graphql
directive @auth on FIELD_DEFINITION | OBJECT
directive @requireRole(role: Role!) on FIELD_DEFINITION

type Mutation {
  deleteService(id: ID!): DeleteResult! @auth @requireRole(role: ADMIN)
}
```

### 3. Rate Limiting

**Field-Level Rate Limiting**:
```graphql
directive @rateLimit(
  limit: Int!
  window: Int!
) on FIELD_DEFINITION

type Query {
  searchServices(query: String!): [Service!]! @rateLimit(limit: 100, window: 60)
}
```

### 4. Query Complexity Analysis

```typescript
// Prevent expensive queries
const complexity = {
  Query: {
    services: 10,
    searchServices: 20
  },
  Service: {
    usage: 15,
    recommendations: 10
  }
};

// Reject queries exceeding limit
maxComplexity: 1000
```

### 5. Real-time Subscriptions

**WebSocket Support**:
```typescript
// PubSub for real-time events
const pubsub = new RedisPubSub({
  publisher: redisClient,
  subscriber: redisClient
});

// Subscription resolver
const resolvers = {
  Subscription: {
    serviceUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator('SERVICE_UPDATED'),
        (payload, variables) => payload.id === variables.id
      )
    }
  }
};
```

### 6. Error Handling

**Structured Errors**:
```graphql
interface Error {
  message: String!
  code: ErrorCode!
  path: [String!]
}

enum ErrorCode {
  AUTHENTICATION_ERROR
  AUTHORIZATION_ERROR
  NOT_FOUND
  VALIDATION_ERROR
  RATE_LIMIT_EXCEEDED
  INTERNAL_ERROR
}

union ServiceResult = Service | ValidationError | NotFoundError
```

**Error Formatting**:
```typescript
formatError: (error) => ({
  message: error.message,
  code: error.extensions.code,
  path: error.path,
  timestamp: new Date().toISOString(),
  requestId: context.requestId
})
```

---

## Performance Optimizations

### 1. N+1 Query Prevention

```typescript
// Without DataLoader (N+1 problem)
services.map(async s => ({
  ...s,
  provider: await getProvider(s.providerId) // N queries!
}))

// With DataLoader (batched)
services.map(s => ({
  ...s,
  provider: providerLoader.load(s.providerId) // 1 query!
}))
```

### 2. Field-Level Caching

```typescript
// Cache specific fields
const resolvers = {
  Service: {
    recommendations: async (service, args, { cache }) => {
      const cacheKey = `recs:${service.id}`;
      const cached = await cache.get(cacheKey);

      if (cached) return cached;

      const recs = await getRecommendations(service.id);
      await cache.set(cacheKey, recs, { ttl: 300 });

      return recs;
    }
  }
};
```

### 3. Persisted Queries

```typescript
// Client sends hash instead of full query
{
  "extensions": {
    "persistedQuery": {
      "version": 1,
      "sha256Hash": "abc123..."
    }
  }
}

// Server looks up query from hash
const query = await persistedQueries.get(hash);
```

### 4. Response Compression

```typescript
// Enable compression
app.use(compression({
  threshold: 0,
  filter: () => true
}));
```

---

## Security

### 1. Query Depth Limiting

```typescript
// Prevent deeply nested queries
validationRules: [
  depthLimit(7),  // Max depth
  createComplexityLimitRule(1000)
]
```

### 2. Query Timeout

```typescript
// Prevent long-running queries
timeout: 30000  // 30 seconds
```

### 3. Introspection Control

```typescript
// Disable in production
introspection: process.env.NODE_ENV !== 'production'
```

### 4. CORS Configuration

```typescript
cors: {
  origin: process.env.ALLOWED_ORIGINS.split(','),
  credentials: true
}
```

---

## Monitoring & Observability

### 1. Metrics

```typescript
// Prometheus metrics
const metrics = {
  queries: new Counter('graphql_queries_total'),
  errors: new Counter('graphql_errors_total'),
  latency: new Histogram('graphql_query_duration_ms')
};
```

### 2. Logging

```typescript
// Structured logging
logger.info({
  query: info.operation.name,
  variables: info.variables,
  userId: context.user?.id,
  duration: elapsed,
  requestId: context.requestId
});
```

### 3. Distributed Tracing

```typescript
// OpenTelemetry integration
const tracer = trace.getTracer('graphql-gateway');

const span = tracer.startSpan('graphql.query', {
  attributes: {
    'graphql.operation.name': operationName,
    'graphql.operation.type': operationType
  }
});
```

---

## Deployment

### Docker Configuration

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "dist/index.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: graphql-gateway
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: graphql-gateway
        image: graphql-gateway:latest
        ports:
        - containerPort: 4000
        env:
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

---

## API Examples

### Query Examples

```graphql
# Search for services
query SearchServices {
  searchServices(
    query: "text generation"
    filter: { category: "ai-models", minRating: 4.0 }
  ) {
    services {
      id
      name
      description
      category
      pricing {
        model
        price
      }
      provider {
        name
        rating
      }
    }
    total
  }
}

# Get service with usage
query ServiceDetails($id: ID!) {
  service(id: $id) {
    id
    name
    description
    usage(timeRange: { start: "2024-11-01", end: "2024-11-30" }) {
      totalRequests
      avgResponseTime
      errorRate
    }
    quota {
      limit
      used
      remaining
      resetAt
    }
  }
}

# Paginated list
query ListServices($cursor: String) {
  services(
    filter: { status: APPROVED }
    pagination: { limit: 10, cursor: $cursor }
  ) {
    edges {
      node {
        id
        name
        status
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Mutation Examples

```graphql
# Create service
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

# Approve service
mutation ApproveService($id: ID!) {
  approveService(id: $id, notes: "Looks good!") {
    success
    service {
      id
      status
    }
  }
}
```

### Subscription Examples

```graphql
# Real-time service updates
subscription ServiceUpdates($id: ID!) {
  serviceUpdated(id: $id) {
    id
    status
    updatedAt
  }
}

# Usage monitoring
subscription UsageMonitoring($serviceId: ID!) {
  usageUpdated(serviceId: $serviceId) {
    totalRequests
    errorRate
    avgResponseTime
  }
}
```

---

## Migration Strategy

### Phase 1: Parallel Deployment (Week 1-2)
- Deploy GraphQL gateway alongside REST APIs
- No traffic routing yet
- Internal testing only

### Phase 2: Gradual Rollout (Week 3-4)
- 10% traffic to GraphQL
- Monitor performance and errors
- Increase to 25%, 50%, 75%

### Phase 3: Full Migration (Week 5-6)
- 100% traffic to GraphQL
- Keep REST APIs for backward compatibility
- Deprecation notices

### Phase 4: REST Deprecation (Month 6)
- Remove REST endpoints
- GraphQL only

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| P50 Latency | < 50ms | TBD |
| P95 Latency | < 200ms | TBD |
| P99 Latency | < 500ms | TBD |
| Throughput | > 1000 qps | TBD |
| Error Rate | < 0.1% | TBD |
| Cache Hit Rate | > 80% | TBD |

---

## Related Documentation

- [GraphQL Schema Reference](./schema/README.md)
- [Resolver Implementation Guide](./docs/resolvers.md)
- [Authentication Guide](./docs/authentication.md)
- [Deployment Guide](./docs/deployment.md)

---

**Document Owner:** API Team
**Last Updated:** 2024-11-19
**Next Review:** 2025-01-19
**Status:** ✅ Active

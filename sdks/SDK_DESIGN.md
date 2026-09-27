# Multi-Language SDK Design

**Version:** 1.0.0
**Status:** ✅ Production Ready
**Last Updated:** 2024-11-19
**Owner:** SDK Team

---

## Overview

This document defines the architecture, patterns, and standards for LLM-Marketplace SDKs across JavaScript/TypeScript, Python, Go, and Java.

### Supported Languages

| Language | Version | Package Manager | Status |
|----------|---------|-----------------|--------|
| JavaScript/TypeScript | Node 18+, TS 5+ | npm | ✅ Ready |
| Python | 3.8+ | pip/PyPI | ✅ Ready |
| Go | 1.21+ | Go modules | ✅ Ready |
| Java | 11+ | Maven/Gradle | ✅ Ready |

---

## SDK Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    SDK Architecture                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Application Code                                            │
│       ↓                                                      │
│  ┌─────────────────────────────────────────────┐            │
│  │         LLM Marketplace Client              │            │
│  │  ┌────────────────────────────────────┐    │            │
│  │  │  Publishing Service Client         │    │            │
│  │  │  Discovery Service Client          │    │            │
│  │  │  Consumption Service Client        │    │            │
│  │  │  Admin Service Client              │    │            │
│  │  └────────────────────────────────────┘    │            │
│  │                                              │            │
│  │  Common Layer:                              │            │
│  │  ├─ Authentication (API Key)                │            │
│  │  ├─ HTTP Client (with retry)                │            │
│  │  ├─ Error Handling                          │            │
│  │  ├─ Rate Limiting                           │            │
│  │  ├─ Pagination                              │            │
│  │  └─ Logging                                 │            │
│  └─────────────────────────────────────────────┘            │
│       ↓                                                      │
│  REST API (api.llm-marketplace.com)                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Client Initialization

**Common Pattern:**

```
Client = new LLMMarketplaceClient({
    apiKey: "your-api-key",
    baseUrl: "https://api.llm-marketplace.com",  // optional
    timeout: 30000,                               // optional
    retryConfig: {                                // optional
        maxRetries: 3,
        backoff: "exponential"
    }
})
```

### Service Clients

Each SDK provides four service clients:

1. **PublishingServiceClient**
   - `createService(data)` - Publish new service
   - `getService(id)` - Get service details
   - `updateService(id, data)` - Update service
   - `deleteService(id)` - Delete service
   - `listServices(params)` - List services with pagination
   - `validateService(data)` - Validate before publishing

2. **DiscoveryServiceClient**
   - `searchServices(query, filters)` - Search services
   - `getServiceById(id)` - Get service details
   - `getRecommendations(userId)` - Get personalized recommendations
   - `getCategories()` - List categories
   - `getTags()` - List popular tags
   - `getServicesByCategory(category)` - Filter by category

3. **ConsumptionServiceClient**
   - `getUsage(serviceId, timeRange)` - Get usage metrics
   - `getQuota(serviceId)` - Get quota information
   - `trackUsage(serviceId, usage)` - Track API usage
   - `getSLA(serviceId)` - Get SLA metrics
   - `getBillingInfo(serviceId)` - Get billing information

4. **AdminServiceClient**
   - `getAnalytics(params)` - Platform analytics
   - `manageUsers(action, userId)` - User management
   - `approveService(serviceId)` - Approve service
   - `rejectService(serviceId, reason)` - Reject service
   - `getAuditLogs(params)` - Audit trail

---

## Common Patterns

### Authentication

**API Key in Header:**

```
Authorization: Bearer <api-key>
```

**SDK Configuration:**

- API key can be set via:
  1. Constructor parameter (highest priority)
  2. Environment variable (`LLM_MARKETPLACE_API_KEY`)
  3. Config file (~/.llm-marketplace/config)

### Error Handling

**Standard Error Types:**

| Error Class | HTTP Status | Description |
|-------------|-------------|-------------|
| `AuthenticationError` | 401 | Invalid or missing API key |
| `AuthorizationError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource not found |
| `ValidationError` | 400 | Invalid request data |
| `RateLimitError` | 429 | Rate limit exceeded |
| `ServerError` | 500 | Internal server error |
| `NetworkError` | N/A | Network/timeout issues |

**Error Response Format:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Service name is required",
    "details": {
      "field": "name",
      "constraint": "required"
    },
    "requestId": "req_123456"
  }
}
```

### Retry Logic

**Exponential Backoff:**

```
Retry 1: Wait 1s
Retry 2: Wait 2s
Retry 3: Wait 4s
Max retries: 3
```

**Retryable Errors:**
- Network timeouts
- HTTP 429 (Rate Limit)
- HTTP 500-599 (Server errors)

**Non-Retryable Errors:**
- HTTP 400 (Bad Request)
- HTTP 401 (Unauthorized)
- HTTP 403 (Forbidden)
- HTTP 404 (Not Found)

### Pagination

**Cursor-Based Pagination:**

```json
{
  "data": [...],
  "pagination": {
    "nextCursor": "eyJpZCI6MTIzfQ==",
    "hasMore": true,
    "total": 1000
  }
}
```

**SDK Pattern:**

```
// Iterator pattern
for service in client.publishing.listServices():
    print(service)

// Manual pagination
response = client.publishing.listServices(limit=10)
while response.hasMore:
    response = client.publishing.listServices(cursor=response.nextCursor)
```

### Rate Limiting

**Rate Limit Headers:**

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1634567890
```

**SDK Behavior:**
- Track rate limits from response headers
- Automatically wait if rate limit hit (optional)
- Throw `RateLimitError` with retry-after info

---

## SDK-Specific Conventions

### JavaScript/TypeScript

**Naming:**
- Classes: PascalCase (`LLMMarketplaceClient`)
- Methods: camelCase (`createService`)
- Constants: UPPER_SNAKE_CASE (`API_VERSION`)

**Async Pattern:**
```typescript
// Promise-based
const service = await client.publishing.createService(data);

// Callback (legacy support)
client.publishing.createService(data, (err, service) => {
    if (err) throw err;
    console.log(service);
});
```

**Types:**
```typescript
interface Service {
    id: string;
    name: string;
    description: string;
    category: string;
    // ...
}

interface CreateServiceRequest {
    name: string;
    description: string;
    category: string;
    // ...
}
```

---

### Python

**Naming:**
- Classes: PascalCase (`LLMMarketplaceClient`)
- Methods: snake_case (`create_service`)
- Constants: UPPER_SNAKE_CASE (`API_VERSION`)

**Async Pattern:**
```python
# Synchronous
service = client.publishing.create_service(data)

# Asynchronous (aiohttp)
async with LLMMarketplaceClient(api_key="...") as client:
    service = await client.publishing.create_service(data)
```

**Type Hints:**
```python
from typing import Optional, List
from dataclasses import dataclass

@dataclass
class Service:
    id: str
    name: str
    description: str
    category: str

def create_service(self, data: dict) -> Service:
    ...
```

---

### Go

**Naming:**
- Types: PascalCase (`LLMMarketplaceClient`)
- Methods: PascalCase (`CreateService`)
- Package: lowercase (`llmmarketplace`)

**Context Pattern:**
```go
ctx := context.Background()
service, err := client.Publishing.CreateService(ctx, data)
if err != nil {
    return err
}
```

**Error Handling:**
```go
type APIError struct {
    Code      string
    Message   string
    Details   map[string]interface{}
    RequestID string
}

func (e *APIError) Error() string {
    return e.Message
}
```

**Structs:**
```go
type Service struct {
    ID          string    `json:"id"`
    Name        string    `json:"name"`
    Description string    `json:"description"`
    Category    string    `json:"category"`
    CreatedAt   time.Time `json:"createdAt"`
}
```

---

### Java

**Naming:**
- Classes: PascalCase (`LLMMarketplaceClient`)
- Methods: camelCase (`createService`)
- Constants: UPPER_SNAKE_CASE (`API_VERSION`)

**Builder Pattern:**
```java
LLMMarketplaceClient client = LLMMarketplaceClient.builder()
    .apiKey("your-api-key")
    .baseUrl("https://api.llm-marketplace.com")
    .timeout(Duration.ofSeconds(30))
    .retryPolicy(RetryPolicy.exponentialBackoff(3))
    .build();
```

**Exception Handling:**
```java
try {
    Service service = client.getPublishing().createService(data);
} catch (AuthenticationException e) {
    // Handle auth error
} catch (ValidationException e) {
    // Handle validation error
} catch (APIException e) {
    // Handle generic API error
}
```

**POJOs:**
```java
public class Service {
    private String id;
    private String name;
    private String description;
    private String category;
    private Instant createdAt;

    // Getters, setters, builder
}
```

---

## API Coverage

### Publishing Service

| Method | Endpoint | SDK Method |
|--------|----------|------------|
| POST | `/publishing/v1/services` | `createService(data)` |
| GET | `/publishing/v1/services/:id` | `getService(id)` |
| PUT | `/publishing/v1/services/:id` | `updateService(id, data)` |
| DELETE | `/publishing/v1/services/:id` | `deleteService(id)` |
| GET | `/publishing/v1/services` | `listServices(params)` |
| POST | `/publishing/v1/services/validate` | `validateService(data)` |

### Discovery Service

| Method | Endpoint | SDK Method |
|--------|----------|------------|
| GET | `/discovery/v1/services/search` | `searchServices(query, filters)` |
| GET | `/discovery/v1/services/:id` | `getServiceById(id)` |
| GET | `/discovery/v1/recommendations` | `getRecommendations(userId)` |
| GET | `/discovery/v1/categories` | `getCategories()` |
| GET | `/discovery/v1/tags` | `getTags()` |
| GET | `/discovery/v1/services/category/:category` | `getServicesByCategory(category)` |

### Consumption Service

| Method | Endpoint | SDK Method |
|--------|----------|------------|
| GET | `/consumption/v1/usage` | `getUsage(serviceId, timeRange)` |
| GET | `/consumption/v1/quota` | `getQuota(serviceId)` |
| POST | `/consumption/v1/usage/track` | `trackUsage(serviceId, usage)` |
| GET | `/consumption/v1/sla` | `getSLA(serviceId)` |
| GET | `/consumption/v1/billing` | `getBillingInfo(serviceId)` |

### Admin Service

| Method | Endpoint | SDK Method |
|--------|----------|------------|
| GET | `/admin/v1/analytics` | `getAnalytics(params)` |
| POST | `/admin/v1/users/:id/action` | `manageUsers(action, userId)` |
| POST | `/admin/v1/services/:id/approve` | `approveService(serviceId)` |
| POST | `/admin/v1/services/:id/reject` | `rejectService(serviceId, reason)` |
| GET | `/admin/v1/audit-logs` | `getAuditLogs(params)` |

---

## Testing Requirements

### Unit Tests

**Coverage Target:** 80%+

**Required Tests:**
- Client initialization
- Authentication handling
- Each service method
- Error handling
- Retry logic
- Pagination

### Integration Tests

**Test Against:**
- Mock server (WireMock, nock, etc.)
- Staging environment
- Real API (optional, with test account)

### Example Test Structure

```
tests/
├── unit/
│   ├── client_test.*
│   ├── publishing_test.*
│   ├── discovery_test.*
│   ├── consumption_test.*
│   └── admin_test.*
├── integration/
│   └── e2e_test.*
└── fixtures/
    └── mock_responses.json
```

---

## Documentation Requirements

### README.md

**Sections:**
1. Installation
2. Quick Start
3. Authentication
4. Usage Examples
5. API Reference
6. Error Handling
7. Contributing
8. License

### API Reference

**Auto-Generated:**
- TypeScript: TypeDoc
- Python: Sphinx
- Go: godoc
- Java: JavaDoc

### Examples

**Minimum Examples:**
1. Client initialization
2. Publishing a service
3. Searching for services
4. Getting usage metrics
5. Error handling
6. Pagination
7. Async usage (where applicable)

---

## Publishing Requirements

### Versioning

**Semantic Versioning:** MAJOR.MINOR.PATCH

- MAJOR: Breaking API changes
- MINOR: New features (backwards compatible)
- PATCH: Bug fixes

**Version Sync:**
- All SDKs start at v1.0.0
- Version bumps coordinated across languages

### Package Registries

| Language | Registry | Package Name |
|----------|----------|--------------|
| JavaScript | npm | `@llm-marketplace/sdk` |
| Python | PyPI | `llm-marketplace` |
| Go | GitHub | `github.com/llm-marketplace/sdk-go` |
| Java | Maven Central | `com.llmmarketplace:sdk` |

### CI/CD

**Automated Publishing:**
- Tag push triggers release
- Run tests before publish
- Build artifacts
- Publish to registry
- Create GitHub release

---

## Security Considerations

### API Key Storage

**Best Practices:**
- Never hardcode API keys
- Use environment variables
- Support config files with restricted permissions
- Warn if API key detected in code

### HTTPS Only

**Enforcement:**
- All requests must use HTTPS
- Reject HTTP URLs
- Certificate validation enabled by default

### Input Validation

**Sanitization:**
- Validate all user input
- Prevent injection attacks
- Type checking where applicable

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Client initialization | < 10ms |
| Simple API call (cached) | < 50ms |
| Simple API call (network) | < 500ms |
| Pagination (1000 items) | < 2s |
| Memory footprint | < 50MB |

---

## Monitoring & Telemetry

### Optional Telemetry

**Metrics to Track:**
- SDK version
- Language/runtime version
- Request count by endpoint
- Error rate
- Average latency

**Privacy:**
- Opt-in only
- No PII collected
- Configurable endpoint

**Implementation:**
```
client = LLMMarketplaceClient({
    apiKey: "...",
    telemetry: {
        enabled: false,  // opt-in
        endpoint: "https://telemetry.llm-marketplace.com"
    }
})
```

---

## Related Documentation

- [REST API Documentation](../docs/api/README.md)
- [Authentication Guide](../docs/authentication.md)
- [Rate Limiting](../docs/rate-limiting.md)
- [Error Codes](../docs/error-codes.md)

---

**Document Owner:** SDK Team
**Last Updated:** 2024-11-19
**Next Review:** 2025-01-19
**Status:** ✅ Active

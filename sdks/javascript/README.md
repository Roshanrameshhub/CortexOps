# LLM Marketplace SDK for JavaScript/TypeScript

Official JavaScript/TypeScript SDK for the LLM Marketplace API.

[![npm version](https://img.shields.io/npm/v/@llm-marketplace/sdk)](https://www.npmjs.com/package/@llm-marketplace/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@llm-marketplace/sdk)](https://github.com/llm-marketplace/sdk-javascript/blob/main/LICENSE)

## Features

- ✅ **TypeScript Support**: Full TypeScript support with comprehensive type definitions
- ✅ **Promise-based API**: Modern async/await syntax
- ✅ **Automatic Retries**: Configurable exponential backoff for failed requests
- ✅ **Error Handling**: Detailed error types for better debugging
- ✅ **Pagination Support**: Easy iteration through paginated results
- ✅ **Rate Limiting**: Automatic handling of rate limits
- ✅ **Tree-shakeable**: Import only what you need
- ✅ **Node.js & Browser**: Works in both environments

## Installation

```bash
npm install @llm-marketplace/sdk
```

Or with yarn:

```bash
yarn add @llm-marketplace/sdk
```

Or with pnpm:

```bash
pnpm add @llm-marketplace/sdk
```

## Quick Start

```typescript
import { LLMMarketplaceClient } from '@llm-marketplace/sdk';

// Initialize the client
const client = new LLMMarketplaceClient({
  apiKey: process.env.LLM_MARKETPLACE_API_KEY!
});

// Create a service
const service = await client.publishing.createService({
  name: 'My LLM Service',
  description: 'An amazing LLM service for text generation',
  category: 'text-generation',
  version: '1.0.0',
  pricing: {
    model: 'free'
  },
  endpoints: [
    {
      url: 'https://api.example.com/v1/generate',
      method: 'POST',
      description: 'Generate text'
    }
  ]
});

console.log(`Service created: ${service.id}`);
```

## Authentication

The SDK requires an API key for authentication. You can provide it in several ways:

### Option 1: Constructor Parameter (Recommended)

```typescript
const client = new LLMMarketplaceClient({
  apiKey: 'your-api-key'
});
```

### Option 2: Environment Variable

```typescript
// Set LLM_MARKETPLACE_API_KEY in your environment
const client = new LLMMarketplaceClient({
  apiKey: process.env.LLM_MARKETPLACE_API_KEY!
});
```

### Option 3: Config File

```typescript
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('~/.llm-marketplace/config.json', 'utf8'));
const client = new LLMMarketplaceClient({
  apiKey: config.apiKey
});
```

## Configuration

```typescript
const client = new LLMMarketplaceClient({
  apiKey: 'your-api-key',

  // Optional: Custom base URL (defaults to https://api.llm-marketplace.com)
  baseUrl: 'https://api.llm-marketplace.com',

  // Optional: Request timeout in milliseconds (default: 30000)
  timeout: 60000,

  // Optional: Retry configuration
  retryConfig: {
    maxRetries: 3,           // Max number of retries (default: 3)
    backoff: 'exponential',  // 'exponential', 'linear', or 'none'
    retryDelay: 1000         // Initial delay in ms (default: 1000)
  },

  // Optional: Custom headers
  headers: {
    'X-Custom-Header': 'value'
  },

  // Optional: Enable telemetry (opt-in, default: false)
  telemetry: false
});
```

## Usage Examples

### Publishing Services

#### Create a Service

```typescript
const service = await client.publishing.createService({
  name: 'GPT-4 Text Generator',
  description: 'Advanced text generation using GPT-4',
  category: 'text-generation',
  version: '1.0.0',
  pricing: {
    model: 'pay-per-use',
    price: 0.03,
    currency: 'USD'
  },
  tags: ['gpt-4', 'text-generation', 'ai'],
  endpoints: [
    {
      url: 'https://api.example.com/v1/generate',
      method: 'POST',
      description: 'Generate text from a prompt'
    }
  ]
});
```

#### Update a Service

```typescript
const updated = await client.publishing.updateService('svc_123', {
  description: 'Updated description',
  pricing: {
    model: 'subscription',
    price: 29.99,
    currency: 'USD'
  }
});
```

#### List Services with Pagination

```typescript
// Simple pagination
const page1 = await client.publishing.listServices({ limit: 10 });

if (page1.pagination.hasMore) {
  const page2 = await client.publishing.listServices({
    limit: 10,
    cursor: page1.pagination.nextCursor
  });
}

// Iterate through all services
for await (const service of client.publishing.iterateServices()) {
  console.log(`${service.name}: ${service.status}`);
}

// Filtered iteration
for await (const service of client.publishing.iterateServices({
  category: 'text-generation',
  status: 'approved'
})) {
  console.log(service.name);
}
```

#### Validate Before Publishing

```typescript
const validation = await client.publishing.validateService({
  name: 'My Service',
  description: 'Test service',
  category: 'invalid-category',  // This will fail
  version: '1.0.0',
  pricing: { model: 'free' },
  endpoints: []
});

if (!validation.valid) {
  console.error('Validation failed:', validation.errors);
  // [{ field: 'category', message: 'Invalid category' }]
}
```

### Discovering Services

#### Search Services

```typescript
const results = await client.discovery.searchServices({
  query: 'text generation',
  category: 'ai-models',
  tags: ['gpt', 'nlp'],
  minRating: 4.0,
  pricingModel: 'free',
  limit: 20
});

for (const service of results.data) {
  console.log(`${service.name} - ${service.description}`);
}
```

#### Get Recommendations

```typescript
const recommendations = await client.discovery.getRecommendations(undefined, 5);

console.log('Recommended services:');
recommendations.forEach(service => {
  console.log(`- ${service.name}`);
});
```

#### Browse by Category

```typescript
// Get all categories
const categories = await client.discovery.getCategories();

// Get services in a category
const services = await client.discovery.getServicesByCategory('text-generation', 10);
```

#### Get Popular Tags

```typescript
const tags = await client.discovery.getTags(20);

console.log('Popular tags:');
tags.forEach(tag => {
  console.log(`${tag.name} (${tag.count} services)`);
});
```

### Consumption & Usage Tracking

#### Get Usage Metrics

```typescript
const usage = await client.consumption.getUsage('svc_123', {
  start: '2024-11-01T00:00:00Z',
  end: '2024-11-30T23:59:59Z'
});

console.log(`Total requests: ${usage.totalRequests}`);
console.log(`Average response time: ${usage.avgResponseTime}ms`);
console.log(`Error rate: ${usage.errorRate}%`);
console.log(`Total cost: $${usage.totalCost}`);
```

#### Check Quota

```typescript
const quota = await client.consumption.getQuota('svc_123');

console.log(`Usage: ${quota.used}/${quota.limit}`);
console.log(`Remaining: ${quota.remaining}`);
console.log(`Resets at: ${new Date(quota.resetAt).toLocaleString()}`);

if (quota.remaining < 100) {
  console.warn('Quota running low!');
}
```

#### Track Usage

```typescript
await client.consumption.trackUsage('svc_123', {
  requests: 1,
  tokens: 150,
  responseTime: 234,
  status: 'success',
  metadata: {
    model: 'gpt-4',
    prompt_length: 50
  }
});
```

#### Monitor SLA

```typescript
const sla = await client.consumption.getSLA('svc_123', {
  start: '2024-11-01T00:00:00Z',
  end: '2024-11-30T23:59:59Z'
});

console.log(`Uptime: ${sla.uptime}%`);
console.log(`Avg response time: ${sla.avgResponseTime}ms`);
console.log(`P95 response time: ${sla.p95ResponseTime}ms`);
console.log(`P99 response time: ${sla.p99ResponseTime}ms`);
console.log(`Error rate: ${sla.errorRate}%`);
```

### Admin Operations

#### Get Analytics

```typescript
const analytics = await client.admin.getAnalytics({
  start: '2024-11-01T00:00:00Z',
  end: '2024-11-30T23:59:59Z'
});

console.log(`Total services: ${analytics.totalServices}`);
console.log(`Active services: ${analytics.activeServices}`);
console.log(`Total users: ${analytics.totalUsers}`);
console.log(`Total requests: ${analytics.totalRequests}`);
```

#### Service Approval Workflow

```typescript
// Approve a service
await client.admin.approveService('svc_123', 'Excellent service!');

// Reject a service
await client.admin.rejectService('svc_456', 'Does not meet quality standards');
```

#### Audit Logs

```typescript
// Get audit logs with filtering
const logs = await client.admin.getAuditLogs({
  userId: 'usr_123',
  action: 'service.create',
  start: '2024-11-01T00:00:00Z',
  end: '2024-11-30T23:59:59Z',
  limit: 50
});

// Iterate through all logs
for await (const log of client.admin.iterateAuditLogs({ userId: 'usr_123' })) {
  console.log(`${log.timestamp}: ${log.action} on ${log.resourceType}:${log.resourceId}`);
}
```

## Error Handling

The SDK provides specific error types for different scenarios:

```typescript
import {
  LLMMarketplaceClient,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
  NetworkError
} from '@llm-marketplace/sdk';

const client = new LLMMarketplaceClient({ apiKey: 'your-key' });

try {
  const service = await client.publishing.getService('svc_123');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof AuthorizationError) {
    console.error('Insufficient permissions');
  } else if (error instanceof NotFoundError) {
    console.error('Service not found');
  } else if (error instanceof ValidationError) {
    console.error('Invalid request:', error.details);
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limit exceeded. Retry after: ${error.retryAfter}`);
  } else if (error instanceof ServerError) {
    console.error('Server error:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## TypeScript Support

The SDK is written in TypeScript and provides comprehensive type definitions:

```typescript
import {
  LLMMarketplaceClient,
  Service,
  CreateServiceRequest,
  PaginationResponse
} from '@llm-marketplace/sdk';

const client = new LLMMarketplaceClient({ apiKey: 'your-key' });

// Type-safe service creation
const request: CreateServiceRequest = {
  name: 'My Service',
  description: 'Description',
  category: 'text-generation',
  version: '1.0.0',
  pricing: { model: 'free' },
  endpoints: []
};

const service: Service = await client.publishing.createService(request);

// Type-safe pagination
const response: PaginationResponse<Service> = await client.publishing.listServices();
```

## Advanced Usage

### Custom HTTP Headers

```typescript
const client = new LLMMarketplaceClient({
  apiKey: 'your-key',
  headers: {
    'X-Request-ID': 'unique-request-id',
    'X-Custom-Header': 'value'
  }
});
```

### Testing Connection

```typescript
const isConnected = await client.testConnection();
if (isConnected) {
  console.log('Successfully connected to LLM Marketplace API');
} else {
  console.error('Failed to connect');
}
```

### Get API Version

```typescript
const version = await client.getVersion();
console.log(`API Version: ${version.version}`);
console.log(`Environment: ${version.environment}`);
```

## Browser Usage

The SDK works in browsers with bundlers like Webpack, Rollup, or Vite:

```typescript
import { LLMMarketplaceClient } from '@llm-marketplace/sdk';

const client = new LLMMarketplaceClient({
  apiKey: 'your-key' // Note: Be careful with API keys in browsers!
});

const services = await client.discovery.searchServices({ query: 'text generation' });
```

**⚠️ Security Warning**: Never expose your API key in client-side code. Consider using a backend proxy for browser applications.

## Examples

Complete examples are available in the [examples](./examples) directory:

- [Basic Usage](./examples/basic-usage.ts)
- [Publishing Workflow](./examples/publishing-workflow.ts)
- [Search and Discovery](./examples/search-discovery.ts)
- [Usage Tracking](./examples/usage-tracking.ts)
- [Error Handling](./examples/error-handling.ts)
- [Pagination](./examples/pagination.ts)

## API Reference

Full API documentation is available at [https://docs.llm-marketplace.com/sdk/javascript](https://docs.llm-marketplace.com/sdk/javascript)

Or generate locally using TypeDoc:

```bash
npm run docs
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Type Checking

```bash
npm run typecheck
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- **Documentation**: [https://docs.llm-marketplace.com](https://docs.llm-marketplace.com)
- **GitHub Issues**: [https://github.com/roshanrameshhub/inferops/issues](https://github.com/roshanrameshhub/inferops/issues)
- **Email**: support@llm-marketplace.com

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for a list of changes.

---

**Made with ❤️ by the LLM Marketplace Team**

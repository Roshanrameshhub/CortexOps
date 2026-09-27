# Multi-Tenancy Support - LLM Marketplace

Enterprise-grade multi-tenancy implementation with full tenant isolation, per-tenant quotas, cross-tenant resource sharing, and tenant-specific customization.

## Features

### Core Multi-Tenancy
- **Full Tenant Isolation**: Row-level security, dedicated schemas, and instance isolation options
- **Tenant Management**: Complete CRUD operations for tenants with lifecycle management
- **Member Management**: User-tenant relationships with role-based access control
- **Tenant Tiers**: FREE, STARTER, PROFESSIONAL, ENTERPRISE with tier-based features

### Quota Management
- **Per-Tenant Quotas**: API requests, storage, compute hours, GPU hours, users, services
- **Multiple Reset Periods**: Hourly, daily, monthly, or never-reset quotas
- **Enforcement Actions**: Block, throttle, alert, or allow overage
- **Real-time Tracking**: Redis-backed usage tracking with periodic database sync
- **Usage Analytics**: Historical usage data and trending analysis

### Cross-Tenant Sharing
- **Sharing Policies**: Define who can access your resources and with what permissions
- **Visibility Levels**: Private, tenant, marketplace, or public
- **Access Control**: Request-based or automatic access with condition validation
- **Revenue Sharing**: Built-in support for marketplace revenue distribution
- **Usage Tracking**: Track cross-tenant resource usage for billing

### Tenant Customization
- **Branding**: Custom logos, colors, and themes
- **Feature Flags**: Per-tenant feature toggling
- **Custom Domains**: Support for tenant-specific domains
- **White Labeling**: Enterprise-tier white labeling capabilities
- **Integration Settings**: SSO, webhooks, and custom API configurations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Tenant     │  │    Rate      │  │   Tenant     │     │
│  │ Extraction   │→│  Limiting    │→│ Authorization│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               Tenant Management Service                     │
│                                                             │
│  Tenant Service  │  Quota Service  │  Sharing Service     │
│                                                             │
│  Multi-Tenant Data Access Layer                            │
│  - Tenant Context Injection                                │
│  - Query Filtering                                         │
│  - Cross-Tenant Policies                                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
│  PostgreSQL + Redis + Row-Level Security                    │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Create `.env` file:

```env
# Server
PORT=3000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=llm_marketplace
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRATION=24h

# Quotas
QUOTA_SYNC_INTERVAL=60000  # 1 minute
QUOTA_RESET_CRON=0 0 * * *  # Daily at midnight
```

### Database Setup

```bash
# Run migrations
npm run migration:run

# Or create schema manually
psql -U postgres -d llm_marketplace -f scripts/init-schema.sql
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Tenant Management

#### Create Tenant
```http
POST /api/v1/tenants
Content-Type: application/json

{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "tier": "professional",
  "ownerUserId": "user-123",
  "ownerEmail": "admin@acme.com",
  "trialDays": 14
}
```

#### Get Tenant
```http
GET /api/v1/tenants/:id
X-Tenant-ID: tenant-uuid
```

#### Update Tenant
```http
PUT /api/v1/tenants/:id
X-Tenant-ID: tenant-uuid
Content-Type: application/json

{
  "name": "Acme Corporation",
  "settings": {
    "timezone": "America/New_York"
  }
}
```

#### Upgrade Tier
```http
POST /api/v1/tenants/:id/upgrade
X-Tenant-ID: tenant-uuid
Content-Type: application/json

{
  "tier": "enterprise"
}
```

### Quota Management

#### Get Quotas
```http
GET /api/v1/tenants/:id/quotas
X-Tenant-ID: tenant-uuid
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "type": "api_requests",
      "limit": 1000000,
      "usage": 45000,
      "percentage": 4.5,
      "remaining": 955000,
      "resetAt": "2025-02-01T00:00:00Z"
    }
  ]
}
```

#### Update Quota
```http
PUT /api/v1/tenants/:id/quotas/api_requests
X-Tenant-ID: tenant-uuid
Content-Type: application/json

{
  "limit": 2000000,
  "softLimit": 1800000
}
```

### Member Management

#### Add Member
```http
POST /api/v1/tenants/:id/members
X-Tenant-ID: tenant-uuid
Content-Type: application/json

{
  "userId": "user-456",
  "role": "admin"
}
```

#### Remove Member
```http
DELETE /api/v1/tenants/:id/members/:userId
X-Tenant-ID: tenant-uuid
```

### Sharing Policies

#### Create Sharing Policy
```http
POST /api/v1/sharing/policies
X-Tenant-ID: tenant-uuid
Content-Type: application/json

{
  "resourceId": "service-123",
  "resourceType": "service",
  "visibility": "marketplace",
  "permissions": ["read", "execute"],
  "pricing": {
    "type": "usage_based",
    "usagePrice": 0.001,
    "currency": "USD"
  }
}
```

#### Request Access
```http
POST /api/v1/sharing/policies/:id/request-access
X-Tenant-ID: consumer-tenant-uuid
Content-Type: application/json

{
  "justification": "Need this service for our ML pipeline"
}
```

## Usage Examples

### Using Tenant Context Middleware

```typescript
import express from 'express';
import { TenantContextMiddleware } from './middleware/tenant-context.middleware';

const app = express();

// Extract tenant context
app.use(tenantMiddleware.extract());

// Require active tenant
app.get('/api/protected',
  tenantMiddleware.requireActive(),
  (req, res) => {
    const tenant = req.tenant;
    res.json({ tenantId: tenant.tenantId });
  }
);

// Require minimum tier
app.get('/api/premium',
  tenantMiddleware.requireTier('professional'),
  (req, res) => {
    res.json({ message: 'Premium feature' });
  }
);

// Enforce quota
app.post('/api/resource',
  tenantMiddleware.enforceQuota('api_requests', 1),
  async (req, res) => {
    // Process request
  }
);
```

### Programmatic Usage

```typescript
import { TenantService } from './services/tenant.service';
import { QuotaService } from './services/quota.service';

// Create tenant
const tenant = await tenantService.createTenant({
  name: 'Acme Corp',
  slug: 'acme-corp',
  tier: TenantTier.PROFESSIONAL,
  ownerUserId: 'user-123',
  ownerEmail: 'admin@acme.com'
});

// Check quota
const check = await quotaService.checkQuota(
  tenant.id,
  QuotaType.API_REQUESTS,
  1
);

if (check.allowed) {
  // Increment usage
  await quotaService.incrementUsage(
    tenant.id,
    QuotaType.API_REQUESTS,
    1
  );
}

// Get usage statistics
const stats = await quotaService.getUsageStatistics(
  tenant.id,
  startDate,
  endDate
);
```

## Tenant Tiers

| Feature | FREE | STARTER | PROFESSIONAL | ENTERPRISE |
|---------|------|---------|--------------|------------|
| API Requests/Month | 10,000 | 100,000 | 1,000,000 | Unlimited |
| Storage | 1 GB | 10 GB | 100 GB | Custom |
| Compute Hours | 10 | 100 | 500 | Unlimited |
| Users | 3 | 10 | 50 | Unlimited |
| Services | 5 | 25 | 100 | Unlimited |
| Custom Branding | ❌ | ❌ | ✅ | ✅ |
| SSO Integration | ❌ | ❌ | ✅ | ✅ |
| Priority Support | ❌ | ❌ | ✅ | ✅ |
| White Labeling | ❌ | ❌ | ❌ | ✅ |
| Dedicated Schema | ❌ | ❌ | ❌ | ✅ |
| SLA | - | 99% | 99.9% | 99.99% |

## Security

### Tenant Isolation

**Row-Level Security (RLS)**:
```sql
-- Enable RLS on tenant tables
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY tenant_isolation ON services
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Application-Level Filtering**:
```typescript
// Automatic tenant filtering
const scopedRepo = TenantQueryFilterMiddleware.createScopedRepository(
  servicesRepo,
  tenantId
);

// All queries automatically filtered by tenant_id
const services = await scopedRepo.find();
```

### Authentication & Authorization

- JWT-based authentication with tenant context
- Role-based access control (RBAC) per tenant
- Permission-based resource access
- Cross-tenant access validation

### Audit Logging

All tenant operations are logged:
- Tenant creation/modification/deletion
- Member additions/removals
- Quota changes
- Access grants/revocations
- Resource usage

## Performance

### Caching Strategy

- **L1**: In-memory tenant context cache (5s TTL)
- **L2**: Redis quota counters (1h TTL)
- **L3**: PostgreSQL source of truth

### Database Optimization

- Compound indexes on `(tenant_id, created_at)`
- Partial indexes for active tenants
- Connection pooling per tenant
- Prepared statements with tenant context

### Scalability

- Horizontal scaling with stateless service
- Redis for distributed quota tracking
- Database read replicas per region
- Tenant sharding for massive scale

## Monitoring

### Metrics

- `tenant_count{tier}` - Total tenants by tier
- `tenant_quota_usage{tenant_id, quota_type}` - Quota usage per tenant
- `tenant_api_requests_total{tenant_id}` - API requests per tenant
- `cross_tenant_shares_total` - Total cross-tenant shares
- `quota_exceeded_events{tenant_id}` - Quota exceeded events

### Alerts

- Quota approaching limit (80%, 90%, 95%)
- Unusual usage patterns
- Trial expiration approaching
- Payment failures
- Cross-tenant access violations

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Deployment

### Docker

```bash
docker build -t tenant-management:latest .
docker run -p 3000:3000 tenant-management:latest
```

### Kubernetes

```bash
kubectl apply -f k8s/deployment.yaml
```

## Contributing

See [DESIGN.md](DESIGN.md) for architecture details and design decisions.

## License

Proprietary - LLM Marketplace Platform

## Support

For enterprise support, contact: support@llm-marketplace.com

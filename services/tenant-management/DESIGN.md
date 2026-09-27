# Multi-Tenancy Support - Design Document

## Overview

This document describes the enterprise-grade multi-tenancy architecture for the LLM Marketplace platform. The system supports full tenant isolation, per-tenant quotas, cross-tenant resource sharing, and tenant-specific customization.

## Architecture

### High-Level Architecture

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
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Tenant CRUD  │  Quota Mgmt  │  Billing  │  Config  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Multi-Tenant Data Access Layer                      │  │
│  │  - Tenant Context Injection                          │  │
│  │  - Query Filtering                                   │  │
│  │  - Cross-Tenant Policies                             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Tenants   │  │   Quotas    │  │   Usage     │        │
│  │   Schema    │  │   Schema    │  │   Metrics   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         Application Data (Tenant-Partitioned)        │  │
│  │  - Services  - Users  - Transactions  - Logs        │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Tenant Isolation Strategies

### 1. Database Isolation

We use a **hybrid approach** combining Row-Level Security (RLS) and logical partitioning:

**Row-Level Security (RLS)**:
- All multi-tenant tables include `tenant_id` column
- PostgreSQL RLS policies enforce tenant isolation at database level
- Prevents accidental cross-tenant data leakage
- Transparent to application code

**Schema-per-Tenant (Optional for Enterprise Tier)**:
- Highest isolation level for enterprise customers
- Dedicated schema per tenant
- Complete data segregation
- Independent backups and migrations

### 2. Resource Isolation

**Compute Isolation**:
- Per-tenant resource quotas (CPU, memory, GPU)
- Kubernetes resource quotas and limit ranges
- Separate namespaces for high-tier tenants

**Storage Isolation**:
- Per-tenant storage quotas
- Isolated S3 buckets or directories
- Separate encryption keys per tenant

**Network Isolation**:
- Virtual network isolation for enterprise tenants
- Dedicated load balancers for high-tier plans
- Private endpoints and VPC peering

## Data Models

### Tenant Model

```typescript
interface Tenant {
  id: string;                    // UUID
  name: string;                  // Display name
  slug: string;                  // URL-safe identifier
  tier: TenantTier;              // FREE, STARTER, PROFESSIONAL, ENTERPRISE
  status: TenantStatus;          // ACTIVE, SUSPENDED, TRIAL, DEACTIVATED

  // Configuration
  settings: TenantSettings;
  features: FeatureFlags;
  customization: TenantCustomization;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  suspendedAt?: Date;

  // Billing
  billingInfo: BillingInformation;
  subscriptionId?: string;

  // Isolation
  isolationLevel: IsolationLevel;  // SHARED, DEDICATED_SCHEMA, DEDICATED_INSTANCE
  region: string;                  // Data residency
}

enum TenantTier {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}

enum TenantStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated'
}

enum IsolationLevel {
  SHARED = 'shared',              // Row-level security
  DEDICATED_SCHEMA = 'dedicated_schema',  // Schema per tenant
  DEDICATED_INSTANCE = 'dedicated_instance'  // Separate cluster
}
```

### Quota Model

```typescript
interface TenantQuota {
  tenantId: string;
  quotaType: QuotaType;

  // Limits
  limit: number;                  // Maximum allowed
  softLimit?: number;             // Warning threshold

  // Usage
  currentUsage: number;
  resetPeriod: ResetPeriod;       // HOURLY, DAILY, MONTHLY
  lastReset: Date;

  // Enforcement
  enforcementAction: EnforcementAction;  // BLOCK, THROTTLE, ALERT
  overageAllowed: boolean;
  overageRate?: number;           // Cost per unit over quota
}

enum QuotaType {
  API_REQUESTS = 'api_requests',
  COMPUTE_HOURS = 'compute_hours',
  STORAGE_GB = 'storage_gb',
  BANDWIDTH_GB = 'bandwidth_gb',
  USERS = 'users',
  SERVICES = 'services',
  GPU_HOURS = 'gpu_hours',
  MODELS = 'models'
}

enum ResetPeriod {
  HOURLY = 'hourly',
  DAILY = 'daily',
  MONTHLY = 'monthly',
  NEVER = 'never'
}

enum EnforcementAction {
  BLOCK = 'block',                // Hard block
  THROTTLE = 'throttle',          // Rate limiting
  ALERT = 'alert'                 // Only notify
}
```

### Sharing Policy Model

```typescript
interface SharingPolicy {
  id: string;
  resourceId: string;             // Service, model, dataset
  resourceType: ResourceType;
  ownerTenantId: string;

  // Access Control
  visibility: Visibility;
  allowedTenants: string[];       // Specific tenant whitelist
  blockedTenants: string[];       // Specific tenant blacklist

  // Permissions
  permissions: Permission[];

  // Conditions
  conditions: AccessCondition[];

  // Metadata
  createdAt: Date;
  expiresAt?: Date;
}

enum Visibility {
  PRIVATE = 'private',            // Only owner
  TENANT = 'tenant',              // Within tenant
  MARKETPLACE = 'marketplace',    // All tenants (with restrictions)
  PUBLIC = 'public'               // Public access
}

enum Permission {
  READ = 'read',
  EXECUTE = 'execute',
  MODIFY = 'modify',
  SHARE = 'share',
  DELETE = 'delete'
}

interface AccessCondition {
  type: ConditionType;
  value: any;
}

enum ConditionType {
  TIER_MINIMUM = 'tier_minimum',
  REGION = 'region',
  COMPLIANCE = 'compliance',
  COST_LIMIT = 'cost_limit'
}
```

### Tenant Customization

```typescript
interface TenantCustomization {
  // Branding
  branding: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    favicon?: string;
  };

  // UI Customization
  ui: {
    theme: 'light' | 'dark' | 'custom';
    customCSS?: string;
    layout?: string;
  };

  // Feature Flags
  features: {
    [key: string]: boolean;
  };

  // Email Templates
  emailTemplates: {
    [key: string]: string;
  };

  // Custom Domains
  domains: string[];

  // Integration Settings
  integrations: {
    sso?: SSOConfig;
    webhooks?: WebhookConfig[];
    apis?: APIConfig;
  };
}
```

## Quota Management

### Quota Tiers

| Tier | API Requests/Month | Storage | Compute Hours | Users | Price |
|------|-------------------|---------|---------------|-------|-------|
| FREE | 10,000 | 1 GB | 10 hrs | 3 | $0 |
| STARTER | 100,000 | 10 GB | 100 hrs | 10 | $49/mo |
| PROFESSIONAL | 1,000,000 | 100 GB | 500 hrs | 50 | $299/mo |
| ENTERPRISE | Unlimited | Custom | Custom | Unlimited | Custom |

### Quota Enforcement

**Pre-Request Check**:
```python
async def check_quota(tenant_id: str, quota_type: QuotaType, amount: int = 1):
    quota = await get_tenant_quota(tenant_id, quota_type)

    if quota.current_usage + amount > quota.limit:
        if quota.enforcement_action == EnforcementAction.BLOCK:
            raise QuotaExceededError()
        elif quota.enforcement_action == EnforcementAction.THROTTLE:
            await throttle_request(tenant_id)
        elif quota.enforcement_action == EnforcementAction.ALERT:
            await send_quota_alert(tenant_id)

    await increment_usage(tenant_id, quota_type, amount)
```

**Usage Tracking**:
- Real-time usage tracking with Redis counters
- Periodic synchronization to PostgreSQL
- Hourly/daily rollups for analytics

## Access Control

### Tenant-Based RBAC

```typescript
interface TenantRole {
  id: string;
  tenantId: string;
  name: string;
  permissions: Permission[];
  isSystemRole: boolean;
}

// System Roles per Tenant
const SYSTEM_ROLES = {
  TENANT_OWNER: 'tenant_owner',      // Full control
  TENANT_ADMIN: 'tenant_admin',      // Admin without billing
  TENANT_MEMBER: 'tenant_member',    // Standard user
  TENANT_VIEWER: 'tenant_viewer'     // Read-only
};
```

### Cross-Tenant Access

**Service Sharing Flow**:
```
1. Owner tenant publishes service to marketplace
2. Sharing policy created with visibility = MARKETPLACE
3. Consumer tenant discovers service
4. Consumer requests access (if conditions met, auto-granted)
5. Consumer uses service with tracking
6. Owner receives revenue share
7. Both tenants see usage in their dashboards
```

## Billing & Metering

### Usage Metering

**Metered Events**:
- API requests (by endpoint, method)
- Compute time (CPU/GPU hours)
- Storage (GB-months)
- Bandwidth (GB transferred)
- Model inference calls
- Custom metrics per service

**Metering Pipeline**:
```
Event → Buffer (Redis) → Aggregation → PostgreSQL → Billing System
  ↓
  → Real-time Quota Check
```

### Billing Integration

**Invoice Generation**:
- Monthly billing cycles
- Usage-based charges
- Tiered pricing
- Volume discounts
- Committed use discounts

## Security

### Tenant Isolation Security

**Data Isolation**:
- PostgreSQL RLS policies on all tables
- Application-level tenant context validation
- Audit logging of cross-tenant access attempts

**API Security**:
- Tenant extracted from JWT token or API key
- Tenant context validated on every request
- Cross-tenant requests explicitly authorized

**Network Security**:
- VPC isolation for enterprise tenants
- Private endpoints
- IP whitelisting per tenant

### Compliance

**Data Residency**:
- Per-tenant region selection
- Data sovereignty compliance
- Cross-region replication controls

**Audit Trail**:
- All tenant operations logged
- Immutable audit log
- Compliance reports (SOC2, GDPR, HIPAA)

## Performance Considerations

### Caching Strategy

**Multi-Level Cache**:
1. **L1 - In-Memory**: Tenant settings, quotas (5s TTL)
2. **L2 - Redis**: Shared cache across instances (1m TTL)
3. **L3 - Database**: Source of truth

### Database Optimization

**Indexing**:
```sql
-- Compound indexes for tenant queries
CREATE INDEX idx_services_tenant_id ON services(tenant_id, created_at);
CREATE INDEX idx_usage_tenant_date ON usage_metrics(tenant_id, date);

-- Partial indexes for active tenants
CREATE INDEX idx_active_tenants ON tenants(id) WHERE status = 'ACTIVE';
```

**Query Optimization**:
- Always include `tenant_id` in WHERE clause
- Use connection pooling per tenant
- Prepared statements with tenant context

### Scalability

**Horizontal Scaling**:
- Stateless tenant management service
- Kubernetes HPA based on tenant count
- Database read replicas per region

**Tenant Sharding** (for massive scale):
- Shard tenants across database instances
- Consistent hashing by tenant_id
- Cross-shard queries for platform analytics

## Migration Strategy

### Onboarding New Tenants

```python
async def create_tenant(tenant_data: TenantCreate):
    # 1. Create tenant record
    tenant = await db.tenants.create(tenant_data)

    # 2. Initialize quotas based on tier
    await initialize_quotas(tenant.id, tenant.tier)

    # 3. Create default roles
    await create_default_roles(tenant.id)

    # 4. Setup isolation (schema if needed)
    if tenant.isolation_level == IsolationLevel.DEDICATED_SCHEMA:
        await create_tenant_schema(tenant.id)

    # 5. Initialize customization
    await initialize_customization(tenant.id)

    # 6. Send welcome email
    await send_welcome_email(tenant)

    return tenant
```

### Tenant Lifecycle

**Trial → Paid Conversion**:
- Automatic tier upgrade
- Quota increases
- Feature unlocking

**Suspension**:
- Read-only access
- Block writes and executions
- Retain data for recovery period

**Deletion**:
- Soft delete (90-day retention)
- Data export for compliance
- Hard delete after retention period

## Monitoring & Observability

### Metrics

**Tenant-Level Metrics**:
- `tenant_quota_usage{tenant_id, quota_type}`
- `tenant_api_requests_total{tenant_id, endpoint}`
- `tenant_error_rate{tenant_id}`
- `tenant_response_time{tenant_id, percentile}`

**Platform Metrics**:
- `total_active_tenants{tier}`
- `tenant_churn_rate`
- `cross_tenant_shares_total`
- `quota_exceeded_events{tenant_id, quota_type}`

### Alerting

**Tenant Alerts**:
- Quota approaching limit (80%, 90%, 95%)
- Unusual usage patterns
- Service degradation
- Billing issues

**Platform Alerts**:
- High tenant creation rate
- Database connection pool exhaustion
- Cross-tenant data leak attempts

## API Design

### Tenant Context Headers

```
X-Tenant-ID: tenant-uuid
X-Tenant-Tier: professional
X-User-ID: user-uuid
Authorization: Bearer <jwt-token>
```

### Tenant Management Endpoints

```
POST   /api/v1/tenants                      # Create tenant
GET    /api/v1/tenants/:id                  # Get tenant
PUT    /api/v1/tenants/:id                  # Update tenant
DELETE /api/v1/tenants/:id                  # Delete tenant

GET    /api/v1/tenants/:id/quotas           # Get quotas
PUT    /api/v1/tenants/:id/quotas/:type     # Update quota

GET    /api/v1/tenants/:id/usage            # Get usage metrics
GET    /api/v1/tenants/:id/billing          # Get billing info

POST   /api/v1/tenants/:id/members          # Add member
GET    /api/v1/tenants/:id/members          # List members
DELETE /api/v1/tenants/:id/members/:userId  # Remove member

GET    /api/v1/tenants/:id/audit-log        # Audit trail
```

## Implementation Checklist

- [x] Tenant data models
- [x] Quota management system
- [x] Sharing policy engine
- [ ] Tenant CRUD service
- [ ] Quota enforcement middleware
- [ ] Usage metering pipeline
- [ ] Billing integration
- [ ] Multi-tenant database layer
- [ ] Tenant isolation tests
- [ ] Performance benchmarks
- [ ] Documentation

## References

- [AWS Multi-Tenant SaaS Architecture](https://aws.amazon.com/partners/programs/saas/)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Stripe Multi-Tenant Best Practices](https://stripe.com/docs/connect)

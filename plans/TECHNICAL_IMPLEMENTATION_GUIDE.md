# LLM-Marketplace: Technical Implementation Guide

**Target Audience:** Development Team, DevOps, Architects
**Version:** 1.0
**Date:** 2025-11-18

---

## Table of Contents

1. [Development Environment Setup](#1-development-environment-setup)
2. [Repository Structure](#2-repository-structure)
3. [Service Implementation Details](#3-service-implementation-details)
4. [Database Schema](#4-database-schema)
5. [API Specifications](#5-api-specifications)
6. [Integration Implementation](#6-integration-implementation)
7. [Testing Strategy](#7-testing-strategy)
8. [Deployment Guide](#8-deployment-guide)
9. [Monitoring & Observability](#9-monitoring--observability)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Development Environment Setup

### 1.1 Prerequisites

**Required Software:**
```bash
# Core tools
- Docker 24.0+
- Kubernetes 1.28+ (minikube/kind for local)
- Node.js 20.x LTS
- Go 1.21+
- Rust 1.75+
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Elasticsearch 8.x

# Development tools
- Git 2.40+
- VSCode/IntelliJ/Vim (with language servers)
- Postman/Insomnia (API testing)
- k9s (Kubernetes management)
- kubectl
- helm 3.x
- terraform 1.6+
```

### 1.2 Local Development Setup

**Clone and Initialize:**
```bash
# Clone repository
git clone https://github.com/roshanrameshhub/CortexOps.git
cd CortexOps

# Install dependencies
make install-deps

# Start local infrastructure
docker-compose -f docker-compose.dev.yml up -d

# Verify services
make verify-env
```

**Docker Compose Development Stack:**
```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: marketplace
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: devpassword
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
    ports:
      - "9092:9092"

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
    ports:
      - "2181:2181"

  jaeger:
    image: jaegertracing/all-in-one:1.51
    ports:
      - "16686:16686"  # UI
      - "14268:14268"  # HTTP collector

volumes:
  postgres_data:
  redis_data:
  elasticsearch_data:
```

### 1.3 Environment Configuration

**Create `.env` file:**
```bash
# Database
DATABASE_URL=postgresql://dev:devpassword@localhost:5432/marketplace
DATABASE_POOL_SIZE=10

# Redis
REDIS_URL=redis://localhost:6379
REDIS_CACHE_TTL=300

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX_PREFIX=marketplace

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CONSUMER_GROUP=marketplace-dev

# Service URLs
REGISTRY_URL=http://localhost:8001
POLICY_ENGINE_URL=grpc://localhost:9090
ANALYTICS_HUB_URL=http://localhost:8002
GOVERNANCE_DASHBOARD_URL=http://localhost:8003

# Authentication
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRY=3600
OAUTH_CLIENT_ID=marketplace-dev
OAUTH_CLIENT_SECRET=dev-secret

# Observability
JAEGER_ENDPOINT=http://localhost:14268/api/traces
LOG_LEVEL=debug
METRICS_PORT=9091

# Feature Flags
ENABLE_RECOMMENDATIONS=true
ENABLE_AUTO_APPROVAL=false
ENABLE_RATE_LIMITING=true
```

---

## 2. Repository Structure

### 2.1 Monorepo Layout

```
llm-marketplace/
├── .github/
│   ├── workflows/           # CI/CD pipelines
│   │   ├── ci.yml
│   │   ├── deploy-staging.yml
│   │   └── deploy-production.yml
│   └── CODEOWNERS
├── services/
│   ├── discovery/           # Discovery Service (Go)
│   │   ├── cmd/
│   │   ├── internal/
│   │   ├── pkg/
│   │   ├── Dockerfile
│   │   └── go.mod
│   ├── publishing/          # Publishing Service (TypeScript)
│   │   ├── src/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── consumption/         # Consumption Service (Rust)
│   │   ├── src/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── Cargo.toml
│   └── admin/               # Administration Service (Python)
│       ├── app/
│       ├── tests/
│       ├── Dockerfile
│       └── requirements.txt
├── libs/
│   ├── common-go/           # Shared Go libraries
│   ├── common-ts/           # Shared TypeScript libraries
│   ├── common-rust/         # Shared Rust libraries
│   └── proto/               # Protobuf definitions
├── infrastructure/
│   ├── terraform/           # Infrastructure as Code
│   │   ├── modules/
│   │   ├── environments/
│   │   └── main.tf
│   ├── kubernetes/          # K8s manifests
│   │   ├── base/
│   │   ├── overlays/
│   │   └── helm/
│   └── docker-compose/      # Local development
├── scripts/
│   ├── init-db.sql
│   ├── seed-data.sql
│   ├── migrate.sh
│   └── deploy.sh
├── docs/
│   ├── api/                 # API documentation
│   ├── architecture/        # Architecture diagrams
│   └── runbooks/            # Operational guides
├── tests/
│   ├── integration/         # Integration tests
│   ├── e2e/                 # End-to-end tests
│   └── performance/         # Load tests
├── .editorconfig
├── .gitignore
├── docker-compose.dev.yml
├── Makefile
└── README.md
```

### 2.2 Service Structure (Example: Discovery Service)

```
services/discovery/
├── cmd/
│   └── server/
│       └── main.go          # Entry point
├── internal/
│   ├── api/                 # API handlers
│   │   ├── rest/
│   │   └── grpc/
│   ├── service/             # Business logic
│   │   ├── search.go
│   │   ├── ranking.go
│   │   └── recommendations.go
│   ├── repository/          # Data access
│   │   ├── postgres.go
│   │   ├── elasticsearch.go
│   │   └── redis.go
│   ├── models/              # Domain models
│   └── middleware/          # HTTP middleware
├── pkg/                     # Exportable packages
│   └── client/              # Client library
├── config/
│   └── config.go            # Configuration management
├── migrations/              # Database migrations
│   ├── 001_initial.up.sql
│   └── 001_initial.down.sql
├── tests/
│   ├── unit/
│   └── integration/
├── Dockerfile
├── go.mod
├── go.sum
└── README.md
```

---

## 3. Service Implementation Details

### 3.1 Discovery Service (Go)

**Core Implementation:**

```go
// internal/service/search.go
package service

import (
    "context"
    "time"
)

type SearchService struct {
    esClient     *elasticsearch.Client
    redisClient  *redis.Client
    embeddings   *EmbeddingService
    policyEngine PolicyEngineClient
}

type SearchQuery struct {
    Query      string            `json:"query"`
    Filters    map[string]string `json:"filters"`
    Pagination Pagination        `json:"pagination"`
}

type SearchResults struct {
    Services       []Service       `json:"services"`
    Total          int64           `json:"total"`
    Recommendations []Service      `json:"recommendations"`
    FacetCounts    map[string]int  `json:"facet_counts"`
}

func (s *SearchService) Search(ctx context.Context, query SearchQuery, userId string) (*SearchResults, error) {
    span := trace.SpanFromContext(ctx)
    span.SetAttributes(attribute.String("query", query.Query))

    // Check cache
    cacheKey := fmt.Sprintf("search:%s:%s", query.Query, userId)
    if cached, err := s.redisClient.Get(ctx, cacheKey).Result(); err == nil {
        var results SearchResults
        if json.Unmarshal([]byte(cached), &results) == nil {
            return &results, nil
        }
    }

    // Generate semantic embedding
    embedding, err := s.embeddings.Encode(ctx, query.Query)
    if err != nil {
        return nil, fmt.Errorf("failed to generate embedding: %w", err)
    }

    // Build Elasticsearch query
    esQuery := s.buildESQuery(query, embedding)

    // Execute search
    res, err := s.esClient.Search(
        s.esClient.Search.WithContext(ctx),
        s.esClient.Search.WithIndex("services"),
        s.esClient.Search.WithBody(esQuery),
    )
    if err != nil {
        return nil, fmt.Errorf("search failed: %w", err)
    }
    defer res.Body.Close()

    // Parse results
    services, total, err := s.parseESResponse(res)
    if err != nil {
        return nil, err
    }

    // Filter by permissions
    allowedServices := s.filterByPermissions(ctx, services, userId)

    // Rank results
    rankedServices := s.rankResults(allowedServices)

    // Get recommendations
    recommendations, _ := s.getRecommendations(ctx, userId, rankedServices)

    results := &SearchResults{
        Services:       rankedServices,
        Total:          total,
        Recommendations: recommendations,
    }

    // Cache results
    if data, err := json.Marshal(results); err == nil {
        s.redisClient.Set(ctx, cacheKey, data, 30*time.Second)
    }

    return results, nil
}

func (s *SearchService) buildESQuery(query SearchQuery, embedding []float64) io.Reader {
    // Multi-field search with boosting
    mustClauses := []map[string]interface{}{
        {
            "multi_match": map[string]interface{}{
                "query":  query.Query,
                "fields": []string{"name^3", "description^2", "tags"},
                "type":   "best_fields",
            },
        },
    }

    // Semantic search (vector)
    if len(embedding) > 0 {
        mustClauses = append(mustClauses, map[string]interface{}{
            "script_score": map[string]interface{}{
                "query": map[string]interface{}{"match_all": map[string]interface{}{}},
                "script": map[string]interface{}{
                    "source": "cosineSimilarity(params.embedding, 'embedding_vector') + 1.0",
                    "params": map[string]interface{}{
                        "embedding": embedding,
                    },
                },
            },
        })
    }

    // Apply filters
    filterClauses := []map[string]interface{}{}
    for key, value := range query.Filters {
        filterClauses = append(filterClauses, map[string]interface{}{
            "term": map[string]interface{}{key: value},
        })
    }

    esQuery := map[string]interface{}{
        "query": map[string]interface{}{
            "bool": map[string]interface{}{
                "must":   mustClauses,
                "filter": filterClauses,
            },
        },
        "from": query.Pagination.Offset,
        "size": query.Pagination.Limit,
        "aggs": map[string]interface{}{
            "categories": map[string]interface{}{
                "terms": map[string]interface{}{"field": "category"},
            },
            "pricing_models": map[string]interface{}{
                "terms": map[string]interface{}{"field": "pricing.model"},
            },
        },
    }

    var buf bytes.Buffer
    json.NewEncoder(&buf).Encode(esQuery)
    return &buf
}
```

**API Handler:**

```go
// internal/api/rest/search_handler.go
package rest

import (
    "net/http"
    "github.com/gin-gonic/gin"
)

type SearchHandler struct {
    searchService *service.SearchService
}

func (h *SearchHandler) HandleSearch(c *gin.Context) {
    var req SearchQuery
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    userId := c.GetString("user_id") // from JWT middleware

    results, err := h.searchService.Search(c.Request.Context(), req, userId)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, results)
}
```

### 3.2 Publishing Service (TypeScript)

**Core Implementation:**

```typescript
// src/services/publishing.service.ts
import { injectable, inject } from 'inversify';
import { TemporalClient, WorkflowClient } from '@temporalio/client';
import { ServiceSpec, PublishResult } from '../models';
import { RegistryClient } from '../clients/registry.client';
import { PolicyEngineClient } from '../clients/policy-engine.client';
import { ValidationService } from './validation.service';

@injectable()
export class PublishingService {
  constructor(
    @inject('TemporalClient') private temporal: WorkflowClient,
    @inject('RegistryClient') private registry: RegistryClient,
    @inject('PolicyEngineClient') private policyEngine: PolicyEngineClient,
    @inject('ValidationService') private validator: ValidationService,
  ) {}

  async publishService(
    spec: ServiceSpec,
    providerId: string,
  ): Promise<PublishResult> {
    // Phase 1: Validate specification
    const validationErrors = await this.validator.validate(spec);
    if (validationErrors.length > 0) {
      return {
        success: false,
        errors: validationErrors,
      };
    }

    // Phase 2: Policy compliance check
    const complianceCheck = await this.policyEngine.validate(spec);
    if (!complianceCheck.compliant) {
      return {
        success: false,
        errors: complianceCheck.violations,
      };
    }

    // Phase 3: Start workflow (Temporal)
    const workflowId = `publish-${Date.now()}-${providerId}`;

    const handle = await this.temporal.start('publishServiceWorkflow', {
      taskQueue: 'publishing',
      workflowId,
      args: [spec, providerId],
    });

    // Wait for initial registration
    const result = await handle.result();

    return {
      success: true,
      serviceId: result.serviceId,
      status: result.status,
      workflowId,
    };
  }
}

// src/workflows/publish-service.workflow.ts
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  registerInRegistry,
  runValidationTests,
  createApprovalWorkflow,
  indexInSearch,
  publishEvents,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 3,
  },
});

export async function publishServiceWorkflow(
  spec: ServiceSpec,
  providerId: string,
): Promise<PublishResult> {

  // Register in LLM-Registry
  const registryEntry = await registerInRegistry(spec, providerId);

  // Run automated tests
  const testResults = await runValidationTests(registryEntry.id);

  if (testResults.failed > 0) {
    return {
      success: false,
      errors: testResults.failures,
    };
  }

  // Create approval workflow if needed
  let approvalStatus = 'approved';
  if (spec.requiresApproval) {
    const approval = await createApprovalWorkflow(registryEntry.id);
    approvalStatus = approval.status;
  }

  // Index in search engine
  await indexInSearch(registryEntry.id);

  // Publish events
  await publishEvents('service.published', {
    serviceId: registryEntry.id,
    providerId,
    timestamp: new Date(),
  });

  return {
    success: true,
    serviceId: registryEntry.id,
    status: approvalStatus,
  };
}
```

### 3.3 Consumption Service (Rust)

**Core Implementation:**

```rust
// src/service/consumption.rs
use tokio::time::{timeout, Duration};
use hyper::{Client, Body, Request, Response};
use redis::AsyncCommands;
use crate::models::{ConsumptionRequest, ConsumptionResponse};
use crate::clients::{PolicyEngineClient, AnalyticsClient};
use crate::error::ServiceError;

pub struct ConsumptionService {
    http_client: Client<hyper::client::HttpConnector>,
    redis_client: redis::aio::MultiplexedConnection,
    policy_client: PolicyEngineClient,
    analytics_client: AnalyticsClient,
}

impl ConsumptionService {
    pub async fn route_request(
        &self,
        consumer_id: &str,
        service_id: &str,
        request: ConsumptionRequest,
    ) -> Result<ConsumptionResponse, ServiceError> {

        // Check quota
        let quota_key = format!("quota:{}:{}", consumer_id, service_id);
        let current_quota: i64 = self.redis_client
            .clone()
            .get(&quota_key)
            .await
            .unwrap_or(0);

        if current_quota <= 0 {
            return Err(ServiceError::QuotaExceeded);
        }

        // Check rate limit (token bucket)
        if !self.check_rate_limit(consumer_id, service_id).await? {
            return Err(ServiceError::RateLimitExceeded);
        }

        // Policy validation
        let policy_check = self.policy_client
            .validate_consumption(consumer_id, service_id, &request)
            .await?;

        if !policy_check.allowed {
            return Err(ServiceError::PolicyViolation(policy_check.reason));
        }

        // Get service endpoint
        let endpoint = self.get_service_endpoint(service_id).await?;

        // Build HTTP request
        let http_request = Request::builder()
            .method("POST")
            .uri(&endpoint)
            .header("Content-Type", "application/json")
            .header("X-Consumer-ID", consumer_id)
            .body(Body::from(serde_json::to_string(&request)?))?;

        // Execute with timeout
        let start = std::time::Instant::now();
        let response = timeout(
            Duration::from_secs(30),
            self.http_client.request(http_request)
        ).await??;

        let latency = start.elapsed();

        // Parse response
        let body_bytes = hyper::body::to_bytes(response.into_body()).await?;
        let consumption_response: ConsumptionResponse =
            serde_json::from_slice(&body_bytes)?;

        // Update quota
        let _: () = self.redis_client
            .clone()
            .decr(&quota_key, consumption_response.usage.tokens.total)
            .await?;

        // Stream to analytics
        self.analytics_client.track(AnalyticsEvent {
            event_type: "request_completed",
            service_id: service_id.to_string(),
            consumer_id: consumer_id.to_string(),
            latency_ms: latency.as_millis() as u64,
            tokens: consumption_response.usage.tokens.total,
            status: "success".to_string(),
        }).await?;

        Ok(consumption_response)
    }

    async fn check_rate_limit(
        &self,
        consumer_id: &str,
        service_id: &str,
    ) -> Result<bool, ServiceError> {
        let key = format!("ratelimit:{}:{}", consumer_id, service_id);
        let capacity = 100; // requests per minute
        let refill_rate = capacity / 60; // per second

        // Token bucket algorithm
        let script = r#"
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local refill_rate = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])

            local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
            local tokens = tonumber(bucket[1]) or capacity
            local last_refill = tonumber(bucket[2]) or now

            local elapsed = now - last_refill
            tokens = math.min(capacity, tokens + (elapsed * refill_rate))

            if tokens >= 1 then
                tokens = tokens - 1
                redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
                redis.call('EXPIRE', key, 60)
                return 1
            else
                return 0
            end
        "#;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs();

        let allowed: i32 = redis::Script::new(script)
            .key(&key)
            .arg(capacity)
            .arg(refill_rate)
            .arg(now)
            .invoke_async(&mut self.redis_client.clone())
            .await?;

        Ok(allowed == 1)
    }
}
```

---

## 4. Database Schema

### 4.1 PostgreSQL Schema

```sql
-- Services table
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registry_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    provider_id UUID NOT NULL,
    category VARCHAR(100) NOT NULL,
    tags TEXT[],
    capabilities JSONB NOT NULL,
    endpoint JSONB NOT NULL,
    pricing JSONB NOT NULL,
    sla JSONB NOT NULL,
    compliance JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_approval',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    deprecated_at TIMESTAMP WITH TIME ZONE,
    suspension_reason TEXT,

    CONSTRAINT unique_service_version UNIQUE(name, version),
    CONSTRAINT valid_status CHECK (status IN ('pending_approval', 'active', 'deprecated', 'suspended', 'retired'))
);

CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_provider ON services(provider_id);
CREATE INDEX idx_services_created ON services(created_at DESC);

-- Consumers table
CREATE TABLE consumers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    authentication JSONB NOT NULL,
    quotas JSONB NOT NULL DEFAULT '[]',
    permissions JSONB NOT NULL,
    billing JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_consumer_status CHECK (status IN ('active', 'suspended', 'closed'))
);

CREATE INDEX idx_consumers_email ON consumers(email);
CREATE INDEX idx_consumers_org ON consumers(organization_id);
CREATE INDEX idx_consumers_status ON consumers(status);

-- Usage records table (partitioned by month)
CREATE TABLE usage_records (
    id UUID DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id),
    consumer_id UUID NOT NULL REFERENCES consumers(id),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_ms INTEGER NOT NULL,
    usage JSONB NOT NULL,
    cost JSONB NOT NULL,
    status VARCHAR(50) NOT NULL,
    error JSONB,
    metadata JSONB,

    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions for current and next month
CREATE TABLE usage_records_2025_11 PARTITION OF usage_records
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE usage_records_2025_12 PARTITION OF usage_records
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE INDEX idx_usage_service ON usage_records(service_id, timestamp DESC);
CREATE INDEX idx_usage_consumer ON usage_records(consumer_id, timestamp DESC);
CREATE INDEX idx_usage_status ON usage_records(status, timestamp DESC);

-- API Keys table
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id UUID NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_api_keys_consumer ON api_keys(consumer_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- Approval workflows table
CREATE TABLE approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    approvers JSONB NOT NULL,
    decisions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_workflow_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

CREATE INDEX idx_workflows_service ON approval_workflows(service_id);
CREATE INDEX idx_workflows_status ON approval_workflows(status);

-- Audit log table (append-only)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    actor_id UUID NOT NULL,
    actor_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    resource_type VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    details JSONB NOT NULL,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_id);
CREATE INDEX idx_audit_event_type ON audit_logs(event_type);

-- Prevent deletions and updates on audit_logs
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
```

### 4.2 Redis Data Structures

```redis
# Session data
SET session:{session_id} "{user_data_json}" EX 86400

# Rate limiting (token bucket)
HMSET ratelimit:{consumer_id}:{service_id} tokens 100 last_refill {timestamp}
EXPIRE ratelimit:{consumer_id}:{service_id} 60

# Quotas
SET quota:{consumer_id}:{service_id} {remaining_tokens} EX 2592000

# Cache: Service metadata
SET cache:service:{service_id} "{service_json}" EX 300

# Cache: Search results
SET cache:search:{query_hash}:{user_id} "{results_json}" EX 30

# Distributed lock
SET lock:publish:{service_id} "locked" NX EX 30
```

### 4.3 Elasticsearch Index Mapping

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "name": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        },
        "analyzer": "standard"
      },
      "description": {
        "type": "text",
        "analyzer": "english"
      },
      "category": { "type": "keyword" },
      "tags": { "type": "keyword" },
      "provider": {
        "properties": {
          "id": { "type": "keyword" },
          "name": { "type": "text" }
        }
      },
      "capabilities": {
        "type": "nested",
        "properties": {
          "name": { "type": "keyword" },
          "description": { "type": "text" }
        }
      },
      "pricing": {
        "properties": {
          "model": { "type": "keyword" },
          "rates": { "type": "nested" }
        }
      },
      "compliance": {
        "properties": {
          "level": { "type": "keyword" },
          "certifications": { "type": "keyword" }
        }
      },
      "metrics": {
        "properties": {
          "totalRequests": { "type": "long" },
          "averageLatency": { "type": "float" },
          "errorRate": { "type": "float" },
          "popularity": { "type": "long" }
        }
      },
      "ratings": {
        "properties": {
          "average": { "type": "float" },
          "count": { "type": "long" }
        }
      },
      "embedding_vector": {
        "type": "dense_vector",
        "dims": 384,
        "index": true,
        "similarity": "cosine"
      },
      "indexed_at": { "type": "date" },
      "status": { "type": "keyword" }
    }
  },
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 2,
    "refresh_interval": "30s",
    "analysis": {
      "analyzer": {
        "english": {
          "type": "standard",
          "stopwords": "_english_"
        }
      }
    }
  }
}
```

---

## 5. API Specifications

### 5.1 REST API (OpenAPI 3.1)

```yaml
openapi: 3.1.0
info:
  title: LLM Marketplace API
  version: 1.0.0
  description: API for discovering, publishing, and consuming LLM services

servers:
  - url: https://api.llm-marketplace.example.com/v1
    description: Production
  - url: https://staging-api.llm-marketplace.example.com/v1
    description: Staging

security:
  - BearerAuth: []
  - ApiKeyAuth: []

paths:
  /services/search:
    post:
      summary: Search for services
      operationId: searchServices
      tags: [Discovery]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                query:
                  type: string
                  example: "text generation model"
                filters:
                  type: object
                  properties:
                    category:
                      type: string
                    pricingModel:
                      type: string
                    complianceLevel:
                      type: string
                pagination:
                  type: object
                  properties:
                    offset:
                      type: integer
                      default: 0
                    limit:
                      type: integer
                      default: 20
      responses:
        '200':
          description: Search results
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SearchResults'

  /services:
    post:
      summary: Publish a new service
      operationId: publishService
      tags: [Publishing]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ServiceSpec'
      responses:
        '201':
          description: Service published
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PublishResult'

  /services/{serviceId}/invoke:
    post:
      summary: Invoke a service
      operationId: invokeService
      tags: [Consumption]
      parameters:
        - name: serviceId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                input:
                  type: object
                parameters:
                  type: object
      responses:
        '200':
          description: Service response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConsumptionResponse'

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key

  schemas:
    SearchResults:
      type: object
      properties:
        services:
          type: array
          items:
            $ref: '#/components/schemas/Service'
        total:
          type: integer
        recommendations:
          type: array
          items:
            $ref: '#/components/schemas/Service'
        facetCounts:
          type: object

    Service:
      type: object
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        version:
          type: string
        description:
          type: string
        category:
          type: string
        pricing:
          type: object
        sla:
          type: object
        status:
          type: string
          enum: [active, deprecated, suspended]
```

### 5.2 gRPC API (Protocol Buffers)

```protobuf
// proto/marketplace.proto
syntax = "proto3";

package marketplace.v1;

service ConsumptionService {
  rpc RouteRequest(RouteRequestRequest) returns (RouteRequestResponse);
  rpc CheckQuota(CheckQuotaRequest) returns (QuotaStatus);
}

message RouteRequestRequest {
  string consumer_id = 1;
  string service_id = 2;
  bytes payload = 3;
  map<string, string> metadata = 4;
}

message RouteRequestResponse {
  string request_id = 1;
  bytes response_data = 2;
  Usage usage = 3;
  Cost cost = 4;
}

message Usage {
  int64 input_tokens = 1;
  int64 output_tokens = 2;
  int64 total_tokens = 3;
}

message Cost {
  double amount = 1;
  string currency = 2;
}

message CheckQuotaRequest {
  string consumer_id = 1;
  string service_id = 2;
}

message QuotaStatus {
  int64 remaining = 1;
  int64 limit = 2;
  int64 reset_at = 3;
}
```

---

## 6. Integration Implementation

### 6.1 LLM-Registry Client

```go
// libs/common-go/clients/registry_client.go
package clients

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
)

type RegistryClient struct {
    baseURL    string
    httpClient *http.Client
    apiKey     string
}

type ServiceRegistration struct {
    Name         string                 `json:"name"`
    Version      string                 `json:"version"`
    ProviderID   string                 `json:"provider_id"`
    Capabilities []ServiceCapability    `json:"capabilities"`
    Metadata     map[string]interface{} `json:"metadata"`
}

type RegistryEntry struct {
    ID           string    `json:"id"`
    Name         string    `json:"name"`
    Version      string    `json:"version"`
    RegisteredAt time.Time `json:"registered_at"`
}

func (c *RegistryClient) RegisterService(
    ctx context.Context,
    registration ServiceRegistration,
) (*RegistryEntry, error) {

    body, err := json.Marshal(registration)
    if err != nil {
        return nil, fmt.Errorf("failed to marshal registration: %w", err)
    }

    req, err := http.NewRequestWithContext(
        ctx,
        "POST",
        fmt.Sprintf("%s/api/v1/services", c.baseURL),
        bytes.NewReader(body),
    )
    if err != nil {
        return nil, err
    }

    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-API-Key", c.apiKey)

    resp, err := c.httpClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("request failed: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusCreated {
        return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
    }

    var entry RegistryEntry
    if err := json.NewDecoder(resp.Body).Decode(&entry); err != nil {
        return nil, err
    }

    return &entry, nil
}
```

### 6.2 Policy Engine Client (gRPC)

```rust
// libs/common-rust/src/clients/policy_engine.rs
use tonic::{Request, Response, Status};
use crate::proto::policy_engine_client::PolicyEngineClient as GrpcClient;
use crate::proto::{ValidationRequest, ValidationResult};

pub struct PolicyEngineClient {
    client: GrpcClient<tonic::transport::Channel>,
}

impl PolicyEngineClient {
    pub async fn new(endpoint: String) -> Result<Self, Box<dyn std::error::Error>> {
        let client = GrpcClient::connect(endpoint).await?;
        Ok(Self { client })
    }

    pub async fn validate_service(
        &mut self,
        service_spec: &ServiceSpec,
    ) -> Result<ValidationResult, Status> {

        let request = Request::new(ValidationRequest {
            service_name: service_spec.name.clone(),
            service_version: service_spec.version.clone(),
            metadata: serde_json::to_string(&service_spec.metadata).unwrap(),
        });

        let response = self.client.validate_service(request).await?;
        Ok(response.into_inner())
    }
}
```

### 6.3 Analytics Hub Client (Kafka Producer)

```typescript
// libs/common-ts/src/clients/analytics-hub.client.ts
import { Kafka, Producer, ProducerRecord } from 'kafkajs';

export interface AnalyticsEvent {
  event_type: string;
  event_id: string;
  timestamp: Date;
  service_id: string;
  consumer_id?: string;
  data: Record<string, any>;
}

export class AnalyticsHubClient {
  private producer: Producer;
  private buffer: AnalyticsEvent[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor(private kafka: Kafka) {
    this.producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
    });

    // Flush buffer every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async track(event: AnalyticsEvent): Promise<void> {
    this.buffer.push(event);

    // Flush if buffer exceeds 1000 events
    if (this.buffer.length >= 1000) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    const messages = events.map(event => ({
      key: event.service_id,
      value: JSON.stringify(event),
      timestamp: event.timestamp.getTime().toString(),
    }));

    await this.producer.send({
      topic: 'marketplace.events',
      messages,
    });
  }

  async disconnect(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();
    await this.producer.disconnect();
  }
}
```

---

## 7. Testing Strategy

### 7.1 Unit Testing

**Go Example:**
```go
// internal/service/search_test.go
package service

import (
    "context"
    "testing"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
)

type MockESClient struct {
    mock.Mock
}

func (m *MockESClient) Search(query SearchQuery) (*SearchResults, error) {
    args := m.Called(query)
    return args.Get(0).(*SearchResults), args.Error(1)
}

func TestSearchService_Search(t *testing.T) {
    // Arrange
    mockES := new(MockESClient)
    service := &SearchService{
        esClient: mockES,
    }

    expectedResults := &SearchResults{
        Services: []Service{{ID: "123", Name: "Test Service"}},
        Total:    1,
    }

    mockES.On("Search", mock.Anything).Return(expectedResults, nil)

    // Act
    results, err := service.Search(context.Background(), SearchQuery{
        Query: "test",
    }, "user123")

    // Assert
    assert.NoError(t, err)
    assert.Equal(t, 1, len(results.Services))
    assert.Equal(t, "Test Service", results.Services[0].Name)
    mockES.AssertExpectations(t)
}
```

**TypeScript Example:**
```typescript
// src/services/__tests__/publishing.service.test.ts
import { PublishingService } from '../publishing.service';
import { RegistryClient } from '../../clients/registry.client';
import { PolicyEngineClient } from '../../clients/policy-engine.client';

describe('PublishingService', () => {
  let service: PublishingService;
  let mockRegistry: jest.Mocked<RegistryClient>;
  let mockPolicyEngine: jest.Mocked<PolicyEngineClient>;

  beforeEach(() => {
    mockRegistry = {
      registerService: jest.fn(),
    } as any;

    mockPolicyEngine = {
      validate: jest.fn(),
    } as any;

    service = new PublishingService(
      {} as any, // temporal client
      mockRegistry,
      mockPolicyEngine,
      {} as any, // validator
    );
  });

  it('should publish service successfully', async () => {
    // Arrange
    const spec = {
      name: 'Test Service',
      version: '1.0.0',
    };

    mockPolicyEngine.validate.mockResolvedValue({
      compliant: true,
      violations: [],
    });

    mockRegistry.registerService.mockResolvedValue({
      id: 'service-123',
    });

    // Act
    const result = await service.publishService(spec, 'provider-123');

    // Assert
    expect(result.success).toBe(true);
    expect(result.serviceId).toBe('service-123');
    expect(mockPolicyEngine.validate).toHaveBeenCalledWith(spec);
  });
});
```

### 7.2 Integration Testing

```typescript
// tests/integration/publishing-workflow.test.ts
import { TestEnvironment } from '../helpers/test-environment';
import { PublishingService } from '../../src/services/publishing.service';

describe('Publishing Workflow Integration', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.create();
    await env.start();
  });

  afterAll(async () => {
    await env.stop();
  });

  it('should complete full publishing workflow', async () => {
    // Arrange
    const serviceSpec = {
      name: 'Integration Test Service',
      version: '1.0.0',
      description: 'A test service',
      category: 'text-generation',
    };

    // Act
    const result = await env.publishingService.publishService(
      serviceSpec,
      'test-provider',
    );

    // Assert: Service registered in registry
    const registryEntry = await env.registryClient.getService(result.serviceId);
    expect(registryEntry).toBeDefined();
    expect(registryEntry.name).toBe(serviceSpec.name);

    // Assert: Service indexed in search
    const searchResults = await env.discoveryService.search({
      query: serviceSpec.name,
    }, 'test-user');
    expect(searchResults.services).toHaveLength(1);

    // Assert: Event published to Kafka
    const events = await env.kafka.consumeEvents('service.published', 1);
    expect(events[0].serviceId).toBe(result.serviceId);
  });
});
```

### 7.3 End-to-End Testing

```typescript
// tests/e2e/marketplace-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Marketplace E2E Flow', () => {
  test('should complete full marketplace journey', async ({ page, request }) => {
    // 1. Provider publishes service
    const publishResponse = await request.post('/api/v1/services', {
      headers: {
        'Authorization': `Bearer ${process.env.PROVIDER_TOKEN}`,
      },
      data: {
        name: 'E2E Test Service',
        version: '1.0.0',
        endpoint: 'https://test-service.example.com',
      },
    });
    expect(publishResponse.ok()).toBeTruthy();
    const { serviceId } = await publishResponse.json();

    // 2. Consumer searches for service
    await page.goto('/marketplace');
    await page.fill('[data-testid="search-input"]', 'E2E Test');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="search-results"]')).toContainText('E2E Test Service');

    // 3. Consumer provisions API key
    await page.click(`[data-testid="service-${serviceId}"]`);
    await page.click('[data-testid="get-access-button"]');

    const apiKey = await page.locator('[data-testid="api-key"]').textContent();
    expect(apiKey).toBeTruthy();

    // 4. Consumer invokes service
    const invokeResponse = await request.post(`/api/v1/services/${serviceId}/invoke`, {
      headers: {
        'X-API-Key': apiKey,
      },
      data: {
        input: { text: 'Hello, world!' },
      },
    });
    expect(invokeResponse.ok()).toBeTruthy();

    // 5. Verify usage tracking
    await page.goto('/dashboard/usage');
    await expect(page.locator('[data-testid="usage-table"]')).toContainText(serviceId);
  });
});
```

### 7.4 Performance Testing

```javascript
// tests/performance/search-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp up to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const API_KEY = __ENV.API_KEY;

export default function () {
  const payload = JSON.stringify({
    query: 'text generation',
    filters: {
      category: 'llm',
    },
    pagination: {
      offset: 0,
      limit: 20,
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };

  const response = http.post(`${BASE_URL}/api/v1/services/search`, payload, params);

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
    'has results': (r) => JSON.parse(r.body).services.length > 0,
  });

  errorRate.add(!success);

  sleep(1);
}
```

---

## 8. Deployment Guide

### 8.1 Kubernetes Deployment

**Discovery Service Deployment:**
```yaml
# infrastructure/kubernetes/base/discovery-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: discovery-service
  labels:
    app: discovery-service
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: discovery-service
  template:
    metadata:
      labels:
        app: discovery-service
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9091"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: discovery-service
      containers:
      - name: discovery
        image: registry.example.com/discovery-service:v1.0.0
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 9091
          name: metrics
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-credentials
              key: url
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: redis-config
              key: url
        - name: ELASTICSEARCH_URL
          valueFrom:
            configMapKeyRef:
              name: elasticsearch-config
              key: url
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
        securityContext:
          runAsNonRoot: true
          runAsUser: 1000
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
---
apiVersion: v1
kind: Service
metadata:
  name: discovery-service
spec:
  selector:
    app: discovery-service
  ports:
  - name: http
    port: 80
    targetPort: 8080
  - name: metrics
    port: 9091
    targetPort: 9091
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: discovery-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: discovery-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 8.2 CI/CD Pipeline

**GitHub Actions Workflow:**
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [discovery, publishing, consumption, admin]

    steps:
    - uses: actions/checkout@v4

    - name: Set up service dependencies
      run: docker-compose -f docker-compose.test.yml up -d

    - name: Run unit tests
      run: make test-unit SERVICE=${{ matrix.service }}

    - name: Run integration tests
      run: make test-integration SERVICE=${{ matrix.service }}

    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/${{ matrix.service }}.xml

  security-scan:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Run Snyk Security Scan
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
        format: 'sarif'
        output: 'trivy-results.sarif'

    - name: Upload Trivy results to GitHub Security
      uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: 'trivy-results.sarif'

  build:
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    if: github.event_name == 'push'

    steps:
    - uses: actions/checkout@v4

    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Build and push Docker images
      run: make docker-build-push VERSION=${{ github.sha }}

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment: staging

    steps:
    - uses: actions/checkout@v4

    - name: Configure kubectl
      uses: azure/k8s-set-context@v3
      with:
        kubeconfig: ${{ secrets.KUBECONFIG_STAGING }}

    - name: Deploy to staging
      run: |
        kubectl apply -k infrastructure/kubernetes/overlays/staging
        kubectl set image deployment/discovery-service \
          discovery=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/discovery:${{ github.sha }}

    - name: Run E2E tests
      run: make test-e2e ENV=staging

  deploy-production:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production

    steps:
    - uses: actions/checkout@v4

    - name: Configure kubectl
      uses: azure/k8s-set-context@v3
      with:
        kubeconfig: ${{ secrets.KUBECONFIG_PRODUCTION }}

    - name: Deploy to production (blue-green)
      run: |
        ./scripts/blue-green-deploy.sh ${{ github.sha }}

    - name: Verify deployment
      run: ./scripts/verify-deployment.sh

    - name: Rollback on failure
      if: failure()
      run: ./scripts/rollback.sh
```

---

## 9. Monitoring & Observability

### 9.1 Prometheus Metrics

**Go Service Metrics:**
```go
// internal/metrics/metrics.go
package metrics

import (
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promauto"
)

var (
    SearchRequestsTotal = promauto.NewCounterVec(
        prometheus.CounterOpts{
            Name: "marketplace_search_requests_total",
            Help: "Total number of search requests",
        },
        []string{"status"},
    )

    SearchDuration = promauto.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "marketplace_search_duration_seconds",
            Help:    "Search request duration in seconds",
            Buckets: prometheus.DefBuckets,
        },
        []string{"status"},
    )

    ActiveServices = promauto.NewGauge(
        prometheus.GaugeOpts{
            Name: "marketplace_active_services_total",
            Help: "Total number of active services",
        },
    )
)
```

### 9.2 Grafana Dashboards

**Dashboard JSON (excerpt):**
```json
{
  "dashboard": {
    "title": "LLM Marketplace Overview",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(marketplace_requests_total[5m])",
            "legendFormat": "{{service}}"
          }
        ],
        "type": "graph"
      },
      {
        "title": "P95 Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(marketplace_request_duration_seconds_bucket[5m]))",
            "legendFormat": "{{service}}"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(marketplace_requests_total{status=\"error\"}[5m]) / rate(marketplace_requests_total[5m])",
            "legendFormat": "{{service}}"
          }
        ],
        "type": "graph"
      }
    ]
  }
}
```

### 9.3 Alert Rules

**Prometheus Alert Rules:**
```yaml
# infrastructure/kubernetes/base/prometheus/alerts.yaml
groups:
- name: marketplace
  interval: 30s
  rules:
  - alert: HighErrorRate
    expr: |
      rate(marketplace_requests_total{status="error"}[5m])
      / rate(marketplace_requests_total[5m]) > 0.01
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value }}% for {{ $labels.service }}"

  - alert: HighLatency
    expr: |
      histogram_quantile(0.95,
        rate(marketplace_request_duration_seconds_bucket[5m])
      ) > 0.5
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "High latency detected"
      description: "P95 latency is {{ $value }}s for {{ $labels.service }}"

  - alert: ServiceDown
    expr: up{job="marketplace-services"} == 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Service is down"
      description: "{{ $labels.service }} has been down for 2 minutes"
```

---

## 10. Troubleshooting

### 10.1 Common Issues

**Issue: High search latency**
```bash
# Check Elasticsearch cluster health
curl http://elasticsearch:9200/_cluster/health

# Check slow queries
curl http://elasticsearch:9200/_nodes/stats/indices/search

# Check cache hit rate
redis-cli INFO stats | grep keyspace_hits
```

**Issue: Rate limiting false positives**
```bash
# Inspect Redis rate limit keys
redis-cli KEYS "ratelimit:*"

# Check specific consumer rate limit
redis-cli HGETALL "ratelimit:consumer-123:service-456"

# Reset rate limit (use cautiously)
redis-cli DEL "ratelimit:consumer-123:service-456"
```

**Issue: Kafka lag**
```bash
# Check consumer group lag
kafka-consumer-groups --bootstrap-server kafka:9092 \
  --describe --group marketplace-analytics

# Reset consumer group offset (if needed)
kafka-consumer-groups --bootstrap-server kafka:9092 \
  --group marketplace-analytics --reset-offsets --to-latest \
  --topic marketplace.events --execute
```

### 10.2 Debugging Workflows

**Enable Debug Logging:**
```bash
# Update ConfigMap
kubectl edit configmap discovery-service-config

# Set LOG_LEVEL=debug
# Restart pods
kubectl rollout restart deployment/discovery-service
```

**Trace Distributed Request:**
```bash
# Get trace ID from logs
kubectl logs -l app=discovery-service | grep "trace_id"

# View in Jaeger UI
open http://jaeger:16686/trace/<trace-id>
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-18
**Maintained By:** Development Team
**Next Review:** 2025-12-01

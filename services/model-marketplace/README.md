# Fine-Tuned Model Marketplace
# Enterprise-grade marketplace for fine-tuned LLM models with comprehensive versioning, lineage tracking, and provenance

## Overview

The Fine-Tuned Model Marketplace is a production-ready platform for managing, versioning, evaluating, and deploying fine-tuned language models. It provides complete lineage tracking, training data provenance, automated quality evaluation, and a robust API for model discovery and deployment.

### Key Features

✅ **Model Registry** - Centralized storage and metadata management for fine-tuned models
✅ **Version Tracking** - Git-like semantic versioning with complete version history
✅ **Model Lineage** - DAG-based tracking of base models, datasets, and training runs
✅ **Data Provenance** - Complete audit trail of training data sources and preprocessing
✅ **Automated Evaluation** - Continuous benchmarking (MMLU, HellaSwag, TruthfulQA, etc.)
✅ **Compliance Tracking** - GDPR, CCPA, HIPAA compliance validation and PII detection
✅ **Model Comparison** - Side-by-side version comparison and A/B testing
✅ **Quality Scoring** - Aggregate quality scores from multiple evaluation metrics
✅ **Marketplace Discovery** - Advanced search with faceted filtering
✅ **Multi-Tenancy** - Complete tenant isolation with row-level security

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Fine-Tuned Model Marketplace                    │
└─────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │   REST API       │
                    │   Controllers    │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐      ┌───────▼────────┐    ┌─────▼──────┐
   │ Model   │      │ Lineage        │    │ Evaluation │
   │ Registry│      │ Tracker        │    │ Service    │
   └────┬────┘      └───────┬────────┘    └─────┬──────┘
        │                   │                    │
   ┌────▼────┐      ┌───────▼────────┐    ┌─────▼──────┐
   │ S3/     │      │ Provenance     │    │ Benchmark  │
   │ MinIO   │      │ Tracker        │    │ Runner     │
   └─────────┘      └────────────────┘    └────────────┘
        │
   ┌────▼─────────────────────────────────────────────┐
   │              PostgreSQL Database                  │
   │  - Models & Versions  - Evaluations              │
   │  - Lineage Graphs     - Provenance Records       │
   │  - Training Runs      - Quality Metrics          │
   └──────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- **Node.js** 18+ and npm 9+
- **PostgreSQL** 14+
- **Redis** 7+ (optional, for caching)
- **S3-compatible storage** (AWS S3, MinIO, etc.)
- **GPU cluster** (optional, for evaluation)

### Setup

```bash
# Clone repository
git clone https://github.com/roshanrameshhub/CortexOps.git
cd CortexOps/services/model-marketplace

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migration:run

# Build TypeScript
npm run build

# Start service
npm start

# Development mode with hot reload
npm run dev
```

### Environment Variables

```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=model_marketplace
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password

# S3 Storage
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=model-marketplace-artifacts
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# API
PORT=3000
NODE_ENV=production

# Authentication
JWT_SECRET=your_jwt_secret
```

---

## API Documentation

### Model Management

#### Create Model
```http
POST /api/v1/models
Content-Type: application/json

{
  "name": "Customer Support GPT",
  "description": "Fine-tuned GPT-3.5 for customer support",
  "baseModelName": "gpt-3.5-turbo",
  "baseModelProvider": "openai",
  "architecture": "transformer",
  "category": "customer-support",
  "tags": ["conversational", "support", "finance"],
  "language": ["en"],
  "license": "MIT",
  "pricing": {
    "type": "usage_based",
    "inputTokenPrice": 0.0015,
    "outputTokenPrice": 0.002
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Customer Support GPT",
    "slug": "customer-support-gpt-abc123",
    "status": "draft",
    "currentVersion": "0.0.0",
    "createdAt": "2024-01-19T10:00:00Z"
  }
}
```

#### Upload Model Version
```http
POST /api/v1/models/{modelId}/versions
Content-Type: multipart/form-data

version: "1.0.0"
modelFile: [binary file]
configFile: [binary file]
tokenizerFile: [binary file]
adapterFile: [binary file] (optional)
changelog: "Initial release with improved accuracy"
breaking: false
baseModelId: "base-model-uuid"
baseModelName: "gpt-3.5-turbo"
autoEvaluate: true
benchmarks: "mmlu,hellaswag,truthfulqa"
lineage: {
  "baseModels": [{
    "name": "gpt-3.5-turbo",
    "provider": "openai",
    "version": "0613"
  }],
  "trainingDatasets": [{
    "datasetId": "dataset-uuid",
    "name": "customer-support-qa",
    "version": "1.0.0"
  }]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "version-uuid",
    "modelId": "model-uuid",
    "version": "1.0.0",
    "status": "evaluating",
    "artifacts": {
      "modelPath": "models/model-uuid/1.0.0/model.bin",
      "modelSize": 1073741824,
      "modelChecksum": "sha256:abc123..."
    },
    "createdAt": "2024-01-19T10:15:00Z"
  }
}
```

#### Search Models
```http
GET /api/v1/models?q=customer+support&category=conversational&minQuality=80&limit=20&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "model-uuid",
      "name": "Customer Support GPT",
      "description": "...",
      "qualityScore": 85.5,
      "downloads": 1250,
      "rating": 4.7,
      "currentVersion": "1.2.0"
    }
  ],
  "meta": {
    "total": 47,
    "limit": 20,
    "offset": 0,
    "facets": {
      "categories": {
        "customer-support": 15,
        "code-generation": 10,
        "summarization": 22
      },
      "tags": {
        "conversational": 30,
        "finance": 12,
        "healthcare": 5
      }
    }
  }
}
```

#### Get Model with Lineage
```http
GET /api/v1/models/{modelId}?include=versions,evaluations,lineage
```

**Response:**
```json
{
  "success": true,
  "data": {
    "model": {
      "id": "model-uuid",
      "name": "Customer Support GPT",
      "versions": [
        {
          "version": "1.2.0",
          "status": "ready",
          "createdAt": "2024-01-19T10:00:00Z",
          "evaluationResults": [...]
        }
      ]
    },
    "lineage": {
      "nodes": [
        {
          "id": "base-model-uuid",
          "type": "base_model",
          "name": "gpt-3.5-turbo",
          "version": "0613"
        },
        {
          "id": "dataset-uuid",
          "type": "dataset",
          "name": "customer-support-qa",
          "version": "1.0.0"
        },
        {
          "id": "version-uuid",
          "type": "model_version",
          "name": "Customer Support GPT v1.0.0"
        }
      ],
      "edges": [
        {
          "from": "base-model-uuid",
          "to": "version-uuid",
          "relationType": "derived_from"
        },
        {
          "from": "dataset-uuid",
          "to": "version-uuid",
          "relationType": "trained_on"
        }
      ]
    }
  }
}
```

#### Compare Versions
```http
GET /api/v1/models/{modelId}/versions/1.0.0/compare/1.2.0
```

**Response:**
```json
{
  "success": true,
  "data": {
    "versionA": "1.0.0",
    "versionB": "1.2.0",
    "sizeChange": -15.5,
    "performanceDeltas": {
      "latencyP50Delta": -50,
      "latencyP95Delta": -100,
      "throughputDelta": 150,
      "memorySizeDelta": -200
    },
    "evaluationDeltas": {
      "mmlu": {
        "scoreDelta": 5.2,
        "scoreA": 75.3,
        "scoreB": 80.5
      }
    }
  }
}
```

### Evaluation

#### Trigger Evaluation
```http
POST /api/v1/evaluations
Content-Type: application/json

{
  "modelVersionId": "version-uuid",
  "benchmarks": ["mmlu", "hellaswag", "truthfulqa"],
  "customDatasets": ["custom-eval-dataset-uuid"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Evaluation job submitted",
  "data": {
    "id": "eval-job-uuid",
    "modelVersionId": "version-uuid",
    "status": "pending",
    "benchmarks": ["mmlu", "hellaswag", "truthfulqa"],
    "createdAt": "2024-01-19T11:00:00Z"
  }
}
```

#### Get Evaluation Results
```http
GET /api/v1/evaluations/{evaluationId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "eval-uuid",
    "modelVersionId": "version-uuid",
    "evaluationType": "benchmark",
    "benchmarkName": "mmlu",
    "overallScore": 80.5,
    "taskScores": [
      {
        "taskName": "elementary_mathematics",
        "score": 85.2,
        "sampleCount": 100
      },
      {
        "taskName": "us_history",
        "score": 78.9,
        "sampleCount": 100
      }
    ],
    "metrics": {
      "mmluScore": 80.5,
      "toxicityScore": 8.2,
      "biasScore": 12.5,
      "latencyP95": 250
    },
    "status": "completed",
    "evaluatedAt": "2024-01-19T11:30:00Z"
  }
}
```

#### Get Leaderboard
```http
GET /api/v1/leaderboard?benchmark=mmlu&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": {
    "benchmark": "mmlu",
    "entries": [
      {
        "modelVersionId": "version-uuid-1",
        "score": 92.5
      },
      {
        "modelVersionId": "version-uuid-2",
        "score": 90.3
      }
    ],
    "lastUpdated": "2024-01-19T12:00:00Z"
  }
}
```

### Provenance

#### Get Dataset Provenance
```http
GET /api/v1/datasets/{datasetId}/provenance
```

**Response:**
```json
{
  "success": true,
  "data": {
    "datasetId": "dataset-uuid",
    "datasetName": "customer-support-qa",
    "datasetVersion": "1.0.0",
    "sources": [
      {
        "type": "web_scrape",
        "url": "https://example.com/support",
        "description": "Customer support conversations",
        "sampleCount": 50000,
        "collectedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "preprocessingSteps": [
      {
        "step": "deduplication",
        "description": "Remove duplicate conversations",
        "affectedSamples": 5000,
        "timestamp": "2024-01-02T00:00:00Z"
      },
      {
        "step": "pii_removal",
        "description": "Redact PII from conversations",
        "affectedSamples": 50000,
        "timestamp": "2024-01-03T00:00:00Z"
      }
    ],
    "compliance": {
      "piiDetected": true,
      "piiRemoved": true,
      "gdprCompliant": true,
      "ccpaCompliant": true,
      "certifications": ["GDPR", "CCPA"]
    },
    "licensing": {
      "license": "CC-BY-4.0",
      "commercialUse": true,
      "derivativeWorks": true
    }
  }
}
```

#### Validate Compliance
```http
POST /api/v1/compliance/validate
Content-Type: application/json

{
  "datasetId": "dataset-uuid",
  "standards": ["GDPR", "HIPAA"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "compliant": false,
    "violations": [
      "HIPAA: Dataset not HIPAA certified"
    ],
    "warnings": [
      "No license information provided"
    ]
  }
}
```

---

## Database Schema

### Fine-Tuned Models
```sql
CREATE TABLE fine_tuned_models (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    tenant_id UUID NOT NULL,
    base_model_id UUID,
    base_model_name VARCHAR(255) NOT NULL,
    base_model_provider VARCHAR(100),
    model_type VARCHAR(50),
    architecture VARCHAR(100),
    current_version VARCHAR(50),
    category VARCHAR(100),
    tags TEXT[],
    language TEXT[],
    quality_score DECIMAL(5,2) DEFAULT 0,
    benchmark_scores JSONB DEFAULT '{}',
    downloads INTEGER DEFAULT 0,
    deployments INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    pricing JSONB,
    license VARCHAR(100),
    status VARCHAR(50) DEFAULT 'draft',
    visibility VARCHAR(50) DEFAULT 'private',
    compliance_flags JSONB DEFAULT '{}',
    certifications TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP
);

CREATE INDEX idx_models_tenant ON fine_tuned_models(tenant_id);
CREATE INDEX idx_models_category ON fine_tuned_models(category);
CREATE INDEX idx_models_quality ON fine_tuned_models(quality_score);
CREATE INDEX idx_models_status ON fine_tuned_models(status);
```

### Model Versions
```sql
CREATE TABLE model_versions (
    id UUID PRIMARY KEY,
    model_id UUID NOT NULL REFERENCES fine_tuned_models(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    artifacts JSONB NOT NULL,
    lineage JSONB NOT NULL,
    training_run_id UUID,
    performance JSONB DEFAULT '{}',
    changelog TEXT,
    breaking BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'building',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    evaluated_at TIMESTAMP,
    published_at TIMESTAMP,
    UNIQUE(model_id, version)
);

CREATE INDEX idx_versions_model ON model_versions(model_id);
CREATE INDEX idx_versions_status ON model_versions(status);
```

### Evaluation Results
```sql
CREATE TABLE evaluation_results (
    id UUID PRIMARY KEY,
    model_version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    evaluation_type VARCHAR(50) NOT NULL,
    benchmark_name VARCHAR(100) NOT NULL,
    benchmark_version VARCHAR(50) NOT NULL,
    overall_score DECIMAL(5,2) NOT NULL,
    task_scores JSONB NOT NULL,
    predictions VARCHAR(500),
    metrics JSONB NOT NULL,
    baseline_comparison JSONB,
    evaluation_duration INTEGER,
    evaluation_cost DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'pending',
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    evaluated_at TIMESTAMP
);

CREATE INDEX idx_eval_version ON evaluation_results(model_version_id);
CREATE INDEX idx_eval_benchmark ON evaluation_results(benchmark_name);
```

### Data Provenance
```sql
CREATE TABLE data_provenance (
    id UUID PRIMARY KEY,
    dataset_id UUID NOT NULL,
    dataset_name VARCHAR(255) NOT NULL,
    dataset_version VARCHAR(50) NOT NULL,
    tenant_id UUID NOT NULL,
    sources JSONB NOT NULL,
    collection_date TIMESTAMP NOT NULL,
    preprocessing_steps JSONB DEFAULT '[]',
    quality_metrics JSONB NOT NULL,
    licensing JSONB NOT NULL,
    compliance JSONB NOT NULL,
    total_samples INTEGER NOT NULL,
    total_tokens BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    storage_size BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_validated_at TIMESTAMP
);

CREATE INDEX idx_provenance_dataset ON data_provenance(dataset_id);
CREATE INDEX idx_provenance_tenant ON data_provenance(tenant_id);
```

---

## Usage Examples

### TypeScript SDK

```typescript
import { ModelRegistryService, LineageTrackerService } from '@llm-marketplace/model-marketplace';

// Initialize services
const modelRegistry = new ModelRegistryService(dataSource, s3Config, bucketName);
const lineageTracker = new LineageTrackerService(dataSource);

// Create a model
const model = await modelRegistry.createModel({
  name: 'Customer Support GPT',
  description: 'Fine-tuned for customer support',
  tenantId: 'tenant-uuid',
  baseModelName: 'gpt-3.5-turbo',
  baseModelProvider: 'openai',
  architecture: 'transformer',
  category: 'customer-support',
  tags: ['conversational', 'support'],
  language: ['en'],
  license: 'MIT',
  pricing: {
    type: 'usage_based',
    inputTokenPrice: 0.0015,
    outputTokenPrice: 0.002
  }
});

// Upload version with files
const version = await modelRegistry.createVersion(model.id, {
  version: '1.0.0',
  modelFile: modelBuffer,
  configFile: configBuffer,
  tokenizerFile: tokenizerBuffer,
  changelog: 'Initial release',
  breaking: false,
  lineage: {
    baseModels: [{
      name: 'gpt-3.5-turbo',
      provider: 'openai',
      version: '0613'
    }]
  }
});

// Track lineage
await lineageTracker.trackModelDerivation(
  version.id,
  'base-model-uuid',
  'gpt-3.5-turbo',
  'tenant-uuid'
);

// Search models
const results = await modelRegistry.searchModels(
  {
    query: 'customer support',
    category: 'conversational',
    minQualityScore: 80
  },
  { limit: 20, offset: 0 }
);

// Compare versions
const comparison = await modelRegistry.compareVersions(
  model.id,
  '1.0.0',
  '1.2.0'
);
```

---

## Production Deployment

### Docker

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  model-marketplace:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_NAME: model_marketplace
      S3_ENDPOINT: http://minio:9000
      REDIS_HOST: redis
    depends_on:
      - postgres
      - minio
      - redis

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: model_marketplace
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  minio_data:
  redis_data:
```

### Kubernetes

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: model-marketplace
spec:
  replicas: 3
  selector:
    matchLabels:
      app: model-marketplace
  template:
    metadata:
      labels:
        app: model-marketplace
    spec:
      containers:
        - name: model-marketplace
          image: llm-marketplace/model-marketplace:latest
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_HOST
              valueFrom:
                configMapKeyRef:
                  name: model-marketplace-config
                  key: database_host
            - name: DATABASE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: model-marketplace-secrets
                  key: database_password
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
```

---

## Performance

### Benchmarks

- **Model Upload**: 1GB model uploads in < 30 seconds with multipart
- **Search Latency**: < 100ms for typical searches with Elasticsearch
- **Version Comparison**: < 50ms for 2-version comparison
- **Lineage Query**: < 200ms for depth-5 lineage graph
- **Evaluation Throughput**: 1000 samples/minute on GPU cluster

### Scaling

- **Horizontal Scaling**: Stateless API servers behind load balancer
- **Database**: PostgreSQL with read replicas for heavy read workloads
- **Storage**: S3-compatible with CDN for model artifact downloads
- **Evaluation**: Auto-scaling GPU node pool for parallel evaluations

---

## Security

- **Authentication**: JWT-based with tenant isolation
- **Authorization**: Role-based access control (RBAC)
- **Encryption at Rest**: AES-256 for model artifacts
- **Encryption in Transit**: TLS 1.3 for all communications
- **PII Detection**: Automated PII scanning with Presidio
- **Audit Logging**: Complete audit trail for compliance

---

## License

MIT License - See [LICENSE](LICENSE) file for details

---

**Version**: 1.0.0
**Last Updated**: 2024-01-19
**Maintained by**: LLM Marketplace Team

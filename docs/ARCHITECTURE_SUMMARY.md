# Architecture Summary

This document provides a quick reference to the LLM-Marketplace architecture documentation.

## Documentation Structure

```
llm-marketplace/
├── README.md                           # Project overview and quick start
├── ARCHITECTURE.md                     # Complete architecture specification
├── SECURITY.md                         # Security policy and best practices
├── LICENSE                             # Apache 2.0 license
│
├── docs/
│   ├── data-model.md                  # Database schemas and data structures
│   ├── api-reference.md               # REST and GraphQL API documentation
│   └── deployment-guide.md            # Deployment instructions for all environments
│
└── plans/                             # Project planning documents
    ├── EXECUTIVE_SUMMARY.md
    ├── SPARC-IMPLEMENTATION-ROADMAP.md
    └── TECHNICAL_IMPLEMENTATION_GUIDE.md
```

## Key Architecture Documents

### 1. ARCHITECTURE.md (Main Document)

**Sections:**
1. Executive Summary
2. System Overview
3. Data Model Design
4. Core Services Architecture
5. Technology Stack
6. API Specifications
7. Deployment Models
8. Security Architecture
9. Infrastructure & Operations
10. Development Roadmap

**Key Diagrams:**
- High-level system architecture
- Component interaction flow
- Service communication patterns
- Database entity relationships
- Deployment architecture (all models)

### 2. Data Model (docs/data-model.md)

**Contents:**
- Complete PostgreSQL schema
- Entity relationship diagrams
- Core entities (Asset, User, Organization, etc.)
- Security entities (Signatures, Scans, Vulnerabilities)
- Engagement entities (Ratings, Comments)
- Analytics entities (Downloads, Metrics)
- Query patterns and optimizations

**Key Tables:**
- `assets` - Core asset metadata
- `asset_versions` - Version history
- `users` - User accounts
- `organizations` - Team accounts
- `dependencies` - Dependency graph
- `ratings` - User reviews
- `scan_results` - Security scans
- `download_events` - Analytics

### 3. API Reference (docs/api-reference.md)

**Endpoints:**
- Authentication (`/auth/*`)
- Assets (`/assets/*`)
- Search (`/search`)
- Users (`/users/*`)
- Organizations (`/organizations/*`)
- Ratings (`/ratings/*`)
- Categories & Tags

**Features:**
- REST API specification
- GraphQL schema
- WebSocket protocol
- Error handling
- Rate limiting
- Pagination

### 4. Deployment Guide (docs/deployment-guide.md)

**Deployment Options:**
1. Local Development (Docker Compose)
2. Production (Docker Compose with Nginx)
3. Kubernetes (Helm charts)
4. Cloud (AWS EKS, GKE, AKS)
5. Self-hosted (single binary)

**Infrastructure:**
- Configuration examples
- Environment variables
- Secrets management
- Monitoring setup
- Backup strategies

### 5. Security (SECURITY.md)

**Coverage:**
- Vulnerability reporting process
- Threat model
- Security controls (auth, network, data, etc.)
- Asset security (signing, scanning)
- Compliance (GDPR, SOC 2, SLSA)
- Best practices
- Incident response

## Technology Stack Summary

### Backend (Rust)
```toml
[dependencies]
actix-web = "4.5"      # Web framework
sqlx = "0.7"           # Database (PostgreSQL)
redis = "0.24"         # Caching
meilisearch-sdk = "0.26" # Search
aws-sdk-s3 = "1.15"    # Object storage
async-nats = "0.33"    # Message queue
jsonwebtoken = "9.2"   # Authentication
ed25519-dalek = "2.1"  # Digital signatures
```

### Frontend (TypeScript/React)
```json
{
  "react": "^18.2.0",
  "@tanstack/react-query": "^5.17.0",
  "tailwindcss": "^3.4.1",
  "axios": "^1.6.5"
}
```

### Infrastructure
- PostgreSQL 15+ (primary database)
- Redis 7+ (caching, sessions)
- Meilisearch 1.5+ (search engine)
- MinIO/S3 (object storage)
- NATS (message queue)
- Prometheus + Grafana (monitoring)
- Kubernetes (orchestration)

## Core Service Architecture

```
Publishing Service (Rust)
├── Upload validation
├── Version management
├── Signature verification
└── Event publishing

Discovery Service (Rust)
├── Full-text search (Meilisearch)
├── Filtering & sorting
├── Trending algorithm
└── Category browsing

Retrieval Service (Rust)
├── Download handling
├── Dependency resolution
├── Version selection
└── CDN integration

Auth Service (Rust)
├── User registration/login
├── JWT token management
├── OAuth integration
├── API key management
└── RBAC/ABAC enforcement

Compliance Service (Rust)
├── Malware scanning (ClamAV)
├── Prompt injection detection
├── License validation
├── Vulnerability tracking
└── Content moderation
```

## Data Flow Examples

### Asset Publishing Flow

```
1. User uploads asset file + metadata
   ↓
2. Publishing service validates payload
   ↓
3. Store file to S3 (content-addressable)
   ↓
4. Calculate checksums (SHA-256)
   ↓
5. Store metadata in PostgreSQL
   ↓
6. Publish event: "asset.version.created"
   ↓
7. Compliance service picks up event
   ↓
8. Run security scans (async)
   ↓
9. Update scan results
   ↓
10. If passing, allow publication
   ↓
11. Index in Meilisearch
   ↓
12. Asset is now discoverable
```

### Asset Discovery Flow

```
1. User searches via web/CLI
   ↓
2. Discovery service queries Meilisearch
   ↓
3. Apply filters (category, license, rating)
   ↓
4. Sort by relevance/downloads/rating
   ↓
5. Fetch metadata from PostgreSQL
   ↓
6. Cache results in Redis
   ↓
7. Return paginated results
```

### Asset Download Flow

```
1. User requests download
   ↓
2. Check authentication/authorization
   ↓
3. Resolve dependencies (if any)
   ↓
4. Verify signatures
   ↓
5. Generate S3 signed URL
   ↓
6. Log download event (analytics)
   ↓
7. Increment download counter (Redis)
   ↓
8. Return download URL or stream file
```

## Security Layers

### 1. Network Security
- TLS 1.3 only
- HSTS headers
- CORS policy
- Rate limiting
- DDoS protection (Cloudflare)

### 2. Authentication Security
- Argon2id password hashing
- 2FA (TOTP, WebAuthn)
- JWT with RS256
- API key scoping
- Session management

### 3. Asset Security
- Ed25519 digital signatures
- Multi-scanner malware detection
- Prompt injection detection
- Content-addressed storage
- SHA-256 checksums

### 4. Data Security
- Encryption at rest (PostgreSQL pgcrypto)
- Encryption in transit (TLS)
- PII anonymization
- Audit logging
- GDPR compliance

## Deployment Architecture

### SaaS (Production)

```
Internet
   ↓
Cloudflare CDN
   ↓
Load Balancer (ALB)
   ↓
┌─────────────────────────────┐
│   Kubernetes Cluster        │
│  ┌──────────┐  ┌──────────┐ │
│  │API Pods  │  │Web Pods  │ │
│  │(3-20)    │  │(2-10)    │ │
│  └──────────┘  └──────────┘ │
│  ┌──────────┐  ┌──────────┐ │
│  │PostgreSQL│  │Redis     │ │
│  │(Primary +│  │(Cluster) │ │
│  │Replicas) │  └──────────┘ │
│  └──────────┘                │
│  ┌──────────┐  ┌──────────┐ │
│  │Meili-    │  │NATS      │ │
│  │search    │  │(Cluster) │ │
│  └──────────┘  └──────────┘ │
└─────────────────────────────┘
   ↓
S3 Storage (Assets)
```

### Self-Hosted (Docker Compose)

```
Host Machine
├── Nginx (reverse proxy)
├── API containers (3x)
├── Web container
├── PostgreSQL
├── Redis
├── Meilisearch
├── MinIO (S3-compatible)
└── NATS
```

### P2P (Decentralized)

```
┌──────────────────────┐
│  Distributed Hash    │
│  Table (Kademlia)    │
│  ┌────┐  ┌────┐     │
│  │Node│──│Node│ ... │
│  └────┘  └────┘     │
└──────────────────────┘
   Each node stores:
   - Local SQLite DB
   - Local file storage
   - Peer connections
```

## Development Roadmap

### Phase 1: MVP (Months 1-3)
Core CRUD, basic search, auth, web UI, CLI

### Phase 2: Enhanced Discovery (Months 4-6)
Advanced search, ratings, dependencies

### Phase 3: Security & Trust (Months 7-9)
Signatures, scanning, vulnerabilities, reputation

### Phase 4: Enterprise (Months 10-12)
Organizations, private registries, SSO, analytics

### Phase 5: Decentralization (Months 13-18)
P2P distribution, offline support

## Quick Reference

### Start Development Environment
```bash
docker-compose -f docker-compose.dev.yml up -d
```

### Run Tests
```bash
cargo test                    # Backend
npm test                      # Frontend
./scripts/integration-test.sh # Integration
```

### Deploy to Production
```bash
# Docker Compose
docker-compose up -d

# Kubernetes
helm install marketplace llm-marketplace/marketplace
```

### Access Services
- Web UI: http://localhost:3000
- API: http://localhost:8080
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- Meilisearch: http://localhost:7700
- MinIO Console: http://localhost:9001

### Monitoring
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001
- Jaeger: http://localhost:16686

## Additional Resources

- **Full Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **API Docs**: [docs/api-reference.md](docs/api-reference.md)
- **Data Model**: [docs/data-model.md](docs/data-model.md)
- **Deployment**: [docs/deployment-guide.md](docs/deployment-guide.md)
- **Security**: [SECURITY.md](SECURITY.md)
- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md)

---

**Version:** 1.0  
**Last Updated:** 2025-11-18  
**Maintained By:** System Architect

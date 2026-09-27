# LLM-Marketplace Architecture

**Version:** 1.0
**Last Updated:** 2025-11-18
**Status:** Design Document

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Data Model Design](#data-model-design)
4. [Core Services Architecture](#core-services-architecture)
5. [Technology Stack](#technology-stack)
6. [API Specifications](#api-specifications)
7. [Deployment Models](#deployment-models)
8. [Security Architecture](#security-architecture)
9. [Infrastructure & Operations](#infrastructure--operations)
10. [Development Roadmap](#development-roadmap)

---

## Executive Summary

LLM-Marketplace is a production-ready asset marketplace designed for the LLM DevOps ecosystem. It enables discovery, publishing, and consumption of reusable LLM assets including prompts, prompt templates, agent configurations, tools, workflows, datasets, and model adapters.

### Key Features

- **Multi-tenant Asset Registry**: Centralized repository with versioning and dependency management
- **Flexible Deployment**: SaaS, self-hosted, P2P, and hybrid modes
- **Trust & Security**: Digital signatures, malware scanning, vulnerability tracking
- **Discovery Engine**: Advanced search with semantic understanding
- **Integration Ready**: REST and GraphQL APIs, CLI tools, SDK libraries

### Design Principles

1. **Security First**: Every asset is signed, scanned, and verified
2. **Developer Experience**: Simple publishing, intuitive discovery
3. **Scalability**: Handle millions of assets and concurrent users
4. **Extensibility**: Plugin architecture for custom validators and scanners
5. **Interoperability**: Open standards, multiple deployment models

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
├─────────────┬──────────────┬──────────────┬────────────────────┤
│   Web UI    │   CLI Tool   │   SDK/API    │   IDE Extensions   │
│  (React)    │   (Rust)     │  (Multiple)  │   (VSCode, etc.)   │
└─────────────┴──────────────┴──────────────┴────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API Gateway Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  • Rate Limiting        • Authentication      • Request Routing │
│  • API Versioning       • TLS Termination     • Load Balancing  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Core Services Layer                        │
├──────────────┬──────────────┬──────────────┬──────────────────┤
│  Publishing  │  Discovery   │  Retrieval   │  Rating/Review   │
│   Service    │   Service    │   Service    │     Service      │
├──────────────┼──────────────┼──────────────┼──────────────────┤
│     Auth     │  Compliance  │  Dependency  │    Analytics     │
│   Service    │   Service    │   Service    │     Service      │
└──────────────┴──────────────┴──────────────┴──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Data & Storage Layer                        │
├──────────────┬──────────────┬──────────────┬──────────────────┤
│  PostgreSQL  │    Redis     │ Meilisearch  │   S3 Storage     │
│  (Metadata)  │  (Cache)     │   (Search)   │   (Assets)       │
└──────────────┴──────────────┴──────────────┴──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  • Message Queue (NATS/RabbitMQ)  • Monitoring (Prometheus)    │
│  • Distributed Tracing (Jaeger)   • Logging (Loki/ELK)         │
│  • Service Mesh (Linkerd)         • Container Orchestration    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
┌────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Client │──1──▶│   API    │──2──▶│  Auth    │──3──▶│Publishing│
│        │      │ Gateway  │      │ Service  │      │ Service  │
└────────┘      └──────────┘      └──────────┘      └──────────┘
                                                           │
                                                           │ 4
                                                           ▼
┌────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  S3    │◀─9──│ Retrieval│◀─8──│Discovery │◀─7──│Compliance│
│Storage │      │ Service  │      │ Service  │      │  Check   │
└────────┘      └──────────┘      └──────────┘      └──────────┘
                                        │                  ▲
                     ┌──────────────────┘                  │
                     │ 5                                   │ 6
                     ▼                                     │
              ┌──────────┐      ┌──────────┐      ┌──────────┐
              │PostgreSQL│      │  Redis   │      │Meilisearch│
              │          │──────│  Cache   │      │  Index   │
              └──────────┘      └──────────┘      └──────────┘

Flow: 1) Request → 2) Authenticate → 3) Publish Asset → 4) Validate
      5) Store Metadata → 6) Index for Search → 7) Policy Check
      8) Discover Assets → 9) Retrieve Asset
```

---

## Data Model Design

### Core Entities

#### 1. Asset Schema

```rust
// Core asset metadata structure
pub struct Asset {
    pub id: Uuid,                          // Unique identifier
    pub name: String,                      // Human-readable name
    pub slug: String,                      // URL-friendly identifier
    pub asset_type: AssetType,             // Type of asset
    pub version: SemanticVersion,          // SemVer version
    pub description: String,               // Rich text description
    pub readme: Option<String>,            // Markdown documentation

    // Contributor Information
    pub author_id: Uuid,                   // Primary author
    pub contributors: Vec<ContributorRef>, // Additional contributors
    pub organization_id: Option<Uuid>,     // Organization ownership

    // Content & Storage
    pub content_hash: String,              // SHA-256 of asset content
    pub storage_key: String,               // S3 object key
    pub size_bytes: i64,                   // File size
    pub checksum: String,                  // Integrity checksum

    // Metadata
    pub tags: Vec<String>,                 // Free-form tags
    pub categories: Vec<CategoryId>,       // Hierarchical categories
    pub license: LicenseType,              // License identifier
    pub metadata: serde_json::Value,       // Type-specific metadata

    // Dependencies
    pub dependencies: Vec<Dependency>,     // Required dependencies
    pub compatible_with: Vec<CompatibilityRule>, // Compatibility matrix

    // Security
    pub signature: DigitalSignature,       // Cryptographic signature
    pub scan_results: Vec<ScanResult>,     // Security scan results
    pub vulnerability_reports: Vec<VulnerabilityId>, // Known vulnerabilities

    // Engagement Metrics
    pub download_count: i64,
    pub rating_average: f32,
    pub rating_count: i64,
    pub view_count: i64,

    // Timestamps
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub published_at: Option<DateTime<Utc>>,
    pub deprecated_at: Option<DateTime<Utc>>,

    // Status
    pub status: AssetStatus,
    pub visibility: Visibility,
}

pub enum AssetType {
    Prompt,              // Single prompt
    PromptTemplate,      // Parameterized prompt template
    AgentConfig,         // Agent configuration
    Tool,                // LLM-callable tool
    Workflow,            // Multi-step workflow
    Dataset,             // Training/evaluation dataset
    ModelAdapter,        // LoRA, fine-tune adapter
    EvaluationSuite,     // Test suite
    Integration,         // Third-party integration
    Plugin,              // Marketplace plugin
}

pub enum AssetStatus {
    Draft,               // Not yet published
    UnderReview,         // Pending moderation
    Published,           // Available for use
    Deprecated,          // Deprecated, not recommended
    Archived,            // Hidden from search
    Suspended,           // Suspended due to policy violation
}

pub enum Visibility {
    Public,              // Anyone can access
    Unlisted,            // Only via direct link
    Private,             // Owner and collaborators only
    Organization,        // Organization members only
}
```

#### 2. Versioning Schema

```rust
pub struct AssetVersion {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub version: SemanticVersion,
    pub changelog: String,
    pub breaking_changes: Vec<String>,
    pub migration_guide: Option<String>,

    // Version-specific content
    pub content_hash: String,
    pub storage_key: String,

    // Dependencies for this version
    pub dependencies: Vec<Dependency>,

    // Version metadata
    pub released_at: DateTime<Utc>,
    pub yanked: bool,                    // Withdrawn from distribution
    pub yanked_reason: Option<String>,

    // Download stats per version
    pub download_count: i64,
}

pub struct SemanticVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub pre_release: Option<String>,
    pub build: Option<String>,
}

pub struct Dependency {
    pub asset_id: Uuid,
    pub version_requirement: VersionRequirement,
    pub optional: bool,
    pub features: Vec<String>,
}

pub enum VersionRequirement {
    Exact(SemanticVersion),
    GreaterThan(SemanticVersion),
    GreaterThanOrEqual(SemanticVersion),
    LessThan(SemanticVersion),
    LessThanOrEqual(SemanticVersion),
    Compatible(SemanticVersion),          // ^ in npm/cargo
    Range(SemanticVersion, SemanticVersion),
    Wildcard(WildcardPattern),
}
```

#### 3. Contributor & Reputation Schema

```rust
pub struct Contributor {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,

    // Profile
    pub website: Option<String>,
    pub github_handle: Option<String>,
    pub twitter_handle: Option<String>,

    // Reputation
    pub reputation_score: i64,
    pub badges: Vec<Badge>,
    pub verified: bool,

    // Activity
    pub assets_published: i64,
    pub total_downloads: i64,
    pub total_stars: i64,

    // Security
    pub public_keys: Vec<PublicKey>,      // For asset signing
    pub two_factor_enabled: bool,

    // Timestamps
    pub created_at: DateTime<Utc>,
    pub last_active_at: DateTime<Utc>,
}

pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub logo_url: Option<String>,
    pub website: Option<String>,

    // Members
    pub members: Vec<OrganizationMember>,
    pub teams: Vec<Team>,

    // Settings
    pub verified: bool,
    pub subscription_tier: SubscriptionTier,

    pub created_at: DateTime<Utc>,
}

pub struct OrganizationMember {
    pub user_id: Uuid,
    pub role: OrganizationRole,
    pub joined_at: DateTime<Utc>,
}

pub enum OrganizationRole {
    Owner,
    Admin,
    Member,
    Viewer,
}

pub struct ReputationEvent {
    pub id: Uuid,
    pub user_id: Uuid,
    pub event_type: ReputationEventType,
    pub points: i32,
    pub reason: String,
    pub created_at: DateTime<Utc>,
}

pub enum ReputationEventType {
    AssetPublished,
    AssetDownloaded,
    AssetStarred,
    PositiveReview,
    NegativeReview,
    SecurityViolation,
    QualityContribution,
    CommunityModeration,
}

pub struct Badge {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon_url: String,
    pub awarded_at: DateTime<Utc>,
}
```

#### 4. Category & Tag System

```rust
pub struct Category {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,         // Hierarchical structure
    pub icon: Option<String>,
    pub asset_count: i64,
    pub sort_order: i32,
}

pub struct Tag {
    pub id: Uuid,
    pub name: String,
    pub normalized_name: String,         // Lowercase, trimmed
    pub usage_count: i64,
    pub created_at: DateTime<Utc>,
}

// Pre-defined category hierarchy
// - AI Models
//   - Prompt Engineering
//     - System Prompts
//     - Few-Shot Examples
//     - Chain-of-Thought
//   - Agent Configurations
//     - Autonomous Agents
//     - Tool-Using Agents
//     - Multi-Agent Systems
// - Tools & Integrations
//   - Data Processing
//   - API Integrations
//   - File Operations
// - Workflows
//   - Data Pipelines
//   - Evaluation Workflows
//   - Deployment Automation
// - Datasets
//   - Training Data
//   - Evaluation Benchmarks
//   - Synthetic Data
```

#### 5. Digital Signatures & Security

```rust
pub struct DigitalSignature {
    pub algorithm: SignatureAlgorithm,
    pub public_key_id: String,           // Key identifier
    pub signature: Vec<u8>,              // Raw signature bytes
    pub signed_at: DateTime<Utc>,
    pub signer_id: Uuid,
}

pub enum SignatureAlgorithm {
    Ed25519,
    RSAPSS,
    ECDSA,
}

pub struct PublicKey {
    pub id: String,
    pub algorithm: SignatureAlgorithm,
    pub key_data: Vec<u8>,
    pub fingerprint: String,
    pub added_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

pub struct ScanResult {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub scanner: String,                 // Scanner name/version
    pub scan_type: ScanType,
    pub status: ScanStatus,
    pub findings: Vec<Finding>,
    pub scanned_at: DateTime<Utc>,
}

pub enum ScanType {
    Malware,
    VulnerabilityCheck,
    LicenseCompliance,
    CodeQuality,
    SecretsDetection,
    PromptInjection,                     // LLM-specific
}

pub enum ScanStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

pub struct Finding {
    pub severity: Severity,
    pub category: String,
    pub description: String,
    pub location: Option<String>,
    pub remediation: Option<String>,
}

pub enum Severity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

pub struct Vulnerability {
    pub id: String,                      // CVE or internal ID
    pub title: String,
    pub description: String,
    pub severity: Severity,
    pub affected_versions: Vec<VersionRange>,
    pub patched_versions: Vec<SemanticVersion>,
    pub published_at: DateTime<Utc>,
    pub references: Vec<String>,
}
```

#### 6. License Management

```rust
pub enum LicenseType {
    MIT,
    Apache20,
    GPL30,
    BSD3Clause,
    MPL20,
    CC0,
    CCBY40,
    CCBYSA40,
    Proprietary,
    Custom(String),                      // Custom license text
}

pub struct License {
    pub id: String,
    pub name: String,
    pub spdx_identifier: Option<String>,
    pub osi_approved: bool,
    pub full_text: String,
    pub url: Option<String>,

    // License characteristics
    pub allows_commercial_use: bool,
    pub allows_modifications: bool,
    pub allows_distribution: bool,
    pub requires_attribution: bool,
    pub requires_share_alike: bool,
}
```

#### 7. Rating & Review System

```rust
pub struct Rating {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub user_id: Uuid,
    pub version_id: Option<Uuid>,        // Rating for specific version
    pub score: i32,                      // 1-5 stars
    pub review: Option<String>,
    pub helpful_count: i64,
    pub unhelpful_count: i64,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct Comment {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub user_id: Uuid,
    pub parent_id: Option<Uuid>,         // For threaded comments
    pub content: String,
    pub upvotes: i64,
    pub downvotes: i64,

    pub created_at: DateTime<Utc>,
    pub edited_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}
```

#### 8. Analytics & Metrics

```rust
pub struct DownloadEvent {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub version_id: Uuid,
    pub user_id: Option<Uuid>,           // Anonymous if None
    pub ip_address: Option<String>,      // Hashed for privacy
    pub user_agent: String,
    pub downloaded_at: DateTime<Utc>,
}

pub struct AssetMetrics {
    pub asset_id: Uuid,
    pub period: MetricsPeriod,

    pub downloads: i64,
    pub unique_users: i64,
    pub views: i64,
    pub stars: i64,
    pub forks: i64,

    pub avg_rating: f32,
    pub rating_distribution: [i64; 5],   // Count per star rating

    pub growth_rate: f32,
    pub trending_score: f32,
}

pub enum MetricsPeriod {
    Daily,
    Weekly,
    Monthly,
    AllTime,
}
```

### Database Schema (PostgreSQL)

```sql
-- Users and Organizations
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    bio TEXT,
    website TEXT,
    github_handle VARCHAR(255),
    twitter_handle VARCHAR(255),
    reputation_score BIGINT DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT username_length CHECK (char_length(username) >= 3),
    CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_-]+$')
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_reputation ON users(reputation_score DESC);

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,
    website TEXT,
    verified BOOLEAN DEFAULT FALSE,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, user_id)
);

-- Assets
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    readme TEXT,

    author_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,

    license VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    visibility VARCHAR(50) DEFAULT 'public',

    download_count BIGINT DEFAULT 0,
    rating_average REAL DEFAULT 0.0,
    rating_count BIGINT DEFAULT 0,
    view_count BIGINT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    deprecated_at TIMESTAMPTZ,

    UNIQUE(author_id, slug),
    CONSTRAINT asset_name_length CHECK (char_length(name) >= 3),
    CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_assets_author ON assets(author_id);
CREATE INDEX idx_assets_org ON assets(organization_id);
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_published ON assets(published_at DESC);
CREATE INDEX idx_assets_downloads ON assets(download_count DESC);
CREATE INDEX idx_assets_rating ON assets(rating_average DESC);

-- Asset Versions
CREATE TABLE asset_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    changelog TEXT,

    content_hash VARCHAR(64) NOT NULL,
    storage_key TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL,

    yanked BOOLEAN DEFAULT FALSE,
    yanked_reason TEXT,

    download_count BIGINT DEFAULT 0,
    released_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(asset_id, version),
    CONSTRAINT version_semver CHECK (version ~ '^\d+\.\d+\.\d+')
);

CREATE INDEX idx_versions_asset ON asset_versions(asset_id);
CREATE INDEX idx_versions_released ON asset_versions(released_at DESC);

-- Dependencies
CREATE TABLE dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_version_id UUID REFERENCES asset_versions(id) ON DELETE CASCADE,
    target_asset_id UUID REFERENCES assets(id) ON DELETE RESTRICT,
    version_requirement VARCHAR(100) NOT NULL,
    optional BOOLEAN DEFAULT FALSE,

    UNIQUE(source_version_id, target_asset_id)
);

-- Categories and Tags
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    icon VARCHAR(255),
    asset_count BIGINT DEFAULT 0,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    normalized_name VARCHAR(100) UNIQUE NOT NULL,
    usage_count BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE asset_categories (
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, category_id)
);

CREATE TABLE asset_tags (
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, tag_id)
);

-- Security
CREATE TABLE public_keys (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    algorithm VARCHAR(50) NOT NULL,
    key_data BYTEA NOT NULL,
    fingerprint VARCHAR(255) UNIQUE NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE TABLE digital_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_version_id UUID REFERENCES asset_versions(id) ON DELETE CASCADE,
    algorithm VARCHAR(50) NOT NULL,
    public_key_id VARCHAR(255) REFERENCES public_keys(id),
    signature BYTEA NOT NULL,
    signed_at TIMESTAMPTZ DEFAULT NOW(),
    signer_id UUID REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE scan_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_version_id UUID REFERENCES asset_versions(id) ON DELETE CASCADE,
    scanner VARCHAR(255) NOT NULL,
    scan_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    findings JSONB,
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scan_results_version ON scan_results(asset_version_id);
CREATE INDEX idx_scan_results_type ON scan_results(scan_type);

CREATE TABLE vulnerabilities (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL,
    affected_versions JSONB NOT NULL,
    patched_versions JSONB,
    references JSONB,
    published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE asset_vulnerabilities (
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    vulnerability_id VARCHAR(255) REFERENCES vulnerabilities(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, vulnerability_id)
);

-- Ratings and Reviews
CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    version_id UUID REFERENCES asset_versions(id) ON DELETE SET NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    review TEXT,
    helpful_count BIGINT DEFAULT 0,
    unhelpful_count BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(asset_id, user_id)
);

CREATE INDEX idx_ratings_asset ON ratings(asset_id);
CREATE INDEX idx_ratings_user ON ratings(user_id);
CREATE INDEX idx_ratings_score ON ratings(score);

-- Analytics
CREATE TABLE download_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    version_id UUID REFERENCES asset_versions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_hash VARCHAR(64),
    user_agent TEXT,
    downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partition by time for efficient querying
CREATE INDEX idx_downloads_asset ON download_events(asset_id, downloaded_at DESC);
CREATE INDEX idx_downloads_version ON download_events(version_id, downloaded_at DESC);
CREATE INDEX idx_downloads_time ON download_events(downloaded_at DESC);

-- Materialized view for trending assets
CREATE MATERIALIZED VIEW trending_assets AS
SELECT
    a.id,
    a.name,
    a.slug,
    COUNT(DISTINCT de.id) AS downloads_7d,
    COUNT(DISTINCT r.id) AS ratings_7d,
    AVG(r.score) AS avg_rating_7d,
    (COUNT(DISTINCT de.id) * 2 + COUNT(DISTINCT r.id) * 5 + AVG(r.score) * 10) AS trending_score
FROM assets a
LEFT JOIN download_events de ON de.asset_id = a.id
    AND de.downloaded_at > NOW() - INTERVAL '7 days'
LEFT JOIN ratings r ON r.asset_id = a.id
    AND r.created_at > NOW() - INTERVAL '7 days'
WHERE a.status = 'published'
GROUP BY a.id, a.name, a.slug
ORDER BY trending_score DESC;

CREATE INDEX idx_trending_score ON trending_assets(trending_score DESC);
```

---

## Core Services Architecture

### Service Design Principles

- **Microservices**: Each service is independently deployable
- **Domain-Driven**: Services aligned with business domains
- **API-First**: Well-defined interfaces via REST and GraphQL
- **Event-Driven**: Asynchronous communication via message queue
- **Resilient**: Circuit breakers, retries, timeouts

### 1. Publishing Service

**Responsibilities:**
- Accept asset uploads
- Validate asset structure and metadata
- Trigger security scans
- Version management
- Publish/unpublish assets

**Technology Stack:**
- Rust with actix-web
- S3 client for storage
- PostgreSQL for metadata
- NATS for event publishing

**API Endpoints:**

```rust
// POST /api/v1/assets
// Create a new asset (draft state)
pub async fn create_asset(
    auth: AuthContext,
    payload: Json<CreateAssetRequest>,
) -> Result<Json<Asset>, ApiError>;

// POST /api/v1/assets/{asset_id}/versions
// Upload a new version
pub async fn create_version(
    auth: AuthContext,
    asset_id: Path<Uuid>,
    payload: Multipart,
) -> Result<Json<AssetVersion>, ApiError>;

// PUT /api/v1/assets/{asset_id}
// Update asset metadata
pub async fn update_asset(
    auth: AuthContext,
    asset_id: Path<Uuid>,
    payload: Json<UpdateAssetRequest>,
) -> Result<Json<Asset>, ApiError>;

// POST /api/v1/assets/{asset_id}/publish
// Publish asset (make publicly available)
pub async fn publish_asset(
    auth: AuthContext,
    asset_id: Path<Uuid>,
) -> Result<Json<Asset>, ApiError>;

// DELETE /api/v1/assets/{asset_id}
// Delete or archive asset
pub async fn delete_asset(
    auth: AuthContext,
    asset_id: Path<Uuid>,
) -> Result<HttpResponse, ApiError>;
```

**Workflow:**

```
1. User uploads asset file + metadata
2. Publishing service validates payload
3. Store file to S3 with content-addressable key
4. Calculate checksums (SHA-256)
5. Store metadata in PostgreSQL
6. Publish event: "asset.version.created"
7. Compliance service picks up event
8. Run security scans (async)
9. Update scan results
10. If passing, allow publication
```

### 2. Discovery Service

**Responsibilities:**
- Full-text and semantic search
- Browse by category/tag
- Filter by license, rating, etc.
- Autocomplete suggestions
- Trending/popular assets

**Technology Stack:**
- Rust with actix-web
- Meilisearch for search indexing
- Redis for caching
- PostgreSQL for complex queries

**API Endpoints:**

```rust
// GET /api/v1/search?q={query}&type={type}&category={cat}&license={lic}
pub async fn search_assets(
    query: Query<SearchParams>,
) -> Result<Json<SearchResults>, ApiError>;

// GET /api/v1/assets/trending
pub async fn get_trending_assets(
    query: Query<PaginationParams>,
) -> Result<Json<Vec<Asset>>, ApiError>;

// GET /api/v1/assets/{asset_id}
pub async fn get_asset_details(
    asset_id: Path<Uuid>,
) -> Result<Json<AssetDetail>, ApiError>;

// GET /api/v1/categories
pub async fn list_categories() -> Result<Json<Vec<Category>>, ApiError>;

// GET /api/v1/categories/{slug}/assets
pub async fn get_assets_by_category(
    slug: Path<String>,
    query: Query<PaginationParams>,
) -> Result<Json<Vec<Asset>>, ApiError>;
```

**Search Implementation:**

```rust
pub struct SearchParams {
    pub q: String,                       // Search query
    pub asset_type: Option<AssetType>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub license: Option<Vec<LicenseType>>,
    pub min_rating: Option<f32>,
    pub sort_by: Option<SortField>,
    pub page: Option<u32>,
    pub per_page: Option<u32>,
}

pub enum SortField {
    Relevance,
    Downloads,
    Rating,
    Recent,
    Trending,
}

// Meilisearch index configuration
pub fn configure_search_index() -> MeilisearchIndex {
    Index::new("assets")
        .searchable_attributes(&[
            "name",
            "description",
            "tags",
            "author_name",
            "readme",
        ])
        .filterable_attributes(&[
            "asset_type",
            "category",
            "license",
            "rating_average",
            "status",
        ])
        .ranking_rules(&[
            "words",
            "typo",
            "proximity",
            "attribute",
            "sort",
            "exactness",
            "download_count:desc",
            "rating_average:desc",
        ])
}
```

### 3. Retrieval Service

**Responsibilities:**
- Download assets
- Dependency resolution
- Version pinning
- Install/update workflows
- Offline caching

**Technology Stack:**
- Rust with actix-web
- S3 client
- Redis for download tokens
- PostgreSQL for version metadata

**API Endpoints:**

```rust
// GET /api/v1/assets/{asset_id}/versions/{version}/download
pub async fn download_asset_version(
    asset_id: Path<Uuid>,
    version: Path<String>,
    auth: Option<AuthContext>,
) -> Result<StreamResponse, ApiError>;

// POST /api/v1/resolve-dependencies
// Resolve dependency tree
pub async fn resolve_dependencies(
    payload: Json<DependencyResolutionRequest>,
) -> Result<Json<DependencyGraph>, ApiError>;

// GET /api/v1/assets/{asset_id}/versions
pub async fn list_asset_versions(
    asset_id: Path<Uuid>,
) -> Result<Json<Vec<AssetVersion>>, ApiError>;
```

**Dependency Resolution Algorithm:**

```rust
pub struct DependencyResolver {
    cache: HashMap<Uuid, Vec<AssetVersion>>,
}

impl DependencyResolver {
    // Resolve dependencies using topological sort
    pub async fn resolve(
        &self,
        root_asset: Uuid,
        version_req: VersionRequirement,
    ) -> Result<DependencyGraph, ResolverError> {
        let mut graph = DependencyGraph::new();
        let mut queue = VecDeque::new();
        let mut visited = HashSet::new();

        queue.push_back((root_asset, version_req));

        while let Some((asset_id, ver_req)) = queue.pop_front() {
            if visited.contains(&asset_id) {
                // Check for version conflicts
                continue;
            }

            let version = self.select_version(asset_id, ver_req).await?;
            graph.add_node(asset_id, version.clone());
            visited.insert(asset_id);

            for dep in &version.dependencies {
                graph.add_edge(asset_id, dep.asset_id);
                queue.push_back((dep.asset_id, dep.version_requirement.clone()));
            }
        }

        // Detect cycles
        if graph.has_cycle() {
            return Err(ResolverError::CircularDependency);
        }

        Ok(graph)
    }

    fn select_version(
        &self,
        asset_id: Uuid,
        requirement: VersionRequirement,
    ) -> Result<AssetVersion, ResolverError> {
        // Implement version selection strategy
        // Prefer: latest stable > latest compatible > any matching
    }
}
```

### 4. Rating & Review Service

**Responsibilities:**
- Submit ratings and reviews
- Moderate content
- Calculate aggregate ratings
- Helpful/unhelpful votes
- Report abuse

**Technology Stack:**
- Rust with actix-web
- PostgreSQL
- Redis for rate limiting

**API Endpoints:**

```rust
// POST /api/v1/assets/{asset_id}/ratings
pub async fn create_rating(
    auth: AuthContext,
    asset_id: Path<Uuid>,
    payload: Json<CreateRatingRequest>,
) -> Result<Json<Rating>, ApiError>;

// GET /api/v1/assets/{asset_id}/ratings
pub async fn list_ratings(
    asset_id: Path<Uuid>,
    query: Query<PaginationParams>,
) -> Result<Json<Vec<Rating>>, ApiError>;

// POST /api/v1/ratings/{rating_id}/helpful
pub async fn mark_helpful(
    auth: AuthContext,
    rating_id: Path<Uuid>,
) -> Result<HttpResponse, ApiError>;
```

### 5. Authentication & Authorization Service

**Responsibilities:**
- User registration and login
- JWT token issuance
- OAuth integration (GitHub, Google)
- API key management
- RBAC/ABAC enforcement

**Technology Stack:**
- Rust with actix-web
- PostgreSQL
- Redis for session storage
- JWT with RS256

**API Endpoints:**

```rust
// POST /api/v1/auth/register
pub async fn register(
    payload: Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, ApiError>;

// POST /api/v1/auth/login
pub async fn login(
    payload: Json<LoginRequest>,
) -> Result<Json<AuthResponse>, ApiError>;

// POST /api/v1/auth/refresh
pub async fn refresh_token(
    payload: Json<RefreshRequest>,
) -> Result<Json<AuthResponse>, ApiError>;

// GET /api/v1/auth/oauth/{provider}
pub async fn oauth_login(
    provider: Path<String>,
) -> Result<HttpResponse, ApiError>;

// POST /api/v1/api-keys
pub async fn create_api_key(
    auth: AuthContext,
    payload: Json<CreateApiKeyRequest>,
) -> Result<Json<ApiKey>, ApiError>;
```

**Authorization Model:**

```rust
pub struct Permission {
    pub resource: Resource,
    pub action: Action,
}

pub enum Resource {
    Asset(Uuid),
    Organization(Uuid),
    User(Uuid),
    Global,
}

pub enum Action {
    Read,
    Write,
    Delete,
    Publish,
    Moderate,
    Admin,
}

// ABAC policy evaluation
pub fn can_perform_action(
    user: &User,
    permission: &Permission,
) -> bool {
    match (&permission.resource, &permission.action) {
        (Resource::Asset(id), Action::Read) => {
            // Public assets are readable by anyone
            true
        }
        (Resource::Asset(id), Action::Write) => {
            // Only author or org members can modify
            user.id == get_asset_author(id) ||
            user.is_org_member(get_asset_org(id))
        }
        (Resource::Asset(id), Action::Publish) => {
            // Requires author and passing scans
            user.id == get_asset_author(id) &&
            asset_passed_scans(id)
        }
        // ... more rules
    }
}
```

### 6. Compliance & Policy Service

**Responsibilities:**
- Execute security scans
- License compliance checking
- Content moderation
- Policy enforcement
- Vulnerability tracking

**Technology Stack:**
- Rust with actix-web
- ClamAV for malware scanning
- Custom scanners for LLM-specific threats
- PostgreSQL for results

**Scanners:**

```rust
#[async_trait]
pub trait Scanner: Send + Sync {
    fn name(&self) -> &str;
    fn scan_type(&self) -> ScanType;
    async fn scan(&self, asset: &Asset) -> Result<ScanResult, ScanError>;
}

// Malware Scanner
pub struct MalwareScanner {
    clamav_client: ClamAvClient,
}

#[async_trait]
impl Scanner for MalwareScanner {
    fn name(&self) -> &str { "ClamAV" }
    fn scan_type(&self) -> ScanType { ScanType::Malware }

    async fn scan(&self, asset: &Asset) -> Result<ScanResult, ScanError> {
        let content = download_asset_content(asset).await?;
        let result = self.clamav_client.scan_bytes(&content).await?;

        Ok(ScanResult {
            scanner: self.name().to_string(),
            scan_type: self.scan_type(),
            status: if result.is_clean() {
                ScanStatus::Completed
            } else {
                ScanStatus::Failed
            },
            findings: result.threats.into_iter().map(|t| Finding {
                severity: Severity::Critical,
                category: "malware".to_string(),
                description: t.name,
                location: None,
                remediation: Some("Remove malicious code".to_string()),
            }).collect(),
            scanned_at: Utc::now(),
        })
    }
}

// Prompt Injection Scanner (LLM-specific)
pub struct PromptInjectionScanner {
    model: LLMSecurityModel,
}

#[async_trait]
impl Scanner for PromptInjectionScanner {
    fn name(&self) -> &str { "PromptGuard" }
    fn scan_type(&self) -> ScanType { ScanType::PromptInjection }

    async fn scan(&self, asset: &Asset) -> Result<ScanResult, ScanError> {
        // Analyze prompts for injection patterns
        let content = extract_prompt_content(asset).await?;
        let analysis = self.model.analyze(&content).await?;

        Ok(ScanResult {
            scanner: self.name().to_string(),
            scan_type: self.scan_type(),
            status: ScanStatus::Completed,
            findings: analysis.vulnerabilities.into_iter().map(|v| Finding {
                severity: v.severity,
                category: "prompt-injection".to_string(),
                description: v.description,
                location: Some(v.location),
                remediation: v.remediation,
            }).collect(),
            scanned_at: Utc::now(),
        })
    }
}

// Secrets Detection Scanner
pub struct SecretsScanner {
    patterns: Vec<SecretPattern>,
}

// License Compliance Scanner
pub struct LicenseScanner;

// Orchestrate all scanners
pub async fn scan_asset(asset_id: Uuid) -> Result<Vec<ScanResult>, ScanError> {
    let scanners: Vec<Box<dyn Scanner>> = vec![
        Box::new(MalwareScanner::new()),
        Box::new(PromptInjectionScanner::new()),
        Box::new(SecretsScanner::new()),
        Box::new(LicenseScanner::new()),
    ];

    let mut results = Vec::new();

    for scanner in scanners {
        let result = scanner.scan(&asset).await?;
        store_scan_result(&result).await?;
        results.push(result);
    }

    // Update asset status based on scan results
    if results.iter().any(|r| has_critical_findings(r)) {
        update_asset_status(asset_id, AssetStatus::Suspended).await?;
    }

    Ok(results)
}
```

### 7. Analytics Service

**Responsibilities:**
- Track downloads and views
- Generate usage reports
- Trending calculations
- User behavior analytics
- Revenue analytics (if applicable)

**Technology Stack:**
- Rust with actix-web
- PostgreSQL (time-series data)
- Redis for real-time counters
- Apache Kafka for event streaming

**Event Processing:**

```rust
pub struct AnalyticsEvent {
    pub event_type: EventType,
    pub timestamp: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub asset_id: Option<Uuid>,
    pub metadata: serde_json::Value,
}

pub enum EventType {
    AssetView,
    AssetDownload,
    SearchQuery,
    RatingSubmitted,
    UserSignup,
}

// Stream processing
pub async fn process_analytics_stream() {
    let consumer = KafkaConsumer::new("analytics-events");

    while let Ok(message) = consumer.recv().await {
        let event: AnalyticsEvent = serde_json::from_slice(&message.payload)?;

        match event.event_type {
            EventType::AssetDownload => {
                // Increment Redis counter
                increment_download_count(event.asset_id.unwrap()).await?;

                // Store to database (batched)
                batch_insert_download_event(&event).await?;

                // Update trending score
                update_trending_score(event.asset_id.unwrap()).await?;
            }
            // ... handle other events
        }
    }
}
```

### Service Communication

**Event-Driven Architecture:**

```rust
pub enum DomainEvent {
    // Publishing events
    AssetCreated { asset_id: Uuid },
    AssetVersionCreated { version_id: Uuid },
    AssetPublished { asset_id: Uuid },
    AssetDeprecated { asset_id: Uuid },

    // Security events
    ScanCompleted { asset_id: Uuid, results: Vec<ScanResult> },
    VulnerabilityDetected { asset_id: Uuid, vulnerability: Vulnerability },

    // User events
    UserRegistered { user_id: Uuid },
    RatingSubmitted { asset_id: Uuid, rating: Rating },

    // Analytics events
    AssetDownloaded { asset_id: Uuid, version_id: Uuid, user_id: Option<Uuid> },
    AssetViewed { asset_id: Uuid, user_id: Option<Uuid> },
}

pub struct EventBus {
    nats_client: nats::Client,
}

impl EventBus {
    pub async fn publish(&self, event: DomainEvent) -> Result<(), EventError> {
        let topic = event.topic();
        let payload = serde_json::to_vec(&event)?;
        self.nats_client.publish(&topic, payload).await?;
        Ok(())
    }

    pub async fn subscribe<F>(&self, topic: &str, handler: F)
    where
        F: Fn(DomainEvent) -> BoxFuture<'static, ()> + Send + Sync + 'static,
    {
        let mut sub = self.nats_client.subscribe(topic).await?;

        while let Some(msg) = sub.next().await {
            let event: DomainEvent = serde_json::from_slice(&msg.data)?;
            handler(event).await;
        }
    }
}
```

---

## Technology Stack

### Backend Services

#### Primary Language: Rust

**Rationale:**
- Performance: Near C++ performance, critical for high-throughput services
- Safety: Memory safety without GC, prevents entire classes of bugs
- Concurrency: Fearless concurrency with ownership system
- Ecosystem: Mature web frameworks and libraries
- Type Safety: Strong static typing catches errors at compile time

**Core Libraries:**

```toml
[dependencies]
# Web Framework
actix-web = "4.5"              # High-performance web framework
actix-rt = "2.9"               # Async runtime

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Database
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio-rustls", "uuid", "chrono"] }
diesel = { version = "2.1", features = ["postgres", "uuid", "chrono"] }
redis = { version = "0.24", features = ["tokio-comp", "connection-manager"] }

# Search
meilisearch-sdk = "0.26"
tantivy = "0.21"               # Alternative: embedded search

# Storage
aws-sdk-s3 = "1.15"
rusoto_s3 = "0.48"             # Alternative S3 client

# Authentication & Security
jsonwebtoken = "9.2"
argon2 = "0.5"                 # Password hashing
ed25519-dalek = "2.1"          # Digital signatures
x509-parser = "0.15"

# HTTP Client
reqwest = { version = "0.11", features = ["json"] }

# Message Queue
async-nats = "0.33"
lapin = "2.3"                  # RabbitMQ client

# Utilities
uuid = { version = "1.6", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
tokio = { version = "1.35", features = ["full"] }
futures = "0.3"
anyhow = "1.0"
thiserror = "1.0"

# Logging & Tracing
tracing = "0.1"
tracing-subscriber = "0.3"
tracing-opentelemetry = "0.22"
opentelemetry = "0.21"
opentelemetry-jaeger = "0.20"

# Configuration
config = "0.14"
dotenv = "0.15"

# Testing
mockall = "0.12"
rstest = "0.18"
```

### Frontend Application

#### Framework Options

**Option 1: React + TypeScript (Recommended)**

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",

    "@tanstack/react-query": "^5.17.0",
    "@tanstack/react-table": "^8.11.0",

    "axios": "^1.6.5",
    "zod": "^3.22.4",
    "zustand": "^4.4.7",

    "tailwindcss": "^3.4.1",
    "shadcn-ui": "latest",

    "monaco-editor": "^0.45.0",
    "react-markdown": "^9.0.1",
    "highlight.js": "^11.9.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "typescript": "^5.3.3",
    "vite": "^5.0.11",
    "vitest": "^1.2.0"
  }
}
```

**Option 2: Svelte + TypeScript**

```json
{
  "dependencies": {
    "svelte": "^4.2.8",
    "svelte-routing": "^2.11.0",
    "@sveltejs/kit": "^2.0.0"
  }
}
```

**Option 3: Vue 3 + TypeScript**

```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.5",
    "pinia": "^2.1.7"
  }
}
```

**Frontend Architecture:**

```
src/
├── components/
│   ├── asset/
│   │   ├── AssetCard.tsx
│   │   ├── AssetDetail.tsx
│   │   ├── AssetVersionList.tsx
│   │   └── DependencyGraph.tsx
│   ├── search/
│   │   ├── SearchBar.tsx
│   │   ├── SearchFilters.tsx
│   │   └── SearchResults.tsx
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   └── Spinner.tsx
│   └── layout/
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
├── pages/
│   ├── HomePage.tsx
│   ├── SearchPage.tsx
│   ├── AssetDetailPage.tsx
│   ├── PublishPage.tsx
│   ├── ProfilePage.tsx
│   └── DashboardPage.tsx
├── api/
│   ├── client.ts
│   ├── assets.ts
│   ├── auth.ts
│   └── search.ts
├── hooks/
│   ├── useAsset.ts
│   ├── useSearch.ts
│   └── useAuth.ts
├── store/
│   └── authStore.ts
├── types/
│   └── api.ts
└── utils/
    ├── validation.ts
    └── formatting.ts
```

### Database Layer

#### PostgreSQL (Primary Database)

**Version:** 15+

**Configuration:**

```sql
-- Performance tuning
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10485kB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Trigram matching for fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gin";    -- GIN indexes for better performance
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";  -- Query performance monitoring
```

#### Redis (Caching & Sessions)

**Version:** 7+

**Use Cases:**
- Session storage
- Rate limiting
- Real-time counters
- Cache layer (CDN-like)
- Pub/Sub for real-time features

**Configuration:**

```redis
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

#### Meilisearch (Search Engine)

**Version:** 1.5+

**Rationale:**
- Fast: Sub-50ms search response times
- Typo-tolerant: Handles misspellings
- Easy to use: Simple REST API
- Resource-efficient: Lower memory footprint than Elasticsearch
- Great DX: Excellent documentation

**Alternative: Tantivy (Embedded)**

If self-hosted deployment is critical, use Tantivy (Rust native search library) embedded directly in the application.

### Object Storage

**Primary: S3-Compatible Storage**

Options:
- AWS S3 (cloud)
- MinIO (self-hosted)
- Cloudflare R2 (zero egress fees)
- DigitalOcean Spaces

**Bucket Structure:**

```
llm-marketplace/
├── assets/
│   ├── {asset-id}/
│   │   └── {version}/
│   │       └── content.{ext}
├── avatars/
│   └── {user-id}.jpg
└── logos/
    └── {org-id}.png
```

**Content Addressing:**

```rust
pub fn generate_storage_key(
    asset_id: Uuid,
    version: &str,
    content_hash: &str,
) -> String {
    format!("assets/{}/{}/{}", asset_id, version, content_hash)
}
```

### Message Queue

**Primary: NATS**

**Rationale:**
- High performance (millions of messages/sec)
- Simple deployment
- Native clustering
- JetStream for persistence

**Alternative: RabbitMQ** (if more complex routing needed)

### Monitoring & Observability

**Metrics: Prometheus + Grafana**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'marketplace-api'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
```

**Distributed Tracing: Jaeger**

**Logging: Structured Logging with Loki**

```rust
use tracing::{info, instrument};

#[instrument]
pub async fn download_asset(asset_id: Uuid) -> Result<Vec<u8>, Error> {
    info!(asset_id = %asset_id, "Starting asset download");
    // ... implementation
}
```

### CLI Tool

**Language:** Rust

**Framework:** clap

```rust
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "llm-mp")]
#[command(about = "LLM Marketplace CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Search for assets
    Search {
        query: String,
        #[arg(short, long)]
        asset_type: Option<String>,
    },

    /// Install an asset
    Install {
        asset: String,
        #[arg(short, long)]
        version: Option<String>,
    },

    /// Publish a new asset
    Publish {
        #[arg(short, long)]
        manifest: String,
    },

    /// Login to the marketplace
    Login,

    /// Logout
    Logout,
}
```

---

## API Specifications

### REST API

**Base URL:** `https://api.llm-marketplace.dev/v1`

**Authentication:**

```http
Authorization: Bearer <JWT_TOKEN>
```

or

```http
X-API-Key: <API_KEY>
```

**Common Response Format:**

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2025-11-18T12:00:00Z",
    "request_id": "req_abc123"
  },
  "error": null
}
```

**Error Response:**

```json
{
  "error": {
    "code": "ASSET_NOT_FOUND",
    "message": "Asset with ID 'abc123' not found",
    "details": {},
    "request_id": "req_abc123"
  }
}
```

#### Core Endpoints

**Assets:**

```
GET    /assets                    # List assets (paginated)
POST   /assets                    # Create new asset
GET    /assets/{id}               # Get asset details
PUT    /assets/{id}               # Update asset
DELETE /assets/{id}               # Delete asset

GET    /assets/{id}/versions      # List versions
POST   /assets/{id}/versions      # Create new version
GET    /assets/{id}/versions/{v}  # Get specific version
POST   /assets/{id}/publish       # Publish asset
POST   /assets/{id}/deprecate     # Deprecate asset

GET    /assets/{id}/dependencies  # Get dependency tree
GET    /assets/{id}/dependents    # Get reverse dependencies
GET    /assets/{id}/stats         # Get statistics
```

**Search & Discovery:**

```
GET    /search                    # Full-text search
GET    /search/autocomplete       # Autocomplete suggestions
GET    /trending                  # Trending assets
GET    /popular                   # Most downloaded
GET    /new                       # Recently published
```

**Categories & Tags:**

```
GET    /categories                # List all categories
GET    /categories/{slug}/assets  # Assets in category
GET    /tags                      # List popular tags
GET    /tags/{name}/assets        # Assets with tag
```

**Ratings & Reviews:**

```
GET    /assets/{id}/ratings       # List ratings
POST   /assets/{id}/ratings       # Submit rating
PUT    /ratings/{id}              # Update rating
DELETE /ratings/{id}              # Delete rating
POST   /ratings/{id}/helpful      # Mark helpful
```

**Users & Organizations:**

```
GET    /users/{id}                # Get user profile
GET    /users/{id}/assets         # User's assets
GET    /users/{id}/stars          # Starred assets

GET    /organizations             # List organizations
GET    /organizations/{slug}      # Get organization
GET    /organizations/{slug}/assets  # Org assets
POST   /organizations             # Create organization
```

**Authentication:**

```
POST   /auth/register             # Register user
POST   /auth/login                # Login
POST   /auth/logout               # Logout
POST   /auth/refresh              # Refresh token
GET    /auth/oauth/{provider}     # OAuth redirect

GET    /me                        # Current user
PUT    /me                        # Update profile
GET    /me/api-keys               # List API keys
POST   /me/api-keys               # Create API key
DELETE /me/api-keys/{id}          # Revoke API key
```

### GraphQL API

**Endpoint:** `https://api.llm-marketplace.dev/graphql`

**Schema:**

```graphql
type Query {
  # Assets
  asset(id: ID!): Asset
  assets(
    filter: AssetFilter
    sort: AssetSort
    page: Int
    perPage: Int
  ): AssetConnection!

  searchAssets(
    query: String!
    filter: AssetFilter
  ): [Asset!]!

  # User
  user(id: ID!): User
  me: User

  # Organization
  organization(slug: String!): Organization

  # Categories
  categories: [Category!]!
  category(slug: String!): Category
}

type Mutation {
  # Publishing
  createAsset(input: CreateAssetInput!): Asset!
  updateAsset(id: ID!, input: UpdateAssetInput!): Asset!
  deleteAsset(id: ID!): Boolean!
  publishAsset(id: ID!): Asset!

  createVersion(
    assetId: ID!
    input: CreateVersionInput!
  ): AssetVersion!

  # Ratings
  submitRating(
    assetId: ID!
    score: Int!
    review: String
  ): Rating!

  # User actions
  starAsset(assetId: ID!): Boolean!
  unstarAsset(assetId: ID!): Boolean!
}

type Subscription {
  assetPublished(category: String): Asset!
  downloadCount(assetId: ID!): Int!
}

type Asset {
  id: ID!
  name: String!
  slug: String!
  type: AssetType!
  description: String!
  author: User!
  organization: Organization

  currentVersion: AssetVersion!
  versions(limit: Int): [AssetVersion!]!

  categories: [Category!]!
  tags: [String!]!
  license: License!

  stats: AssetStats!
  ratings(page: Int, perPage: Int): RatingConnection!
  dependencies: [Dependency!]!

  createdAt: DateTime!
  publishedAt: DateTime
  updatedAt: DateTime!
}

type AssetVersion {
  id: ID!
  version: String!
  changelog: String
  downloadUrl: String!
  size: Int!
  checksum: String!
  signature: DigitalSignature

  dependencies: [Dependency!]!
  scanResults: [ScanResult!]!

  releasedAt: DateTime!
  downloadCount: Int!
}

type User {
  id: ID!
  username: String!
  displayName: String
  avatarUrl: String
  bio: String

  reputationScore: Int!
  badges: [Badge!]!
  verified: Boolean!

  assets(page: Int, perPage: Int): AssetConnection!
  starredAssets: [Asset!]!

  createdAt: DateTime!
}

type AssetStats {
  downloadCount: Int!
  viewCount: Int!
  starCount: Int!
  ratingAverage: Float!
  ratingCount: Int!
  trendingScore: Float!
}

enum AssetType {
  PROMPT
  PROMPT_TEMPLATE
  AGENT_CONFIG
  TOOL
  WORKFLOW
  DATASET
  MODEL_ADAPTER
  EVALUATION_SUITE
  INTEGRATION
  PLUGIN
}

input AssetFilter {
  type: AssetType
  category: String
  tags: [String!]
  license: [String!]
  minRating: Float
}

enum AssetSort {
  RECENT
  DOWNLOADS
  RATING
  TRENDING
}
```

### WebSocket API (Real-time)

**Endpoint:** `wss://api.llm-marketplace.dev/ws`

**Use Cases:**
- Live download counts
- Real-time notifications
- Collaborative editing
- Live chat/comments

**Protocol:**

```json
// Client -> Server: Subscribe to asset updates
{
  "type": "subscribe",
  "topic": "asset:updates",
  "assetId": "abc-123"
}

// Server -> Client: Download event
{
  "type": "event",
  "topic": "asset:updates",
  "event": "download",
  "data": {
    "assetId": "abc-123",
    "downloadCount": 1542,
    "timestamp": "2025-11-18T12:30:00Z"
  }
}
```

---

## Deployment Models

### 1. Centralized SaaS (Primary)

**Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare CDN                       │
│              (Static assets, DNS, DDoS)                 │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Load Balancer (ALB)                    │
│            (TLS termination, routing)                   │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ API Server   │  │ API Server   │  │ API Server   │
│ (Container)  │  │ (Container)  │  │ (Container)  │
└──────────────┘  └──────────────┘  └──────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
        ┌─────────────────────────────────────┐
        │         Kubernetes Cluster          │
        │  ┌────────────┐  ┌───────────────┐  │
        │  │ PostgreSQL │  │ Redis Cluster │  │
        │  │  (Primary) │  │   (HA Mode)   │  │
        │  │     +      │  └───────────────┘  │
        │  │  Replicas  │                     │
        │  └────────────┘                     │
        │  ┌────────────┐  ┌───────────────┐  │
        │  │Meilisearch │  │  NATS Cluster │  │
        │  │  (Cluster) │  │               │  │
        │  └────────────┘  └───────────────┘  │
        └─────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │           S3 Storage                │
        │      (Asset files, backups)         │
        └─────────────────────────────────────┘
```

**Infrastructure as Code (Terraform):**

```hcl
# main.tf
provider "aws" {
  region = "us-east-1"
}

# EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "llm-marketplace"
  cluster_version = "1.28"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    main = {
      min_size     = 3
      max_size     = 10
      desired_size = 5

      instance_types = ["t3.large"]
      capacity_type  = "SPOT"
    }
  }
}

# RDS PostgreSQL
resource "aws_db_instance" "postgres" {
  identifier        = "llm-marketplace-db"
  engine            = "postgres"
  engine_version    = "15.4"
  instance_class    = "db.t3.large"
  allocated_storage = 100

  db_name  = "marketplace"
  username = var.db_username
  password = var.db_password

  multi_az               = true
  backup_retention_period = 7
  skip_final_snapshot    = false

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
}

# S3 Bucket
resource "aws_s3_bucket" "assets" {
  bucket = "llm-marketplace-assets"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    enabled = true

    noncurrent_version_expiration {
      days = 90
    }
  }
}

# CloudFront CDN
resource "aws_cloudfront_distribution" "assets_cdn" {
  origin {
    domain_name = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id   = "S3-Assets"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.assets.cloudfront_access_identity_path
    }
  }

  enabled = true

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-Assets"
    viewer_protocol_policy = "redirect-to-https"

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }
}
```

**Kubernetes Manifests:**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: marketplace-api
  namespace: marketplace
spec:
  replicas: 5
  selector:
    matchLabels:
      app: marketplace-api
  template:
    metadata:
      labels:
        app: marketplace-api
    spec:
      containers:
      - name: api
        image: llm-marketplace/api:latest
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: REDIS_URL
          value: redis://redis-cluster:6379
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
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
---
apiVersion: v1
kind: Service
metadata:
  name: marketplace-api
  namespace: marketplace
spec:
  selector:
    app: marketplace-api
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: marketplace-api-hpa
  namespace: marketplace
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: marketplace-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 2. Self-Hosted (On-Premise)

**Deployment Options:**

**Option A: Docker Compose (Development/Small Teams)**

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    image: llm-marketplace/api:latest
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgres://postgres:password@db:5432/marketplace
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: minioadmin
      S3_SECRET_KEY: minioadmin
    depends_on:
      - db
      - redis
      - minio
      - meilisearch

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: marketplace
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  meilisearch:
    image: getmeili/meilisearch:v1.5
    environment:
      MEILI_MASTER_KEY: masterKey123
    ports:
      - "7700:7700"
    volumes:
      - meili_data:/meili_data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

  nats:
    image: nats:latest
    ports:
      - "4222:4222"
      - "8222:8222"

  web:
    image: llm-marketplace/web:latest
    ports:
      - "3000:80"
    environment:
      API_URL: http://api:8080

volumes:
  postgres_data:
  redis_data:
  meili_data:
  minio_data:
```

**Option B: Kubernetes (Production On-Premise)**

Use Helm charts for easy deployment:

```bash
# Install with Helm
helm repo add llm-marketplace https://charts.llm-marketplace.dev
helm install marketplace llm-marketplace/marketplace \
  --set database.host=postgres.local \
  --set redis.host=redis.local \
  --set storage.endpoint=s3.local
```

**Option C: Single Binary (Lightweight)**

```bash
# All services embedded in one binary
./llm-marketplace serve \
  --port 8080 \
  --database-path ./data/marketplace.db \
  --storage-path ./data/assets \
  --admin-email admin@example.com
```

### 3. Peer-to-Peer (Decentralized)

**Architecture:**

```
┌──────────────────────────────────────────────────────┐
│              Distributed Hash Table (DHT)            │
│                  (Kademlia-based)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Node A  │──│  Node B  │──│  Node C  │  ...     │
│  └──────────┘  └──────────┘  └──────────┘          │
└──────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│Local Registry│  │Local Registry│  │Local Registry│
│  (SQLite)    │  │  (SQLite)    │  │  (SQLite)    │
└──────────────┘  └──────────────┘  └──────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Local Assets │  │ Local Assets │  │ Local Assets │
└──────────────┘  └──────────────┘  └──────────────┘
```

**Protocol:**

```rust
pub struct P2PNode {
    peer_id: PeerId,
    dht: KademliaDHT,
    local_db: SqlitePool,
    storage: PathBuf,
}

impl P2PNode {
    // Publish asset to network
    pub async fn publish_asset(&self, asset: Asset) -> Result<(), P2PError> {
        // 1. Store locally
        self.store_asset_locally(&asset).await?;

        // 2. Announce to DHT
        let key = asset.content_hash.clone();
        let record = DHTRecord {
            key: key.clone(),
            value: serde_json::to_vec(&asset)?,
            publisher: self.peer_id,
        };
        self.dht.put_record(record).await?;

        // 3. Replicate to closest peers
        let closest_peers = self.dht.get_closest_peers(&key, 20).await?;
        for peer in closest_peers {
            self.replicate_to_peer(peer, &asset).await?;
        }

        Ok(())
    }

    // Discover and download asset
    pub async fn fetch_asset(&self, content_hash: &str) -> Result<Asset, P2PError> {
        // 1. Check local cache
        if let Some(asset) = self.get_local_asset(content_hash).await? {
            return Ok(asset);
        }

        // 2. Query DHT for providers
        let providers = self.dht.find_providers(content_hash).await?;

        // 3. Download from fastest peer
        for peer in providers {
            if let Ok(asset) = self.download_from_peer(peer, content_hash).await {
                // 4. Cache locally
                self.store_asset_locally(&asset).await?;
                return Ok(asset);
            }
        }

        Err(P2PError::AssetNotFound)
    }
}
```

**Benefits:**
- No central point of failure
- Censorship-resistant
- Lower infrastructure costs
- Community-owned

**Challenges:**
- Consistency guarantees
- Moderation/governance
- Discovery performance
- NAT traversal

### 4. Hybrid Model (Recommended for Enterprise)

**Central registry + P2P distribution:**

```
┌────────────────────────────────────────────┐
│       Central Registry (Metadata)          │
│   - Asset metadata & discovery             │
│   - Authentication & authorization         │
│   - Reputation & reviews                   │
└────────────────────────────────────────────┘
                    │
                    │ (Metadata queries)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│  P2P     │  │  P2P     │  │  P2P     │
│  Node A  │──│  Node B  │──│  Node C  │
│(Content) │  │(Content) │  │(Content) │
└──────────┘  └──────────┘  └──────────┘
```

**Workflow:**

1. User searches via central registry (fast, indexed)
2. Discovers asset metadata (name, version, hash)
3. Downloads content from P2P network (distributed, fast)
4. Verifies signature against central registry public keys

---

## Security Architecture

### Threat Model

**Primary Threats:**

1. **Malicious Assets**: Malware, backdoors, data exfiltration
2. **Prompt Injection**: Malicious prompts that manipulate LLMs
3. **Supply Chain Attacks**: Compromised dependencies
4. **Account Takeover**: Credential theft, session hijacking
5. **Data Breaches**: Unauthorized access to user data
6. **DDoS Attacks**: Service disruption
7. **Reputation Manipulation**: Fake reviews, vote brigading

### Defense Layers

#### 1. Asset Security

**Digital Signatures:**

```rust
use ed25519_dalek::{Keypair, Signature, Signer, Verifier};

pub struct AssetSigner {
    keypair: Keypair,
}

impl AssetSigner {
    pub fn sign_asset(&self, asset: &Asset) -> Signature {
        let message = self.serialize_for_signing(asset);
        self.keypair.sign(&message)
    }

    fn serialize_for_signing(&self, asset: &Asset) -> Vec<u8> {
        // Canonical serialization
        let mut data = Vec::new();
        data.extend_from_slice(asset.id.as_bytes());
        data.extend_from_slice(asset.version.as_bytes());
        data.extend_from_slice(asset.content_hash.as_bytes());
        data
    }
}

pub struct AssetVerifier {
    trusted_keys: HashMap<String, PublicKey>,
}

impl AssetVerifier {
    pub fn verify_signature(
        &self,
        asset: &Asset,
        signature: &Signature,
        public_key_id: &str,
    ) -> Result<(), VerificationError> {
        let public_key = self.trusted_keys
            .get(public_key_id)
            .ok_or(VerificationError::UnknownKey)?;

        let message = AssetSigner::serialize_for_signing(asset);

        public_key.verify(&message, signature)
            .map_err(|_| VerificationError::InvalidSignature)?;

        Ok(())
    }
}
```

**Malware Scanning:**

```rust
// Integration with multiple scanners
pub async fn comprehensive_scan(asset: &Asset) -> Result<ScanReport, ScanError> {
    let scanners = vec![
        scan_with_clamav(asset),
        scan_with_virustotal(asset),
        scan_with_custom_rules(asset),
    ];

    let results = futures::future::join_all(scanners).await;

    ScanReport::aggregate(results)
}
```

**Sandboxed Execution:**

```rust
// Execute asset in isolated environment
pub async fn sandbox_test(asset: &Asset) -> Result<SandboxReport, Error> {
    let container = Docker::new().create_container(
        "ubuntu:latest",
        &[
            "--network=none",        // No network access
            "--memory=512m",         // Limited memory
            "--cpus=0.5",            // Limited CPU
            "--read-only",           // Read-only filesystem
        ],
    ).await?;

    let output = container.exec(&format!("run-asset {}", asset.id)).await?;

    SandboxReport {
        exit_code: output.status_code,
        stdout: output.stdout,
        stderr: output.stderr,
        resource_usage: output.resource_usage,
    }
}
```

#### 2. Authentication Security

**Password Hashing:**

```rust
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

pub fn hash_password(password: &str) -> Result<String, Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, Error> {
    let parsed_hash = PasswordHash::new(hash)?;
    let argon2 = Argon2::default();
    Ok(argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok())
}
```

**JWT with Rotation:**

```rust
use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};

pub struct TokenManager {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
}

#[derive(Serialize, Deserialize)]
pub struct Claims {
    sub: String,           // User ID
    exp: i64,              // Expiration
    iat: i64,              // Issued at
    jti: String,           // Token ID (for revocation)
    scope: Vec<String>,    // Permissions
}

impl TokenManager {
    pub fn generate_token(&self, user_id: Uuid, scope: Vec<String>) -> Result<String, Error> {
        let claims = Claims {
            sub: user_id.to_string(),
            exp: (Utc::now() + Duration::hours(1)).timestamp(),
            iat: Utc::now().timestamp(),
            jti: Uuid::new_v4().to_string(),
            scope,
        };

        encode(&Header::new(Algorithm::RS256), &claims, &self.encoding_key)
            .map_err(Into::into)
    }

    pub fn validate_token(&self, token: &str) -> Result<Claims, Error> {
        let validation = Validation::new(Algorithm::RS256);
        let token_data = decode::<Claims>(token, &self.decoding_key, &validation)?;

        // Check if token is revoked
        if self.is_token_revoked(&token_data.claims.jti) {
            return Err(Error::TokenRevoked);
        }

        Ok(token_data.claims)
    }
}
```

**Rate Limiting:**

```rust
use actix_web::middleware::RateLimiter;

pub struct RateLimitConfig {
    pub max_requests: u32,
    pub window_secs: u32,
}

// Apply different limits per endpoint
pub fn configure_rate_limits() -> Vec<RateLimitConfig> {
    vec![
        // Authentication endpoints
        RateLimitConfig {
            path: "/auth/login",
            max_requests: 5,
            window_secs: 60,
        },
        // Search endpoints
        RateLimitConfig {
            path: "/search",
            max_requests: 100,
            window_secs: 60,
        },
        // Download endpoints
        RateLimitConfig {
            path: "/assets/:id/download",
            max_requests: 50,
            window_secs: 60,
        },
    ]
}
```

#### 3. Network Security

**TLS Configuration:**

```rust
use actix_web::{HttpServer, web};
use rustls::{ServerConfig, NoClientAuth};

pub fn create_tls_config() -> ServerConfig {
    let cert_file = File::open("cert.pem")?;
    let key_file = File::open("key.pem")?;

    let certs = rustls_pemfile::certs(&mut BufReader::new(cert_file))?;
    let keys = rustls_pemfile::pkcs8_private_keys(&mut BufReader::new(key_file))?;

    let mut config = ServerConfig::new(NoClientAuth::new());
    config.set_single_cert(certs, keys[0].clone())?;

    // Enable TLS 1.3 only
    config.versions = vec![ProtocolVersion::TLSv1_3];

    config
}
```

**CORS Policy:**

```rust
use actix_cors::Cors;

pub fn configure_cors() -> Cors {
    Cors::default()
        .allowed_origin("https://llm-marketplace.dev")
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
        ])
        .max_age(3600)
}
```

**CSP Headers:**

```http
Content-Security-Policy:
    default-src 'self';
    script-src 'self' 'unsafe-inline' https://cdn.llm-marketplace.dev;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    connect-src 'self' https://api.llm-marketplace.dev;
    frame-ancestors 'none';
```

#### 4. Data Protection

**Encryption at Rest:**

```rust
// Database-level encryption
CREATE EXTENSION pgcrypto;

-- Encrypt sensitive columns
CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(255),
    email VARCHAR(255),
    encrypted_data BYTEA  -- Encrypted with pgp_sym_encrypt
);

INSERT INTO users (id, username, email, encrypted_data)
VALUES (
    gen_random_uuid(),
    'alice',
    'alice@example.com',
    pgp_sym_encrypt('sensitive data', 'encryption_key')
);
```

**Encryption in Transit:**

All communication over TLS 1.3+

**PII Handling:**

```rust
// Anonymize IP addresses
pub fn anonymize_ip(ip: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(ip);
    hasher.update(SECRET_SALT);
    format!("{:x}", hasher.finalize())
}

// Redact sensitive data from logs
pub fn redact_sensitive(log: &str) -> String {
    log.replace_regex(r"Bearer \S+", "Bearer [REDACTED]")
       .replace_regex(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", "[EMAIL REDACTED]")
}
```

#### 5. Audit Logging

```rust
pub struct AuditLog {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub ip_address: String,
    pub action: AuditAction,
    pub resource: String,
    pub status: ActionStatus,
    pub metadata: serde_json::Value,
}

pub enum AuditAction {
    Login,
    Logout,
    AssetPublish,
    AssetDelete,
    PermissionChange,
    DataExport,
    AdminAction,
}

// Log all sensitive operations
pub async fn log_audit_event(event: AuditLog) {
    // Store to immutable append-only log
    // Send to SIEM system
    // Trigger alerts for suspicious patterns
}
```

### Compliance

**GDPR:**
- Data export functionality
- Right to deletion
- Consent management
- Privacy policy

**SOC 2:**
- Access controls
- Encryption
- Monitoring
- Incident response

**Supply Chain Security (SLSA):**
- Build provenance
- Signed artifacts
- Reproducible builds

---

## Infrastructure & Operations

### Observability Stack

**Metrics Collection:**

```rust
use prometheus::{Registry, Counter, Histogram, Gauge};

lazy_static! {
    static ref HTTP_REQUESTS: Counter = Counter::new(
        "http_requests_total",
        "Total HTTP requests"
    ).unwrap();

    static ref HTTP_DURATION: Histogram = Histogram::new(
        "http_request_duration_seconds",
        "HTTP request duration"
    ).unwrap();

    static ref ACTIVE_DOWNLOADS: Gauge = Gauge::new(
        "active_downloads",
        "Number of active downloads"
    ).unwrap();
}

pub fn record_request(duration: f64) {
    HTTP_REQUESTS.inc();
    HTTP_DURATION.observe(duration);
}
```

**Distributed Tracing:**

```rust
use opentelemetry::trace::{Tracer, Span};
use tracing_opentelemetry::OpenTelemetrySpanExt;

#[tracing::instrument]
pub async fn download_asset(asset_id: Uuid) -> Result<Vec<u8>, Error> {
    let span = tracing::Span::current();
    span.record("asset.id", &asset_id.to_string());

    // Fetch from database
    let asset = fetch_asset_metadata(asset_id).await?;
    span.record("asset.size", &asset.size_bytes);

    // Download from S3
    let content = fetch_from_storage(&asset.storage_key).await?;
    span.record("download.bytes", content.len());

    Ok(content)
}
```

**Alerting Rules:**

```yaml
# prometheus-alerts.yml
groups:
  - name: marketplace
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}%"

      - alert: SlowResponseTime
        expr: |
          histogram_quantile(0.95, http_request_duration_seconds) > 1.0
        for: 10m
        annotations:
          summary: "95th percentile response time > 1s"

      - alert: DatabaseConnectionPoolExhausted
        expr: |
          db_connection_pool_active / db_connection_pool_max > 0.9
        for: 5m
        annotations:
          summary: "Database connection pool nearly exhausted"
```

### Backup & Disaster Recovery

**Database Backups:**

```bash
#!/bin/bash
# Daily backup script

BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/marketplace_$TIMESTAMP.sql.gz"

# Dump database
pg_dump -h $DB_HOST -U $DB_USER marketplace | gzip > $BACKUP_FILE

# Upload to S3
aws s3 cp $BACKUP_FILE s3://backups/postgres/

# Retain last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

**Disaster Recovery Plan:**

```
RTO (Recovery Time Objective): 4 hours
RPO (Recovery Point Objective): 1 hour

Recovery Steps:
1. Provision new infrastructure (Terraform)
2. Restore database from latest backup
3. Restore object storage from replica
4. Update DNS to point to new infrastructure
5. Verify data integrity
6. Resume operations
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Run tests
        run: cargo test --all

      - name: Run security audit
        run: cargo audit

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: |
          docker build -t llm-marketplace/api:${{ github.sha }} .

      - name: Scan image for vulnerabilities
        run: |
          trivy image llm-marketplace/api:${{ github.sha }}

      - name: Push to registry
        run: |
          docker push llm-marketplace/api:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/marketplace-api \
            api=llm-marketplace/api:${{ github.sha }}

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/marketplace-api

      - name: Run smoke tests
        run: |
          ./scripts/smoke-test.sh
```

---

## Development Roadmap

### Phase 1: MVP (Months 1-3)

**Core Features:**
- [ ] Basic asset CRUD operations
- [ ] Simple search (PostgreSQL full-text)
- [ ] User authentication (JWT)
- [ ] File upload to S3
- [ ] Basic web UI (React)
- [ ] CLI tool (search, install)

**Infrastructure:**
- [ ] PostgreSQL setup
- [ ] Redis for sessions
- [ ] S3 storage
- [ ] Docker Compose deployment

### Phase 2: Enhanced Discovery (Months 4-6)

**Features:**
- [ ] Advanced search (Meilisearch)
- [ ] Categories and tags
- [ ] Ratings and reviews
- [ ] Trending algorithm
- [ ] Dependency resolution
- [ ] Version management

**Infrastructure:**
- [ ] Meilisearch cluster
- [ ] NATS message queue
- [ ] Kubernetes deployment

### Phase 3: Security & Trust (Months 7-9)

**Features:**
- [ ] Digital signatures
- [ ] Malware scanning
- [ ] Prompt injection detection
- [ ] Vulnerability tracking
- [ ] Reputation system
- [ ] Content moderation

**Infrastructure:**
- [ ] Security scanning pipeline
- [ ] Audit logging system
- [ ] Monitoring & alerting

### Phase 4: Enterprise Features (Months 10-12)

**Features:**
- [ ] Organizations
- [ ] Private registries
- [ ] SSO integration
- [ ] Usage analytics
- [ ] API rate limiting
- [ ] SLA guarantees

**Infrastructure:**
- [ ] Multi-region deployment
- [ ] CDN integration
- [ ] High availability setup

### Phase 5: Decentralization (Months 13-18)

**Features:**
- [ ] P2P distribution
- [ ] Blockchain integration (optional)
- [ ] Decentralized governance
- [ ] Offline-first support

**Infrastructure:**
- [ ] DHT implementation
- [ ] P2P protocol
- [ ] Hybrid architecture

---

## Conclusion

This architecture provides a comprehensive, production-ready foundation for the LLM-Marketplace. The design prioritizes:

1. **Security**: Multi-layered security with signing, scanning, and verification
2. **Scalability**: Microservices architecture that scales horizontally
3. **Flexibility**: Multiple deployment models (SaaS, self-hosted, P2P)
4. **Developer Experience**: Rich APIs, CLI tools, and comprehensive documentation
5. **Trust**: Reputation systems, moderation, and transparency

### Next Steps

1. **Set up development environment** (Docker Compose)
2. **Implement core data models** (PostgreSQL schema)
3. **Build Publishing Service** (asset upload, validation)
4. **Develop Discovery Service** (search, browse)
5. **Create basic web UI** (React frontend)
6. **Deploy MVP** (single-node Kubernetes)

### Additional Resources

- [API Documentation](./docs/api/)
- [CLI Guide](./docs/cli/)
- [Deployment Guide](./docs/deployment/)
- [Security Policy](./SECURITY.md)
- [Contributing Guide](./CONTRIBUTING.md)

---

**Document Prepared By:** System Architect
**Review Status:** Draft v1.0
**Approval Required:** Engineering Lead, Security Team, Product Owner

# Data Model Reference

This document provides detailed reference for the LLM-Marketplace data model.

## Entity Relationship Diagram

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│    User     │────1:N──│    Asset     │────1:N──│AssetVersion │
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                        │
      │                        │                        │
      │ 1:N                    │ 1:N                    │ 1:N
      │                        │                        │
      ▼                        ▼                        ▼
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ PublicKey   │         │    Rating    │         │ Dependency  │
└─────────────┘         └──────────────┘         └─────────────┘
                               │
                               │ 1:N
                               ▼
                        ┌──────────────┐
                        │   Comment    │
                        └──────────────┘

┌─────────────┐         ┌──────────────┐
│Organization │────1:N──│    Asset     │
└─────────────┘         └──────────────┘
      │
      │ N:M
      ▼
┌─────────────┐
│    User     │
└─────────────┘

┌─────────────┐         ┌──────────────┐
│  Category   │────N:M──│    Asset     │
└─────────────┘         └──────────────┘
      │
      │ Tree
      ▼
┌─────────────┐
│  Category   │
│  (parent)   │
└─────────────┘

┌─────────────┐         ┌──────────────┐
│    Tag      │────N:M──│    Asset     │
└─────────────┘         └──────────────┘
```

## Core Entities

### Asset

The central entity representing a publishable asset in the marketplace.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| name | String(255) | No | Display name |
| slug | String(255) | No | URL-friendly identifier |
| asset_type | AssetType | No | Type of asset |
| description | Text | No | Markdown description |
| readme | Text | Yes | Extended documentation |
| author_id | UUID | No | Foreign key to users |
| organization_id | UUID | Yes | Foreign key to organizations |
| license | LicenseType | No | License identifier |
| status | AssetStatus | No | Publication status |
| visibility | Visibility | No | Access control level |
| download_count | BigInt | No | Total downloads |
| rating_average | Real | No | Average rating (0-5) |
| rating_count | BigInt | No | Number of ratings |
| view_count | BigInt | No | Page views |
| created_at | Timestamp | No | Creation time |
| updated_at | Timestamp | No | Last update time |
| published_at | Timestamp | Yes | Publication time |
| deprecated_at | Timestamp | Yes | Deprecation time |

**Indexes:**

- Primary: `id`
- Unique: `(author_id, slug)`
- Index: `author_id`, `organization_id`, `asset_type`, `status`, `published_at DESC`, `download_count DESC`, `rating_average DESC`

**Constraints:**

- `name` length >= 3 characters
- `slug` format: `^[a-z0-9-]+$`
- Foreign keys: `author_id → users(id)`, `organization_id → organizations(id)`

### AssetVersion

Represents a specific version of an asset with immutable content.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| asset_id | UUID | No | Foreign key to assets |
| version | String(50) | No | Semantic version |
| changelog | Text | Yes | Release notes |
| content_hash | String(64) | No | SHA-256 hash |
| storage_key | Text | No | S3 object key |
| size_bytes | BigInt | No | File size in bytes |
| checksum | String(64) | No | Integrity checksum |
| yanked | Boolean | No | Withdrawn flag |
| yanked_reason | Text | Yes | Reason for yanking |
| download_count | BigInt | No | Version downloads |
| released_at | Timestamp | No | Release timestamp |

**Indexes:**

- Primary: `id`
- Unique: `(asset_id, version)`
- Index: `asset_id`, `released_at DESC`

**Constraints:**

- `version` format: `^\d+\.\d+\.\d+` (semantic versioning)
- Foreign key: `asset_id → assets(id)` ON DELETE CASCADE

### User

Represents a contributor or consumer in the marketplace.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| username | String(255) | No | Unique username |
| email | String(255) | No | Email address |
| display_name | String(255) | Yes | Display name |
| avatar_url | Text | Yes | Avatar image URL |
| bio | Text | Yes | Biography |
| website | Text | Yes | Personal website |
| github_handle | String(255) | Yes | GitHub username |
| twitter_handle | String(255) | Yes | Twitter handle |
| reputation_score | BigInt | No | Reputation points |
| verified | Boolean | No | Verified account flag |
| two_factor_enabled | Boolean | No | 2FA enabled flag |
| created_at | Timestamp | No | Account creation |
| last_active_at | Timestamp | No | Last activity |
| deleted_at | Timestamp | Yes | Soft delete timestamp |

**Indexes:**

- Primary: `id`
- Unique: `username`, `email`
- Index: `reputation_score DESC`

**Constraints:**

- `username` length >= 3
- `username` format: `^[a-zA-Z0-9_-]+$`

### Organization

Represents a group account for teams and companies.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| name | String(255) | No | Organization name |
| slug | String(255) | No | URL-friendly identifier |
| description | Text | Yes | Description |
| logo_url | Text | Yes | Logo image URL |
| website | Text | Yes | Website URL |
| verified | Boolean | No | Verified org flag |
| subscription_tier | String(50) | No | Subscription level |
| created_at | Timestamp | No | Creation time |
| deleted_at | Timestamp | Yes | Soft delete |

**Indexes:**

- Primary: `id`
- Unique: `slug`

### Dependency

Represents a dependency relationship between assets.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| source_version_id | UUID | No | Dependent version |
| target_asset_id | UUID | No | Required asset |
| version_requirement | String(100) | No | Version constraint |
| optional | Boolean | No | Optional dependency |

**Indexes:**

- Primary: `id`
- Unique: `(source_version_id, target_asset_id)`

**Constraints:**

- Foreign keys: `source_version_id → asset_versions(id)`, `target_asset_id → assets(id)`

## Enumeration Types

### AssetType

```sql
CREATE TYPE asset_type AS ENUM (
    'prompt',
    'prompt_template',
    'agent_config',
    'tool',
    'workflow',
    'dataset',
    'model_adapter',
    'evaluation_suite',
    'integration',
    'plugin'
);
```

### AssetStatus

```sql
CREATE TYPE asset_status AS ENUM (
    'draft',
    'under_review',
    'published',
    'deprecated',
    'archived',
    'suspended'
);
```

### Visibility

```sql
CREATE TYPE visibility AS ENUM (
    'public',
    'unlisted',
    'private',
    'organization'
);
```

### LicenseType

```sql
CREATE TYPE license_type AS ENUM (
    'mit',
    'apache_2_0',
    'gpl_3_0',
    'bsd_3_clause',
    'mpl_2_0',
    'cc0',
    'cc_by_4_0',
    'cc_by_sa_4_0',
    'proprietary',
    'custom'
);
```

## Security Entities

### PublicKey

Stores public keys for asset signature verification.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | String(255) | No | Key fingerprint |
| user_id | UUID | No | Key owner |
| algorithm | String(50) | No | Signature algorithm |
| key_data | Bytea | No | Public key bytes |
| fingerprint | String(255) | No | Key fingerprint |
| added_at | Timestamp | No | Addition time |
| revoked_at | Timestamp | Yes | Revocation time |

**Indexes:**

- Primary: `id`
- Unique: `fingerprint`
- Index: `user_id`

### DigitalSignature

Records cryptographic signatures for asset versions.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| asset_version_id | UUID | No | Signed version |
| algorithm | String(50) | No | Signature algorithm |
| public_key_id | String(255) | No | Key used for signing |
| signature | Bytea | No | Signature bytes |
| signed_at | Timestamp | No | Signing time |
| signer_id | UUID | No | Signer user ID |

**Indexes:**

- Primary: `id`
- Index: `asset_version_id`

### ScanResult

Stores security scan results for asset versions.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| asset_version_id | UUID | No | Scanned version |
| scanner | String(255) | No | Scanner name/version |
| scan_type | String(50) | No | Type of scan |
| status | String(50) | No | Scan status |
| findings | JSONB | Yes | Findings array |
| scanned_at | Timestamp | No | Scan time |

**Indexes:**

- Primary: `id`
- Index: `asset_version_id`, `scan_type`

### Vulnerability

Tracks known vulnerabilities (CVEs, etc.).

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | String(255) | No | CVE or internal ID |
| title | String(500) | No | Vulnerability title |
| description | Text | No | Details |
| severity | String(50) | No | Severity level |
| affected_versions | JSONB | No | Affected version ranges |
| patched_versions | JSONB | Yes | Fixed versions |
| references | JSONB | Yes | External references |
| published_at | Timestamp | No | Publication time |

**Indexes:**

- Primary: `id`
- Index: `severity`

## Engagement Entities

### Rating

User ratings and reviews for assets.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| asset_id | UUID | No | Rated asset |
| user_id | UUID | No | Reviewer |
| version_id | UUID | Yes | Specific version rated |
| score | Integer | No | Rating (1-5) |
| review | Text | Yes | Review text |
| helpful_count | BigInt | No | Helpful votes |
| unhelpful_count | BigInt | No | Unhelpful votes |
| created_at | Timestamp | No | Creation time |
| updated_at | Timestamp | No | Last update |

**Indexes:**

- Primary: `id`
- Unique: `(asset_id, user_id)`
- Index: `asset_id`, `user_id`, `score`

**Constraints:**

- `score` CHECK: `score BETWEEN 1 AND 5`

### Comment

Threaded comments on assets.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| asset_id | UUID | No | Asset being discussed |
| user_id | UUID | No | Commenter |
| parent_id | UUID | Yes | Parent comment (threading) |
| content | Text | No | Comment content |
| upvotes | BigInt | No | Upvote count |
| downvotes | BigInt | No | Downvote count |
| created_at | Timestamp | No | Creation time |
| edited_at | Timestamp | Yes | Edit time |
| deleted_at | Timestamp | Yes | Soft delete |

**Indexes:**

- Primary: `id`
- Index: `asset_id`, `user_id`, `parent_id`

## Analytics Entities

### DownloadEvent

Tracks individual download events for analytics.

**Fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | UUID | No | Primary key |
| asset_id | UUID | No | Downloaded asset |
| version_id | UUID | No | Downloaded version |
| user_id | UUID | Yes | Downloader (null if anonymous) |
| ip_hash | String(64) | Yes | Hashed IP address |
| user_agent | Text | Yes | User agent string |
| downloaded_at | Timestamp | No | Download time |

**Indexes:**

- Primary: `id`
- Index: `(asset_id, downloaded_at DESC)`, `(version_id, downloaded_at DESC)`, `downloaded_at DESC`

**Partitioning:**

Partition by `downloaded_at` for efficient time-based queries:

```sql
CREATE TABLE download_events (
    -- fields
) PARTITION BY RANGE (downloaded_at);

CREATE TABLE download_events_2025_01 PARTITION OF download_events
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

## Materialized Views

### trending_assets

Pre-computed trending scores for fast retrieval.

```sql
CREATE MATERIALIZED VIEW trending_assets AS
SELECT
    a.id,
    a.name,
    a.slug,
    a.asset_type,
    COUNT(DISTINCT de.id) AS downloads_7d,
    COUNT(DISTINCT r.id) AS ratings_7d,
    COALESCE(AVG(r.score), 0) AS avg_rating_7d,
    (
        COUNT(DISTINCT de.id) * 2 +
        COUNT(DISTINCT r.id) * 5 +
        COALESCE(AVG(r.score), 0) * 10
    ) AS trending_score
FROM assets a
LEFT JOIN download_events de ON de.asset_id = a.id
    AND de.downloaded_at > NOW() - INTERVAL '7 days'
LEFT JOIN ratings r ON r.asset_id = a.id
    AND r.created_at > NOW() - INTERVAL '7 days'
WHERE a.status = 'published'
GROUP BY a.id, a.name, a.slug, a.asset_type
ORDER BY trending_score DESC;

-- Refresh every hour
CREATE INDEX idx_trending_score ON trending_assets(trending_score DESC);
```

**Refresh Strategy:**

```sql
-- Refresh concurrently to avoid locking
REFRESH MATERIALIZED VIEW CONCURRENTLY trending_assets;
```

## Query Patterns

### Get Asset with Latest Version

```sql
SELECT
    a.*,
    av.*
FROM assets a
LEFT JOIN LATERAL (
    SELECT *
    FROM asset_versions
    WHERE asset_id = a.id
    ORDER BY released_at DESC
    LIMIT 1
) av ON true
WHERE a.id = $1;
```

### Search Assets with Filters

```sql
SELECT
    a.*,
    u.username AS author_username,
    u.display_name AS author_display_name,
    COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags,
    COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), '{}') AS categories
FROM assets a
JOIN users u ON u.id = a.author_id
LEFT JOIN asset_tags at ON at.asset_id = a.id
LEFT JOIN tags t ON t.id = at.tag_id
LEFT JOIN asset_categories ac ON ac.asset_id = a.id
LEFT JOIN categories c ON c.id = ac.category_id
WHERE
    a.status = 'published'
    AND ($1::asset_type IS NULL OR a.asset_type = $1)
    AND ($2::text[] IS NULL OR EXISTS (
        SELECT 1 FROM unnest($2::text[]) AS tag_name
        WHERE tag_name = ANY(array_agg(t.name))
    ))
    AND ($3::float IS NULL OR a.rating_average >= $3)
    AND (
        to_tsvector('english', a.name || ' ' || a.description)
        @@ plainto_tsquery('english', $4)
    )
GROUP BY a.id, u.username, u.display_name
ORDER BY
    CASE WHEN $5 = 'recent' THEN a.published_at END DESC,
    CASE WHEN $5 = 'downloads' THEN a.download_count END DESC,
    CASE WHEN $5 = 'rating' THEN a.rating_average END DESC
LIMIT $6 OFFSET $7;
```

### Resolve Dependency Tree

```sql
WITH RECURSIVE dep_tree AS (
    -- Base case: root asset version
    SELECT
        av.id AS version_id,
        av.asset_id,
        av.version,
        0 AS depth
    FROM asset_versions av
    WHERE av.id = $1

    UNION ALL

    -- Recursive case: dependencies
    SELECT
        av.id,
        av.asset_id,
        av.version,
        dt.depth + 1
    FROM dep_tree dt
    JOIN dependencies d ON d.source_version_id = dt.version_id
    JOIN asset_versions av ON av.asset_id = d.target_asset_id
        AND av.version = satisfy_version_requirement(d.version_requirement)
    WHERE dt.depth < 10  -- Prevent infinite recursion
)
SELECT
    dt.*,
    a.name,
    a.slug
FROM dep_tree dt
JOIN assets a ON a.id = dt.asset_id
ORDER BY dt.depth, a.name;
```

## Database Migrations

Use a migration tool like `sqlx` (Rust) or `diesel` to manage schema changes.

**Example Migration:**

```sql
-- migrations/001_create_users.sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    -- ... other fields
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
```

## Performance Optimization

### Indexing Strategy

1. **Primary Keys**: All tables use UUID primary keys
2. **Foreign Keys**: Index all foreign key columns
3. **Search Columns**: Full-text search indexes on `name`, `description`
4. **Sort Columns**: Indexes on frequently sorted fields (`download_count`, `rating_average`, `published_at`)
5. **Composite Indexes**: For common query patterns

### Partitioning

Partition large tables by time:

- `download_events`: Monthly partitions
- `audit_logs`: Monthly partitions

### Connection Pooling

Use connection pooling to manage database connections efficiently:

```rust
use sqlx::postgres::PgPoolOptions;

let pool = PgPoolOptions::new()
    .max_connections(20)
    .min_connections(5)
    .acquire_timeout(Duration::from_secs(3))
    .connect(&database_url)
    .await?;
```

### Query Caching

Cache frequently accessed data in Redis:

- Asset metadata
- User profiles
- Category lists
- Trending assets

## Backup Strategy

1. **Continuous Archiving**: WAL archiving to S3
2. **Daily Snapshots**: Full database backups
3. **Point-in-Time Recovery**: Restore to any point in the last 30 days
4. **Replication**: Streaming replication to standby servers

---

**Document Version:** 1.0
**Last Updated:** 2025-11-18

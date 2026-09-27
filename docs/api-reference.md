# API Reference

**Version:** v1
**Base URL:** `https://api.llm-marketplace.dev/v1`

## Table of Contents

1. [Authentication](#authentication)
2. [Assets API](#assets-api)
3. [Search API](#search-api)
4. [Users API](#users-api)
5. [Organizations API](#organizations-api)
6. [Ratings API](#ratings-api)
7. [Categories & Tags API](#categories--tags-api)
8. [Error Handling](#error-handling)
9. [Rate Limiting](#rate-limiting)
10. [Pagination](#pagination)

---

## Authentication

All authenticated requests require either a JWT token or an API key.

### Methods

**1. JWT Bearer Token:**

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**2. API Key:**

```http
X-API-Key: llm_mp_1a2b3c4d5e6f7g8h9i0j
```

### Endpoints

#### POST /auth/register

Register a new user account.

**Request:**

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "SecurePassword123!",
  "display_name": "Alice Smith"
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "alice",
      "email": "alice@example.com",
      "display_name": "Alice Smith",
      "created_at": "2025-11-18T12:00:00Z"
    },
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "refresh_token": "8a9b0c1d2e3f4g5h6i7j...",
    "expires_in": 3600
  }
}
```

#### POST /auth/login

Authenticate and receive tokens.

**Request:**

```json
{
  "username": "alice",
  "password": "SecurePassword123!"
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "refresh_token": "8a9b0c1d2e3f4g5h6i7j...",
    "expires_in": 3600,
    "token_type": "Bearer"
  }
}
```

#### POST /auth/refresh

Refresh an expired access token.

**Request:**

```json
{
  "refresh_token": "8a9b0c1d2e3f4g5h6i7j..."
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "expires_in": 3600
  }
}
```

#### GET /auth/oauth/{provider}

Initiate OAuth flow.

**Parameters:**

- `provider`: `github`, `google`, `gitlab`

**Response:** `302 Redirect` to OAuth provider

#### POST /auth/logout

Invalidate current token.

**Request:**

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

**Response:** `204 No Content`

---

## Assets API

### List Assets

#### GET /assets

Retrieve a paginated list of assets.

**Query Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `page` | integer | Page number | 1 |
| `per_page` | integer | Items per page (max 100) | 20 |
| `type` | string | Filter by asset type | - |
| `status` | string | Filter by status | `published` |
| `author` | string | Filter by author username | - |
| `organization` | string | Filter by org slug | - |
| `sort` | string | Sort field (`recent`, `downloads`, `rating`, `trending`) | `recent` |

**Example Request:**

```http
GET /assets?page=1&per_page=20&type=prompt&sort=downloads
```

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Code Review Assistant",
      "slug": "code-review-assistant",
      "type": "prompt_template",
      "description": "AI-powered code review prompt with best practices",
      "author": {
        "id": "660f9511-f3ac-52e5-b827-557766551111",
        "username": "alice",
        "display_name": "Alice Smith",
        "avatar_url": "https://cdn.example.com/avatars/alice.jpg"
      },
      "current_version": {
        "version": "1.2.0",
        "released_at": "2025-11-15T10:30:00Z"
      },
      "categories": ["tools", "code-analysis"],
      "tags": ["code-review", "javascript", "best-practices"],
      "license": "MIT",
      "stats": {
        "download_count": 15420,
        "view_count": 48932,
        "rating_average": 4.8,
        "rating_count": 342
      },
      "created_at": "2025-10-01T08:00:00Z",
      "published_at": "2025-10-02T12:00:00Z",
      "updated_at": "2025-11-15T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 1542,
    "total_pages": 78
  }
}
```

### Get Asset Details

#### GET /assets/{id}

Retrieve detailed information about a specific asset.

**Path Parameters:**

- `id`: Asset UUID or `{author}/{slug}` format

**Example Request:**

```http
GET /assets/alice/code-review-assistant
```

**Response:** `200 OK`

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Code Review Assistant",
    "slug": "code-review-assistant",
    "type": "prompt_template",
    "description": "AI-powered code review prompt with best practices",
    "readme": "# Code Review Assistant\n\nThis prompt template...",
    "author": {
      "id": "660f9511-f3ac-52e5-b827-557766551111",
      "username": "alice",
      "display_name": "Alice Smith",
      "avatar_url": "https://cdn.example.com/avatars/alice.jpg",
      "verified": true
    },
    "organization": null,
    "current_version": {
      "id": "770g0622-g4bd-63f6-c938-668877662222",
      "version": "1.2.0",
      "changelog": "- Added support for TypeScript\n- Fixed edge cases",
      "size_bytes": 4096,
      "checksum": "sha256:a3b2c1d0e9f8...",
      "download_url": "/assets/550e8400.../versions/1.2.0/download",
      "released_at": "2025-11-15T10:30:00Z",
      "download_count": 8421
    },
    "versions": [
      {
        "version": "1.2.0",
        "released_at": "2025-11-15T10:30:00Z"
      },
      {
        "version": "1.1.0",
        "released_at": "2025-11-01T09:00:00Z"
      }
    ],
    "categories": [
      {
        "id": "880h1733-h5ce-74g7-d049-779988773333",
        "name": "Tools",
        "slug": "tools"
      }
    ],
    "tags": ["code-review", "javascript", "best-practices"],
    "license": {
      "type": "MIT",
      "name": "MIT License",
      "url": "https://opensource.org/licenses/MIT",
      "allows_commercial_use": true
    },
    "dependencies": [],
    "stats": {
      "download_count": 15420,
      "view_count": 48932,
      "star_count": 892,
      "rating_average": 4.8,
      "rating_count": 342,
      "trending_score": 92.5
    },
    "security": {
      "signed": true,
      "signature_verified": true,
      "scan_status": "passed",
      "last_scanned_at": "2025-11-15T11:00:00Z"
    },
    "created_at": "2025-10-01T08:00:00Z",
    "published_at": "2025-10-02T12:00:00Z",
    "updated_at": "2025-11-15T10:30:00Z"
  }
}
```

### Create Asset

#### POST /assets

Create a new asset (draft state).

**Authentication:** Required

**Request:**

```json
{
  "name": "My New Prompt",
  "slug": "my-new-prompt",
  "type": "prompt",
  "description": "A helpful prompt for...",
  "readme": "# My New Prompt\n\nDetailed documentation...",
  "license": "MIT",
  "categories": ["prompt-engineering"],
  "tags": ["productivity", "writing"],
  "visibility": "public"
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "990i2844-i6df-85h8-e150-880099884444",
    "name": "My New Prompt",
    "slug": "my-new-prompt",
    "status": "draft",
    "created_at": "2025-11-18T12:00:00Z"
  }
}
```

### Update Asset

#### PUT /assets/{id}

Update asset metadata.

**Authentication:** Required (must be owner)

**Request:**

```json
{
  "description": "Updated description",
  "readme": "# Updated Documentation",
  "tags": ["productivity", "writing", "ai"]
}
```

**Response:** `200 OK`

### Delete Asset

#### DELETE /assets/{id}

Delete or archive an asset.

**Authentication:** Required (must be owner)

**Response:** `204 No Content`

### Publish Asset

#### POST /assets/{id}/publish

Make an asset publicly available.

**Authentication:** Required (must be owner)

**Response:** `200 OK`

```json
{
  "data": {
    "id": "990i2844-i6df-85h8-e150-880099884444",
    "status": "published",
    "published_at": "2025-11-18T12:30:00Z"
  }
}
```

### Asset Versions

#### GET /assets/{id}/versions

List all versions of an asset.

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "aa0j3955-j7eg-96i9-f261-991100995555",
      "version": "1.2.0",
      "changelog": "Bug fixes and improvements",
      "size_bytes": 4096,
      "download_count": 8421,
      "released_at": "2025-11-15T10:30:00Z",
      "yanked": false
    }
  ]
}
```

#### POST /assets/{id}/versions

Upload a new version.

**Authentication:** Required (must be owner)

**Content-Type:** `multipart/form-data`

**Request:**

```
POST /assets/{id}/versions
Content-Type: multipart/form-data; boundary=----Boundary

------Boundary
Content-Disposition: form-data; name="version"

1.3.0
------Boundary
Content-Disposition: form-data; name="changelog"

- New feature X
- Fixed bug Y
------Boundary
Content-Disposition: form-data; name="file"; filename="asset.zip"
Content-Type: application/zip

[binary content]
------Boundary--
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "bb1k4a66-k8fh-a7j0-g372-aa2211aa6666",
    "version": "1.3.0",
    "size_bytes": 5120,
    "checksum": "sha256:b4c3d2e1f0a9...",
    "download_url": "/assets/{id}/versions/1.3.0/download",
    "released_at": "2025-11-18T13:00:00Z"
  }
}
```

#### GET /assets/{id}/versions/{version}/download

Download a specific version.

**Response:** `302 Redirect` to S3 signed URL or `200 OK` with file stream

**Headers:**

```http
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="asset-1.3.0.zip"
X-Content-Hash: sha256:b4c3d2e1f0a9...
```

### Asset Dependencies

#### GET /assets/{id}/dependencies

Get dependency tree for an asset.

**Response:** `200 OK`

```json
{
  "data": {
    "asset_id": "550e8400-e29b-41d4-a716-446655440000",
    "version": "1.2.0",
    "dependencies": [
      {
        "asset_id": "cc2l5b77-l9gi-b8k1-h483-bb3322bb7777",
        "name": "json-validator",
        "version_requirement": "^2.1.0",
        "resolved_version": "2.1.5",
        "optional": false
      }
    ],
    "total_size_bytes": 12288
  }
}
```

#### GET /assets/{id}/dependents

Get assets that depend on this asset (reverse dependencies).

**Response:** `200 OK`

```json
{
  "data": [
    {
      "asset_id": "dd3m6c88-m0hj-c9l2-i594-cc4433cc8888",
      "name": "Advanced Code Analyzer",
      "version_requirement": "^1.0.0"
    }
  ],
  "meta": {
    "total": 42
  }
}
```

---

## Search API

### Full-Text Search

#### GET /search

Search for assets using full-text search.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `type` | string | Filter by asset type |
| `category` | string | Filter by category slug |
| `tags` | string[] | Filter by tags (comma-separated) |
| `license` | string[] | Filter by license type |
| `min_rating` | float | Minimum average rating |
| `sort` | string | Sort order |
| `page` | integer | Page number |
| `per_page` | integer | Results per page |

**Example Request:**

```http
GET /search?q=code+review&type=prompt&min_rating=4.0&sort=rating
```

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Code Review Assistant",
      "slug": "code-review-assistant",
      "type": "prompt_template",
      "description": "AI-powered code review...",
      "highlight": {
        "description": "AI-powered <em>code review</em> prompt..."
      },
      "stats": {
        "rating_average": 4.8,
        "download_count": 15420
      }
    }
  ],
  "meta": {
    "query": "code review",
    "total": 124,
    "page": 1,
    "per_page": 20,
    "search_time_ms": 12
  }
}
```

### Autocomplete

#### GET /search/autocomplete

Get search suggestions.

**Query Parameters:**

- `q`: Partial query string (min 2 characters)
- `limit`: Maximum suggestions (default: 10)

**Example Request:**

```http
GET /search/autocomplete?q=code
```

**Response:** `200 OK`

```json
{
  "data": {
    "suggestions": [
      "code review",
      "code analysis",
      "code generation",
      "code refactoring"
    ],
    "assets": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Code Review Assistant",
        "slug": "code-review-assistant"
      }
    ]
  }
}
```

### Trending Assets

#### GET /trending

Get currently trending assets.

**Query Parameters:**

- `period`: Time period (`day`, `week`, `month`) - default: `week`
- `type`: Filter by asset type
- `limit`: Number of results (max 100)

**Response:** `200 OK`

```json
{
  "data": [
    {
      "asset": { /* asset object */ },
      "trending_score": 92.5,
      "growth_rate": 0.45,
      "downloads_7d": 2341,
      "ratings_7d": 84
    }
  ]
}
```

---

## Users API

### Get User Profile

#### GET /users/{username}

Get public profile information.

**Response:** `200 OK`

```json
{
  "data": {
    "id": "660f9511-f3ac-52e5-b827-557766551111",
    "username": "alice",
    "display_name": "Alice Smith",
    "avatar_url": "https://cdn.example.com/avatars/alice.jpg",
    "bio": "AI enthusiast and developer",
    "website": "https://alice.dev",
    "github_handle": "alice",
    "verified": true,
    "reputation_score": 8542,
    "badges": [
      {
        "id": "early_adopter",
        "name": "Early Adopter",
        "icon_url": "https://cdn.example.com/badges/early.png"
      }
    ],
    "stats": {
      "assets_published": 24,
      "total_downloads": 156420,
      "total_stars": 3421
    },
    "joined_at": "2025-09-01T10:00:00Z"
  }
}
```

### Get User's Assets

#### GET /users/{username}/assets

List assets published by a user.

**Query Parameters:** Same as `/assets`

**Response:** Same format as `/assets`

### Get Current User

#### GET /me

Get authenticated user's profile.

**Authentication:** Required

**Response:** `200 OK` (includes private fields)

```json
{
  "data": {
    "id": "660f9511-f3ac-52e5-b827-557766551111",
    "username": "alice",
    "email": "alice@example.com",
    "display_name": "Alice Smith",
    "two_factor_enabled": true,
    // ... other fields
  }
}
```

### Update Profile

#### PUT /me

Update authenticated user's profile.

**Authentication:** Required

**Request:**

```json
{
  "display_name": "Alice M. Smith",
  "bio": "Updated bio",
  "website": "https://newsite.com"
}
```

**Response:** `200 OK`

### API Keys

#### GET /me/api-keys

List user's API keys.

**Authentication:** Required

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "ee4n7d99-n1ik-d0m3-j6a5-dd5544dd9999",
      "name": "Production API Key",
      "key_prefix": "llm_mp_1a2b3c",
      "scopes": ["read:assets", "write:assets"],
      "created_at": "2025-11-01T10:00:00Z",
      "last_used_at": "2025-11-18T09:30:00Z",
      "expires_at": null
    }
  ]
}
```

#### POST /me/api-keys

Create a new API key.

**Authentication:** Required

**Request:**

```json
{
  "name": "CI/CD Pipeline",
  "scopes": ["read:assets"],
  "expires_in_days": 90
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "ff5o8e00-o2jl-e1n4-k7b6-ee6655ee0000",
    "name": "CI/CD Pipeline",
    "key": "llm_mp_9z8y7x6w5v4u3t2s1r0q",
    "scopes": ["read:assets"],
    "created_at": "2025-11-18T12:00:00Z",
    "expires_at": "2026-02-16T12:00:00Z"
  }
}
```

**Note:** The full API key is only shown once during creation.

#### DELETE /me/api-keys/{id}

Revoke an API key.

**Authentication:** Required

**Response:** `204 No Content`

---

## Organizations API

### List Organizations

#### GET /organizations

List all organizations.

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "gg6p9f11-p3km-f2o5-l8c7-ff7766ff1111",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "description": "Leading AI solutions provider",
      "logo_url": "https://cdn.example.com/logos/acme.png",
      "website": "https://acme.com",
      "verified": true,
      "member_count": 24,
      "asset_count": 156
    }
  ]
}
```

### Get Organization

#### GET /organizations/{slug}

Get organization details.

**Response:** `200 OK`

```json
{
  "data": {
    "id": "gg6p9f11-p3km-f2o5-l8c7-ff7766ff1111",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "description": "Leading AI solutions provider",
    "logo_url": "https://cdn.example.com/logos/acme.png",
    "website": "https://acme.com",
    "verified": true,
    "members": [
      {
        "user_id": "660f9511-f3ac-52e5-b827-557766551111",
        "username": "alice",
        "role": "owner"
      }
    ],
    "stats": {
      "assets_published": 156,
      "total_downloads": 2450000,
      "member_count": 24
    },
    "created_at": "2025-01-15T08:00:00Z"
  }
}
```

### Get Organization Assets

#### GET /organizations/{slug}/assets

List assets published by an organization.

**Response:** Same format as `/assets`

### Create Organization

#### POST /organizations

Create a new organization.

**Authentication:** Required

**Request:**

```json
{
  "name": "My Company",
  "slug": "my-company",
  "description": "Our awesome company",
  "website": "https://mycompany.com"
}
```

**Response:** `201 Created`

---

## Ratings API

### List Ratings

#### GET /assets/{id}/ratings

Get ratings for an asset.

**Query Parameters:**

- `sort`: `recent`, `helpful`, `rating_desc`, `rating_asc`
- `page`, `per_page`: Pagination

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "hh7q0g22-q4ln-g3p6-m9d8-gg8877gg2222",
      "asset_id": "550e8400-e29b-41d4-a716-446655440000",
      "user": {
        "username": "bob",
        "display_name": "Bob Johnson",
        "avatar_url": "https://cdn.example.com/avatars/bob.jpg"
      },
      "score": 5,
      "review": "Excellent prompt! Saved me hours of work.",
      "helpful_count": 42,
      "unhelpful_count": 2,
      "created_at": "2025-11-10T14:30:00Z",
      "updated_at": "2025-11-10T14:30:00Z"
    }
  ],
  "meta": {
    "summary": {
      "average": 4.8,
      "count": 342,
      "distribution": {
        "5": 256,
        "4": 64,
        "3": 18,
        "2": 3,
        "1": 1
      }
    }
  }
}
```

### Submit Rating

#### POST /assets/{id}/ratings

Submit or update a rating.

**Authentication:** Required

**Request:**

```json
{
  "score": 5,
  "review": "Excellent prompt! Saved me hours of work."
}
```

**Response:** `201 Created` or `200 OK` (if updating)

```json
{
  "data": {
    "id": "hh7q0g22-q4ln-g3p6-m9d8-gg8877gg2222",
    "score": 5,
    "review": "Excellent prompt! Saved me hours of work.",
    "created_at": "2025-11-18T12:00:00Z"
  }
}
```

### Mark Rating Helpful

#### POST /ratings/{id}/helpful

Vote a rating as helpful.

**Authentication:** Required

**Response:** `200 OK`

#### POST /ratings/{id}/unhelpful

Vote a rating as unhelpful.

**Authentication:** Required

**Response:** `200 OK`

---

## Categories & Tags API

### List Categories

#### GET /categories

Get all categories (hierarchical).

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "880h1733-h5ce-74g7-d049-779988773333",
      "name": "Tools",
      "slug": "tools",
      "description": "Utility tools and integrations",
      "parent_id": null,
      "icon": "🛠️",
      "asset_count": 1542,
      "children": [
        {
          "id": "ii8r2844-r6mo-h4q7-n0e9-hh9900hh3333",
          "name": "Code Analysis",
          "slug": "code-analysis",
          "parent_id": "880h1733-h5ce-74g7-d049-779988773333",
          "asset_count": 342
        }
      ]
    }
  ]
}
```

### Get Category Assets

#### GET /categories/{slug}/assets

Get assets in a category.

**Response:** Same format as `/assets`

### List Popular Tags

#### GET /tags

Get most popular tags.

**Query Parameters:**

- `limit`: Number of tags (default: 50, max: 100)

**Response:** `200 OK`

```json
{
  "data": [
    {
      "name": "code-review",
      "usage_count": 1542
    },
    {
      "name": "javascript",
      "usage_count": 892
    }
  ]
}
```

### Get Assets by Tag

#### GET /tags/{name}/assets

Get assets with a specific tag.

**Response:** Same format as `/assets`

---

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "additional context"
    },
    "request_id": "req_abc123xyz",
    "timestamp": "2025-11-18T12:00:00Z"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created |
| 204 | No Content | Success with no response body |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (e.g., duplicate) |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Temporary unavailability |

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request |
| `VALIDATION_ERROR` | 422 | Input validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `INVALID_TOKEN` | 401 | Token expired or invalid |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `ASSET_NOT_FOUND` | 404 | Asset does not exist |
| `VERSION_NOT_FOUND` | 404 | Version does not exist |
| `DUPLICATE_ASSET` | 409 | Asset with slug already exists |
| `DUPLICATE_VERSION` | 409 | Version already exists |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Temporary outage |

### Example Error Responses

**Validation Error:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "name": "Name must be at least 3 characters",
      "email": "Invalid email format"
    },
    "request_id": "req_abc123"
  }
}
```

**Rate Limit:**

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 42 seconds.",
    "details": {
      "limit": 100,
      "window_seconds": 60,
      "retry_after": 42
    },
    "request_id": "req_xyz789"
  }
}
```

---

## Rate Limiting

Rate limits are enforced per API key or IP address.

### Default Limits

| Endpoint Pattern | Limit | Window |
|-----------------|-------|--------|
| `/auth/login` | 5 requests | 1 minute |
| `/auth/register` | 3 requests | 1 hour |
| `/search` | 100 requests | 1 minute |
| `/assets/*` (read) | 1000 requests | 1 minute |
| `/assets` (write) | 50 requests | 1 minute |
| Default | 1000 requests | 1 minute |

### Response Headers

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1700308800
```

### Rate Limit Exceeded

When rate limited, you'll receive a `429 Too Many Requests` response with a `Retry-After` header:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700308842
```

---

## Pagination

List endpoints return paginated results.

### Request Parameters

- `page`: Page number (1-indexed)
- `per_page`: Items per page (max 100, default 20)

### Response Format

```json
{
  "data": [ /* items */ ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 1542,
    "total_pages": 78
  },
  "links": {
    "first": "/assets?page=1&per_page=20",
    "prev": null,
    "next": "/assets?page=2&per_page=20",
    "last": "/assets?page=78&per_page=20"
  }
}
```

### Link Header

```http
Link: </assets?page=1&per_page=20>; rel="first",
      </assets?page=2&per_page=20>; rel="next",
      </assets?page=78&per_page=20>; rel="last"
```

---

## Versioning

The API uses URL versioning. The current version is `v1`.

**Base URL:** `https://api.llm-marketplace.dev/v1`

When breaking changes are introduced, a new version will be released (e.g., `v2`), and the previous version will be supported for at least 12 months.

---

## SDKs and Client Libraries

Official client libraries:

- **Rust:** `llm-marketplace-client` (crates.io)
- **TypeScript/JavaScript:** `@llm-marketplace/client` (npm)
- **Python:** `llm-marketplace` (PyPI)
- **Go:** `github.com/llm-marketplace/go-client`

### Example (TypeScript):

```typescript
import { LLMMarketplace } from '@llm-marketplace/client';

const client = new LLMMarketplace({
  apiKey: process.env.LLM_MP_API_KEY,
});

// Search for assets
const results = await client.search({
  query: 'code review',
  type: 'prompt',
  minRating: 4.0,
});

// Download an asset
const asset = await client.downloadAsset('alice/code-review-assistant', '1.2.0');
```

---

**API Version:** v1
**Last Updated:** 2025-11-18
**Support:** api-support@llm-marketplace.dev

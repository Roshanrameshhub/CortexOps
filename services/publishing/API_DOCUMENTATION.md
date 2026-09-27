# Publishing Service API Documentation

## Overview

The Publishing Service is the core backend service for the LLM-Marketplace platform. It provides REST APIs for authentication, service management, and CRUD operations following the SPARC specification.

**Base URL:** `http://localhost:3000/api/v1`

**Version:** 1.0.0

## Table of Contents

- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
  - [Authentication Endpoints](#authentication-endpoints)
  - [Service Endpoints](#service-endpoints)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Authentication

The API supports two authentication methods:

### 1. JWT Bearer Token

Include the JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### 2. API Key

Include the API key in the X-API-Key header:

```
X-API-Key: llm_<your_api_key>
```

Or as a query parameter (less secure):

```
?api_key=llm_<your_api_key>
```

---

## API Endpoints

### Authentication Endpoints

#### Register User

Create a new user account.

**Endpoint:** `POST /auth/register`

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "provider"
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "provider",
      "status": "active",
      "emailVerified": false,
      "lastLoginAt": null,
      "createdAt": "2025-11-18T00:00:00.000Z",
      "updatedAt": "2025-11-18T00:00:00.000Z"
    }
  },
  "message": "User registered successfully"
}
```

---

#### Login

Authenticate with email and password.

**Endpoint:** `POST /auth/login`

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "provider",
      "status": "active",
      "emailVerified": false,
      "lastLoginAt": "2025-11-18T00:00:00.000Z",
      "createdAt": "2025-11-18T00:00:00.000Z",
      "updatedAt": "2025-11-18T00:00:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  },
  "message": "Login successful"
}
```

---

#### Refresh Token

Get a new access token using refresh token.

**Endpoint:** `POST /auth/refresh`

**Authentication:** Not required

**Request Body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  },
  "message": "Token refreshed successfully"
}
```

---

#### Get Profile

Get current user profile.

**Endpoint:** `GET /auth/me`

**Authentication:** Required (JWT)

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "role": "provider"
    }
  }
}
```

---

#### Create API Key

Generate a new API key for programmatic access.

**Endpoint:** `POST /auth/api-keys`

**Authentication:** Required (JWT)

**Request Body:**

```json
{
  "name": "Production API Key",
  "scopes": ["service:read", "service:create"],
  "expiresInDays": 365
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "data": {
    "apiKey": {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "keyPrefix": "llm_a1b2c3d4",
      "name": "Production API Key",
      "scopes": ["service:read", "service:create"],
      "expiresAt": "2026-11-18T00:00:00.000Z",
      "lastUsedAt": null,
      "createdAt": "2025-11-18T00:00:00.000Z"
    },
    "key": "llm_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
  },
  "message": "API key created successfully. Save the key securely - it will not be shown again."
}
```

---

#### List API Keys

Get all API keys for the current user.

**Endpoint:** `GET /auth/api-keys`

**Authentication:** Required (JWT)

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "apiKeys": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "keyPrefix": "llm_a1b2c3d4",
        "name": "Production API Key",
        "scopes": ["service:read", "service:create"],
        "expiresAt": "2026-11-18T00:00:00.000Z",
        "lastUsedAt": "2025-11-18T12:00:00.000Z",
        "createdAt": "2025-11-18T00:00:00.000Z"
      }
    ]
  }
}
```

---

#### Revoke API Key

Revoke an API key.

**Endpoint:** `DELETE /auth/api-keys/:id`

**Authentication:** Required (JWT)

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "API key revoked successfully"
}
```

---

### Service Endpoints

#### Create Service

Publish a new LLM service to the marketplace.

**Endpoint:** `POST /services`

**Authentication:** Required (JWT, role: provider or higher)

**Permissions:** `service:create`

**Request Body:**

```json
{
  "registryId": "650e8400-e29b-41d4-a716-446655440001",
  "name": "gpt-4-turbo",
  "version": "1.0.0",
  "description": "Advanced language model for text generation",
  "category": "text-generation",
  "tags": ["gpt", "chat", "reasoning"],
  "capabilities": [
    {
      "name": "chat_completion",
      "description": "Generate conversational responses",
      "parameters": {
        "type": "object",
        "properties": {
          "messages": { "type": "array" },
          "temperature": { "type": "number", "default": 0.7 }
        }
      }
    }
  ],
  "endpoint": {
    "url": "https://api.example.com/v1/chat/completions",
    "protocol": "rest",
    "authentication": "api-key"
  },
  "pricing": {
    "model": "per-token",
    "rates": [
      {
        "tier": "standard",
        "rate": 0.03,
        "unit": "1k tokens",
        "inputRate": 0.03,
        "outputRate": 0.06
      }
    ]
  },
  "sla": {
    "availability": 99.9,
    "maxLatency": 2000,
    "supportLevel": "premium"
  },
  "compliance": {
    "level": "internal",
    "certifications": ["SOC2", "ISO27001"],
    "dataResidency": ["US", "EU"]
  }
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "data": {
    "service": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "registryId": "650e8400-e29b-41d4-a716-446655440001",
      "name": "gpt-4-turbo",
      "version": "1.0.0",
      "description": "Advanced language model for text generation",
      "provider": {
        "id": "750e8400-e29b-41d4-a716-446655440001",
        "name": "John Doe",
        "verified": false
      },
      "category": "text-generation",
      "tags": ["gpt", "chat", "reasoning"],
      "status": "pending_approval",
      "createdAt": "2025-11-18T00:00:00.000Z",
      "updatedAt": "2025-11-18T00:00:00.000Z",
      "publishedAt": null
    }
  },
  "message": "Service created successfully"
}
```

---

#### Get Service

Retrieve service details by ID.

**Endpoint:** `GET /services/:id`

**Authentication:** Not required

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "service": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "gpt-4-turbo",
      "version": "1.0.0",
      "description": "Advanced language model for text generation",
      "provider": {
        "id": "750e8400-e29b-41d4-a716-446655440001",
        "name": "John Doe",
        "verified": false
      },
      "category": "text-generation",
      "status": "active",
      "pricing": {
        "model": "per-token",
        "rates": [...]
      },
      "sla": {...},
      "compliance": {...}
    }
  }
}
```

---

#### List Services

Search and filter services.

**Endpoint:** `GET /services`

**Authentication:** Not required

**Query Parameters:**

- `query` (string): Search query
- `category` (string): Filter by category
- `tags` (string[]): Filter by tags
- `status` (string): Filter by status (default: active)
- `providerId` (string): Filter by provider
- `complianceLevel` (string): Filter by compliance level
- `minAvailability` (number): Minimum SLA availability
- `maxLatency` (number): Maximum SLA latency
- `pricingModel` (string): Filter by pricing model
- `limit` (number): Results per page (default: 20)
- `offset` (number): Pagination offset (default: 0)
- `sortBy` (string): Sort field (createdAt, publishedAt, name)
- `sortOrder` (string): Sort order (asc, desc)

**Example:** `GET /services?category=text-generation&limit=10&sortBy=createdAt&sortOrder=desc`

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "services": [...],
    "total": 42,
    "limit": 10,
    "offset": 0
  }
}
```

---

#### Update Service

Update service details.

**Endpoint:** `PUT /services/:id`

**Authentication:** Required (JWT)

**Permissions:** `service:update` + ownership or admin role

**Request Body:**

```json
{
  "description": "Updated description",
  "tags": ["updated", "tags"],
  "status": "active"
}
```

**Response:** `200 OK`

---

#### Delete Service

Delete (soft delete) a service.

**Endpoint:** `DELETE /services/:id`

**Authentication:** Required (JWT)

**Permissions:** `service:delete` + ownership or admin role

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Service deleted successfully"
}
```

---

#### Get Service Versions

Get all versions of a service by name.

**Endpoint:** `GET /services/:name/versions`

**Authentication:** Not required

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "versions": [...],
    "count": 3
  }
}
```

---

#### Get My Services

Get all services created by the current user.

**Endpoint:** `GET /services/my/services`

**Authentication:** Required (JWT)

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "services": [...],
    "count": 5
  }
}
```

---

#### Publish Service

Change service status to active.

**Endpoint:** `PUT /services/:id/publish`

**Authentication:** Required (JWT)

**Permissions:** `service:publish`

**Response:** `200 OK`

---

#### Deprecate Service

Mark service as deprecated.

**Endpoint:** `PUT /services/:id/deprecate`

**Authentication:** Required (JWT)

**Permissions:** `service:update` + ownership

**Response:** `200 OK`

---

#### Suspend Service

Suspend a service (admin only).

**Endpoint:** `PUT /services/:id/suspend`

**Authentication:** Required (JWT)

**Permissions:** Admin role

**Request Body:**

```json
{
  "reason": "Policy violation"
}
```

**Response:** `200 OK`

---

## Data Models

### User Roles

- `admin`: Full system access
- `provider`: Can create and manage services
- `consumer`: Can consume services
- `viewer`: Read-only access

### Service Status

- `pending_approval`: Awaiting approval
- `active`: Published and available
- `deprecated`: Marked for retirement
- `suspended`: Temporarily disabled
- `retired`: Permanently disabled

### Service Categories

- `text-generation`
- `embeddings`
- `classification`
- `translation`
- `summarization`
- `question-answering`
- `sentiment-analysis`
- `code-generation`
- `image-generation`
- `speech-to-text`
- `text-to-speech`
- `other`

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "message": "Error description",
    "code": "ErrorCode",
    "statusCode": 400,
    "metadata": {
      "additionalInfo": "..."
    }
  }
}
```

### Common Error Codes

- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

---

## Rate Limiting

- Default: 100 requests per minute per user/API key
- Rate limit headers included in responses:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

---

## Health Check

**Endpoint:** `GET /api/v1/health`

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-11-18T00:00:00.000Z",
    "uptime": 12345,
    "environment": "development"
  }
}
```

---

## Support

For API support, contact: llm-marketplace@example.com

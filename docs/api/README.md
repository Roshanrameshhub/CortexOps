# API Documentation

This directory contains the API documentation for the LLM Marketplace platform.

## Services

### Publishing Service
- **Base URL**: `http://localhost:3001`
- **OpenAPI Spec**: `/api/docs`
- **Health Check**: `/health`

Key endpoints:
- `POST /api/v1/services` - Publish a new service
- `GET /api/v1/services/:id` - Get service details
- `PUT /api/v1/services/:id` - Update service
- `DELETE /api/v1/services/:id` - Deprecate service

### Discovery Service
- **Base URL**: `http://localhost:3002`
- **Health Check**: `/health`

Key endpoints:
- `GET /api/v1/search` - Search services
- `GET /api/v1/services/:id` - Get service details
- `GET /api/v1/recommendations` - Get personalized recommendations

### Consumption Service
- **Base URL**: `http://localhost:3003`
- **Health Check**: `/health`

Key endpoints:
- `POST /api/v1/consume/:serviceId` - Consume a service
- `GET /api/v1/usage` - Get usage statistics
- `GET /api/v1/quota` - Check quota status

### Admin Service
- **Base URL**: `http://localhost:3004`
- **Health Check**: `/health`

Key endpoints:
- `GET /api/v1/analytics` - Platform analytics
- `GET /api/v1/audit-logs` - Audit trail
- `POST /api/v1/workflows` - Approval workflows

## Authentication

All API requests require authentication using JWT tokens or API keys.

### JWT Authentication
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3001/api/v1/services
```

### API Key Authentication
```bash
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:3001/api/v1/services
```

## Rate Limiting

- Default: 100 requests per minute
- Rate limit headers included in responses
- Returns 429 status when exceeded

## Error Responses

Standard error format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "requestId": "uuid"
  }
}
```

Common status codes:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

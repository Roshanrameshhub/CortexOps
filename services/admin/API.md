# Admin Service API Reference

Complete API reference for the LLM Marketplace Admin Service.

## Base URL
```
http://localhost:3004
```

## Authentication

All endpoints except `/health` and `/auth/login` require authentication via JWT Bearer token.

### Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

---

## Authentication Endpoints

### POST /auth/login
Login and obtain JWT access token.

**Request:**
```json
{
  "username": "admin",
  "password": "SecurePassword123!"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 86400
}
```

### GET /auth/me
Get current authenticated user information.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "email": "admin@example.com",
  "username": "admin",
  "full_name": "Admin User",
  "role": "admin",
  "status": "active",
  "permissions": ["read", "write", "admin"],
  "created_at": "2025-11-18T10:00:00Z",
  "last_login_at": "2025-11-18T12:00:00Z"
}
```

---

## User Management Endpoints

### POST /users
Create a new user (Admin only).

**Request:**
```json
{
  "email": "newuser@example.com",
  "username": "newuser",
  "full_name": "New User",
  "password": "SecurePassword123!",
  "role": "viewer",
  "permissions": []
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "email": "newuser@example.com",
  "username": "newuser",
  "full_name": "New User",
  "role": "viewer",
  "status": "pending",
  "permissions": [],
  "created_at": "2025-11-18T10:00:00Z"
}
```

### GET /users
List all users with pagination.

**Query Parameters:**
- `role`: Filter by role (optional)
- `status`: Filter by status (optional)
- `page`: Page number (default: 1)
- `page_size`: Items per page (default: 20, max: 100)

**Response:** `200 OK`
```json
{
  "items": [...],
  "total": 50,
  "page": 1,
  "page_size": 20,
  "total_pages": 3
}
```

### GET /users/{user_id}
Get user by ID.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "user",
  "role": "viewer",
  "status": "active"
}
```

### PATCH /users/{user_id}
Update user information.

**Request:**
```json
{
  "full_name": "Updated Name",
  "role": "admin",
  "status": "active",
  "permissions": ["read", "write"]
}
```

**Response:** `200 OK`

### DELETE /users/{user_id}
Delete user (soft delete, Super Admin only).

**Response:** `204 No Content`

### POST /users/{user_id}/activate
Activate a pending user account.

**Response:** `200 OK`

### POST /users/{user_id}/suspend
Suspend a user account.

**Query Parameters:**
- `reason`: Suspension reason (optional)

**Response:** `200 OK`

### GET /users/statistics
Get user statistics.

**Response:** `200 OK`
```json
{
  "total": 100,
  "active": 80,
  "suspended": 5,
  "inactive": 15,
  "by_role": {
    "super_admin": 2,
    "admin": 5,
    "approver": 10,
    "viewer": 83
  }
}
```

---

## Workflow Management Endpoints

### POST /workflows
Create a new approval workflow.

**Request:**
```json
{
  "workflow_type": "service_publish",
  "service_name": "my-llm-service",
  "service_version": "1.0.0",
  "request_data": {
    "description": "New LLM service for text generation",
    "endpoint": "https://api.example.com/v1"
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "workflow_type": "service_publish",
  "status": "pending",
  "service_name": "my-llm-service",
  "service_version": "1.0.0",
  "requester_id": "uuid",
  "requested_at": "2025-11-18T10:00:00Z",
  "expires_at": "2025-11-19T10:00:00Z"
}
```

### GET /workflows
List workflows with filters.

**Query Parameters:**
- `status`: Filter by status (pending, approved, rejected, cancelled, expired)
- `workflow_type`: Filter by type
- `service_id`: Filter by service ID
- `page`, `page_size`: Pagination

**Response:** `200 OK`

### GET /workflows/pending
Get all pending workflows (Approvers only).

**Query Parameters:**
- `workflow_type`: Filter by type (optional)

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "workflow_type": "service_publish",
    "status": "pending",
    "service_name": "service-1",
    "requester_id": "uuid",
    "requested_at": "2025-11-18T10:00:00Z",
    "expires_at": "2025-11-19T10:00:00Z"
  }
]
```

### GET /workflows/{workflow_id}
Get workflow by ID.

**Response:** `200 OK`

### PATCH /workflows/{workflow_id}
Update workflow status (approve/reject).

**Request:**
```json
{
  "status": "approved",
  "approval_notes": "Service meets all requirements"
}
```

**Response:** `200 OK`

### POST /workflows/{workflow_id}/cancel
Cancel a pending workflow.

**Response:** `200 OK`

### GET /workflows/statistics
Get workflow statistics.

**Response:** `200 OK`
```json
{
  "total": 500,
  "pending": 10,
  "approved": 450,
  "rejected": 30,
  "expired": 5,
  "cancelled": 5,
  "approval_rate": 90.0,
  "rejection_rate": 6.0,
  "average_approval_time_seconds": 3600
}
```

---

## Health Monitoring Endpoints

### GET /health
Overall service health check.

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "timestamp": "2025-11-18T10:00:00Z",
  "services": {
    "publishing": {
      "service_name": "publishing",
      "status": "healthy",
      "response_time_ms": 45.2,
      "checked_at": "2025-11-18T10:00:00Z"
    }
  },
  "database": true,
  "cache": true
}
```

### GET /health/services
Get health summary of all services.

**Response:** `200 OK`
```json
{
  "total_services": 7,
  "healthy": 6,
  "degraded": 1,
  "down": 0,
  "unknown": 0,
  "services": [...]
}
```

### GET /health/services/{service_name}/history
Get health check history for a specific service.

**Query Parameters:**
- `hours`: Number of hours of history (default: 24, max: 168)

**Response:** `200 OK`
```json
{
  "service_name": "publishing",
  "checks": [
    {
      "status": "healthy",
      "response_time_ms": 45.2,
      "checked_at": "2025-11-18T10:00:00Z"
    }
  ]
}
```

---

## Analytics Endpoints

### POST /analytics/query
Query aggregated analytics data.

**Request:**
```json
{
  "metric_type": "performance",
  "metric_names": ["response_time", "error_rate"],
  "service_name": "publishing",
  "time_window": "24h",
  "start_date": "2025-11-17T00:00:00Z",
  "end_date": "2025-11-18T00:00:00Z"
}
```

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "metric_type": "performance",
    "metric_name": "response_time",
    "service_name": "publishing",
    "time_window": "24h",
    "value": 123.45,
    "count": 1000,
    "avg_value": 123.45,
    "p95_value": 250.0,
    "p99_value": 450.0,
    "window_start": "2025-11-17T00:00:00Z",
    "window_end": "2025-11-18T00:00:00Z"
  }
]
```

### GET /analytics/services/{service_name}/statistics
Get comprehensive statistics for a service.

**Query Parameters:**
- `hours`: Time window in hours (default: 24, max: 168)

**Response:** `200 OK`
```json
{
  "service_name": "publishing",
  "total_requests": 10000,
  "total_errors": 50,
  "error_rate": 0.5,
  "avg_response_time_ms": 123.45,
  "p95_response_time_ms": 250.0,
  "p99_response_time_ms": 450.0,
  "active_users": 150,
  "uptime_percentage": 99.9
}
```

### GET /analytics/trends/{metric_name}
Get trend analysis for a metric.

**Query Parameters:**
- `service_id`: Filter by service (optional)
- `days`: Number of days to analyze (default: 7, max: 90)

**Response:** `200 OK`
```json
{
  "metric_name": "response_time",
  "trend": "increasing",
  "change_percentage": 15.5,
  "data_points": 168,
  "first_value": 100.0,
  "last_value": 115.5,
  "mean_value": 107.5,
  "volatility": 12.3,
  "min_value": 85.0,
  "max_value": 150.0
}
```

### GET /dashboard/metrics
Get dashboard overview metrics.

**Response:** `200 OK`
```json
{
  "total_services": 7,
  "active_services": 6,
  "total_users": 100,
  "active_users": 80,
  "total_requests_24h": 50000,
  "error_rate_24h": 0.5,
  "avg_response_time_ms": 123.45,
  "pending_workflows": 5,
  "health_summary": {...}
}
```

---

## System Administration Endpoints

### POST /admin/cleanup/health
Cleanup old health check records.

**Query Parameters:**
- `retention_days`: Days to retain (default: 7, max: 90)

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Deleted 1000 old health records"
}
```

### POST /admin/cleanup/metrics
Cleanup old aggregated metrics.

**Query Parameters:**
- `retention_days`: Days to retain (optional, uses config default)

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Deleted 5000 old metric records"
}
```

### POST /admin/workflows/expire
Mark expired workflows.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Expired 3 workflows"
}
```

---

## Metrics & Observability

### GET /metrics
Prometheus metrics endpoint.

**Response:** `200 OK` (text/plain)
```
# HELP admin_requests_total Total requests
# TYPE admin_requests_total counter
admin_requests_total{method="GET",endpoint="/health",status="200"} 1234

# HELP admin_request_duration_seconds Request duration
# TYPE admin_request_duration_seconds histogram
admin_request_duration_seconds_bucket{method="GET",endpoint="/users",le="0.1"} 950
```

---

## Error Responses

All endpoints may return error responses in the following format:

### 400 Bad Request
```json
{
  "error": "ValidationError",
  "message": "Invalid request data",
  "details": {...},
  "timestamp": "2025-11-18T10:00:00Z"
}
```

### 401 Unauthorized
```json
{
  "detail": "Could not validate credentials"
}
```

### 403 Forbidden
```json
{
  "detail": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "detail": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "InternalServerError",
  "message": "An unexpected error occurred",
  "timestamp": "2025-11-18T10:00:00Z"
}
```

---

## Rate Limiting

Rate limits are enforced per user/IP:
- **Default**: 1000 requests per minute
- **Headers**:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

---

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `page`: Page number (default: 1, min: 1)
- `page_size`: Items per page (default: 20, min: 1, max: 100)

**Response Format:**
```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "page_size": 20,
  "total_pages": 5
}
```

---

## User Roles

- **super_admin**: Full system access, can manage admins
- **admin**: User and workflow management
- **approver**: Can approve/reject workflows
- **viewer**: Read-only access
- **service_account**: Service-to-service authentication

---

## Workflow Types

- `service_publish`: Service publishing approval
- `service_update`: Service update approval
- `service_delete`: Service deletion approval
- `user_permission`: User permission change approval
- `policy_change`: Policy modification approval

---

## Workflow Statuses

- `pending`: Awaiting approval
- `approved`: Approved by approver
- `rejected`: Rejected by approver
- `cancelled`: Cancelled by requester
- `expired`: Approval timeout exceeded

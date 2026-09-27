# Admin Service

The Admin Service is the central administrative hub for the LLM Marketplace platform, providing comprehensive monitoring, analytics, workflow management, and user administration capabilities.

## Features

### 1. Service Health Monitoring
- Real-time health checks for all marketplace services
- Historical health data tracking
- Service availability metrics and uptime calculation
- Automated alerts for service degradation

### 2. Workflow Management
- Approval workflows for service publishing
- Multi-level approval support
- Workflow status tracking (pending, approved, rejected, expired)
- Auto-approval for trusted users
- Workflow expiration and cleanup

### 3. Analytics & Reporting
- Aggregated metrics collection using pandas
- Performance analytics (response times, error rates)
- Service statistics and trends
- Dashboard metrics for operational overview
- Time-series data analysis with percentile calculations

### 4. User Management
- Full CRUD operations for users
- Role-based access control (Super Admin, Admin, Approver, Viewer)
- Permission management
- User activation/suspension
- Password management with bcrypt hashing
- Login attempt tracking and account lockout

### 5. Integration Capabilities
- Analytics Hub integration for metrics streaming
- Service-to-service health monitoring
- Event tracking and audit logging
- RESTful API with comprehensive documentation

## Architecture

### Technology Stack
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 15 with SQLAlchemy ORM
- **Cache**: Redis for session and rate limiting
- **Analytics**: Pandas for data processing
- **Authentication**: JWT with OAuth2
- **Metrics**: Prometheus for monitoring
- **Testing**: Pytest with >80% coverage

### Database Models
- **Users**: User accounts with roles and permissions
- **ApprovalWorkflow**: Service publishing approval workflows
- **ServiceHealth**: Health check records for all services
- **AggregatedMetrics**: Pre-computed analytics data
- **ServiceMetrics**: Real-time service metrics snapshots
- **AuditLog**: Immutable audit trail for all operations
- **SystemConfiguration**: Platform-wide configuration settings

### API Structure
```
/auth/*              - Authentication endpoints
/users/*             - User management
/workflows/*         - Approval workflow management
/health/*            - Service health monitoring
/analytics/*         - Analytics and reporting
/dashboard/*         - Dashboard metrics
/admin/*             - System administration
```

## Getting Started

### Prerequisites
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Docker (optional)

### Installation

1. **Clone the repository**
   ```bash
   cd services/admin
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Initialize database**
   ```bash
   # Database tables are created automatically on first run
   python -c "from database import init_db; init_db()"
   ```

### Running the Service

**Development Mode:**
```bash
uvicorn main:app --host 0.0.0.0 --port 3004 --reload
```

**Production Mode:**
```bash
uvicorn main:app --host 0.0.0.0 --port 3004 --workers 4
```

**Using Docker:**
```bash
docker build -t admin-service .
docker run -p 3004:3004 admin-service
```

**Using Docker Compose:**
```bash
docker-compose up admin-service
```

## API Documentation

Once the service is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:3004/docs
- **ReDoc**: http://localhost:3004/redoc
- **OpenAPI JSON**: http://localhost:3004/openapi.json

## Configuration

Key configuration options (set via environment variables or `.env` file):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `REDIS_URL` | Redis connection string | `redis://...` |
| `JWT_SECRET` | Secret key for JWT tokens | `dev-secret-...` |
| `HEALTH_CHECK_INTERVAL` | Health check frequency (seconds) | `30` |
| `WORKFLOW_APPROVAL_TIMEOUT` | Workflow expiration time (seconds) | `86400` (24h) |
| `ANALYTICS_RETENTION_DAYS` | Metric retention period (days) | `90` |
| `LOG_LEVEL` | Logging level | `INFO` |

## Testing

### Run all tests
```bash
pytest
```

### Run with coverage
```bash
pytest --cov=. --cov-report=html
```

### Run specific test types
```bash
pytest -m unit          # Unit tests only
pytest -m integration   # Integration tests only
```

### Test structure
```
tests/
├── conftest.py           # Shared fixtures
├── test_user_manager.py  # User management tests
├── test_api.py          # API endpoint tests
└── test_workflows.py    # Workflow management tests
```

## API Examples

### Authentication
```bash
# Login
curl -X POST http://localhost:3004/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'

# Get current user
curl http://localhost:3004/auth/me \
  -H "Authorization: Bearer <token>"
```

### User Management
```bash
# Create user (admin only)
curl -X POST http://localhost:3004/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "newuser",
    "password": "SecurePass123!",
    "role": "viewer"
  }'

# List users
curl http://localhost:3004/users \
  -H "Authorization: Bearer <token>"
```

### Workflow Management
```bash
# Create workflow
curl -X POST http://localhost:3004/workflows \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "service_publish",
    "service_name": "my-service",
    "request_data": {"description": "New service"}
  }'

# Get pending workflows
curl http://localhost:3004/workflows/pending \
  -H "Authorization: Bearer <token>"

# Approve workflow
curl -X PATCH http://localhost:3004/workflows/<workflow_id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "approval_notes": "Looks good"
  }'
```

### Health Monitoring
```bash
# Check overall health
curl http://localhost:3004/health

# Get service health summary
curl http://localhost:3004/health/services

# Get health history for specific service
curl http://localhost:3004/health/services/publishing/history?hours=24
```

### Analytics
```bash
# Query analytics
curl -X POST http://localhost:3004/analytics/query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"metric_type": "performance", "time_window": "24h"}'

# Get service statistics
curl http://localhost:3004/analytics/services/publishing/statistics?hours=24 \
  -H "Authorization: Bearer <token>"

# Get dashboard metrics
curl http://localhost:3004/dashboard/metrics \
  -H "Authorization: Bearer <token>"
```

## Monitoring

### Prometheus Metrics
The service exposes Prometheus metrics at `/metrics`:
- `admin_requests_total`: Total HTTP requests
- `admin_request_duration_seconds`: Request duration histogram

### Health Checks
- `/health`: Overall service health including database and dependencies
- `/health/services`: Health status of all monitored services

### Logging
Structured JSON logging with configurable levels:
```json
{
  "time": "2025-11-18T10:00:00Z",
  "name": "admin.service",
  "level": "INFO",
  "message": "Service health check completed"
}
```

## Security

### Authentication
- JWT-based authentication with configurable expiration
- Password hashing using bcrypt
- Account lockout after failed login attempts

### Authorization
- Role-based access control (RBAC)
- Permission-based endpoint protection
- Service-to-service API key authentication

### Data Protection
- SQL injection prevention via parameterized queries
- CORS configuration for cross-origin requests
- Secrets management via environment variables

## Troubleshooting

### Database Connection Issues
```bash
# Test database connectivity
psql postgresql://marketplace_user:marketplace_password@localhost:5432/llm_marketplace

# Check connection pool stats
curl http://localhost:3004/admin/db/stats
```

### Service Health Issues
```bash
# Check which services are down
curl http://localhost:3004/health/services

# View health check history
curl http://localhost:3004/health/services/<service_name>/history?hours=1
```

### Performance Issues
```bash
# Check Prometheus metrics
curl http://localhost:3004/metrics | grep admin_request_duration

# Monitor database pool
# Check logs for slow queries
```

## Development

### Code Structure
```
services/admin/
├── main.py              # FastAPI application
├── config.py            # Configuration management
├── database.py          # Database connection
├── models.py            # SQLAlchemy models
├── schemas.py           # Pydantic schemas
├── auth.py              # Authentication utilities
├── services/            # Business logic
│   ├── health_monitor.py
│   ├── workflow_manager.py
│   ├── analytics_processor.py
│   └── user_manager.py
├── integrations/        # External service clients
│   └── analytics_client.py
└── tests/               # Test suite
```

### Code Quality
```bash
# Format code
black .

# Lint code
pylint *.py services/

# Type checking
mypy .
```

## Contributing

1. Follow PEP 8 style guide
2. Add tests for new features (maintain >80% coverage)
3. Update documentation
4. Use type hints
5. Write descriptive commit messages

## License

Copyright © 2025 LLM Marketplace. All rights reserved.

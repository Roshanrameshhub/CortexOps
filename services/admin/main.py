"""
Admin Service - Main Application
FastAPI application for monitoring, analytics, and administration
"""

import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional
from uuid import UUID

import uvicorn
from fastapi import FastAPI, Depends, HTTPException, status, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response
from sqlalchemy.orm import Session

from config import settings
from database import init_db, get_db, health_check as db_health_check, close_db
from models import WorkflowStatus, WorkflowType, UserRole, UserStatus
from schemas import (
    UserCreate, UserUpdate, UserResponse, UserLogin, Token,
    WorkflowCreate, WorkflowUpdate, WorkflowResponse,
    ServiceHealthSummary, HealthResponse,
    AnalyticsQuery, AnalyticsReport, ServiceStatistics, DashboardMetrics,
    AuditLogCreate, AuditLogResponse, PaginationParams, PaginatedResponse,
    SuccessResponse, ErrorResponse
)
from auth import (
    create_access_token, authenticate_user, get_current_user,
    get_current_active_user, require_admin, require_super_admin, require_approver
)
from services import health_monitor, workflow_manager, analytics_processor, user_manager
from integrations.analytics_client import analytics_client

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s' if settings.log_format == 'text'
    else '{"time":"%(asctime)s","name":"%(name)s","level":"%(levelname)s","message":"%(message)s"}',
    stream=sys.stdout
)

logger = logging.getLogger(__name__)

# Prometheus metrics
request_count = Counter('admin_requests_total', 'Total requests', ['method', 'endpoint', 'status'])
request_duration = Histogram('admin_request_duration_seconds', 'Request duration', ['method', 'endpoint'])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting Admin Service")

    # Initialize database
    try:
        init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

    # Start background health monitoring
    # asyncio.create_task(health_monitor.start_monitoring(get_db_context))

    yield

    # Shutdown
    logger.info("Shutting down Admin Service")
    health_monitor.stop_monitoring()
    close_db()


# Create FastAPI app
app = FastAPI(
    title="LLM Marketplace - Admin Service",
    description="Administrative service for monitoring, analytics, and workflow management",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Middleware for request tracking
@app.middleware("http")
async def track_requests(request: Request, call_next):
    """Track request metrics"""
    start_time = datetime.utcnow()

    response = await call_next(request)

    duration = (datetime.utcnow() - start_time).total_seconds()

    # Record metrics
    request_count.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()

    request_duration.labels(
        method=request.method,
        endpoint=request.url.path
    ).observe(duration)

    return response


# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.exception(f"Unhandled exception: {exc}")

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="InternalServerError",
            message="An unexpected error occurred",
            details={"error": str(exc)} if settings.debug else None
        ).model_dump()
    )


# ============================================================================
# HEALTH & MONITORING ENDPOINTS
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint
    Returns health status of admin service and monitored services
    """
    # Check database
    db_healthy = db_health_check()

    # Check all services
    service_checks = await health_monitor.check_all_services()

    # Determine overall status
    all_healthy = db_healthy and all(
        check.status.value == "healthy" for check in service_checks.values()
    )

    return HealthResponse(
        status="healthy" if all_healthy else "degraded",
        timestamp=datetime.utcnow(),
        services=service_checks,
        database=db_healthy,
        cache=True  # TODO: Add Redis health check
    )


@app.get("/health/services", response_model=ServiceHealthSummary)
async def get_service_health_summary(db: Session = Depends(get_db)):
    """Get summary of all service health statuses"""
    return health_monitor.get_health_summary(db)


@app.get("/health/services/{service_name}/history")
async def get_service_health_history(
    service_name: str,
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db)
):
    """Get health check history for a specific service"""
    history = health_monitor.get_service_health_history(db, service_name, hours)
    return {"service_name": service_name, "checks": history}


@app.get("/metrics")
async def get_prometheus_metrics():
    """Prometheus metrics endpoint"""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@app.post("/auth/login", response_model=Token)
async def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """
    User login
    Returns JWT access token
    """
    user = authenticate_user(db, user_login.username, user_login.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    access_token = create_access_token(user.id, user.role, user.permissions)

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.jwt_expiration_minutes * 60
    )


@app.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user = Depends(get_current_active_user)):
    """Get current user information"""
    return UserResponse.model_validate(current_user)


# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@app.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Create a new user (admin only)"""
    try:
        user = user_manager.create_user(db, user_data)
        return UserResponse.model_validate(user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.get("/users", response_model=PaginatedResponse)
async def list_users(
    role: Optional[UserRole] = None,
    status: Optional[UserStatus] = None,
    pagination: PaginationParams = Depends(),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """List all users with pagination and filters"""
    users, total = user_manager.list_users(
        db,
        role=role,
        status=status,
        skip=pagination.offset,
        limit=pagination.limit
    )

    user_responses = [UserResponse.model_validate(u) for u in users]
    return PaginatedResponse.create(user_responses, total, pagination)


@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Get user by ID"""
    user = user_manager.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse.model_validate(user)


@app.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    update_data: UserUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Update user information"""
    try:
        user = user_manager.update_user(db, user_id, update_data)
        return UserResponse.model_validate(user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@app.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    _: str = Depends(require_super_admin)
):
    """Delete user (soft delete, super admin only)"""
    try:
        user_manager.delete_user(db, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@app.post("/users/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Activate a pending user account"""
    try:
        user = user_manager.activate_user(db, user_id)
        return UserResponse.model_validate(user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@app.post("/users/{user_id}/suspend", response_model=UserResponse)
async def suspend_user(
    user_id: UUID,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Suspend a user account"""
    try:
        user = user_manager.suspend_user(db, user_id, reason)
        return UserResponse.model_validate(user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@app.get("/users/statistics", response_model=dict)
async def get_user_statistics(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Get user statistics"""
    return user_manager.get_user_statistics(db)


# ============================================================================
# WORKFLOW MANAGEMENT ENDPOINTS
# ============================================================================

@app.post("/workflows", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    workflow_data: WorkflowCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
):
    """Create a new approval workflow"""
    try:
        workflow = workflow_manager.create_workflow(db, workflow_data, current_user.id)
        return WorkflowResponse.model_validate(workflow)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.get("/workflows", response_model=PaginatedResponse)
async def list_workflows(
    status: Optional[WorkflowStatus] = None,
    workflow_type: Optional[WorkflowType] = None,
    service_id: Optional[UUID] = None,
    pagination: PaginationParams = Depends(),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
):
    """List workflows with filters"""
    # Non-admins can only see their own workflows
    requester_id = None if current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN] else current_user.id

    workflows, total = workflow_manager.list_workflows(
        db,
        status=status,
        workflow_type=workflow_type,
        requester_id=requester_id,
        service_id=service_id,
        skip=pagination.offset,
        limit=pagination.limit
    )

    workflow_responses = [WorkflowResponse.model_validate(w) for w in workflows]
    return PaginatedResponse.create(workflow_responses, total, pagination)


@app.get("/workflows/pending", response_model=List[WorkflowResponse])
async def get_pending_workflows(
    workflow_type: Optional[WorkflowType] = None,
    db: Session = Depends(get_db),
    _: str = Depends(require_approver)
):
    """Get all pending workflows (approvers only)"""
    workflows = workflow_manager.get_pending_workflows(db, workflow_type)
    return [WorkflowResponse.model_validate(w) for w in workflows]


@app.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
):
    """Get workflow by ID"""
    workflow = workflow_manager.get_workflow(db, workflow_id)

    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    # Check permissions
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.APPROVER]:
        if workflow.requester_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return WorkflowResponse.model_validate(workflow)


@app.patch("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: UUID,
    update_data: WorkflowUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_approver)
):
    """Update workflow status (approve/reject)"""
    try:
        workflow = workflow_manager.update_workflow(db, workflow_id, update_data, current_user.id)
        return WorkflowResponse.model_validate(workflow)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/workflows/{workflow_id}/cancel", response_model=WorkflowResponse)
async def cancel_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user)
):
    """Cancel a pending workflow"""
    try:
        workflow = workflow_manager.cancel_workflow(db, workflow_id, current_user.id)
        return WorkflowResponse.model_validate(workflow)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.get("/workflows/statistics", response_model=dict)
async def get_workflow_statistics(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Get workflow statistics"""
    return workflow_manager.get_workflow_statistics(db)


# ============================================================================
# ANALYTICS ENDPOINTS
# ============================================================================

@app.post("/analytics/query", response_model=List)
async def query_analytics(
    query: AnalyticsQuery,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_active_user)
):
    """Query aggregated analytics data"""
    metrics = analytics_processor.query_metrics(db, query)
    return metrics


@app.get("/analytics/services/{service_name}/statistics", response_model=ServiceStatistics)
async def get_service_statistics(
    service_name: str,
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_active_user)
):
    """Get comprehensive statistics for a service"""
    return analytics_processor.calculate_service_statistics(db, service_name, hours)


@app.get("/analytics/trends/{metric_name}")
async def get_trend_analysis(
    metric_name: str,
    service_id: Optional[UUID] = None,
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_active_user)
):
    """Get trend analysis for a metric"""
    return analytics_processor.generate_trend_analysis(db, metric_name, service_id, days)


@app.get("/dashboard/metrics", response_model=DashboardMetrics)
async def get_dashboard_metrics(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_active_user)
):
    """Get dashboard overview metrics"""
    health_summary = health_monitor.get_health_summary(db)
    user_stats = user_manager.get_user_statistics(db)
    workflow_stats = workflow_manager.get_workflow_statistics(db)

    return DashboardMetrics(
        total_services=health_summary.total_services,
        active_services=health_summary.healthy,
        total_users=user_stats["total"],
        active_users=user_stats["active"],
        total_requests_24h=0,  # TODO: Calculate from metrics
        error_rate_24h=0.0,  # TODO: Calculate from metrics
        avg_response_time_ms=0.0,  # TODO: Calculate from metrics
        pending_workflows=workflow_stats["pending"],
        health_summary=health_summary
    )


# ============================================================================
# SYSTEM ADMINISTRATION ENDPOINTS
# ============================================================================

@app.post("/admin/cleanup/health")
async def cleanup_health_records(
    retention_days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Cleanup old health check records"""
    deleted = health_monitor.cleanup_old_health_records(db, retention_days)
    return SuccessResponse(message=f"Deleted {deleted} old health records")


@app.post("/admin/cleanup/metrics")
async def cleanup_metrics(
    retention_days: Optional[int] = None,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Cleanup old aggregated metrics"""
    deleted = analytics_processor.cleanup_old_metrics(db, retention_days)
    return SuccessResponse(message=f"Deleted {deleted} old metric records")


@app.post("/admin/workflows/expire")
async def expire_workflows(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin)
):
    """Mark expired workflows"""
    expired = workflow_manager.expire_old_workflows(db)
    return SuccessResponse(message=f"Expired {expired} workflows")


# ============================================================================
# ROOT ENDPOINT
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "LLM Marketplace - Admin Service",
        "version": "1.0.0",
        "status": "running",
        "timestamp": datetime.utcnow().isoformat()
    }


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )

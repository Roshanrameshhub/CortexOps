"""
Pydantic Schemas for Request/Response Validation
Data Transfer Objects (DTOs) for API endpoints
"""

from pydantic import BaseModel, Field, EmailStr, validator, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

from models import (
    UserRole, UserStatus, WorkflowStatus, WorkflowType,
    ServiceHealthStatus
)


# Base Schemas
class TimestampMixin(BaseModel):
    """Mixin for timestamp fields"""
    created_at: datetime
    updated_at: Optional[datetime] = None


# User Schemas
class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    full_name: Optional[str] = Field(None, max_length=255)
    role: UserRole = UserRole.VIEWER
    permissions: List[str] = Field(default_factory=list)


class UserCreate(UserBase):
    """Schema for creating a new user"""
    password: str = Field(..., min_length=8)

    @validator('password')
    def validate_password(cls, v):
        """Validate password strength"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v


class UserUpdate(BaseModel):
    """Schema for updating user information"""
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    permissions: Optional[List[str]] = None


class UserResponse(UserBase, TimestampMixin):
    """Schema for user response"""
    id: UUID
    status: UserStatus
    last_login_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserLogin(BaseModel):
    """Schema for user login"""
    username: str
    password: str


class Token(BaseModel):
    """JWT token response"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# Workflow Schemas
class WorkflowBase(BaseModel):
    """Base workflow schema"""
    workflow_type: WorkflowType
    service_id: Optional[UUID] = None
    service_name: Optional[str] = None
    service_version: Optional[str] = None
    request_data: Dict[str, Any]


class WorkflowCreate(WorkflowBase):
    """Schema for creating approval workflow"""
    pass


class WorkflowUpdate(BaseModel):
    """Schema for updating workflow"""
    status: WorkflowStatus
    approval_notes: Optional[str] = None
    rejection_reason: Optional[str] = None


class WorkflowResponse(WorkflowBase, TimestampMixin):
    """Schema for workflow response"""
    id: UUID
    status: WorkflowStatus
    requester_id: UUID
    approver_id: Optional[UUID] = None
    approval_notes: Optional[str] = None
    rejection_reason: Optional[str] = None
    requested_at: datetime
    reviewed_at: Optional[datetime] = None
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Health Monitoring Schemas
class ServiceHealthCheck(BaseModel):
    """Schema for service health check result"""
    service_name: str
    service_url: str
    status: ServiceHealthStatus
    response_time_ms: Optional[float] = None
    health_data: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    checked_at: datetime


class ServiceHealthSummary(BaseModel):
    """Summary of service health across all services"""
    total_services: int
    healthy: int
    degraded: int
    down: int
    unknown: int
    services: List[ServiceHealthCheck]


class HealthResponse(BaseModel):
    """Overall system health response"""
    status: str
    timestamp: datetime
    services: Dict[str, ServiceHealthCheck]
    database: bool
    cache: bool


# Analytics Schemas
class MetricValue(BaseModel):
    """Individual metric value"""
    value: float
    count: int = 0
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    avg_value: Optional[float] = None
    p50_value: Optional[float] = None
    p95_value: Optional[float] = None
    p99_value: Optional[float] = None


class AggregatedMetric(BaseModel):
    """Aggregated metric response"""
    id: UUID
    metric_type: str
    metric_name: str
    service_id: Optional[UUID] = None
    service_name: Optional[str] = None
    time_window: str
    value: float
    count: int
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    avg_value: Optional[float] = None
    p50_value: Optional[float] = None
    p95_value: Optional[float] = None
    p99_value: Optional[float] = None
    dimensions: Dict[str, Any] = Field(default_factory=dict)
    window_start: datetime
    window_end: datetime

    model_config = ConfigDict(from_attributes=True)


class AnalyticsQuery(BaseModel):
    """Schema for analytics query"""
    metric_type: Optional[str] = None
    metric_names: Optional[List[str]] = None
    service_id: Optional[UUID] = None
    service_name: Optional[str] = None
    time_window: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    aggregation: Optional[str] = "avg"  # avg, sum, min, max


class AnalyticsReport(BaseModel):
    """Analytics report response"""
    title: str
    description: Optional[str] = None
    time_range: Dict[str, datetime]
    metrics: List[AggregatedMetric]
    summary: Dict[str, Any]
    generated_at: datetime


class ServiceStatistics(BaseModel):
    """Service statistics summary"""
    service_name: str
    total_requests: int
    total_errors: int
    error_rate: float
    avg_response_time_ms: float
    p95_response_time_ms: Optional[float] = None
    p99_response_time_ms: Optional[float] = None
    active_users: int
    uptime_percentage: float


class DashboardMetrics(BaseModel):
    """Dashboard metrics overview"""
    total_services: int
    active_services: int
    total_users: int
    active_users: int
    total_requests_24h: int
    error_rate_24h: float
    avg_response_time_ms: float
    pending_workflows: int
    health_summary: ServiceHealthSummary


# Audit Log Schemas
class AuditLogCreate(BaseModel):
    """Schema for creating audit log"""
    event_type: str
    action: str
    user_id: Optional[UUID] = None
    actor_type: str = "user"
    resource_id: Optional[UUID] = None
    resource_type: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[UUID] = None
    success: bool = True
    error_message: Optional[str] = None


class AuditLogResponse(AuditLogCreate):
    """Schema for audit log response"""
    id: UUID
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


# Pagination Schemas
class PaginationParams(BaseModel):
    """Pagination parameters"""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


class PaginatedResponse(BaseModel):
    """Paginated response wrapper"""
    items: List[Any]
    total: int
    page: int
    page_size: int
    total_pages: int

    @staticmethod
    def create(items: List[Any], total: int, pagination: PaginationParams):
        """Create paginated response"""
        import math
        return PaginatedResponse(
            items=items,
            total=total,
            page=pagination.page,
            page_size=pagination.page_size,
            total_pages=math.ceil(total / pagination.page_size)
        )


# Configuration Schemas
class SystemConfigCreate(BaseModel):
    """Schema for creating system configuration"""
    key: str
    value: Dict[str, Any]
    description: Optional[str] = None
    category: Optional[str] = None
    is_secret: bool = False
    is_editable: bool = True


class SystemConfigUpdate(BaseModel):
    """Schema for updating system configuration"""
    value: Dict[str, Any]
    description: Optional[str] = None


class SystemConfigResponse(SystemConfigCreate, TimestampMixin):
    """Schema for system configuration response"""
    id: UUID
    updated_by: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


# Error Response Schema
class ErrorResponse(BaseModel):
    """Standard error response"""
    error: str
    message: str
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    request_id: Optional[str] = None


# Success Response Schema
class SuccessResponse(BaseModel):
    """Standard success response"""
    success: bool = True
    message: str
    data: Optional[Dict[str, Any]] = None

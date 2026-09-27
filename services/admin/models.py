"""
Database Models for Admin Service
SQLAlchemy ORM models for users, workflows, audit logs, and metrics
"""

from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Text, Enum as SQLEnum,
    ForeignKey, JSON, Float, Index, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, DeclarativeBase
from sqlalchemy.sql import func
from datetime import datetime
from enum import Enum
import uuid


class Base(DeclarativeBase):
    """Base class for all models"""
    pass


# Enums
class UserRole(str, Enum):
    """User roles in the system"""
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    APPROVER = "approver"
    VIEWER = "viewer"
    SERVICE_ACCOUNT = "service_account"


class UserStatus(str, Enum):
    """User account status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING = "pending"


class WorkflowStatus(str, Enum):
    """Workflow approval status"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class WorkflowType(str, Enum):
    """Types of workflows"""
    SERVICE_PUBLISH = "service_publish"
    SERVICE_UPDATE = "service_update"
    SERVICE_DELETE = "service_delete"
    USER_PERMISSION = "user_permission"
    POLICY_CHANGE = "policy_change"


class ServiceHealthStatus(str, Enum):
    """Service health status"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    UNKNOWN = "unknown"


# Models
class User(Base):
    """User model for authentication and authorization"""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(255))
    hashed_password = Column(String(255), nullable=False)

    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.VIEWER)
    status = Column(SQLEnum(UserStatus), nullable=False, default=UserStatus.PENDING)

    # Permissions (stored as JSON array)
    permissions = Column(JSONB, default=list)

    # Metadata
    metadata = Column(JSONB, default=dict)
    last_login_at = Column(DateTime(timezone=True))
    password_changed_at = Column(DateTime(timezone=True))
    failed_login_attempts = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True))

    # Relationships
    created_workflows = relationship("ApprovalWorkflow", back_populates="requester", foreign_keys="ApprovalWorkflow.requester_id")
    approved_workflows = relationship("ApprovalWorkflow", back_populates="approver", foreign_keys="ApprovalWorkflow.approver_id")
    audit_logs = relationship("AuditLog", back_populates="user")

    __table_args__ = (
        Index('idx_users_role_status', 'role', 'status'),
        Index('idx_users_created_at', 'created_at'),
    )


class ApprovalWorkflow(Base):
    """Approval workflow for service publishing and updates"""
    __tablename__ = "approval_workflows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_type = Column(SQLEnum(WorkflowType), nullable=False)
    status = Column(SQLEnum(WorkflowStatus), nullable=False, default=WorkflowStatus.PENDING)

    # Service information
    service_id = Column(UUID(as_uuid=True), index=True)
    service_name = Column(String(255))
    service_version = Column(String(50))

    # Request details
    requester_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    approver_id = Column(UUID(as_uuid=True), ForeignKey('users.id'))

    # Workflow data
    request_data = Column(JSONB, nullable=False)
    approval_notes = Column(Text)
    rejection_reason = Column(Text)

    # Timestamps
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reviewed_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True), nullable=False)

    # Metadata
    metadata = Column(JSONB, default=dict)

    # Relationships
    requester = relationship("User", back_populates="created_workflows", foreign_keys=[requester_id])
    approver = relationship("User", back_populates="approved_workflows", foreign_keys=[approver_id])

    __table_args__ = (
        Index('idx_workflows_status_type', 'status', 'workflow_type'),
        Index('idx_workflows_service', 'service_id'),
        Index('idx_workflows_requested_at', 'requested_at'),
    )


class ServiceHealth(Base):
    """Service health monitoring records"""
    __tablename__ = "service_health"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_name = Column(String(100), nullable=False, index=True)
    service_url = Column(String(500))

    status = Column(SQLEnum(ServiceHealthStatus), nullable=False)
    response_time_ms = Column(Float)

    # Health check details
    health_data = Column(JSONB, default=dict)
    error_message = Column(Text)

    # Timestamps
    checked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        Index('idx_service_health_name_checked', 'service_name', 'checked_at'),
        Index('idx_service_health_status', 'status'),
    )


class AggregatedMetrics(Base):
    """Aggregated metrics for analytics"""
    __tablename__ = "aggregated_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Metric identification
    metric_type = Column(String(100), nullable=False, index=True)
    metric_name = Column(String(255), nullable=False)

    # Dimensions
    service_id = Column(UUID(as_uuid=True), index=True)
    service_name = Column(String(255))
    time_window = Column(String(50), nullable=False)  # 1h, 24h, 7d, 30d

    # Metric values
    value = Column(Float, nullable=False)
    count = Column(Integer, default=0)
    min_value = Column(Float)
    max_value = Column(Float)
    avg_value = Column(Float)
    p50_value = Column(Float)
    p95_value = Column(Float)
    p99_value = Column(Float)

    # Additional data
    dimensions = Column(JSONB, default=dict)
    metadata = Column(JSONB, default=dict)

    # Timestamps
    window_start = Column(DateTime(timezone=True), nullable=False, index=True)
    window_end = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_metrics_type_window', 'metric_type', 'time_window', 'window_start'),
        Index('idx_metrics_service_window', 'service_id', 'window_start'),
        UniqueConstraint('metric_type', 'metric_name', 'service_id', 'time_window', 'window_start',
                        name='uq_metric_window'),
    )


class AuditLog(Base):
    """Audit log for all admin operations"""
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Event information
    event_type = Column(String(100), nullable=False, index=True)
    action = Column(String(100), nullable=False)

    # Actor information
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), index=True)
    actor_type = Column(String(50), nullable=False)  # user, system, service

    # Resource information
    resource_id = Column(UUID(as_uuid=True), index=True)
    resource_type = Column(String(100), index=True)

    # Event details
    details = Column(JSONB, nullable=False, default=dict)

    # Request context
    ip_address = Column(String(45))  # IPv6 compatible
    user_agent = Column(Text)
    request_id = Column(UUID(as_uuid=True))

    # Result
    success = Column(Boolean, nullable=False, default=True)
    error_message = Column(Text)

    # Timestamp
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Relationships
    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index('idx_audit_event_timestamp', 'event_type', 'timestamp'),
        Index('idx_audit_resource', 'resource_type', 'resource_id'),
        Index('idx_audit_user_timestamp', 'user_id', 'timestamp'),
    )


class SystemConfiguration(Base):
    """System-wide configuration settings"""
    __tablename__ = "system_configuration"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(255), unique=True, nullable=False, index=True)
    value = Column(JSONB, nullable=False)
    description = Column(Text)

    # Metadata
    category = Column(String(100), index=True)
    is_secret = Column(Boolean, default=False)
    is_editable = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(UUID(as_uuid=True), ForeignKey('users.id'))


class ServiceMetrics(Base):
    """Real-time service metrics snapshot"""
    __tablename__ = "service_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_name = Column(String(100), nullable=False, index=True)

    # Performance metrics
    request_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    avg_response_time_ms = Column(Float)
    p95_response_time_ms = Column(Float)
    p99_response_time_ms = Column(Float)

    # Resource metrics
    cpu_usage_percent = Column(Float)
    memory_usage_mb = Column(Float)
    disk_usage_mb = Column(Float)

    # Business metrics
    active_users = Column(Integer, default=0)
    total_services = Column(Integer, default=0)

    # Additional metrics
    custom_metrics = Column(JSONB, default=dict)

    # Timestamps
    collected_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        Index('idx_service_metrics_name_collected', 'service_name', 'collected_at'),
    )

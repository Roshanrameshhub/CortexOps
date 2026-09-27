"""
Workflow Management Service
Handles approval workflows for service publishing and administrative actions
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models import ApprovalWorkflow, WorkflowStatus, WorkflowType, User
from schemas import WorkflowCreate, WorkflowUpdate, WorkflowResponse
from config import settings

logger = logging.getLogger(__name__)


class WorkflowManager:
    """Approval workflow management"""

    def __init__(self):
        self.approval_timeout = settings.workflow_approval_timeout
        self.auto_approve_threshold = settings.workflow_auto_approve_threshold

    def create_workflow(
        self,
        db: Session,
        workflow_data: WorkflowCreate,
        requester_id: UUID
    ) -> ApprovalWorkflow:
        """
        Create a new approval workflow

        Args:
            db: Database session
            workflow_data: Workflow creation data
            requester_id: ID of the user requesting approval

        Returns:
            Created ApprovalWorkflow object
        """
        try:
            # Calculate expiration time
            expires_at = datetime.utcnow() + timedelta(seconds=self.approval_timeout)

            # Create workflow
            workflow = ApprovalWorkflow(
                workflow_type=workflow_data.workflow_type,
                service_id=workflow_data.service_id,
                service_name=workflow_data.service_name,
                service_version=workflow_data.service_version,
                requester_id=requester_id,
                request_data=workflow_data.request_data,
                status=WorkflowStatus.PENDING,
                expires_at=expires_at
            )

            db.add(workflow)
            db.commit()
            db.refresh(workflow)

            logger.info(
                f"Created workflow {workflow.id} of type {workflow.workflow_type} "
                f"for user {requester_id}"
            )

            return workflow

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create workflow: {e}")
            raise

    def update_workflow(
        self,
        db: Session,
        workflow_id: UUID,
        update_data: WorkflowUpdate,
        approver_id: UUID
    ) -> ApprovalWorkflow:
        """
        Update workflow status (approve/reject)

        Args:
            db: Database session
            workflow_id: ID of the workflow to update
            update_data: Workflow update data
            approver_id: ID of the user approving/rejecting

        Returns:
            Updated ApprovalWorkflow object
        """
        try:
            workflow = db.query(ApprovalWorkflow).filter(
                ApprovalWorkflow.id == workflow_id
            ).first()

            if not workflow:
                raise ValueError(f"Workflow {workflow_id} not found")

            if workflow.status != WorkflowStatus.PENDING:
                raise ValueError(f"Workflow {workflow_id} is not pending")

            # Check if expired
            if workflow.expires_at < datetime.utcnow():
                workflow.status = WorkflowStatus.EXPIRED
                db.commit()
                raise ValueError(f"Workflow {workflow_id} has expired")

            # Update workflow
            workflow.status = update_data.status
            workflow.approver_id = approver_id
            workflow.approval_notes = update_data.approval_notes
            workflow.rejection_reason = update_data.rejection_reason
            workflow.reviewed_at = datetime.utcnow()

            db.commit()
            db.refresh(workflow)

            logger.info(
                f"Workflow {workflow_id} updated to {update_data.status} "
                f"by user {approver_id}"
            )

            return workflow

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update workflow: {e}")
            raise

    def get_workflow(self, db: Session, workflow_id: UUID) -> Optional[ApprovalWorkflow]:
        """
        Get workflow by ID

        Args:
            db: Database session
            workflow_id: Workflow ID

        Returns:
            ApprovalWorkflow object or None
        """
        return db.query(ApprovalWorkflow).filter(
            ApprovalWorkflow.id == workflow_id
        ).first()

    def list_workflows(
        self,
        db: Session,
        status: Optional[WorkflowStatus] = None,
        workflow_type: Optional[WorkflowType] = None,
        requester_id: Optional[UUID] = None,
        service_id: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[ApprovalWorkflow], int]:
        """
        List workflows with filters

        Args:
            db: Database session
            status: Filter by workflow status
            workflow_type: Filter by workflow type
            requester_id: Filter by requester
            service_id: Filter by service
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (workflows list, total count)
        """
        query = db.query(ApprovalWorkflow)

        # Apply filters
        if status:
            query = query.filter(ApprovalWorkflow.status == status)
        if workflow_type:
            query = query.filter(ApprovalWorkflow.workflow_type == workflow_type)
        if requester_id:
            query = query.filter(ApprovalWorkflow.requester_id == requester_id)
        if service_id:
            query = query.filter(ApprovalWorkflow.service_id == service_id)

        # Get total count
        total = query.count()

        # Get paginated results
        workflows = query.order_by(
            ApprovalWorkflow.requested_at.desc()
        ).offset(skip).limit(limit).all()

        return workflows, total

    def get_pending_workflows(
        self,
        db: Session,
        workflow_type: Optional[WorkflowType] = None
    ) -> List[ApprovalWorkflow]:
        """
        Get all pending workflows

        Args:
            db: Database session
            workflow_type: Optional filter by workflow type

        Returns:
            List of pending workflows
        """
        query = db.query(ApprovalWorkflow).filter(
            ApprovalWorkflow.status == WorkflowStatus.PENDING,
            ApprovalWorkflow.expires_at > datetime.utcnow()
        )

        if workflow_type:
            query = query.filter(ApprovalWorkflow.workflow_type == workflow_type)

        return query.order_by(ApprovalWorkflow.requested_at.asc()).all()

    def cancel_workflow(
        self,
        db: Session,
        workflow_id: UUID,
        requester_id: UUID
    ) -> ApprovalWorkflow:
        """
        Cancel a pending workflow

        Args:
            db: Database session
            workflow_id: Workflow ID
            requester_id: ID of the user requesting cancellation

        Returns:
            Cancelled workflow
        """
        try:
            workflow = db.query(ApprovalWorkflow).filter(
                ApprovalWorkflow.id == workflow_id
            ).first()

            if not workflow:
                raise ValueError(f"Workflow {workflow_id} not found")

            if workflow.requester_id != requester_id:
                raise ValueError("Only the requester can cancel a workflow")

            if workflow.status != WorkflowStatus.PENDING:
                raise ValueError(f"Cannot cancel workflow with status {workflow.status}")

            workflow.status = WorkflowStatus.CANCELLED
            workflow.reviewed_at = datetime.utcnow()

            db.commit()
            db.refresh(workflow)

            logger.info(f"Workflow {workflow_id} cancelled by requester {requester_id}")

            return workflow

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to cancel workflow: {e}")
            raise

    def expire_old_workflows(self, db: Session) -> int:
        """
        Mark expired workflows

        Args:
            db: Database session

        Returns:
            Number of workflows expired
        """
        try:
            expired_count = (
                db.query(ApprovalWorkflow)
                .filter(
                    ApprovalWorkflow.status == WorkflowStatus.PENDING,
                    ApprovalWorkflow.expires_at < datetime.utcnow()
                )
                .update(
                    {
                        "status": WorkflowStatus.EXPIRED,
                        "reviewed_at": datetime.utcnow()
                    },
                    synchronize_session=False
                )
            )

            db.commit()

            if expired_count > 0:
                logger.info(f"Expired {expired_count} workflows")

            return expired_count

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to expire workflows: {e}")
            raise

    def get_workflow_statistics(self, db: Session) -> Dict[str, Any]:
        """
        Get workflow statistics

        Args:
            db: Database session

        Returns:
            Dictionary with workflow statistics
        """
        total_workflows = db.query(ApprovalWorkflow).count()

        pending = db.query(ApprovalWorkflow).filter(
            ApprovalWorkflow.status == WorkflowStatus.PENDING
        ).count()

        approved = db.query(ApprovalWorkflow).filter(
            ApprovalWorkflow.status == WorkflowStatus.APPROVED
        ).count()

        rejected = db.query(ApprovalWorkflow).filter(
            ApprovalWorkflow.status == WorkflowStatus.REJECTED
        ).count()

        expired = db.query(ApprovalWorkflow).filter(
            ApprovalWorkflow.status == WorkflowStatus.EXPIRED
        ).count()

        # Calculate average approval time
        from sqlalchemy import func
        avg_time = db.query(
            func.avg(
                func.extract('epoch', ApprovalWorkflow.reviewed_at - ApprovalWorkflow.requested_at)
            )
        ).filter(
            ApprovalWorkflow.status.in_([WorkflowStatus.APPROVED, WorkflowStatus.REJECTED])
        ).scalar()

        return {
            "total": total_workflows,
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "expired": expired,
            "cancelled": total_workflows - (pending + approved + rejected + expired),
            "approval_rate": (approved / total_workflows * 100) if total_workflows > 0 else 0,
            "rejection_rate": (rejected / total_workflows * 100) if total_workflows > 0 else 0,
            "average_approval_time_seconds": float(avg_time) if avg_time else 0
        }

    def check_auto_approval(
        self,
        db: Session,
        requester_id: UUID,
        workflow_type: WorkflowType
    ) -> bool:
        """
        Check if user qualifies for auto-approval

        Args:
            db: Database session
            requester_id: ID of the requester
            workflow_type: Type of workflow

        Returns:
            True if auto-approval should be granted
        """
        # Count recent approved workflows of same type
        recent_approved = db.query(ApprovalWorkflow).filter(
            ApprovalWorkflow.requester_id == requester_id,
            ApprovalWorkflow.workflow_type == workflow_type,
            ApprovalWorkflow.status == WorkflowStatus.APPROVED,
            ApprovalWorkflow.requested_at >= datetime.utcnow() - timedelta(days=30)
        ).count()

        return recent_approved >= self.auto_approve_threshold


# Global workflow manager instance
workflow_manager = WorkflowManager()

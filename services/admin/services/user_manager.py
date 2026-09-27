"""
User Management Service
Handles user CRUD operations, role management, and permissions
"""

import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import or_
from passlib.context import CryptContext

from models import User, UserRole, UserStatus
from schemas import UserCreate, UserUpdate, UserResponse
from config import settings

logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserManager:
    """User management operations"""

    def __init__(self):
        self.pwd_context = pwd_context

    def hash_password(self, password: str) -> str:
        """Hash a password"""
        return self.pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return self.pwd_context.verify(plain_password, hashed_password)

    def create_user(self, db: Session, user_data: UserCreate) -> User:
        """
        Create a new user

        Args:
            db: Database session
            user_data: User creation data

        Returns:
            Created User object
        """
        try:
            # Check if user already exists
            existing = db.query(User).filter(
                or_(
                    User.email == user_data.email,
                    User.username == user_data.username
                )
            ).first()

            if existing:
                if existing.email == user_data.email:
                    raise ValueError(f"Email {user_data.email} already exists")
                else:
                    raise ValueError(f"Username {user_data.username} already exists")

            # Hash password
            hashed_password = self.hash_password(user_data.password)

            # Create user
            user = User(
                email=user_data.email,
                username=user_data.username,
                full_name=user_data.full_name,
                hashed_password=hashed_password,
                role=user_data.role,
                permissions=user_data.permissions,
                status=UserStatus.PENDING,  # Require activation
                password_changed_at=datetime.utcnow()
            )

            db.add(user)
            db.commit()
            db.refresh(user)

            logger.info(f"Created user {user.username} ({user.id})")

            return user

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create user: {e}")
            raise

    def get_user(self, db: Session, user_id: UUID) -> Optional[User]:
        """
        Get user by ID

        Args:
            db: Database session
            user_id: User ID

        Returns:
            User object or None
        """
        return db.query(User).filter(
            User.id == user_id,
            User.deleted_at.is_(None)
        ).first()

    def get_user_by_username(self, db: Session, username: str) -> Optional[User]:
        """
        Get user by username

        Args:
            db: Database session
            username: Username

        Returns:
            User object or None
        """
        return db.query(User).filter(
            User.username == username,
            User.deleted_at.is_(None)
        ).first()

    def get_user_by_email(self, db: Session, email: str) -> Optional[User]:
        """
        Get user by email

        Args:
            db: Database session
            email: Email address

        Returns:
            User object or None
        """
        return db.query(User).filter(
            User.email == email,
            User.deleted_at.is_(None)
        ).first()

    def update_user(
        self,
        db: Session,
        user_id: UUID,
        update_data: UserUpdate
    ) -> User:
        """
        Update user information

        Args:
            db: Database session
            user_id: User ID
            update_data: User update data

        Returns:
            Updated User object
        """
        try:
            user = self.get_user(db, user_id)
            if not user:
                raise ValueError(f"User {user_id} not found")

            # Update fields
            if update_data.full_name is not None:
                user.full_name = update_data.full_name
            if update_data.role is not None:
                user.role = update_data.role
            if update_data.status is not None:
                user.status = update_data.status
            if update_data.permissions is not None:
                user.permissions = update_data.permissions

            user.updated_at = datetime.utcnow()

            db.commit()
            db.refresh(user)

            logger.info(f"Updated user {user.username} ({user.id})")

            return user

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update user: {e}")
            raise

    def delete_user(self, db: Session, user_id: UUID) -> bool:
        """
        Soft delete a user

        Args:
            db: Database session
            user_id: User ID

        Returns:
            True if successful
        """
        try:
            user = self.get_user(db, user_id)
            if not user:
                raise ValueError(f"User {user_id} not found")

            # Soft delete
            user.deleted_at = datetime.utcnow()
            user.status = UserStatus.INACTIVE

            db.commit()

            logger.info(f"Deleted user {user.username} ({user.id})")

            return True

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to delete user: {e}")
            raise

    def list_users(
        self,
        db: Session,
        role: Optional[UserRole] = None,
        status: Optional[UserStatus] = None,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[User], int]:
        """
        List users with filters

        Args:
            db: Database session
            role: Filter by role
            status: Filter by status
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (users list, total count)
        """
        query = db.query(User).filter(User.deleted_at.is_(None))

        # Apply filters
        if role:
            query = query.filter(User.role == role)
        if status:
            query = query.filter(User.status == status)

        # Get total count
        total = query.count()

        # Get paginated results
        users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

        return users, total

    def activate_user(self, db: Session, user_id: UUID) -> User:
        """
        Activate a pending user account

        Args:
            db: Database session
            user_id: User ID

        Returns:
            Activated User object
        """
        try:
            user = self.get_user(db, user_id)
            if not user:
                raise ValueError(f"User {user_id} not found")

            user.status = UserStatus.ACTIVE
            user.updated_at = datetime.utcnow()

            db.commit()
            db.refresh(user)

            logger.info(f"Activated user {user.username} ({user.id})")

            return user

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to activate user: {e}")
            raise

    def suspend_user(self, db: Session, user_id: UUID, reason: str = None) -> User:
        """
        Suspend a user account

        Args:
            db: Database session
            user_id: User ID
            reason: Optional suspension reason

        Returns:
            Suspended User object
        """
        try:
            user = self.get_user(db, user_id)
            if not user:
                raise ValueError(f"User {user_id} not found")

            user.status = UserStatus.SUSPENDED
            user.updated_at = datetime.utcnow()

            if reason:
                user.metadata = user.metadata or {}
                user.metadata['suspension_reason'] = reason
                user.metadata['suspended_at'] = datetime.utcnow().isoformat()

            db.commit()
            db.refresh(user)

            logger.info(f"Suspended user {user.username} ({user.id})")

            return user

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to suspend user: {e}")
            raise

    def change_password(
        self,
        db: Session,
        user_id: UUID,
        old_password: str,
        new_password: str
    ) -> bool:
        """
        Change user password

        Args:
            db: Database session
            user_id: User ID
            old_password: Current password
            new_password: New password

        Returns:
            True if successful
        """
        try:
            user = self.get_user(db, user_id)
            if not user:
                raise ValueError(f"User {user_id} not found")

            # Verify old password
            if not self.verify_password(old_password, user.hashed_password):
                raise ValueError("Incorrect password")

            # Hash new password
            user.hashed_password = self.hash_password(new_password)
            user.password_changed_at = datetime.utcnow()
            user.failed_login_attempts = 0

            db.commit()

            logger.info(f"Changed password for user {user.username} ({user.id})")

            return True

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to change password: {e}")
            raise

    def reset_password(self, db: Session, user_id: UUID, new_password: str) -> bool:
        """
        Reset user password (admin operation)

        Args:
            db: Database session
            user_id: User ID
            new_password: New password

        Returns:
            True if successful
        """
        try:
            user = self.get_user(db, user_id)
            if not user:
                raise ValueError(f"User {user_id} not found")

            # Hash new password
            user.hashed_password = self.hash_password(new_password)
            user.password_changed_at = datetime.utcnow()
            user.failed_login_attempts = 0

            db.commit()

            logger.info(f"Reset password for user {user.username} ({user.id})")

            return True

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to reset password: {e}")
            raise

    def record_login_attempt(
        self,
        db: Session,
        username: str,
        success: bool
    ) -> None:
        """
        Record login attempt

        Args:
            db: Database session
            username: Username
            success: Whether login was successful
        """
        try:
            user = self.get_user_by_username(db, username)
            if not user:
                return

            if success:
                user.last_login_at = datetime.utcnow()
                user.failed_login_attempts = 0
            else:
                user.failed_login_attempts += 1

                # Lock account after 5 failed attempts
                if user.failed_login_attempts >= 5:
                    user.status = UserStatus.SUSPENDED
                    user.metadata = user.metadata or {}
                    user.metadata['lock_reason'] = 'Too many failed login attempts'
                    logger.warning(f"Locked user account {user.username} due to failed login attempts")

            db.commit()

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to record login attempt: {e}")

    def has_permission(self, user: User, permission: str) -> bool:
        """
        Check if user has a specific permission

        Args:
            user: User object
            permission: Permission string

        Returns:
            True if user has permission
        """
        # Super admins have all permissions
        if user.role == UserRole.SUPER_ADMIN:
            return True

        # Check explicit permissions
        return permission in (user.permissions or [])

    def get_user_statistics(self, db: Session) -> dict:
        """
        Get user statistics

        Args:
            db: Database session

        Returns:
            Dictionary with user statistics
        """
        total_users = db.query(User).filter(User.deleted_at.is_(None)).count()

        active_users = db.query(User).filter(
            User.status == UserStatus.ACTIVE,
            User.deleted_at.is_(None)
        ).count()

        suspended_users = db.query(User).filter(
            User.status == UserStatus.SUSPENDED,
            User.deleted_at.is_(None)
        ).count()

        # Count by role
        role_counts = {}
        for role in UserRole:
            count = db.query(User).filter(
                User.role == role,
                User.deleted_at.is_(None)
            ).count()
            role_counts[role.value] = count

        return {
            "total": total_users,
            "active": active_users,
            "suspended": suspended_users,
            "inactive": total_users - active_users - suspended_users,
            "by_role": role_counts
        }


# Global user manager instance
user_manager = UserManager()

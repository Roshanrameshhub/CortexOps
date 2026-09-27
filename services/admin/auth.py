"""
Authentication and Authorization Module
JWT token management and permission checking
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import User, UserRole, UserStatus
from services.user_manager import user_manager

logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer()


def create_access_token(user_id: UUID, role: UserRole, permissions: list = None) -> str:
    """
    Create JWT access token

    Args:
        user_id: User ID
        role: User role
        permissions: List of user permissions

    Returns:
        JWT token string
    """
    expires_delta = timedelta(minutes=settings.jwt_expiration_minutes)
    expire = datetime.utcnow() + expires_delta

    to_encode = {
        "sub": str(user_id),
        "role": role.value,
        "permissions": permissions or [],
        "exp": expire,
        "iat": datetime.utcnow()
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm
    )

    return encoded_jwt


def decode_token(token: str) -> dict:
    """
    Decode and validate JWT token

    Args:
        token: JWT token string

    Returns:
        Decoded token payload

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm]
        )
        return payload

    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Get current authenticated user from JWT token

    Args:
        credentials: HTTP authorization credentials
        db: Database session

    Returns:
        User object

    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials
    payload = decode_token(token)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )

    try:
        user = user_manager.get_user(db, UUID(user_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID"
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User account is {user.status.value}"
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get current active user

    Args:
        current_user: Current user from token

    Returns:
        Active User object

    Raises:
        HTTPException: If user is not active
    """
    if current_user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


class RoleChecker:
    """Dependency for checking user roles"""

    def __init__(self, allowed_roles: list[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        """
        Check if user has required role

        Args:
            current_user: Current authenticated user

        Returns:
            User object if authorized

        Raises:
            HTTPException: If user doesn't have required role
        """
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {[r.value for r in self.allowed_roles]}"
            )
        return current_user


class PermissionChecker:
    """Dependency for checking user permissions"""

    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        """
        Check if user has required permission

        Args:
            current_user: Current authenticated user

        Returns:
            User object if authorized

        Raises:
            HTTPException: If user doesn't have required permission
        """
        if not user_manager.has_permission(current_user, self.required_permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: {self.required_permission}"
            )
        return current_user


# Common role checkers
require_admin = RoleChecker([UserRole.SUPER_ADMIN, UserRole.ADMIN])
require_super_admin = RoleChecker([UserRole.SUPER_ADMIN])
require_approver = RoleChecker([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.APPROVER])


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """
    Authenticate user with username and password

    Args:
        db: Database session
        username: Username
        password: Password

    Returns:
        User object if authentication succeeds, None otherwise
    """
    user = user_manager.get_user_by_username(db, username)

    if not user:
        # Record failed attempt
        user_manager.record_login_attempt(db, username, False)
        return None

    if not user_manager.verify_password(password, user.hashed_password):
        # Record failed attempt
        user_manager.record_login_attempt(db, username, False)
        return None

    if user.status != UserStatus.ACTIVE:
        logger.warning(f"Login attempt for inactive user: {username}")
        return None

    # Record successful login
    user_manager.record_login_attempt(db, username, True)

    return user


def verify_api_key(api_key: str) -> bool:
    """
    Verify API key for service-to-service authentication

    Args:
        api_key: API key to verify

    Returns:
        True if valid
    """
    # In production, this should check against a database or secret manager
    valid_keys = {
        settings.registry_api_key,
        settings.policy_engine_api_key,
        settings.analytics_hub_api_key,
        settings.governance_api_key
    }

    return api_key in valid_keys


def get_api_key_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Get service account user from API key

    Args:
        credentials: HTTP authorization credentials
        db: Database session

    Returns:
        Service account user

    Raises:
        HTTPException: If API key is invalid
    """
    api_key = credentials.credentials

    if not verify_api_key(api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )

    # Return a service account user
    # In production, this should look up the actual service account
    service_user = User(
        id=UUID("00000000-0000-0000-0000-000000000000"),
        username="service_account",
        email="service@marketplace.local",
        role=UserRole.SERVICE_ACCOUNT,
        status=UserStatus.ACTIVE,
        hashed_password="",
        permissions=["*"]  # Service accounts have all permissions
    )

    return service_user

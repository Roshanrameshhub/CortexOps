"""
Tests for User Manager Service
"""

import pytest
from uuid import uuid4

from models import UserRole, UserStatus
from schemas import UserCreate, UserUpdate
from services.user_manager import user_manager


class TestUserManager:
    """Test user management operations"""

    def test_create_user(self, db_session, sample_user_data):
        """Test creating a new user"""
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)

        assert user.id is not None
        assert user.username == sample_user_data["username"]
        assert user.email == sample_user_data["email"]
        assert user.role == UserRole.VIEWER
        assert user.status == UserStatus.PENDING

    def test_create_duplicate_user(self, db_session, sample_user_data):
        """Test creating duplicate user raises error"""
        user_data = UserCreate(**sample_user_data)
        user_manager.create_user(db_session, user_data)

        # Try to create another user with same email
        with pytest.raises(ValueError, match="Email .* already exists"):
            user_manager.create_user(db_session, user_data)

    def test_get_user(self, db_session, sample_user_data):
        """Test retrieving user by ID"""
        user_data = UserCreate(**sample_user_data)
        created_user = user_manager.create_user(db_session, user_data)

        retrieved_user = user_manager.get_user(db_session, created_user.id)

        assert retrieved_user is not None
        assert retrieved_user.id == created_user.id
        assert retrieved_user.username == created_user.username

    def test_get_user_by_username(self, db_session, sample_user_data):
        """Test retrieving user by username"""
        user_data = UserCreate(**sample_user_data)
        created_user = user_manager.create_user(db_session, user_data)

        retrieved_user = user_manager.get_user_by_username(db_session, created_user.username)

        assert retrieved_user is not None
        assert retrieved_user.username == created_user.username

    def test_update_user(self, db_session, sample_user_data):
        """Test updating user information"""
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)

        update_data = UserUpdate(
            full_name="Updated Name",
            role=UserRole.ADMIN
        )

        updated_user = user_manager.update_user(db_session, user.id, update_data)

        assert updated_user.full_name == "Updated Name"
        assert updated_user.role == UserRole.ADMIN

    def test_delete_user(self, db_session, sample_user_data):
        """Test soft deleting a user"""
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)

        result = user_manager.delete_user(db_session, user.id)

        assert result is True

        # User should not be retrievable after deletion
        deleted_user = user_manager.get_user(db_session, user.id)
        assert deleted_user is None

    def test_activate_user(self, db_session, sample_user_data):
        """Test activating a pending user"""
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)

        activated_user = user_manager.activate_user(db_session, user.id)

        assert activated_user.status == UserStatus.ACTIVE

    def test_suspend_user(self, db_session, sample_user_data):
        """Test suspending a user"""
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)
        user_manager.activate_user(db_session, user.id)

        suspended_user = user_manager.suspend_user(db_session, user.id, "Test suspension")

        assert suspended_user.status == UserStatus.SUSPENDED

    def test_password_hashing(self, db_session, sample_user_data):
        """Test password is hashed correctly"""
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)

        # Password should not be stored in plain text
        assert user.hashed_password != sample_user_data["password"]

        # Should be able to verify password
        assert user_manager.verify_password(
            sample_user_data["password"],
            user.hashed_password
        )

    def test_change_password(self, db_session, sample_user_data):
        """Test changing user password"""
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)

        new_password = "NewPassword123!"
        result = user_manager.change_password(
            db_session,
            user.id,
            sample_user_data["password"],
            new_password
        )

        assert result is True

        # Verify new password works
        updated_user = user_manager.get_user(db_session, user.id)
        assert user_manager.verify_password(new_password, updated_user.hashed_password)

    def test_has_permission(self, db_session, sample_user_data):
        """Test permission checking"""
        user_data = UserCreate(**{**sample_user_data, "permissions": ["read", "write"]})
        user = user_manager.create_user(db_session, user_data)

        assert user_manager.has_permission(user, "read") is True
        assert user_manager.has_permission(user, "write") is True
        assert user_manager.has_permission(user, "delete") is False

    def test_list_users(self, db_session, sample_user_data):
        """Test listing users with pagination"""
        # Create multiple users
        for i in range(5):
            data = sample_user_data.copy()
            data["email"] = f"user{i}@example.com"
            data["username"] = f"user{i}"
            user_data = UserCreate(**data)
            user_manager.create_user(db_session, user_data)

        users, total = user_manager.list_users(db_session, skip=0, limit=3)

        assert len(users) == 3
        assert total == 5

    def test_user_statistics(self, db_session, sample_user_data):
        """Test getting user statistics"""
        # Create users with different statuses
        for i in range(3):
            data = sample_user_data.copy()
            data["email"] = f"user{i}@example.com"
            data["username"] = f"user{i}"
            user_data = UserCreate(**data)
            user = user_manager.create_user(db_session, user_data)

            if i < 2:
                user_manager.activate_user(db_session, user.id)

        stats = user_manager.get_user_statistics(db_session)

        assert stats["total"] == 3
        assert stats["active"] == 2

"""
API Integration Tests
Tests for REST API endpoints
"""

import pytest
from fastapi import status

from models import UserRole
from schemas import UserCreate
from services.user_manager import user_manager
from auth import create_access_token


class TestAuthenticationAPI:
    """Test authentication endpoints"""

    def test_login_success(self, client, db_session, sample_user_data):
        """Test successful login"""
        # Create and activate user
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)
        user_manager.activate_user(db_session, user.id)
        db_session.commit()

        # Login
        response = client.post(
            "/auth/login",
            json={
                "username": sample_user_data["username"],
                "password": sample_user_data["password"]
            }
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_invalid_credentials(self, client):
        """Test login with invalid credentials"""
        response = client.post(
            "/auth/login",
            json={
                "username": "nonexistent",
                "password": "wrong"
            }
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_current_user(self, client, db_session, sample_user_data):
        """Test getting current user info"""
        # Create and activate user
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)
        user_manager.activate_user(db_session, user.id)
        db_session.commit()

        # Get token
        token = create_access_token(user.id, user.role, user.permissions)

        # Get current user
        response = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["username"] == sample_user_data["username"]


class TestUserManagementAPI:
    """Test user management endpoints"""

    def test_create_user_as_admin(self, client, db_session, sample_user_data):
        """Test creating user as admin"""
        # Create admin user
        admin_data = UserCreate(**{
            **sample_user_data,
            "username": "admin",
            "email": "admin@example.com",
            "role": UserRole.ADMIN
        })
        admin = user_manager.create_user(db_session, admin_data)
        user_manager.activate_user(db_session, admin.id)
        db_session.commit()

        token = create_access_token(admin.id, admin.role, admin.permissions)

        # Create new user
        new_user_data = {
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "Password123!",
            "role": "viewer"
        }

        response = client.post(
            "/users",
            json=new_user_data,
            headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["username"] == "newuser"

    def test_list_users_as_admin(self, client, db_session, sample_user_data):
        """Test listing users as admin"""
        # Create admin
        admin_data = UserCreate(**{
            **sample_user_data,
            "role": UserRole.ADMIN
        })
        admin = user_manager.create_user(db_session, admin_data)
        user_manager.activate_user(db_session, admin.id)
        db_session.commit()

        token = create_access_token(admin.id, admin.role, admin.permissions)

        response = client.get(
            "/users",
            headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "items" in data
        assert "total" in data

    def test_update_user_as_admin(self, client, db_session, sample_user_data):
        """Test updating user as admin"""
        # Create admin and regular user
        admin_data = UserCreate(**{
            **sample_user_data,
            "username": "admin",
            "email": "admin@example.com",
            "role": UserRole.ADMIN
        })
        admin = user_manager.create_user(db_session, admin_data)
        user_manager.activate_user(db_session, admin.id)

        user_data = UserCreate(**{
            **sample_user_data,
            "username": "user",
            "email": "user@example.com"
        })
        user = user_manager.create_user(db_session, user_data)
        db_session.commit()

        token = create_access_token(admin.id, admin.role, admin.permissions)

        # Update user
        response = client.patch(
            f"/users/{user.id}",
            json={"full_name": "Updated Name"},
            headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["full_name"] == "Updated Name"


class TestWorkflowAPI:
    """Test workflow management endpoints"""

    def test_create_workflow(self, client, db_session, sample_user_data, sample_workflow_data):
        """Test creating a workflow"""
        # Create user
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)
        user_manager.activate_user(db_session, user.id)
        db_session.commit()

        token = create_access_token(user.id, user.role, user.permissions)

        response = client.post(
            "/workflows",
            json=sample_workflow_data,
            headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["workflow_type"] == "service_publish"
        assert data["status"] == "pending"

    def test_list_workflows(self, client, db_session, sample_user_data):
        """Test listing workflows"""
        # Create user
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)
        user_manager.activate_user(db_session, user.id)
        db_session.commit()

        token = create_access_token(user.id, user.role, user.permissions)

        response = client.get(
            "/workflows",
            headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "items" in data


class TestHealthAPI:
    """Test health and monitoring endpoints"""

    def test_health_check(self, client):
        """Test health check endpoint"""
        response = client.get("/health")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "status" in data
        assert "timestamp" in data

    def test_metrics_endpoint(self, client):
        """Test Prometheus metrics endpoint"""
        response = client.get("/metrics")

        assert response.status_code == status.HTTP_200_OK
        assert "admin_requests_total" in response.text

    def test_root_endpoint(self, client):
        """Test root endpoint"""
        response = client.get("/")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["service"] == "LLM Marketplace - Admin Service"


class TestAnalyticsAPI:
    """Test analytics endpoints"""

    def test_query_analytics(self, client, db_session, sample_user_data):
        """Test analytics query endpoint"""
        # Create user
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)
        user_manager.activate_user(db_session, user.id)
        db_session.commit()

        token = create_access_token(user.id, user.role, user.permissions)

        response = client.post(
            "/analytics/query",
            json={"metric_type": "performance"},
            headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == status.HTTP_200_OK

    def test_dashboard_metrics(self, client, db_session, sample_user_data):
        """Test dashboard metrics endpoint"""
        # Create user
        user_data = UserCreate(**sample_user_data)
        user = user_manager.create_user(db_session, user_data)
        user_manager.activate_user(db_session, user.id)
        db_session.commit()

        token = create_access_token(user.id, user.role, user.permissions)

        response = client.get(
            "/dashboard/metrics",
            headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "total_services" in data
        assert "total_users" in data

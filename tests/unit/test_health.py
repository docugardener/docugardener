"""Unit tests for health check endpoints."""

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture
def client() -> TestClient:
    """Create test client for FastAPI app."""
    return TestClient(app)


class TestHealthEndpoints:
    """Tests for health check endpoints."""
    
    def test_health_check_returns_healthy(self, client: TestClient):
        """Test that health endpoint returns healthy status."""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "healthy"
        assert "service" in data
        assert "version" in data
        assert "timestamp" in data
    
    def test_readiness_check_returns_ready(self, client: TestClient):
        """Test that readiness endpoint returns ready status."""
        response = client.get("/ready")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "ready" in data
        assert "checks" in data
        assert "timestamp" in data

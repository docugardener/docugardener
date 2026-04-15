"""Unit tests for GitHub webhook handlers."""

import hashlib
import hmac

import pytest
from fastapi.testclient import TestClient

from src.api.webhooks import verify_github_signature
from src.main import app


@pytest.fixture
def client() -> TestClient:
    """Create test client for FastAPI app."""
    return TestClient(app)


class TestWebhookSignature:
    """Tests for GitHub webhook signature verification."""

    def test_verify_valid_signature(self):
        """Test that valid signatures are accepted."""
        secret = "test_secret"
        payload = b'{"test": "payload"}'

        expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        signature = f"sha256={expected}"

        assert verify_github_signature(payload, signature, secret) is True

    def test_verify_invalid_signature(self):
        """Test that invalid signatures are rejected."""
        secret = "test_secret"
        payload = b'{"test": "payload"}'
        signature = "sha256=invalid_signature"

        assert verify_github_signature(payload, signature, secret) is False

    def test_verify_missing_prefix(self):
        """Test that signatures without sha256= prefix are rejected."""
        assert verify_github_signature(b"test", "no_prefix", "secret") is False

    def test_verify_empty_signature(self):
        """Test that empty signatures are rejected."""
        assert verify_github_signature(b"test", "", "secret") is False


class TestWebhookEndpoint:
    """Tests for the GitHub webhook endpoint."""

    def test_ping_event(self, client: TestClient):
        """Test that ping events are handled correctly."""
        payload = {
            "zen": "Keep it simple.",
            "hook_id": 123456,
        }

        response = client.post(
            "/webhooks/github",
            json=payload,
            headers={
                "X-GitHub-Event": "ping",
                "X-GitHub-Delivery": "test-delivery-123",
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "pong"
        assert data["hook_id"] == 123456

    def test_pull_request_opened(self, client: TestClient):
        """Test that PR opened events are queued."""
        payload = {
            "action": "opened",
            "pull_request": {
                "number": 42,
                "title": "Add new feature",
            },
            "repository": {
                "full_name": "test-org/test-repo",
            },
        }

        response = client.post(
            "/webhooks/github",
            json=payload,
            headers={
                "X-GitHub-Event": "pull_request",
                "X-GitHub-Delivery": "test-delivery-456",
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "queued"
        assert data["repository"] == "test-org/test-repo"
        assert data["pull_request"] == 42

    def test_pull_request_closed_skipped(self, client: TestClient):
        """Test that PR closed events are skipped."""
        payload = {
            "action": "closed",
            "pull_request": {"number": 42},
            "repository": {"full_name": "test/repo"},
        }

        response = client.post(
            "/webhooks/github",
            json=payload,
            headers={
                "X-GitHub-Event": "pull_request",
                "X-GitHub-Delivery": "test-delivery-789",
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "skipped"

    def test_unhandled_event_ignored(self, client: TestClient):
        """Test that unhandled events return ignored status."""
        response = client.post(
            "/webhooks/github",
            json={"action": "created"},
            headers={
                "X-GitHub-Event": "issues",
                "X-GitHub-Delivery": "test-delivery-999",
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "ignored"
        assert data["event"] == "issues"

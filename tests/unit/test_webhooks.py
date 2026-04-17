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


class TestLoopPrevention:
    """BUG-7 regression tests — DocuGardener self-generated PRs must be skipped."""

    def _pr_payload(self, branch: str, action: str = "opened") -> dict:
        return {
            "action": action,
            "pull_request": {
                "number": 99,
                "title": "docs: update .github/copilot-instructions.md (DocuGardener policy sync)",
                "head": {"ref": branch},
            },
            "repository": {"full_name": "org/repo"},
        }

    def _post(self, client: TestClient, payload: dict) -> dict:
        resp = client.post(
            "/webhooks/github",
            json=payload,
            headers={
                "X-GitHub-Event": "pull_request",
                "X-GitHub-Delivery": "test-bug7",
            },
        )
        assert resp.status_code == 200
        return resp.json()

    def test_policy_sync_pr_skipped(self, client: TestClient):
        """BUG-7: docugardener/rules-* branch must be skipped — not analysed."""
        data = self._post(client, self._pr_payload("docugardener/rules-agents-md-abc123"))
        assert data["status"] == "skipped"
        assert "policy-sync" in data["reason"].lower() or "loop" in data["reason"].lower()

    def test_policy_sync_copilot_variant_skipped(self, client: TestClient):
        """BUG-7: copilot-instructions variant also uses docugardener/ prefix."""
        data = self._post(client, self._pr_payload("docugardener/rules-copilot-instructions-xyz"))
        assert data["status"] == "skipped"

    def test_policy_sync_synchronize_also_skipped(self, client: TestClient):
        """BUG-7: synchronize events on policy-sync PRs must also be skipped."""
        data = self._post(
            client, self._pr_payload("docugardener/rules-agents-md-abc123", action="synchronize")
        )
        assert data["status"] == "skipped"

    def test_fix_pr_still_skipped(self, client: TestClient):
        """Regression: existing docugardener-fix-* guard must still work."""
        data = self._post(client, self._pr_payload("docugardener-fix-pr-42-abc123"))
        assert data["status"] == "skipped"

    def test_normal_pr_not_skipped(self, client: TestClient):
        """Regression: regular user PRs must still be queued, not skipped."""
        data = self._post(client, self._pr_payload("feature/my-feature"))
        # queued (or skipped for other reasons like tenant not found), but NOT the loop-prevention skip
        assert "policy-sync" not in data.get("reason", "")
        assert "loop" not in data.get("reason", "")

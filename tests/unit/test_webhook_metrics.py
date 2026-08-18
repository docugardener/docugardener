# SPDX-License-Identifier: AGPL-3.0-or-later
"""
BUG-03: Tests that record_webhook() is called from the webhook dispatcher.

Verifies that the Prometheus metric helper is invoked on both success and
failure paths in handle_github_webhook(), without requiring a real DB or
GitHub App connection.
"""

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from src.core.config import settings
from src.main import app

_TEST_SECRET = "metrics-test-secret"


@pytest.fixture
def client() -> TestClient:
    import src.api.webhooks as wh

    wh._webhook_rate_limiters.clear()
    with patch.object(settings, "github_webhook_secret", _TEST_SECRET):
        yield TestClient(app)


def _sign(body: bytes) -> str:
    sig = hmac.new(_TEST_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def _ping_payload() -> bytes:
    return json.dumps({"zen": "Keep it loggy.", "hook_id": 1}).encode()


def _pr_payload(action: str = "opened") -> bytes:
    return json.dumps(
        {
            "action": action,
            "pull_request": {
                "number": 1,
                "head": {"sha": "abc123"},
                "base": {"sha": "def456", "ref": "main"},
            },
            "repository": {"full_name": "org/repo", "id": 99},
            "installation": {"id": 42},
            "sender": {"login": "human", "type": "User"},
        }
    ).encode()


def _headers(event: str, delivery_id: str, body: bytes) -> dict:
    return {
        "X-GitHub-Event": event,
        "X-GitHub-Delivery": delivery_id,
        "Content-Type": "application/json",
        "X-Hub-Signature-256": _sign(body),
    }


class TestWebhookMetricsWired:
    """record_webhook() must be called on every handled event."""

    @patch("src.api.webhooks.record_webhook")
    def test_ping_calls_record_webhook_success(self, mock_record, client):
        body = _ping_payload()
        resp = client.post(
            "/webhooks/github", content=body, headers=_headers("ping", "del-001", body)
        )
        assert resp.status_code == 200
        mock_record.assert_called_once_with("ping", success=True)

    @patch("src.api.webhooks.record_webhook")
    def test_unknown_event_calls_record_webhook_success(self, mock_record, client):
        body = json.dumps({}).encode()
        resp = client.post(
            "/webhooks/github", content=body, headers=_headers("push", "del-002", body)
        )
        assert resp.status_code == 200
        mock_record.assert_called_once_with("push", success=True)

    @patch("src.api.webhooks.record_webhook")
    @patch(
        "src.api.webhooks.handle_pull_request",
        new_callable=AsyncMock,
        side_effect=RuntimeError("upstream down"),
    )
    def test_handler_exception_calls_record_webhook_failure(
        self, mock_handler, mock_record, client
    ):
        """When the handler raises, record_webhook must be called with success=False."""
        body = _pr_payload()
        with pytest.raises(Exception):
            client.post(
                "/webhooks/github", content=body, headers=_headers("pull_request", "del-003", body)
            )
        mock_record.assert_called_once()
        _, kwargs = mock_record.call_args
        assert kwargs["success"] is False
        assert kwargs["error_type"] == "RuntimeError"

    @patch("src.api.webhooks.record_webhook")
    def test_record_webhook_called_with_correct_event_type(self, mock_record, client):
        """The event_type label passed to record_webhook must match X-GitHub-Event."""
        body = _ping_payload()
        client.post("/webhooks/github", content=body, headers=_headers("ping", "del-004", body))
        args, _ = mock_record.call_args
        assert args[0] == "ping"

    @patch("src.api.webhooks.record_webhook")
    def test_record_webhook_called_exactly_once_per_request(self, mock_record, client):
        body = _ping_payload()
        client.post("/webhooks/github", content=body, headers=_headers("ping", "del-005", body))
        assert mock_record.call_count == 1

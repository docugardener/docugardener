"""
BUG-03: Tests that record_webhook() is called from the webhook dispatcher.

Verifies that the Prometheus metric helper is invoked on both success and
failure paths in handle_github_webhook(), without requiring a real DB or
GitHub App connection.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _ping_payload() -> bytes:
    return json.dumps({"zen": "Keep it loggy.", "hook_id": 1}).encode()


def _pr_payload(action: str = "opened") -> bytes:
    return json.dumps({
        "action": action,
        "pull_request": {
            "number": 1,
            "head": {"sha": "abc123"},
            "base": {"sha": "def456", "ref": "main"},
        },
        "repository": {"full_name": "org/repo", "id": 99},
        "installation": {"id": 42},
        "sender": {"login": "human", "type": "User"},
    }).encode()


class TestWebhookMetricsWired:
    """record_webhook() must be called on every handled event."""

    @patch("src.api.webhooks.record_webhook")
    def test_ping_calls_record_webhook_success(self, mock_record, client):
        resp = client.post(
            "/webhooks/github",
            content=_ping_payload(),
            headers={
                "X-GitHub-Event": "ping",
                "X-GitHub-Delivery": "del-001",
                "Content-Type": "application/json",
            },
        )
        assert resp.status_code == 200
        mock_record.assert_called_once_with("ping", success=True)

    @patch("src.api.webhooks.record_webhook")
    def test_unknown_event_calls_record_webhook_success(self, mock_record, client):
        resp = client.post(
            "/webhooks/github",
            content=json.dumps({}).encode(),
            headers={
                "X-GitHub-Event": "push",
                "X-GitHub-Delivery": "del-002",
                "Content-Type": "application/json",
            },
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
        with pytest.raises(Exception):
            client.post(
                "/webhooks/github",
                content=_pr_payload(),
                headers={
                    "X-GitHub-Event": "pull_request",
                    "X-GitHub-Delivery": "del-003",
                    "Content-Type": "application/json",
                },
            )
        mock_record.assert_called_once()
        _, kwargs = mock_record.call_args
        assert kwargs["success"] is False
        assert kwargs["error_type"] == "RuntimeError"

    @patch("src.api.webhooks.record_webhook")
    def test_record_webhook_called_with_correct_event_type(self, mock_record, client):
        """The event_type label passed to record_webhook must match X-GitHub-Event."""
        client.post(
            "/webhooks/github",
            content=_ping_payload(),
            headers={
                "X-GitHub-Event": "ping",
                "X-GitHub-Delivery": "del-004",
                "Content-Type": "application/json",
            },
        )
        args, _ = mock_record.call_args
        assert args[0] == "ping"

    @patch("src.api.webhooks.record_webhook")
    def test_record_webhook_called_exactly_once_per_request(self, mock_record, client):
        client.post(
            "/webhooks/github",
            content=_ping_payload(),
            headers={
                "X-GitHub-Event": "ping",
                "X-GitHub-Delivery": "del-005",
                "Content-Type": "application/json",
            },
        )
        assert mock_record.call_count == 1

"""
TEST-01 / B4: Webhook HMAC Security (E2E).

Tests run against the real FastAPI app via AsyncClient. HMAC verification
is enabled for every test in this file by patching the settings object so
`github_webhook_secret` is non-empty and `debug` is False — the exact
conditions that activate signature checking in the webhook handler.

Covered:
  - Valid HMAC signature → HTTP 200
  - Invalid (wrong secret) signature → HTTP 401
  - Missing X-Hub-Signature-256 header → HTTP 401
  - Tampered payload (signature of original body, different body sent) → HTTP 401
  - Unknown event type (push) → HTTP 200, no job created, status='ignored'
"""

import json
import pytest
from unittest.mock import MagicMock, patch

from src.core.config import settings

from tests.integration.conftest import (
    WEBHOOK_SECRET,
    TestingSessionLocal,
    make_signature,
    pr_opened_payload,
    _webhook_headers,
)


# ── fixture: enable HMAC for all tests in this module ─────────────────────────

@pytest.fixture(autouse=True)
def enable_hmac():
    """Force HMAC verification on by setting a non-empty secret + debug=False."""
    with patch.object(settings, "github_webhook_secret", WEBHOOK_SECRET), \
         patch.object(settings, "debug", False):
        yield


# ── helpers ───────────────────────────────────────────────────────────────────

def _signed_headers(body: bytes, event: str = "pull_request") -> dict:
    """Return headers with a valid HMAC signature for the given body."""
    return _webhook_headers(
        event=event,
        signature=make_signature(body, WEBHOOK_SECRET),
    )


# ── tests ─────────────────────────────────────────────────────────────────────

class TestWebhookSecurity:

    @pytest.mark.asyncio
    async def test_valid_signature_accepted(self, http_client, seed_tenant):
        """Correct HMAC signature → HTTP 200 (request processed normally)."""
        mock_queue = MagicMock()
        mock_queue.enqueue = MagicMock(return_value=MagicMock(id="job-ok"))

        body = json.dumps(pr_opened_payload()).encode()

        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal), \
             patch("src.worker.queue.get_queue", return_value=mock_queue):
            response = await http_client.post(
                "/webhooks/github",
                content=body,
                headers={**_signed_headers(body), "Content-Type": "application/json"},
            )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_invalid_signature_rejected(self, http_client):
        """Signature computed with a different secret → HTTP 401."""
        body = json.dumps(pr_opened_payload()).encode()
        wrong_sig = make_signature(body, secret="wrong-secret")

        response = await http_client.post(
            "/webhooks/github",
            content=body,
            headers={
                **_webhook_headers(signature=wrong_sig),
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_signature_header_rejected(self, http_client):
        """No X-Hub-Signature-256 header at all → HTTP 401."""
        body = json.dumps(pr_opened_payload()).encode()

        response = await http_client.post(
            "/webhooks/github",
            content=body,
            headers={
                "X-GitHub-Event": "pull_request",
                "X-GitHub-Delivery": "del-missing-sig",
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_tampered_payload_rejected(self, http_client):
        """Signature is valid for original body but sent with different body → HTTP 401."""
        original_body = json.dumps(pr_opened_payload()).encode()
        tampered_body = json.dumps({**pr_opened_payload(), "action": "closed"}).encode()

        # Signature is computed for original but tampered body is sent
        sig_for_original = make_signature(original_body, WEBHOOK_SECRET)

        response = await http_client.post(
            "/webhooks/github",
            content=tampered_body,
            headers={
                **_webhook_headers(signature=sig_for_original),
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_unknown_event_returns_200_noop(self, http_client):
        """X-GitHub-Event: push → HTTP 200, status='ignored', no job created."""
        body = json.dumps({"ref": "refs/heads/main", "commits": []}).encode()
        sig = make_signature(body, WEBHOOK_SECRET)

        response = await http_client.post(
            "/webhooks/github",
            content=body,
            headers={
                "X-GitHub-Event": "push",
                "X-GitHub-Delivery": "del-push-001",
                "X-Hub-Signature-256": sig,
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ignored"
        assert data["event"] == "push"

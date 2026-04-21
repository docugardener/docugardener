# SPDX-License-Identifier: AGPL-3.0-or-later
"""
SEC-H4: Webhook signature verification is always enforced — fail-closed.

Verifies that:
  1. Empty GITHUB_WEBHOOK_SECRET → 503 (misconfigured, refuse all requests)
  2. debug=True does NOT bypass the empty-secret check
  3. Valid secret + correct HMAC → 200 (happy path unchanged)
  4. Valid secret + wrong HMAC → 401 (rejection unchanged)
"""

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from src.core.config import settings

_TEST_SECRET = "sec-h4-test-secret-xyz"
_PING = {"zen": "Practicality beats purity.", "hook_id": 42}
_PING_HEADERS = {
    "X-GitHub-Event": "ping",
    "X-GitHub-Delivery": "test-001",
    "Content-Type": "application/json",
}


def _sign(body: bytes, secret: str) -> str:
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def _make_app():
    import src.api.webhooks as wh
    from src.main import create_app
    wh._webhook_rate_limiters.clear()
    return create_app()


# ── Test 1: empty secret → 503 ────────────────────────────────────────────────

def test_empty_secret_returns_503():
    """When GITHUB_WEBHOOK_SECRET is not set, any webhook must return 503."""
    with (
        patch.object(settings, "github_webhook_secret", ""),
        patch.object(settings, "debug", False),
    ):
        client = TestClient(_make_app())
        body = json.dumps(_PING).encode()
        resp = client.post(
            "/webhooks/github",
            content=body,
            headers={**_PING_HEADERS, "X-Hub-Signature-256": "sha256=invalid"},
        )
    assert resp.status_code == 503, (
        f"Expected 503 for unconfigured secret, got {resp.status_code}"
    )


# ── Test 2: debug=True does not bypass empty secret ───────────────────────────

def test_debug_true_does_not_bypass_empty_secret():
    """debug=True must never disable signature enforcement."""
    with (
        patch.object(settings, "github_webhook_secret", ""),
        patch.object(settings, "debug", True),
    ):
        client = TestClient(_make_app())
        body = json.dumps(_PING).encode()
        resp = client.post(
            "/webhooks/github",
            content=body,
            headers=_PING_HEADERS,
        )
    assert resp.status_code == 503, (
        f"Expected 503 even with debug=True when secret is empty, got {resp.status_code}"
    )


# ── Test 3: valid secret + correct HMAC → 200 ─────────────────────────────────

def test_valid_signature_accepted():
    """Correct HMAC with a configured secret must be accepted (200)."""
    with (
        patch.object(settings, "github_webhook_secret", _TEST_SECRET),
        patch.object(settings, "debug", False),
    ):
        client = TestClient(_make_app())
        body = json.dumps(_PING).encode()
        sig = _sign(body, _TEST_SECRET)
        resp = client.post(
            "/webhooks/github",
            content=body,
            headers={**_PING_HEADERS, "X-Hub-Signature-256": sig},
        )
    assert resp.status_code == 200, (
        f"Expected 200 for valid HMAC, got {resp.status_code}: {resp.text}"
    )


# ── Test 4: valid secret + wrong HMAC → 401 ──────────────────────────────────

def test_invalid_signature_rejected():
    """Wrong HMAC signature with a configured secret must return 401."""
    with (
        patch.object(settings, "github_webhook_secret", _TEST_SECRET),
        patch.object(settings, "debug", False),
    ):
        client = TestClient(_make_app())
        body = json.dumps(_PING).encode()
        resp = client.post(
            "/webhooks/github",
            content=body,
            headers={
                **_PING_HEADERS,
                "X-Hub-Signature-256": "sha256=deadbeefdeadbeef",
            },
        )
    assert resp.status_code == 401, (
        f"Expected 401 for wrong HMAC, got {resp.status_code}"
    )

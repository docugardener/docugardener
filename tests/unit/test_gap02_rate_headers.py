"""
GAP-02: Tests for rate-limit headers on webhook responses.

Verifies that POST /webhooks/github:
  A. Returns X-RateLimit-Limit and X-RateLimit-Remaining on every response
  B. Returns 429 + Retry-After when the bucket is exhausted
  C. Uses per-installation buckets (two installs don't share quota)
  D. Bucket is lazy-created on first call
  E. Remaining count decrements with each call
"""

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

# ── Fixtures ──────────────────────────────────────────────────────────────────

PING_PAYLOAD = {
    "action": None,
    "zen": "Practicality beats purity.",
    "hook_id": 42,
    # No "installation" key — falls back to "global" bucket
}

PR_PAYLOAD = {
    "action": "opened",
    "installation": {"id": 9999},
    "pull_request": {
        "number": 1,
        "title": "Test PR",
        "head": {"ref": "feature/test", "sha": "abc123"},
        "base": {"ref": "main", "sha": "def456"},
        "body": "",
    },
    "repository": {
        "name": "my-repo",
        "full_name": "org/my-repo",
        "owner": {"login": "org"},
    },
    "sender": {"login": "human-user"},
}

HEADERS = {
    "X-GitHub-Event": "ping",
    "X-GitHub-Delivery": "test-delivery-001",
    "Content-Type": "application/json",
}


def _make_client(clear_limiters: bool = True) -> TestClient:
    """Return a TestClient with debug mode (no signature check) and fresh limiters."""
    import src.api.webhooks as wh
    from src.main import create_app

    if clear_limiters:
        wh._webhook_rate_limiters.clear()

    app = create_app()
    # Disable signature verification
    from src.core.config import settings

    settings.github_webhook_secret = ""
    settings.debug = True
    return TestClient(app)


# ── A. Headers always present ─────────────────────────────────────────────────


def test_rate_limit_headers_present_on_ping():
    client = _make_client()
    resp = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    assert resp.status_code == 200
    assert "x-ratelimit-limit" in resp.headers
    assert "x-ratelimit-remaining" in resp.headers


def test_rate_limit_limit_header_equals_burst():
    from src.api.webhooks import _WEBHOOK_BURST

    client = _make_client()
    resp = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    assert int(resp.headers["x-ratelimit-limit"]) == _WEBHOOK_BURST


def test_rate_limit_remaining_is_integer():
    client = _make_client()
    resp = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    remaining = resp.headers.get("x-ratelimit-remaining", "")
    assert remaining.isdigit(), f"Expected integer remaining, got: {remaining!r}"


def test_rate_limit_remaining_not_negative():
    client = _make_client()
    resp = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    assert int(resp.headers["x-ratelimit-remaining"]) >= 0


# ── E. Remaining decrements ───────────────────────────────────────────────────


def test_remaining_decrements_on_successive_calls():
    client = _make_client()
    r1 = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    r2 = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    rem1 = int(r1.headers["x-ratelimit-remaining"])
    rem2 = int(r2.headers["x-ratelimit-remaining"])
    assert rem2 <= rem1, "Remaining should not increase between calls"


# ── B. 429 when bucket exhausted ─────────────────────────────────────────────


def test_429_when_rate_limited():
    """Exhausting the burst returns 429."""

    from src.api.webhooks import _get_rate_limiter, _webhook_rate_limiters

    _webhook_rate_limiters.clear()
    # Pre-drain the global bucket
    limiter = _get_rate_limiter("global")
    limiter._tokens = 0.0  # fully exhausted

    client = _make_client(clear_limiters=False)
    resp = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    assert resp.status_code == 429


def test_retry_after_header_present_on_429():
    """Retry-After header is set when rate limited."""
    from src.api.webhooks import _get_rate_limiter, _webhook_rate_limiters

    _webhook_rate_limiters.clear()
    limiter = _get_rate_limiter("global")
    limiter._tokens = 0.0

    client = _make_client(clear_limiters=False)
    resp = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    assert resp.status_code == 429
    assert "retry-after" in resp.headers
    assert int(resp.headers["retry-after"]) >= 1


def test_429_body_indicates_rate_limit():
    from src.api.webhooks import _get_rate_limiter, _webhook_rate_limiters

    _webhook_rate_limiters.clear()
    limiter = _get_rate_limiter("global")
    limiter._tokens = 0.0

    client = _make_client(clear_limiters=False)
    resp = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    assert resp.status_code == 429
    body = resp.json()
    assert "rate" in body.get("detail", "").lower() or "limit" in body.get("detail", "").lower()


# ── C. Per-installation isolation ─────────────────────────────────────────────


def test_per_installation_buckets_independent():
    """Exhausting one installation's bucket does not affect another."""
    from src.api.webhooks import _get_rate_limiter, _webhook_rate_limiters

    _webhook_rate_limiters.clear()
    # Drain installation 1111
    lim1 = _get_rate_limiter("1111")
    lim1._tokens = 0.0

    # Installation 2222 should still have a full bucket
    payload_2222 = dict(PR_PAYLOAD)
    payload_2222["installation"] = {"id": 2222}

    # Mock the queue so the PR webhook doesn't actually try to enqueue
    with patch("src.api.webhooks.handle_pull_request", new_callable=AsyncMock) as mock_handler:
        mock_handler.return_value = {"status": "queued", "job_id": "x"}
        client = _make_client(clear_limiters=False)
        resp = client.post(
            "/webhooks/github",
            json=payload_2222,
            headers={**HEADERS, "X-GitHub-Event": "pull_request"},
        )
    # 2222 bucket is full — must not be 429
    assert resp.status_code != 429


# ── D. Lazy bucket creation ───────────────────────────────────────────────────


def test_new_installation_gets_full_bucket():
    """A freshly-seen installation starts with a full burst bucket."""
    from src.api.webhooks import _WEBHOOK_BURST, _webhook_rate_limiters

    _webhook_rate_limiters.clear()
    client = _make_client(clear_limiters=False)
    resp = client.post("/webhooks/github", json=PING_PAYLOAD, headers=HEADERS)
    assert resp.status_code == 200
    # After the first request, remaining should be burst - 1
    remaining = int(resp.headers["x-ratelimit-remaining"])
    assert remaining == _WEBHOOK_BURST - 1


# ── Helper: module-level dict accessible ─────────────────────────────────────


def test_rate_limiter_dict_is_module_level():
    """The _webhook_rate_limiters dict must be importable from the module."""
    from src.api.webhooks import _webhook_rate_limiters

    assert isinstance(_webhook_rate_limiters, dict)

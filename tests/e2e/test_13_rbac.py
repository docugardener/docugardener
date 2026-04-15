"""
BETA-21 — RBAC API Enforcement.

Verifies that all protected Next.js API routes return 401 when called without
an authenticated session.  This confirms the auth guard is in place on every
sensitive endpoint and no route is accidentally left open.

No PR creation needed — pure HTTP assertions against the running web server.
"""

from __future__ import annotations

import pytest
import requests

from tests.e2e.helpers import WEB_BASE, reset_timer, step

# Routes that must return 401 (or 403) for unauthenticated requests.
# Format: (method, path, description)
_PROTECTED_ROUTES = [
    ("GET", "/api/inbox", "Inbox list"),
    ("GET", "/api/repos", "Repository list"),
    ("GET", "/api/users", "User management"),
    ("POST", "/api/settings", "Settings write"),
    ("GET", "/api/audit", "Audit log"),
    ("GET", "/api/audit/export", "Audit CSV export"),
    ("GET", "/api/stats/ignores", "Ignore-rate analytics"),
    ("GET", "/api/reports/risk-zones", "Risk map"),
    ("GET", "/api/settings/scim", "SCIM config"),
    ("POST", "/api/prompts/reset", "Prompt reset"),
    ("PATCH", "/api/users/fake-id", "User role change"),
]


@pytest.mark.e2e
def test_beta21_rbac_unauthenticated():
    """All protected routes return 401/403 without a session cookie."""
    reset_timer()

    step(1, f"Verify {WEB_BASE} is reachable")
    try:
        r = requests.get(f"{WEB_BASE}/api/health", timeout=5)
        print(f"         → health check: {r.status_code}", flush=True)
    except requests.exceptions.ConnectionError:
        pytest.skip(f"Next.js web server not reachable at {WEB_BASE} — is 'make dev-up' running?")

    step(2, f"Assert {len(_PROTECTED_ROUTES)} routes reject unauthenticated requests")
    failures = []
    for method, path, label in _PROTECTED_ROUTES:
        url = f"{WEB_BASE}{path}"
        try:
            resp = requests.request(method, url, timeout=10)
            if resp.status_code not in (401, 403):
                failures.append(
                    f"  {method} {path} ({label}): expected 401/403, got {resp.status_code}"
                )
                print(f"         ❌ {method} {path:<35} → {resp.status_code}", flush=True)
            else:
                print(f"         ✓  {method} {path:<35} → {resp.status_code}", flush=True)
        except requests.exceptions.RequestException as exc:
            failures.append(f"  {method} {path}: request failed — {exc}")
            print(f"         ❌ {method} {path} — {exc}", flush=True)

    assert not failures, f"{len(failures)} route(s) did not enforce auth:\n" + "\n".join(failures)

    step("✅", f"BETA-21 (RBAC — {len(_PROTECTED_ROUTES)} routes) PASSED")

"""
E2E test suite — shared fixtures.

Run with:
    E2E_ENABLED=1 pytest tests/e2e/ -m e2e -x -v -s

Requirements:
  - Full dev stack running: make dev-up
  - smee proxy running (gh smee or npx smee-client)
  - gh CLI authenticated (gh auth status)
  - PostgreSQL accessible at SQL_DATABASE_URL

Environment variables:
  E2E_ENABLED=1           Required to run (prevents accidental execution)
  E2E_TEST_REPO           GitHub repo for test PRs  (default: alexeykopachev/docugardener-test)
  E2E_TENANT_ID           Tenant ID in dev DB        (default: cmmjpxq3x0005bul35iu3viuv)
  SQL_DATABASE_URL        Postgres connection string  (default: localhost:5433)
  E2E_API_BASE            FastAPI backend URL          (default: http://localhost:8000)
  E2E_WEB_BASE            Next.js frontend URL         (default: http://localhost:3003)
"""

from __future__ import annotations

import os
import subprocess

import pytest
import requests
from sqlalchemy import create_engine, text

# ── Guard: skip unless explicitly enabled ─────────────────────────────────────


def pytest_collection_modifyitems(config, items):
    if os.getenv("E2E_ENABLED", "0") != "1":
        skip = pytest.mark.skip(reason="Set E2E_ENABLED=1 to run e2e tests")
        for item in items:
            if "e2e" in item.keywords:
                item.add_marker(skip)


# ── Infrastructure URLs ───────────────────────────────────────────────────────

_API_BASE = os.getenv("E2E_API_BASE", "http://localhost:8000")
_WEB_BASE = os.getenv("E2E_WEB_BASE", "http://localhost:3003")
_DB_URL = os.getenv(
    "SQL_DATABASE_URL",
    "postgresql://postgres:password@localhost:5433/docugardener-web",
)


# ── Pre-flight checks ─────────────────────────────────────────────────────────


def _check_service(url: str, name: str, timeout: int = 5) -> str | None:
    """Return None if reachable, error string if not."""
    try:
        r = requests.get(url, timeout=timeout, allow_redirects=True)
        if r.status_code < 500:
            return None
        return f"HTTP {r.status_code}"
    except Exception as exc:
        return str(exc)


def _check_smee() -> bool:
    """Return True if a smee or smee-client process is running."""
    result = subprocess.run(
        ["pgrep", "-f", "smee"],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def _check_gh_auth() -> bool:
    """Return True if gh CLI is authenticated."""
    result = subprocess.run(
        ["gh", "auth", "status"],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


@pytest.fixture(scope="session", autouse=True)
def preflight_check():
    """Verify full dev stack is up before running any e2e test.

    Checks: PostgreSQL, FastAPI backend, Next.js frontend, smee proxy, gh CLI.
    Hard-fails on DB and backend (tests cannot run without them).
    Warns on Next.js / smee / gh (some tests may still work).
    """
    if os.getenv("E2E_ENABLED", "0") != "1":
        yield
        return

    print("\n\n  ── Pre-flight checks ────────────────────────────────────")

    failures: list[str] = []
    warnings: list[str] = []

    # 1. FastAPI backend
    err = _check_service(f"{_API_BASE}/health", "FastAPI backend")
    if err:
        failures.append(f"  ✗ FastAPI backend at {_API_BASE}/health — {err}")
    else:
        print(f"  ✓ FastAPI backend  ({_API_BASE})")

    # 2. Next.js frontend
    err = _check_service(_WEB_BASE, "Next.js frontend")
    if err:
        warnings.append(f"  ⚠ Next.js frontend at {_WEB_BASE} — {err} (tests 13, 15b may fail)")
    else:
        print(f"  ✓ Next.js frontend ({_WEB_BASE})")

    # 3. smee proxy
    if _check_smee():
        print("  ✓ smee proxy       (running)")
    else:
        warnings.append(
            "  ⚠ smee proxy not detected — GitHub webhooks won't reach local backend.\n"
            "    Start with: npx smee-client --url <your-smee-url> --target http://localhost:8000/webhooks/github"
        )

    # 4. gh CLI
    if _check_gh_auth():
        print("  ✓ gh CLI           (authenticated)")
    else:
        failures.append("  ✗ gh CLI not authenticated — run: gh auth login")

    for w in warnings:
        print(w)

    print("  ─────────────────────────────────────────────────────\n")

    if failures:
        pytest.fail(
            "E2E pre-flight failed — start the dev stack before running:\n\n" + "\n".join(failures)
        )

    yield


# ── Database ──────────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def db_engine(preflight_check):
    engine = create_engine(_DB_URL)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print(f"  ✓ PostgreSQL       ({_DB_URL.split('@')[-1]})")
    except Exception as exc:
        pytest.fail(
            f"Cannot connect to database at {_DB_URL}.\nIs 'make dev-up' running? Error: {exc}"
        )
    yield engine
    engine.dispose()


@pytest.fixture()
def db(db_engine):
    """SQLAlchemy connection for DB polling and config updates."""
    conn = db_engine.connect()
    yield conn
    conn.close()

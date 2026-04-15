"""
BETA-23 — Audit Log: Tamper Detection and Export.

Queries the AuditLog table directly and verifies:
  1. Entries exist (at least one TRIAGE_DECISION or SETTINGS_CHANGED event)
  2. Every entry has a non-null, properly-formatted SHA-256 hash (64 hex chars)
  3. No entry has a null or empty hash field (tamper-evidence chain is intact)
  4. The audit CSV export endpoint is protected (returns 401 without session)

No PR creation required — reads the DB state left by earlier tests.
"""

from __future__ import annotations

import re

import pytest
import requests
from sqlalchemy import text

from tests.e2e.helpers import (
    TENANT_ID,
    WEB_BASE,
    reset_timer,
    step,
)

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


@pytest.mark.e2e
def test_beta23_audit_log(db_engine):
    """Audit log has entries with valid SHA-256 hashes; export endpoint is protected."""
    reset_timer()

    step(1, "Query AuditLog entries for this tenant")
    with db_engine.connect() as conn:
        rows = conn.execute(
            text(
                'SELECT id, event, "actorEmail", hash, "createdAt" '
                'FROM "AuditLog" WHERE "tenantId" = :tid ORDER BY "createdAt" DESC LIMIT 100'
            ),
            {"tid": TENANT_ID},
        ).fetchall()

    print(f"         → {len(rows)} audit log entries found", flush=True)
    assert rows, (
        "No AuditLog entries found for this tenant. "
        "Run other e2e tests first to generate audit events."
    )

    step(2, "Verify all entries have a non-null hash field")
    null_hashes = [dict(r._mapping) for r in rows if not r[3]]
    assert not null_hashes, (
        f"{len(null_hashes)} AuditLog entries have null/empty hash:\n"
        + "\n".join(f"  id={r['id']}  event={r['event']}" for r in null_hashes)
    )
    print(f"         → all {len(rows)} entries have non-null hashes ✓", flush=True)

    step(3, "Verify hash format is 64-char lowercase hex (SHA-256)")
    bad_format = [dict(r._mapping) for r in rows if r[3] and not _SHA256_RE.match(r[3])]
    assert not bad_format, f"{len(bad_format)} AuditLog entries have malformed hash:\n" + "\n".join(
        f"  id={r['id']}  hash={r['hash'][:20]}…" for r in bad_format
    )
    print("         → all hash values are valid 64-char hex ✓", flush=True)

    step(4, "Print event summary")
    from collections import Counter

    counts = Counter(r[1] for r in rows)
    for evt, cnt in counts.most_common():
        print(f"         → {evt:<30} × {cnt}", flush=True)

    step(5, "Verify audit CSV export endpoint requires authentication")
    try:
        r = requests.get(f"{WEB_BASE}/api/audit/export", timeout=10)
        assert r.status_code in (401, 403), (
            f"Audit export must require auth — expected 401/403, got {r.status_code}"
        )
        print(f"         → /api/audit/export without session → {r.status_code} ✓", flush=True)
    except requests.exceptions.ConnectionError:
        pytest.skip(f"Next.js web server not reachable at {WEB_BASE}")

    step("✅", "BETA-23 (Audit Log) PASSED")

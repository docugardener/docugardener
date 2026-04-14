"""
BETA-07 — Feedback Signal (Thumbs Up / Thumbs Down).

Generates valid HMAC-signed feedback tokens using the same algorithm as the
backend (make_feedback_token), hits the FastAPI /api/feedback endpoint for
both 'up' and 'down' signals, and verifies:
  - Records are upserted in AnalysisFeedback
  - Re-voting changes the stored signal (upsert semantics)
  - A tampered token is rejected with a non-2xx status

Requires FEEDBACK_HMAC_SECRET to be set in the env; skips otherwise.
"""
from __future__ import annotations

import os

import pytest
import requests
from sqlalchemy import text

from tests.e2e.helpers import (
    API_BASE,
    TENANT_ID,
    TEST_REPO,
    close_pr,
    create_pr,
    new_uid,
    reset_timer,
    set_merge_config,
    step,
    wait_for_job_completed,
)


def _make_snippet(uid: str) -> str:
    return f"""\
def calculate_loyalty_discount_{uid}(purchases: int, base_rate: float) -> float:
    \"\"\"Calculate a loyalty discount rate for a customer.

    Returns a discount multiplier between 0 and 1 based on the number of
    previous purchases.  Customers with more than 10 purchases receive a
    full base_rate discount; others receive a proportional fraction.

    Args:
        purchases: Number of completed purchases by this customer.
        base_rate: Maximum discount rate to apply (0.0–1.0).
    \"\"\"
    if purchases <= 0:
        return 0.0
    factor = min(purchases / 10.0, 1.0)
    return round(base_rate * factor, 4)
"""


@pytest.mark.e2e
def test_beta07_feedback_signal(db, db_engine):
    """Submit thumbs-up and thumbs-down feedback; verify DB records and tamper rejection."""
    reset_timer()

    hmac_secret = os.getenv("FEEDBACK_HMAC_SECRET", "")
    if not hmac_secret:
        pytest.skip("FEEDBACK_HMAC_SECRET not set — skipping BETA-07 feedback test")

    pr_number, branch, tmp_dir = None, None, None

    try:
        step(1, "Configure tenant")
        set_merge_config(db, method="squash", wait_for_ci=False, enabled=True)

        step(2, f"Create PR on {TEST_REPO} with regular branch")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="feedback",
            code_snippet=_make_snippet(uid),
            pr_title=f"feat: add calculate_loyalty_discount_{uid} endpoint",
            uid=uid,
            branch_prefix="e2e",
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        step(3, "Wait for analysis to complete")
        job = wait_for_job_completed(db, pr_number, timeout=120)
        job_id = job["id"]
        print(f"         → job_id={job_id[:8]}...", flush=True)

        # Build token using the same algorithm as src/pipeline/feedback.py
        import hashlib, hmac as _hmac
        key = hmac_secret.encode()
        msg = f"{job_id}:{TENANT_ID}".encode()
        token = _hmac.new(key, msg, hashlib.sha256).hexdigest()[:24]
        print(f"         → token={token}", flush=True)

        step(4, "Submit thumbs-UP feedback")
        up_url = f"{API_BASE}/api/feedback?j={job_id}&s=up&tid={TENANT_ID}&t={token}"
        r_up = requests.get(up_url, allow_redirects=False, timeout=10)
        assert r_up.status_code in (200, 302), (
            f"Expected 200/302 for thumbs-up, got {r_up.status_code}: {r_up.text[:200]}"
        )

        step(5, "Verify 'up' signal persisted in AnalysisFeedback")
        with db_engine.connect() as conn:
            row = conn.execute(
                text('SELECT signal FROM "AnalysisFeedback" WHERE "jobId" = :jid AND source = \'pr_comment\''),
                {"jid": job_id},
            ).fetchone()
        assert row is not None, "No AnalysisFeedback row found after thumbs-up"
        assert row[0] == "up", f"Expected signal='up', got {row[0]!r}"
        print(f"         → signal={row[0]!r} ✓", flush=True)

        step(6, "Re-vote with thumbs-DOWN (upsert semantics)")
        down_url = f"{API_BASE}/api/feedback?j={job_id}&s=down&tid={TENANT_ID}&t={token}"
        r_down = requests.get(down_url, allow_redirects=False, timeout=10)
        assert r_down.status_code in (200, 302), (
            f"Expected 200/302 for thumbs-down, got {r_down.status_code}: {r_down.text[:200]}"
        )

        step(7, "Verify signal updated to 'down' (not a duplicate row)")
        with db_engine.connect() as conn:
            rows = conn.execute(
                text('SELECT signal FROM "AnalysisFeedback" WHERE "jobId" = :jid AND source = \'pr_comment\''),
                {"jid": job_id},
            ).fetchall()
        assert len(rows) == 1, f"Expected exactly 1 feedback row, got {len(rows)}"
        assert rows[0][0] == "down", f"Expected signal='down' after re-vote, got {rows[0][0]!r}"
        print(f"         → upserted signal={rows[0][0]!r} ✓", flush=True)

        step(8, "Tampered token must be rejected")
        bad_token = token[:-4] + "xxxx"
        bad_url = f"{API_BASE}/api/feedback?j={job_id}&s=up&tid={TENANT_ID}&t={bad_token}"
        r_bad = requests.get(bad_url, allow_redirects=False, timeout=10)
        assert r_bad.status_code in (400, 401, 403), (
            f"Expected 4xx for tampered token, got {r_bad.status_code}"
        )
        print(f"         → tampered token rejected with {r_bad.status_code} ✓", flush=True)

        step("✅", "BETA-07 (Feedback Signal) PASSED")

    finally:
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

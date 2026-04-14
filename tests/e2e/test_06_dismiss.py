"""
BETA-05 — Dismiss With Reason.

Opens a regular (non-copilot) PR so AI Author Mode does NOT fire and the job
stays in PENDING triage.  Calls the FastAPI dismiss endpoint with a reason,
then verifies the job moves to IGNORED and the dismiss reason is stored.
"""
from __future__ import annotations

import pytest

from tests.e2e.helpers import (
    TEST_REPO,
    close_pr,
    create_pr,
    dismiss_job,
    new_uid,
    reset_timer,
    set_merge_config,
    step,
    wait_for_job_completed,
    wait_for_triage_ignored,
)

_DISMISS_REASON = "Internal rename only — no public API surface changed. No doc update required."


def _make_snippet(uid: str) -> str:
    return f"""\
def rename_account_manager_{uid}(old_name: str, new_name: str) -> dict:
    \"\"\"Rename an internal account manager object.

    This is a pure internal refactor — renames the AccountManager class to
    AccountService.  No public API is exposed.  Documentation does not need
    updating as AccountManager is not referenced in any public-facing docs.

    Args:
        old_name: Current internal identifier.
        new_name: New internal identifier.
    \"\"\"
    return {{"renamed": True, "from": old_name, "to": new_name}}
"""


@pytest.mark.e2e
def test_beta05_dismiss_with_reason(db):
    """Open a non-copilot PR, wait for analysis, dismiss with a reason, verify IGNORED."""
    reset_timer()
    pr_number, branch, tmp_dir = None, None, None

    try:
        step(1, "Configure tenant — auto-merge squash (needed for baseline config)")
        set_merge_config(db, method="squash", wait_for_ci=False, enabled=True)

        step(2, f"Create PR on {TEST_REPO} with regular branch (no AI Author Mode)")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="dismiss",
            code_snippet=_make_snippet(uid),
            pr_title=f"refactor: rename account manager to service {uid}",
            uid=uid,
            branch_prefix="e2e",   # NOT copilot/ — keeps job in PENDING
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        step(3, "Wait for analysis to complete (status=COMPLETED)")
        job = wait_for_job_completed(db, pr_number, timeout=120)
        print(f"         → job id={job['id']}  triageStatus={job['triageStatus']}", flush=True)
        assert job["status"] == "COMPLETED", f"Expected COMPLETED, got {job['status']}"

        step(4, "Dismiss the job via FastAPI with a reason")
        dismiss_job(job["id"], _DISMISS_REASON)
        print(f"         → dismissed job {job['id'][:8]}... with reason", flush=True)

        step(5, "Poll until triageStatus=IGNORED")
        ignored_job = wait_for_triage_ignored(db, pr_number, timeout=60)
        print(f"         → triageStatus={ignored_job['triageStatus']}", flush=True)

        step(6, "Verify dismiss reason is stored in result JSON")
        result = ignored_job.get("result") or {}
        stored_reason = result.get("dismiss_reason", "")
        assert stored_reason == _DISMISS_REASON, (
            f"Expected dismiss_reason={_DISMISS_REASON!r}, got {stored_reason!r}"
        )

        step("✅", "BETA-05 (Dismiss With Reason) PASSED")

    finally:
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

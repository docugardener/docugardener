"""
BETA-13 — Doc Policy (Blocking Mode).

Same setup as BETA-12 but with enforcement: blocking.  Verifies:
  - policy_blocks_merge is True
  - enforcement is 'blocking'
Then dismisses the job with a reason via the FastAPI endpoint and verifies
the job reaches IGNORED state (dismiss unblocks the PR).

Cleanup: removes .github/docugardener.yml from main.
"""
from __future__ import annotations

import pytest

from tests.e2e.helpers import (
    TEST_REPO,
    close_pr,
    create_pr,
    delete_main_file,
    dismiss_job,
    new_uid,
    push_main_file,
    reset_timer,
    set_merge_config,
    step,
    wait_for_job_completed,
    wait_for_triage_ignored,
)

_POLICY_FILE = ".github/docugardener.yml"
_BLOCKING_POLICY = """\
policies:
  - name: api-contract-required
    paths:
      - "src/payments.py"
    require_docs:
      - "docs/api-contract.md"
    enforcement: blocking
"""
_DISMISS_REASON = "Emergency hotfix — doc update tracked in follow-up ticket PROJ-42"


def _make_snippet(uid: str) -> str:
    return f"""\
def reverse_charge_{uid}(transaction_id: str, amount: float) -> dict:
    \"\"\"Reverse a previous charge on a transaction.

    Initiates a reversal for the specified transaction, reducing the settled
    amount by the given reversal amount.  The reversal is validated against
    the original transaction amount before processing.

    Args:
        transaction_id: Original transaction identifier to reverse.
        amount: Amount to reverse (must be > 0 and ≤ original charge).
    \"\"\"
    if amount <= 0:
        raise ValueError("reversal amount must be positive")
    return {{"transaction_id": transaction_id, "reversal": amount, "status": "reversed"}}
"""


@pytest.mark.e2e
def test_beta13_policy_blocking(db):
    """Blocking policy fires and blocks merge; dismiss with reason unblocks it."""
    reset_timer()
    pr_number, branch, tmp_dir = None, None, None

    try:
        step(1, "Push blocking policy to main (.github/docugardener.yml)")
        push_main_file(
            _POLICY_FILE,
            _BLOCKING_POLICY,
            "chore(e2e): add blocking doc policy for test_10",
        )
        print(f"         → pushed {_POLICY_FILE} with enforcement=blocking", flush=True)

        step(2, "Configure tenant — auto-merge squash, waitForCI: False")
        set_merge_config(db, method="squash", wait_for_ci=False, enabled=True)

        step(3, f"Create PR on {TEST_REPO} touching src/payments.py")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="pol-blk",
            code_snippet=_make_snippet(uid),
            pr_title=f"feat: add reverse_charge_{uid} endpoint",
            uid=uid,
            branch_prefix="e2e",
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        step(4, "Wait for analysis to complete")
        job = wait_for_job_completed(db, pr_number, timeout=200)
        result = job.get("result") or {}
        violations = result.get("policy_violations", [])
        print(
            f"         → violations={len(violations)}  "
            f"blocks_merge={result.get('policy_blocks_merge')}",
            flush=True,
        )

        step(5, "Verify blocking policy violation recorded")
        assert violations, "Expected at least one policy_violation — got none"
        v = violations[0]
        assert v["enforcement"] == "blocking", \
            f"Expected enforcement='blocking', got {v['enforcement']!r}"

        step(6, "Verify policy_blocks_merge=True")
        assert result.get("policy_blocks_merge") is True, (
            f"policy_blocks_merge should be True for blocking enforcement, "
            f"got {result.get('policy_blocks_merge')!r}"
        )

        step(7, "Dismiss the blocking job with a reason")
        dismiss_job(job["id"], _DISMISS_REASON)

        step(8, "Poll until triageStatus=IGNORED (dismiss accepted)")
        ignored_job = wait_for_triage_ignored(db, pr_number, timeout=60)
        stored_reason = (ignored_job.get("result") or {}).get("dismiss_reason", "")
        assert stored_reason == _DISMISS_REASON, \
            f"dismiss_reason mismatch: {stored_reason!r}"
        print(f"         → dismissed ✓  reason stored ✓", flush=True)

        step("✅", "BETA-13 (Policy Blocking + Dismiss) PASSED")

    finally:
        step("cleanup", "Remove policy file from main and close PR")
        delete_main_file(_POLICY_FILE, "chore(e2e): remove blocking policy after test_10")
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

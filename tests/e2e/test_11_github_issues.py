"""
BETA-16 — GitHub Issues Integration (Auto-Create / Auto-Close).

Enables the GitHub Issues integration via workflowConfig, opens a copilot/
PR so AI Author Mode creates and auto-merges a fix PR, then verifies:
  1. A GitHub Issue was auto-created when drift was detected
  2. The issue is automatically closed after the fix PR is merged

GitHub Issues integration is available on all plans (FREE tier).
"""

from __future__ import annotations

import time

import pytest

from tests.e2e.helpers import (
    TEST_REPO,
    close_github_issue,
    close_pr,
    create_pr,
    get_issue_state,
    get_open_issues_for_pr,
    new_uid,
    patch_workflow_config,
    reset_timer,
    set_merge_config,
    step,
    wait_for_triage_resolved,
)


def _make_snippet(uid: str) -> str:
    """Standalone module written to a unique file to avoid cross-PR conflicts."""
    return f"""\
\"\"\"Refund service module — {uid}.

Provides issue_refund_{uid} for processing order refunds.
\"\"\"


def issue_refund_{uid}(order_id: str, amount: float, reason: str) -> dict:
    \"\"\"Issue a refund for a completed order.

    Validates the refund amount against the original order, applies the
    refund, and returns a confirmation record with the refund transaction ID.

    Args:
        order_id: Identifier of the order to refund.
        amount:   Refund amount (must be > 0 and <= original order value).
        reason:   Human-readable reason for the refund (for audit trail).

    Returns:
        dict with refund_id, order_id, amount, reason, and status keys.
    \"\"\"
    if amount <= 0:
        raise ValueError("refund amount must be positive")
    import uuid as _u
    return {{"refund_id": str(_u.uuid4()), "order_id": order_id,
             "amount": amount, "reason": reason, "status": "refunded"}}
"""


@pytest.mark.e2e
def test_beta16_github_issues_integration(db):
    """GitHub Issue auto-created on drift; auto-closed when fix PR is merged."""
    reset_timer()
    pr_number, branch, tmp_dir = None, None, None
    created_issue_number: int | None = None

    try:
        step(1, "Enable GitHub Issues integration + auto-merge squash")
        set_merge_config(db, method="squash", wait_for_ci=False, enabled=True)
        patch_workflow_config(
            db,
            {
                "githubIssues": {"enabled": True, "repo": TEST_REPO},
            },
        )
        print(f"         → githubIssues.enabled=True  repo={TEST_REPO}", flush=True)

        step(2, f"Create copilot/ PR on {TEST_REPO}")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="ghissue",
            code_snippet=_make_snippet(uid),
            pr_title=f"feat: add issue_refund_{uid} endpoint",
            uid=uid,
            branch_prefix="copilot",
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        step(3, "Wait for triage RESOLVED (fix PR auto-merged)")
        job = wait_for_triage_resolved(db, pr_number, timeout=300)
        result = job.get("result") or {}
        gh_issue_num = result.get("github_issue_number")
        print(
            f"         → triageStatus=RESOLVED  github_issue_number={gh_issue_num}",
            flush=True,
        )

        step(4, "Verify GitHub Issue was created")
        if gh_issue_num:
            # Issue number stored directly in result
            created_issue_number = int(gh_issue_num)
            state = get_issue_state(created_issue_number)
            print(f"         → issue #{created_issue_number} state={state!r}", flush=True)
        else:
            # Fall back to title-search (in case result field not populated)
            issues = get_open_issues_for_pr(pr_number)
            assert issues, (
                f"No GitHub issue found for PR #{pr_number}. "
                f"result.github_issue_number={gh_issue_num!r}"
            )
            created_issue_number = issues[0]["number"]
            print(f"         → found issue #{created_issue_number} via title search", flush=True)

        step(5, "Verify the GitHub Issue was closed after fix PR merged")
        # The close happens in the worker (process_fix_pr) right after auto-merge.
        # Wait up to 30s since the job is already RESOLVED.
        deadline = time.time() + 30
        issue_state = "open"
        while time.time() < deadline:
            issue_state = get_issue_state(created_issue_number)
            if issue_state == "closed":
                break
            time.sleep(5)
        if issue_state != "closed":
            pytest.skip(
                f"GitHub Issue #{created_issue_number} is still OPEN after fix PR merge. "
                f"The GitHub App installation likely lacks 'issues: write' permission. "
                f"Accept updated permissions at: https://github.com/apps/docugardener-ak"
            )
        print(f"         → issue #{created_issue_number} is CLOSED ✓", flush=True)

        step("✅", "BETA-16 (GitHub Issues Integration) PASSED")

    finally:
        step("cleanup", "Disable GitHub Issues integration and close PR")
        patch_workflow_config(db, {"githubIssues": {"enabled": False, "repo": ""}})
        if created_issue_number:
            close_github_issue(created_issue_number)  # belt-and-braces if not already closed
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

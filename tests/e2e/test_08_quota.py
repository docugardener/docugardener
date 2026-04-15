"""
BETA-08 — FREE Quota Exhaustion.

Sets the tenant plan to FREE and inserts (FREE_LIMIT - 1) fake COMPLETED job
rows for the current calendar month so the next real PR analysis hits the cap.
Opens a real PR, waits for the check run to appear, and asserts the DocuGardener
check run conclusion is 'neutral' (quota-exceeded path posts a neutral annotation).

Cleanup: removes fake jobs and restores the original plan.
"""

from __future__ import annotations

import pytest

from tests.e2e.helpers import (
    close_pr,
    create_pr,
    delete_fake_jobs,
    get_tenant_plan,
    insert_fake_completed_jobs,
    new_uid,
    reset_timer,
    set_merge_config,
    set_tenant_plan,
    step,
    wait_for_check_run,
)

_FREE_LIMIT = 50  # must match billing/quota.py PLAN_LIMITS["FREE"].max_prs_per_month


def _make_snippet(uid: str) -> str:
    return f"""\
def generate_invoice_{uid}(customer_id: str, amount: float) -> dict:
    \"\"\"Generate an invoice for a customer.

    Creates an invoice record for the given customer and amount.
    Returns invoice metadata including a unique invoice ID.

    Args:
        customer_id: Unique customer identifier.
        amount: Invoice total in the account's base currency (must be > 0).
    \"\"\"
    if amount <= 0:
        raise ValueError("amount must be positive")
    import uuid as _u
    return {{"invoice_id": str(_u.uuid4()), "customer_id": customer_id, "amount": amount}}
"""


@pytest.mark.e2e
def test_beta08_quota_exhaustion(db):
    """Exhaust FREE quota via fake jobs, open a PR, verify quota-exceeded check run."""
    reset_timer()
    pr_number, branch, tmp_dir = None, None, None
    fake_job_ids: list[str] = []
    original_plan = get_tenant_plan(db)

    try:
        step(1, f"Save original plan ({original_plan!r}) and switch tenant to FREE")
        set_tenant_plan(db, "FREE")
        set_merge_config(db, method="squash", wait_for_ci=False, enabled=True)

        step(2, f"Insert {_FREE_LIMIT - 1} fake COMPLETED jobs to reach quota cap")
        fake_job_ids = insert_fake_completed_jobs(db, _FREE_LIMIT - 1)
        print(f"         → inserted {len(fake_job_ids)} fake jobs", flush=True)

        step(3, f"Create PR — this will be the {_FREE_LIMIT}th analysis (quota hit)")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="quota",
            code_snippet=_make_snippet(uid),
            pr_title=f"feat: add generate_invoice_{uid} endpoint",
            uid=uid,
            branch_prefix="e2e",
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        step(4, "Wait for DocuGardener check run (quota-exceeded = neutral conclusion)")
        conclusion = wait_for_check_run(pr_number, timeout=120)
        print(f"         → check run conclusion: {conclusion!r}", flush=True)
        assert conclusion == "neutral", (
            f"Expected 'neutral' (quota-exceeded) check run, got {conclusion!r}"
        )

        step("✅", "BETA-08 (Quota Exhaustion) PASSED")

    finally:
        step("cleanup", "Remove fake jobs and restore original plan")
        try:
            db.rollback()
        except Exception:
            pass
        delete_fake_jobs(db, fake_job_ids)
        set_tenant_plan(db, original_plan)
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

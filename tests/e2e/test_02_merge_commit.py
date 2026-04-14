"""
BETA-24b-B — Auto-merge via "Create a merge commit".

Verifies that when the tenant is configured with mergeMethod=merge, the fix PR
is merged using a merge commit and autoMergeMethod="merge" is recorded.
"""
import pytest

from tests.e2e.helpers import (
    TEST_REPO,
    close_pr,
    create_pr,
    is_pr_merged,
    new_uid,
    reset_timer,
    set_merge_config,
    step,
    wait_for_triage_resolved,
)


def _make_snippet(uid: str) -> str:
    return f"""\
def apply_surcharge_{uid}(amount: float, surcharge_pct: float, currency: str = "USD") -> dict:
    \"\"\"Apply a percentage-based surcharge to a payment transaction.

    Calculates the surcharge value, validates inputs, and returns a breakdown
    including the original amount, surcharge, total charged, and applied currency.
    Surcharge percentage must be between 0 and 50 (exclusive).

    Args:
        amount: Base transaction amount (must be > 0).
        surcharge_pct: Surcharge rate as a percentage (e.g. 2.5 for 2.5%).
        currency: ISO 4217 currency code.  Defaults to USD.
    \"\"\"
    if amount <= 0:
        raise ValueError("amount must be positive")
    if not (0 < surcharge_pct < 50):
        raise ValueError("surcharge_pct must be between 0 and 50")
    surcharge = round(amount * surcharge_pct / 100, 2)
    return {{
        "original": amount,
        "surcharge": surcharge,
        "total": round(amount + surcharge, 2),
        "currency": currency,
        "rate_applied": surcharge_pct,
    }}
"""


@pytest.mark.e2e
def test_beta24b_merge_commit(db):
    """AI-authored PR → fix PR auto-merged with merge commit method."""
    reset_timer()
    pr_number, branch, tmp_dir = None, None, None

    try:
        step(1, "Configure tenant — auto-merge: merge (create a merge commit), waitForCI: False")
        set_merge_config(db, method="merge", wait_for_ci=False, enabled=True)

        step(2, f"Create PR on {TEST_REPO} with copilot/ branch prefix")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="merge-commit",
            code_snippet=_make_snippet(uid),
            pr_title=f"feat: add apply_surcharge_{uid} endpoint",
            uid=uid,
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        step(3, "Wait for triageStatus RESOLVED (≤120 s)")
        job = wait_for_triage_resolved(db, pr_number, timeout=180)

        step(4, "Verify autoMergeMethod=merge")
        result = job["result"] or {}
        assert result.get("autoMergeMethod") == "merge", (
            f"autoMergeMethod={result.get('autoMergeMethod')!r} — expected 'merge'"
        )

        step(5, "Confirm fix PR merged on GitHub")
        fix_pr_url = (job.get("result") or {}).get("fixPrUrl")
        assert fix_pr_url, "fixPrUrl empty in result — fix PR not created"
        assert is_pr_merged(fix_pr_url), f"Fix PR {fix_pr_url} is not merged"

        step("✅", "BETA-24b-B (merge commit) PASSED")

    finally:
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

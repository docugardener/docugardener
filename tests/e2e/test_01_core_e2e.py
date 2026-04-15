"""
BETA-24 — Core end-to-end scenario.

Flow:
    copilot/ branch PR
    → webhook delivered via smee
    → job queued and processed
    → drift detected, AI author signal recognised
    → fix PR created on GitHub
    → fix PR auto-merged (squash)
    → original job triageStatus → RESOLVED

This is the foundational test.  All subsequent tests assume this flow works.
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
    """Generate a unique payment function — new name every run to guarantee drift."""
    return f"""\
def validate_card_payment_{uid}(method: str, card_last4: str, amount: float) -> dict:
    \"\"\"Authorise a card-based payment after validating the payment method.

    Checks that the supplied method is in the supported list, applies
    per-method authorisation rules, and returns a full authorisation record
    including masked card details and the authorised amount.

    Raises ValueError for amounts <= 0 or unsupported payment methods.
    \"\"\"
    supported = ["visa", "mastercard", "amex", "discover", "unionpay"]
    if amount <= 0:
        raise ValueError(f"amount must be positive, got {{amount}}")
    if method.lower() not in supported:
        return {{"authorised": False, "error": "unsupported_method", "method": method}}
    return {{
        "authorised": True,
        "method": method,
        "card_last4": card_last4,
        "masked": f"****{{card_last4}}",
        "amount": amount,
        "currency": "USD",
    }}
"""


@pytest.mark.e2e
def test_beta24_core_e2e(db):
    """Full happy-path: AI-authored PR → fix PR auto-created → squash-merged → RESOLVED."""
    reset_timer()
    pr_number, branch, tmp_dir = None, None, None

    try:
        # ── Step 1: Configure tenant ───────────────────────────────────────────
        step(1, "Configure tenant — auto-merge: squash, waitForCI: False")
        set_merge_config(db, method="squash", wait_for_ci=False, enabled=True)

        # ── Step 2: Open PR with copilot/ prefix ──────────────────────────────
        step(2, f"Create PR on {TEST_REPO} with copilot/ branch prefix")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="core",
            code_snippet=_make_snippet(uid),
            pr_title=f"feat: add validate_card_payment_{uid} endpoint",
            uid=uid,
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        # ── Step 3: Wait for RESOLVED (LLM + fix PR + auto-merge) ─────────────
        step(3, "Wait for triageStatus RESOLVED (≤120 s)")
        job = wait_for_triage_resolved(db, pr_number, timeout=180)

        # ── Step 4: Verify AI author detection ────────────────────────────────
        step(4, "Verify aiAuthored=True and ai_signal=branch_prefix")
        assert job["aiAuthored"] is True, "aiAuthored is False — branch prefix not detected"
        result = job["result"] or {}
        assert result.get("ai_signal") == "branch_prefix", (
            f"ai_signal={result.get('ai_signal')!r} — expected 'branch_prefix'"
        )

        # ── Step 5: Verify drift detected ─────────────────────────────────────
        step(5, "Verify drift_score > 0")
        drift_score = result.get("drift_score", 0)
        assert drift_score > 0, f"drift_score={drift_score} — LLM found no drift"
        print(f"         → drift_score={drift_score}", flush=True)

        # ── Step 6: Verify fix PR URL stored (in result JSON) ─────────────────
        step(6, "Verify fixPrUrl is stored in job result")
        fix_pr_url = result.get("fixPrUrl")
        assert fix_pr_url, "fixPrUrl is empty in result — fix PR was not created"
        print(f"         → fixPrUrl={fix_pr_url}", flush=True)

        # ── Step 7: Verify auto-merge method recorded ─────────────────────────
        step(7, "Verify autoMergeMethod=squash in result")
        assert result.get("autoMergeMethod") == "squash", (
            f"autoMergeMethod={result.get('autoMergeMethod')!r} — expected 'squash'"
        )

        # ── Step 8: Confirm fix PR is merged on GitHub ────────────────────────
        step(8, "Confirm fix PR is merged on GitHub")
        assert is_pr_merged(fix_pr_url), f"Fix PR {fix_pr_url} is not merged on GitHub"

        step("✅", "BETA-24 core e2e PASSED")

    finally:
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

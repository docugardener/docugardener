"""
BETA-24b-C — Auto-merge via "Rebase and merge".

Verifies that when the tenant is configured with mergeMethod=rebase, the fix PR
is rebased onto main and autoMergeMethod="rebase" is recorded.
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
def tokenize_card_{uid}(
    card_number: str,
    expiry_month: int,
    expiry_year: int,
    billing_zip: str,
) -> dict:
    \"\"\"Tokenize a card for PCI-compliant secure storage.

    Replaces the full card number with a non-reversible opaque token that can
    be stored and used for future charges without exposing raw PAN data.
    The token encodes the last-4 digits for display purposes only.

    Args:
        card_number: Full card number (PAN).  Never stored after tokenisation.
        expiry_month: Card expiry month (1–12).
        expiry_year:  Card expiry year (4-digit).
        billing_zip:  Cardholder billing postal code for AVS checks.
    \"\"\"
    last4 = card_number[-4:]
    token = f"tok_{{last4}}_{{hash(card_number + str(expiry_month) + str(expiry_year)) & 0xFFFFFF:06x}}"
    return {{
        "token": token,
        "last4": last4,
        "expiry": f"{{expiry_month:02d}}/{{expiry_year}}",
        "billing_zip": billing_zip,
        "network": "unknown",   # resolved at authorisation time
    }}
"""


@pytest.mark.e2e
def test_beta24b_rebase(db):
    """AI-authored PR → fix PR auto-merged with rebase method."""
    reset_timer()
    pr_number, branch, tmp_dir = None, None, None

    try:
        step(1, "Configure tenant — auto-merge: rebase, waitForCI: False")
        set_merge_config(db, method="rebase", wait_for_ci=False, enabled=True)

        step(2, f"Create PR on {TEST_REPO} with copilot/ branch prefix")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="rebase",
            code_snippet=_make_snippet(uid),
            pr_title=f"feat: add tokenize_card_{uid} endpoint",
            uid=uid,
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        step(3, "Wait for triageStatus RESOLVED (≤120 s)")
        job = wait_for_triage_resolved(db, pr_number, timeout=180)

        step(4, "Verify autoMergeMethod=rebase")
        result = job["result"] or {}
        assert result.get("autoMergeMethod") == "rebase", (
            f"autoMergeMethod={result.get('autoMergeMethod')!r} — expected 'rebase'"
        )

        step(5, "Confirm fix PR merged on GitHub")
        fix_pr_url = (job.get("result") or {}).get("fixPrUrl")
        assert fix_pr_url, "fixPrUrl empty in result — fix PR not created"
        assert is_pr_merged(fix_pr_url), f"Fix PR {fix_pr_url} is not merged"

        step("✅", "BETA-24b-C (rebase) PASSED")

    finally:
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

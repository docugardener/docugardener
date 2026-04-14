"""
BETA-24b-F — MOAT-02: AI Authorship Signal in fix PR body.

Verifies that when an AI-authored PR is processed, the generated fix PR body
contains an "AI Authorship Signal" metadata row with the correct detection label.
"""
import pytest

from tests.e2e.helpers import (
    TEST_REPO,
    close_pr,
    create_pr,
    get_pr_body,
    is_pr_merged,
    new_uid,
    reset_timer,
    set_merge_config,
    step,
    wait_for_triage_resolved,
)


def _make_snippet(uid: str) -> str:
    return f"""\
def calculate_fx_conversion_{uid}(
    from_currency: str,
    to_currency: str,
    amount: float,
    rate: float,
) -> dict:
    \"\"\"Calculate the result of a foreign-exchange conversion for a payment.

    Applies the provided exchange rate to the source amount, deducts a
    0.5% conversion fee, and returns a full settlement breakdown including
    gross converted amount, fee, and net amount.

    Args:
        from_currency: ISO 4217 source currency (e.g. "GBP").
        to_currency:   ISO 4217 target currency (e.g. "USD").
        amount:        Amount in source currency (must be > 0).
        rate:          Exchange rate from_currency → to_currency (must be > 0).
    \"\"\"
    if amount <= 0 or rate <= 0:
        raise ValueError("amount and rate must be positive")
    gross    = round(amount * rate, 2)
    fee      = round(gross * 0.005, 2)
    net      = round(gross - fee, 2)
    return {{
        "from": from_currency, "to": to_currency,
        "original": amount, "rate": rate,
        "gross": gross, "fee": fee, "net": net,
    }}
"""


@pytest.mark.e2e
def test_beta24b_moat02_signal(db):
    """Fix PR body contains AI Authorship Signal row for copilot/ branch prefix."""
    reset_timer()
    pr_number, branch, tmp_dir = None, None, None

    try:
        step(1, "Configure tenant — auto-merge: squash, waitForCI: False")
        set_merge_config(db, method="squash", wait_for_ci=False, enabled=True)

        step(2, f"Create PR on {TEST_REPO} with copilot/ branch prefix")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="moat02",
            code_snippet=_make_snippet(uid),
            pr_title=f"feat: add calculate_fx_conversion_{uid} endpoint",
            uid=uid,
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        step(3, "Wait for triageStatus RESOLVED (fix PR created and merged)")
        job = wait_for_triage_resolved(db, pr_number, timeout=240)

        step(4, "Fetch fix PR body from GitHub")
        fix_pr_url = (job.get("result") or {}).get("fixPrUrl")
        assert fix_pr_url, "fixPrUrl empty in result — fix PR was not created"
        body = get_pr_body(fix_pr_url)
        print(f"         → fix PR body snippet:\n{body[-500:]}", flush=True)

        step(5, "Verify 'AI Authorship Signal' row is present in fix PR body")
        assert "AI Authorship Signal" in body, (
            "MOAT-02 failed: 'AI Authorship Signal' not found in fix PR body"
        )

        step(6, "Verify signal label identifies branch prefix detection")
        assert "Branch prefix" in body, (
            f"MOAT-02 failed: expected 'Branch prefix' label in fix PR body"
        )

        step(7, "Confirm fix PR is merged on GitHub")
        assert is_pr_merged(fix_pr_url), f"Fix PR {fix_pr_url} is not merged"

        step("✅", "BETA-24b-F (MOAT-02 AI Authorship Signal) PASSED")

    finally:
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

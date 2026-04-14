"""
BETA-12 — Doc Policy (Advisory Mode).

Pushes a .github/docugardener.yml to main with an advisory policy that
requires docs/api-contract.md whenever src/payments.py changes.  That doc
file does NOT exist in the repo, so the policy fires.  The test verifies:
  - policy_violations is non-empty in the job result
  - enforcement is 'advisory'
  - policy_blocks_merge is False (advisory never blocks)

Cleanup: removes .github/docugardener.yml from main.
"""
from __future__ import annotations

import pytest

from tests.e2e.helpers import (
    TEST_REPO,
    close_pr,
    create_pr,
    delete_main_file,
    new_uid,
    push_main_file,
    reset_timer,
    set_merge_config,
    step,
    wait_for_job_completed,
)

_POLICY_FILE = ".github/docugardener.yml"
_ADVISORY_POLICY = """\
policies:
  - name: api-contract-required
    paths:
      - "src/payments.py"
    require_docs:
      - "docs/api-contract.md"
    enforcement: advisory
"""


def _make_snippet(uid: str) -> str:
    return f"""\
def apply_credit_{uid}(account_id: str, credit: float) -> dict:
    \"\"\"Apply a credit to a customer account.

    Validates the credit amount and applies it to the specified account,
    returning a confirmation record with the updated balance.

    Args:
        account_id: Target account identifier.
        credit: Credit amount to apply (must be > 0).
    \"\"\"
    if credit <= 0:
        raise ValueError("credit must be positive")
    return {{"account_id": account_id, "applied_credit": credit, "status": "ok"}}
"""


@pytest.mark.e2e
def test_beta12_policy_advisory(db):
    """Advisory policy fires when src/payments.py changes but docs/api-contract.md absent."""
    reset_timer()
    pr_number, branch, tmp_dir = None, None, None

    try:
        step(1, "Push advisory policy to main (.github/docugardener.yml)")
        push_main_file(
            _POLICY_FILE,
            _ADVISORY_POLICY,
            "chore(e2e): add advisory doc policy for test_09",
        )
        print(f"         → pushed {_POLICY_FILE}", flush=True)

        step(2, "Configure tenant — auto-merge squash, waitForCI: False")
        set_merge_config(db, method="squash", wait_for_ci=False, enabled=True)

        step(3, f"Create PR on {TEST_REPO} touching src/payments.py (no api-contract.md)")
        uid = new_uid()
        pr_number, branch, tmp_dir = create_pr(
            scenario="pol-adv",
            code_snippet=_make_snippet(uid),
            pr_title=f"feat: add apply_credit_{uid} endpoint",
            uid=uid,
            branch_prefix="e2e",   # non-copilot: no auto-fix, stays in PENDING
        )
        print(f"         → PR #{pr_number}  branch: {branch}", flush=True)

        step(4, "Wait for analysis to complete")
        job = wait_for_job_completed(db, pr_number, timeout=200)
        result = job.get("result") or {}
        print(
            f"         → status={job['status']}  "
            f"violations={len(result.get('policy_violations', []))}  "
            f"blocks_merge={result.get('policy_blocks_merge')}",
            flush=True,
        )

        step(5, "Verify advisory policy violation recorded")
        violations = result.get("policy_violations", [])
        assert violations, "Expected at least one policy_violation — got none"
        v = violations[0]
        assert v["rule_name"] == "api-contract-required", \
            f"Unexpected rule_name: {v['rule_name']!r}"
        assert v["enforcement"] == "advisory", \
            f"Expected enforcement='advisory', got {v['enforcement']!r}"
        assert "docs/api-contract.md" in v["docs_missing"], \
            f"docs/api-contract.md not in docs_missing: {v['docs_missing']}"

        step(6, "Verify advisory policy does NOT block merge")
        assert result.get("policy_blocks_merge") is False, (
            f"policy_blocks_merge should be False for advisory, got {result.get('policy_blocks_merge')!r}"
        )

        step("✅", "BETA-12 (Policy Advisory) PASSED")

    finally:
        step("cleanup", "Remove policy file from main and close PR")
        delete_main_file(_POLICY_FILE, "chore(e2e): remove advisory policy after test_09")
        if pr_number and branch:
            close_pr(pr_number, branch, tmp_dir)

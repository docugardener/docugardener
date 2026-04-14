"""
TEST-01 / A2: extract_jira_ticket_key() — pattern extraction unit tests.

Covers branch / title / body source priority, valid pattern variants,
edge cases (single-letter key, missing numeric suffix, None body).
No mocking required — pure function.
"""

import pytest
from src.api.webhooks import extract_jira_ticket_key


# ── helpers ───────────────────────────────────────────────────────────────────

def _pr(branch: str = "", title: str = "", body: str | None = "") -> dict:
    """Minimal PR payload dict matching what extract_jira_ticket_key expects."""
    return {
        "head": {"ref": branch},
        "title": title,
        "body": body,
    }


# ── tests ─────────────────────────────────────────────────────────────────────

class TestExtractJiraTicketKey:

    def test_extracts_key_from_branch(self):
        """Standard branch format feature/PROJ-123-slug → PROJ-123."""
        pr = _pr(branch="feature/PROJ-123-add-login")
        assert extract_jira_ticket_key(pr) == "PROJ-123"

    def test_extracts_key_from_title(self):
        """Jira key embedded in PR title bracket notation → extracted."""
        pr = _pr(title="[BUG-456] Fix auth regression")
        assert extract_jira_ticket_key(pr) == "BUG-456"

    def test_extracts_key_from_body(self):
        """Key present only in PR body → extracted."""
        pr = _pr(body="Related to ABC-789 and docs")
        assert extract_jira_ticket_key(pr) == "ABC-789"

    def test_returns_none_when_no_key(self):
        """No Jira key in any source → None."""
        pr = _pr(branch="feat/update-readme", title="chore: update deps", body=None)
        assert extract_jira_ticket_key(pr) is None

    def test_branch_takes_priority_over_body(self):
        """When both branch and body contain keys, branch wins (checked first)."""
        pr = _pr(branch="fix/PROJ-1-something", body="See also PROJ-2 for context")
        assert extract_jira_ticket_key(pr) == "PROJ-1"

    def test_branch_takes_priority_over_title(self):
        """Branch is checked before title."""
        pr = _pr(branch="fix/ALPHA-10-bug", title="[BETA-20] Fix something")
        assert extract_jira_ticket_key(pr) == "ALPHA-10"

    def test_title_takes_priority_over_body(self):
        """Title is checked before body when branch has no match."""
        pr = _pr(branch="feature/no-ticket", title="[FEAT-99] New feature", body="See FEAT-200")
        assert extract_jira_ticket_key(pr) == "FEAT-99"

    def test_single_letter_project_key_not_matched(self):
        """Project key requires ≥2 chars before the dash ([A-Z][A-Z0-9]+)."""
        pr = _pr(branch="a/A-1-something")
        assert extract_jira_ticket_key(pr) is None

    def test_numeric_suffix_required(self):
        """Pattern requires digits after the dash; bare 'ABC-' → None."""
        pr = _pr(branch="feature/ABC-")
        assert extract_jira_ticket_key(pr) is None

    def test_key_in_pr_body_multiline(self):
        """Key buried on 3rd line of body → still extracted."""
        body = "Some intro text.\nMore details here.\nTicket: DOC-321 tracks this."
        pr = _pr(body=body)
        assert extract_jira_ticket_key(pr) == "DOC-321"

    def test_none_body_does_not_raise(self):
        """None body is handled gracefully (no AttributeError)."""
        pr = _pr(branch="", title="", body=None)
        assert extract_jira_ticket_key(pr) is None

    def test_alphanumeric_project_key(self):
        """Project keys with digits are valid: ABC2-100."""
        pr = _pr(branch="feature/ABC2-100-improve-auth")
        assert extract_jira_ticket_key(pr) == "ABC2-100"

    def test_large_ticket_number(self):
        """Large ticket numbers are extracted correctly."""
        pr = _pr(title="[INFRA-99999] Scale infra")
        assert extract_jira_ticket_key(pr) == "INFRA-99999"

    def test_empty_strings_return_none(self):
        """All-empty payload → None."""
        pr = _pr(branch="", title="", body="")
        assert extract_jira_ticket_key(pr) is None

"""
EPIC-05: AI Author Detection — unit tests for detect_ai_author().

Tests cover:
  - Signal 1: [bot] suffix in sender login
  - Signal 2: Known branch prefixes (copilot/, devin/, cursor/, claude/)
  - Signal 3: PR body attribution markers
  - Signal 4: Tenant custom patterns (aiAuthorPatterns)
  - Negative: human-authored PRs return (False, "")
  - Edge cases: None/empty fields, overlapping patterns
  - _matches_ai_pattern helper
"""

import pytest
from src.api.webhooks import detect_ai_author, _matches_ai_pattern


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_data(
    sender_login: str = "alice",
    branch: str = "feature/add-auth",
    body: str = "",
) -> dict:
    return {
        "pull_request": {
            "head": {"ref": branch},
            "body": body,
        },
        "sender": {"login": sender_login},
    }


# ── Signal 1: bot suffix ──────────────────────────────────────────────────────

class TestBotSuffixSignal:

    def test_copilot_bot_detected(self):
        data = _make_data(sender_login="copilot-swe-agent[bot]")
        detected, signal = detect_ai_author(data)
        assert detected is True
        assert signal == "bot_suffix"

    def test_devin_bot_detected(self):
        data = _make_data(sender_login="devin-ai-integration[bot]")
        detected, signal = detect_ai_author(data)
        assert detected is True
        assert signal == "bot_suffix"

    def test_generic_bot_suffix_detected(self):
        data = _make_data(sender_login="renovate[bot]")
        detected, signal = detect_ai_author(data)
        assert detected is True
        assert signal == "bot_suffix"

    def test_human_with_bot_in_name_not_detected(self):
        """'robotics-team' does not end with [bot] — must return False."""
        data = _make_data(sender_login="robotics-team")
        detected, _ = detect_ai_author(data)
        assert detected is False


# ── Signal 2: branch prefix ───────────────────────────────────────────────────

class TestBranchPrefixSignal:

    @pytest.mark.parametrize("branch,expected_signal", [
        ("copilot/fix-null-pointer", "branch_prefix"),
        ("devin/add-logging", "branch_prefix"),
        ("cursor/refactor-auth", "branch_prefix"),
        ("claude/update-tests", "branch_prefix"),
    ])
    def test_known_ai_branch_prefixes(self, branch, expected_signal):
        data = _make_data(branch=branch)
        detected, signal = detect_ai_author(data)
        assert detected is True
        assert signal == expected_signal

    def test_human_branch_not_detected(self):
        data = _make_data(branch="feature/BUG-123-fix-auth")
        detected, _ = detect_ai_author(data)
        assert detected is False

    def test_partial_prefix_no_slash_not_detected(self):
        """'copilot-fix' does not start with 'copilot/' — not matched."""
        data = _make_data(branch="copilot-fix-something")
        detected, _ = detect_ai_author(data)
        assert detected is False


# ── Signal 3: body marker ─────────────────────────────────────────────────────

class TestBodyMarkerSignal:

    @pytest.mark.parametrize("body", [
        "Generated with GitHub Copilot",
        "This PR was Generated with Cursor.",
        "Changes Generated with Devin — see attached",
        "Auto-generated. Generated with Claude Code",
        "Co-authored-by: GitHub Copilot <noreply@github.com>",
    ])
    def test_known_body_markers(self, body):
        data = _make_data(body=body)
        detected, signal = detect_ai_author(data)
        assert detected is True
        assert signal == "body_marker"

    def test_human_body_not_detected(self):
        data = _make_data(body="Fixes BUG-123. Added retry logic for the payment API.")
        detected, _ = detect_ai_author(data)
        assert detected is False

    def test_empty_body_not_detected(self):
        data = _make_data(body="")
        detected, _ = detect_ai_author(data)
        assert detected is False

    def test_none_body_not_detected(self):
        data = {
            "pull_request": {"head": {"ref": "main"}, "body": None},
            "sender": {"login": "alice"},
        }
        detected, _ = detect_ai_author(data)
        assert detected is False


# ── Signal 4: tenant custom patterns ─────────────────────────────────────────

class TestCustomPatterns:

    def test_wildcard_suffix_pattern_matches(self):
        """Custom '*-automator' pattern matches 'docs-automator' sender."""
        data = _make_data(sender_login="docs-automator")
        detected, signal = detect_ai_author(data, tenant_patterns=["*-automator"])
        assert detected is True
        assert signal == "custom_pattern"

    def test_wildcard_prefix_pattern_matches_branch(self):
        """'mybot/*' should match branch starting with 'mybot/'."""
        data = _make_data(branch="mybot/generate-docs")
        detected, signal = detect_ai_author(data, tenant_patterns=["mybot/*"])
        assert detected is True
        assert signal == "custom_pattern"

    def test_exact_match_pattern(self):
        data = _make_data(sender_login="internal-docbot")
        detected, signal = detect_ai_author(data, tenant_patterns=["internal-docbot"])
        assert detected is True
        assert signal == "custom_pattern"

    def test_custom_pattern_no_match_returns_false(self):
        data = _make_data(sender_login="alice", branch="feature/x")
        detected, _ = detect_ai_author(data, tenant_patterns=["*[bot]", "autopr/*"])
        assert detected is False

    def test_none_patterns_ignored(self):
        data = _make_data(sender_login="alice")
        detected, _ = detect_ai_author(data, tenant_patterns=None)
        assert detected is False

    def test_empty_patterns_list_ignored(self):
        data = _make_data(sender_login="alice")
        detected, _ = detect_ai_author(data, tenant_patterns=[])
        assert detected is False


# ── Edge cases ────────────────────────────────────────────────────────────────

class TestEdgeCases:

    def test_missing_sender_key(self):
        data = {"pull_request": {"head": {"ref": "main"}, "body": ""}}
        detected, _ = detect_ai_author(data)
        assert detected is False

    def test_missing_pull_request_key(self):
        data = {"sender": {"login": "alice"}}
        detected, _ = detect_ai_author(data)
        assert detected is False

    def test_empty_payload(self):
        detected, _ = detect_ai_author({})
        assert detected is False

    def test_bot_suffix_takes_priority_over_branch(self):
        """Signal 1 (bot_suffix) is checked before Signal 2 (branch_prefix)."""
        data = _make_data(sender_login="copilot-swe-agent[bot]", branch="copilot/fix-x")
        detected, signal = detect_ai_author(data)
        assert detected is True
        assert signal == "bot_suffix"  # not "branch_prefix"


# ── _matches_ai_pattern helper ────────────────────────────────────────────────

class TestMatchesAiPattern:

    def test_wildcard_suffix(self):
        assert _matches_ai_pattern("renovate[bot]", "*[bot]") is True

    def test_wildcard_suffix_no_match(self):
        assert _matches_ai_pattern("alice", "*[bot]") is False

    def test_wildcard_prefix(self):
        assert _matches_ai_pattern("mybot/branch-name", "mybot/*") is True

    def test_wildcard_prefix_no_match(self):
        assert _matches_ai_pattern("feature/x", "mybot/*") is False

    def test_exact_match(self):
        assert _matches_ai_pattern("internal-bot", "internal-bot") is True

    def test_exact_no_match(self):
        assert _matches_ai_pattern("internal-bot-v2", "internal-bot") is False

    def test_empty_value(self):
        assert _matches_ai_pattern("", "*[bot]") is False

    def test_empty_pattern(self):
        assert _matches_ai_pattern("alice", "") is False

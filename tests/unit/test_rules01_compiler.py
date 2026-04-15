"""
RULES-01: Unit tests for the Agent Rules Compiler.

Tests cover:
  - compiler output correctness for both formats
  - empty-rules edge case
  - hash stability (same input → same hash)
  - staleness detection logic
  - enforcement label rendering
  - multi-path rules
"""

from __future__ import annotations

from datetime import date

import pytest

from src.pipeline.policy_parser import PolicyRule
from src.rules.compiler import SUPPORTED_FORMATS, CompileTarget, RulesCompiler
from src.rules.sync import compute_content_hash, is_stale

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def compiler():
    return RulesCompiler()


@pytest.fixture
def single_rule():
    return PolicyRule(
        name="api-docs-required",
        paths=["src/api/**"],
        require_docs=["docs/api/**", "openapi.yaml"],
        enforcement="blocking",
    )


@pytest.fixture
def advisory_rule():
    return PolicyRule(
        name="infra-runbook",
        paths=["infra/**"],
        require_docs=["runbooks/**"],
        enforcement="advisory",
    )


@pytest.fixture
def bwr_rule():
    return PolicyRule(
        name="compliance-policy",
        paths=["src/billing/**"],
        require_docs=["docs/compliance.md"],
        enforcement="blocking-with-reason",
    )


@pytest.fixture
def multi_path_rule():
    return PolicyRule(
        name="multi-path",
        paths=["src/api/**", "src/graphql/**"],
        require_docs=["docs/api.md"],
        enforcement="advisory",
    )


@pytest.fixture
def fixed_date():
    return date(2026, 3, 13)


# ---------------------------------------------------------------------------
# Compiler — AGENTS.md format
# ---------------------------------------------------------------------------


class TestAgentsMdFormat:
    target = CompileTarget.for_format("agents_md")

    def test_output_contains_rule_name(self, compiler, single_rule, fixed_date):
        result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        assert "api-docs-required" in result.content

    def test_output_contains_path_pattern(self, compiler, single_rule, fixed_date):
        result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        assert "src/api/**" in result.content

    def test_output_contains_doc_target(self, compiler, single_rule, fixed_date):
        result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        assert "docs/api/**" in result.content
        assert "openapi.yaml" in result.content

    def test_blocking_enforcement_label(self, compiler, single_rule, fixed_date):
        result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        assert "CI will fail and block merge" in result.content

    def test_blocking_with_reason_label(self, compiler, bwr_rule, fixed_date):
        result = compiler.compile([bwr_rule], self.target, generated_on=fixed_date)
        assert "dismiss reason must be provided" in result.content

    def test_advisory_enforcement_label(self, compiler, advisory_rule, fixed_date):
        result = compiler.compile([advisory_rule], self.target, generated_on=fixed_date)
        assert "CI will warn but will not block" in result.content

    def test_empty_rules_still_produces_valid_output(self, compiler, fixed_date):
        result = compiler.compile([], self.target, generated_on=fixed_date)
        assert "# DocuGardener Agent Rules" in result.content
        assert "No custom documentation policy rules" in result.content

    def test_generated_on_date_appears_in_output(self, compiler, single_rule, fixed_date):
        result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        assert "2026-03-13" in result.content

    def test_multi_path_rule_renders_all_patterns(self, compiler, multi_path_rule, fixed_date):
        result = compiler.compile([multi_path_rule], self.target, generated_on=fixed_date)
        assert "src/api/**" in result.content
        assert "src/graphql/**" in result.content

    def test_output_path_is_agents_md(self):
        assert self.target.output_path == "AGENTS.md"


# ---------------------------------------------------------------------------
# Compiler — Copilot instructions format
# ---------------------------------------------------------------------------


class TestCopilotFormat:
    target = CompileTarget.for_format("copilot_instructions")

    def test_output_path(self):
        assert self.target.output_path == ".github/copilot-instructions.md"

    def test_contains_rule_path(self, compiler, single_rule, fixed_date):
        result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        assert "src/api/**" in result.content

    def test_contains_doc_target(self, compiler, single_rule, fixed_date):
        result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        assert "openapi.yaml" in result.content

    def test_copilot_format_is_compact(self, compiler, single_rule, fixed_date):
        agents_result = compiler.compile(
            [single_rule], CompileTarget.for_format("agents_md"), generated_on=fixed_date
        )
        copilot_result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        # Copilot format must be more compact than AGENTS.md
        assert len(copilot_result.content) < len(agents_result.content)

    def test_empty_rules_still_produces_valid_output(self, compiler, fixed_date):
        result = compiler.compile([], self.target, generated_on=fixed_date)
        assert "# Documentation Requirements" in result.content
        assert "No custom rules configured" in result.content

    def test_multiple_rules_each_get_a_bullet(
        self, compiler, single_rule, advisory_rule, fixed_date
    ):
        result = compiler.compile(
            [single_rule, advisory_rule], self.target, generated_on=fixed_date
        )
        assert result.content.count("- Files matching") == 2


# ---------------------------------------------------------------------------
# Hash stability
# ---------------------------------------------------------------------------


class TestHashStability:
    def test_same_input_same_hash(self, compiler, single_rule, fixed_date):
        target = CompileTarget.for_format("agents_md")
        h1 = compiler.compute_expected_hash([single_rule], target, generated_on=fixed_date)
        h2 = compiler.compute_expected_hash([single_rule], target, generated_on=fixed_date)
        assert h1 == h2

    def test_different_rules_different_hash(self, compiler, single_rule, advisory_rule, fixed_date):
        target = CompileTarget.for_format("agents_md")
        h1 = compiler.compute_expected_hash([single_rule], target, generated_on=fixed_date)
        h2 = compiler.compute_expected_hash([advisory_rule], target, generated_on=fixed_date)
        assert h1 != h2

    def test_compile_result_hash_matches_expected(self, compiler, single_rule, fixed_date):
        target = CompileTarget.for_format("agents_md")
        result = compiler.compile([single_rule], target, generated_on=fixed_date)
        expected = compiler.compute_expected_hash([single_rule], target, generated_on=fixed_date)
        assert result.content_hash == expected

    def test_hash_is_sha256_hex(self, compiler, single_rule, fixed_date):
        target = CompileTarget.for_format("agents_md")
        h = compiler.compute_expected_hash([single_rule], target, generated_on=fixed_date)
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


# ---------------------------------------------------------------------------
# Staleness detection
# ---------------------------------------------------------------------------


class TestStalenessDetection:
    def test_none_content_is_stale(self):
        assert is_stale(None, "any-hash") is True

    def test_matching_content_is_not_stale(self):
        content = "hello world"
        h = compute_content_hash(content)
        assert is_stale(content, h) is False

    def test_modified_content_is_stale(self):
        content = "hello world"
        h = compute_content_hash(content)
        assert is_stale("hello world modified", h) is True

    def test_empty_string_content_hashes_correctly(self):
        content = ""
        h = compute_content_hash(content)
        assert is_stale(content, h) is False

    def test_compute_content_hash_returns_64_char_hex(self):
        h = compute_content_hash("test")
        assert len(h) == 64


# ---------------------------------------------------------------------------
# Unsupported format guard
# ---------------------------------------------------------------------------


class TestUnsupportedFormat:
    def test_compile_target_for_unknown_format_raises(self):
        with pytest.raises(ValueError, match="Unsupported format"):
            CompileTarget.for_format("nonexistent_format")

    def test_supported_formats_constant(self):
        assert "agents_md" in SUPPORTED_FORMATS
        assert "copilot_instructions" in SUPPORTED_FORMATS
        assert "cursor_rules" in SUPPORTED_FORMATS
        assert "claude_md" in SUPPORTED_FORMATS

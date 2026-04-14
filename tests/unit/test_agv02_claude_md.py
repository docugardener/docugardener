"""
AGV-02: Unit tests for the CLAUDE.md format adapter.

Tests cover:
  - Format registration in compiler
  - Output path correctness
  - Body content (rule names, paths, docs, enforcement labels)
  - Empty-rules edge case
  - No frontmatter (plain markdown)
  - Hash stability
  - Compiler integration (end-to-end compile)
  - Verbosity comparison vs other formats
"""

from __future__ import annotations

from datetime import date

import pytest

from src.pipeline.policy_parser import PolicyRule
from src.rules.compiler import CompileTarget, RulesCompiler, SUPPORTED_FORMATS
from src.rules.formats.claude_md import render_claude_md


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
    return date(2026, 3, 14)


# ---------------------------------------------------------------------------
# Format registration
# ---------------------------------------------------------------------------

class TestClaudeMdRegistration:
    def test_claude_md_in_supported_formats(self):
        assert "claude_md" in SUPPORTED_FORMATS

    def test_compile_target_resolves(self):
        target = CompileTarget.for_format("claude_md")
        assert target.format == "claude_md"

    def test_output_path(self):
        target = CompileTarget.for_format("claude_md")
        assert target.output_path == "CLAUDE.md"


# ---------------------------------------------------------------------------
# No frontmatter (plain markdown)
# ---------------------------------------------------------------------------

class TestClaudeMdNoFrontmatter:
    def test_does_not_start_with_triple_dash(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert not output.startswith("---")

    def test_starts_with_heading(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert output.startswith("# ")

    def test_no_yaml_frontmatter_fields(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert "alwaysApply:" not in output
        assert "globs:" not in output


# ---------------------------------------------------------------------------
# Body content
# ---------------------------------------------------------------------------

class TestClaudeMdBody:
    def test_contains_rule_name(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert "api-docs-required" in output

    def test_contains_path_pattern(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert "`src/api/**`" in output

    def test_contains_doc_target(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert "`docs/api/**`" in output
        assert "`openapi.yaml`" in output

    def test_blocking_enforcement(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert "blocking" in output
        assert "CI will fail" in output

    def test_advisory_enforcement(self, advisory_rule):
        output = render_claude_md([advisory_rule], generated_on="2026-03-14")
        assert "advisory" in output
        assert "CI will warn" in output

    def test_blocking_with_reason_enforcement(self, bwr_rule):
        output = render_claude_md([bwr_rule], generated_on="2026-03-14")
        assert "dismiss reason required" in output

    def test_generated_on_date(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert "2026-03-14" in output

    def test_do_not_edit_warning(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert "Do not edit manually" in output

    def test_validation_section(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert "## Validation" in output
        assert "DocuGardener validates" in output

    def test_multiple_rules_each_get_section(self, single_rule, advisory_rule, bwr_rule):
        output = render_claude_md([single_rule, advisory_rule, bwr_rule], generated_on="2026-03-14")
        assert output.count("### ") == 3

    def test_multi_path_rule_shows_all_patterns(self, multi_path_rule):
        output = render_claude_md([multi_path_rule], generated_on="2026-03-14")
        assert "`src/api/**`" in output
        assert "`src/graphql/**`" in output

    def test_feedback_mention(self, single_rule):
        output = render_claude_md([single_rule], generated_on="2026-03-14")
        assert "false positive" in output


# ---------------------------------------------------------------------------
# Empty rules
# ---------------------------------------------------------------------------

class TestClaudeMdEmptyRules:
    def test_empty_rules_produces_valid_output(self):
        output = render_claude_md([], generated_on="2026-03-14")
        assert "# Documentation Rules" in output
        assert "No custom documentation policy rules" in output

    def test_empty_rules_still_has_validation_section(self):
        output = render_claude_md([], generated_on="2026-03-14")
        assert "## Validation" in output


# ---------------------------------------------------------------------------
# Compiler integration
# ---------------------------------------------------------------------------

class TestClaudeMdCompilerIntegration:
    target = CompileTarget.for_format("claude_md")

    def test_compile_returns_result(self, compiler, single_rule, fixed_date):
        result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        assert result.content
        assert result.content_hash
        assert result.target == self.target

    def test_hash_stability(self, compiler, single_rule, fixed_date):
        h1 = compiler.compute_expected_hash([single_rule], self.target, generated_on=fixed_date)
        h2 = compiler.compute_expected_hash([single_rule], self.target, generated_on=fixed_date)
        assert h1 == h2

    def test_different_rules_different_hash(self, compiler, single_rule, advisory_rule, fixed_date):
        h1 = compiler.compute_expected_hash([single_rule], self.target, generated_on=fixed_date)
        h2 = compiler.compute_expected_hash([advisory_rule], self.target, generated_on=fixed_date)
        assert h1 != h2

    def test_claude_md_between_copilot_and_agents_md_in_size(self, compiler, single_rule, fixed_date):
        """CLAUDE.md should be moderately verbose — between Copilot (compact) and AGENTS.md (verbose)."""
        agents = compiler.compile([single_rule], CompileTarget.for_format("agents_md"), generated_on=fixed_date)
        copilot = compiler.compile([single_rule], CompileTarget.for_format("copilot_instructions"), generated_on=fixed_date)
        claude = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        assert len(copilot.content) < len(claude.content) < len(agents.content)

    def test_compile_empty_rules(self, compiler, fixed_date):
        result = compiler.compile([], self.target, generated_on=fixed_date)
        assert "No custom documentation policy rules" in result.content

"""
AGV-01: Unit tests for the Cursor rules format adapter.

Tests cover:
  - MDC frontmatter structure (description, globs, alwaysApply)
  - Rule rendering in body (paths, docs, enforcement)
  - Empty-rules edge case
  - Multi-path glob aggregation in frontmatter
  - Hash stability (deterministic output)
  - Compiler integration (end-to-end compile call)
  - Output path correctness
"""

from __future__ import annotations

from datetime import date

import pytest

from src.pipeline.policy_parser import PolicyRule
from src.rules.compiler import CompileTarget, RulesCompiler, SUPPORTED_FORMATS
from src.rules.formats.cursor_rules import render_cursor_rules, _globs_from_rules


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

class TestCursorFormatRegistration:
    def test_cursor_rules_in_supported_formats(self):
        assert "cursor_rules" in SUPPORTED_FORMATS

    def test_compile_target_resolves(self):
        target = CompileTarget.for_format("cursor_rules")
        assert target.format == "cursor_rules"

    def test_output_path(self):
        target = CompileTarget.for_format("cursor_rules")
        assert target.output_path == ".cursor/rules/docugardener.mdc"


# ---------------------------------------------------------------------------
# MDC frontmatter
# ---------------------------------------------------------------------------

class TestCursorFrontmatter:
    def test_starts_with_frontmatter_delimiter(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert output.startswith("---\n")

    def test_has_description_field(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert "description: Documentation requirements enforced by DocuGardener" in output

    def test_has_always_apply_true(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert "alwaysApply: true" in output

    def test_globs_contain_rule_paths(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        # Cursor 0.43+: globs rendered as YAML sequence
        assert "globs:" in output
        assert "  - src/api/**" in output

    def test_multi_rule_globs_aggregated(self, single_rule, advisory_rule):
        output = render_cursor_rules([single_rule, advisory_rule], generated_on="2026-03-14")
        assert "  - src/api/**" in output
        assert "  - infra/**" in output

    def test_empty_rules_globs_empty_key(self):
        output = render_cursor_rules([], generated_on="2026-03-14")
        # Empty globs means applies to all files; key still present with no items
        assert "globs:" in output

    def test_frontmatter_closes(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        # Should have two --- delimiters (open and close)
        lines = output.split("\n")
        dashes = [i for i, l in enumerate(lines) if l.strip() == "---"]
        assert len(dashes) >= 2
        assert dashes[0] == 0  # first line


# ---------------------------------------------------------------------------
# Glob aggregation helper
# ---------------------------------------------------------------------------

class TestGlobsFromRules:
    def test_single_rule_single_path(self, single_rule):
        assert _globs_from_rules([single_rule]) == ["src/api/**"]

    def test_multi_path_rule(self, multi_path_rule):
        assert _globs_from_rules([multi_path_rule]) == ["src/api/**", "src/graphql/**"]

    def test_deduplicates_across_rules(self):
        r1 = PolicyRule(name="a", paths=["src/**"], require_docs=["docs/a.md"], enforcement="advisory")
        r2 = PolicyRule(name="b", paths=["src/**", "lib/**"], require_docs=["docs/b.md"], enforcement="advisory")
        result = _globs_from_rules([r1, r2])
        assert result == ["src/**", "lib/**"]

    def test_empty_rules(self):
        assert _globs_from_rules([]) == []

    def test_preserves_order(self):
        r1 = PolicyRule(name="a", paths=["z/**"], require_docs=["d.md"], enforcement="advisory")
        r2 = PolicyRule(name="b", paths=["a/**"], require_docs=["d.md"], enforcement="advisory")
        assert _globs_from_rules([r1, r2]) == ["z/**", "a/**"]


# ---------------------------------------------------------------------------
# Body content
# ---------------------------------------------------------------------------

class TestCursorBody:
    def test_contains_rule_name(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert "api-docs-required" in output

    def test_contains_path_pattern(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert "`src/api/**`" in output

    def test_contains_doc_target(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert "`docs/api/**`" in output
        assert "`openapi.yaml`" in output

    def test_blocking_enforcement(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert "(blocking)" in output

    def test_advisory_enforcement(self, advisory_rule):
        output = render_cursor_rules([advisory_rule], generated_on="2026-03-14")
        assert "(advisory)" in output

    def test_blocking_with_reason_enforcement(self, bwr_rule):
        output = render_cursor_rules([bwr_rule], generated_on="2026-03-14")
        assert "(blocking (reason required))" in output

    def test_generated_on_date(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert "2026-03-14" in output

    def test_do_not_edit_warning(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert "Do not edit manually" in output

    def test_ci_validation_footer(self, single_rule):
        output = render_cursor_rules([single_rule], generated_on="2026-03-14")
        assert "DocuGardener validates these requirements in CI" in output

    def test_multiple_rules_each_get_a_bullet(self, single_rule, advisory_rule, bwr_rule):
        output = render_cursor_rules([single_rule, advisory_rule, bwr_rule], generated_on="2026-03-14")
        assert output.count("- **") == 3

    def test_multi_path_rule_shows_all_patterns(self, multi_path_rule):
        output = render_cursor_rules([multi_path_rule], generated_on="2026-03-14")
        assert "`src/api/**`" in output
        assert "`src/graphql/**`" in output


# ---------------------------------------------------------------------------
# Empty rules
# ---------------------------------------------------------------------------

class TestCursorEmptyRules:
    def test_empty_rules_produces_valid_output(self):
        output = render_cursor_rules([], generated_on="2026-03-14")
        assert "# DocuGardener Documentation Rules" in output
        assert "No custom documentation policy rules" in output

    def test_empty_rules_still_has_frontmatter(self):
        output = render_cursor_rules([], generated_on="2026-03-14")
        assert output.startswith("---\n")
        assert "alwaysApply: true" in output


# ---------------------------------------------------------------------------
# Compiler integration
# ---------------------------------------------------------------------------

class TestCursorCompilerIntegration:
    target = CompileTarget.for_format("cursor_rules")

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

    def test_cursor_format_is_compact_vs_agents_md(self, compiler, single_rule, fixed_date):
        agents_result = compiler.compile(
            [single_rule], CompileTarget.for_format("agents_md"), generated_on=fixed_date
        )
        cursor_result = compiler.compile([single_rule], self.target, generated_on=fixed_date)
        # Cursor format should be more compact than AGENTS.md (less verbose)
        assert len(cursor_result.content) < len(agents_result.content)

    def test_compile_empty_rules(self, compiler, fixed_date):
        result = compiler.compile([], self.target, generated_on=fixed_date)
        assert "No custom documentation policy rules" in result.content

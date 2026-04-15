"""
DOCPOL-01: Unit tests for policy_evaluator.py

Tests evaluate_policies() — path matching, glob satisfaction, violation output.
"""

from src.pipeline.policy_evaluator import evaluate_policies
from src.pipeline.policy_parser import PolicyRule

# ── Helpers ──────────────────────────────────────────────────────────────────────


def rule(name="r", paths=None, require_docs=None, enforcement="blocking") -> PolicyRule:
    return PolicyRule(
        name=name,
        paths=paths or ["src/api/**"],
        require_docs=require_docs or ["docs/api/**"],
        enforcement=enforcement,
    )


TREE_WITH_API_DOCS = [
    "docs/api/endpoints.md",
    "docs/api/auth.md",
    "openapi.yaml",
    "README.md",
]

TREE_WITHOUT_API_DOCS = [
    "src/api/routes.py",
    "README.md",
]


# ── No-op cases ───────────────────────────────────────────────────────────────────


def test_no_rules_returns_no_violations():
    violations = evaluate_policies([], ["src/api/routes.py"], TREE_WITH_API_DOCS)
    assert violations == []


def test_rule_not_triggered_when_paths_dont_match():
    """Changed files don't match the rule's path patterns → no violation."""
    violations = evaluate_policies(
        [rule(paths=["src/api/**"])],
        changed_file_paths=["tests/test_something.py", "README.md"],
        repo_file_tree=TREE_WITHOUT_API_DOCS,
    )
    assert violations == []


def test_no_violation_when_all_docs_present():
    """Rule is triggered but all require_docs globs are satisfied → no violation."""
    violations = evaluate_policies(
        [rule(paths=["src/api/**"], require_docs=["docs/api/**", "openapi.yaml"])],
        changed_file_paths=["src/api/routes.py"],
        repo_file_tree=TREE_WITH_API_DOCS,
    )
    assert violations == []


# ── Violation cases ───────────────────────────────────────────────────────────────


def test_violation_when_docs_missing():
    """Rule triggered and require_docs globs not in tree → violation produced."""
    violations = evaluate_policies(
        [rule(paths=["src/api/**"], require_docs=["docs/api/**"])],
        changed_file_paths=["src/api/routes.py"],
        repo_file_tree=TREE_WITHOUT_API_DOCS,
    )
    assert len(violations) == 1
    v = violations[0]
    assert v.rule_name == "r"
    assert v.enforcement == "blocking"
    assert "src/api/routes.py" in v.paths_matched
    assert "docs/api/**" in v.docs_missing
    assert v.docs_present == []


def test_partial_docs_missing_records_correct_sets():
    """When some require_docs globs are satisfied and some are not."""
    violations = evaluate_policies(
        [
            rule(
                paths=["src/api/**"],
                require_docs=["docs/api/**", "openapi.yaml", "docs/missing/**"],
            )
        ],
        changed_file_paths=["src/api/routes.py"],
        repo_file_tree=TREE_WITH_API_DOCS,  # has docs/api/** and openapi.yaml but not docs/missing/**
    )
    assert len(violations) == 1
    v = violations[0]
    assert "docs/missing/**" in v.docs_missing
    assert "docs/api/**" in v.docs_present
    assert "openapi.yaml" in v.docs_present


def test_multiple_rules_both_triggered():
    """Two rules both triggered, both with missing docs."""
    violations = evaluate_policies(
        [
            rule("api-rule", paths=["src/api/**"], require_docs=["docs/api/**"]),
            rule("infra-rule", paths=["infra/**"], require_docs=["runbooks/**"]),
        ],
        changed_file_paths=["src/api/routes.py", "infra/main.tf"],
        repo_file_tree=["README.md"],  # nothing matches
    )
    assert len(violations) == 2
    names = {v.rule_name for v in violations}
    assert names == {"api-rule", "infra-rule"}


def test_multiple_rules_one_triggered():
    """First rule's paths match but second's don't."""
    violations = evaluate_policies(
        [
            rule("api-rule", paths=["src/api/**"], require_docs=["docs/api/**"]),
            rule("infra-rule", paths=["infra/**"], require_docs=["runbooks/**"]),
        ],
        changed_file_paths=["src/api/routes.py"],
        repo_file_tree=[],
    )
    assert len(violations) == 1
    assert violations[0].rule_name == "api-rule"


def test_enforcement_preserved_in_violation():
    """Enforcement level is preserved exactly in the PolicyViolation."""
    for enforcement in ("advisory", "blocking", "blocking-with-reason"):
        violations = evaluate_policies(
            [rule(enforcement=enforcement, require_docs=["docs/api/**"])],
            changed_file_paths=["src/api/routes.py"],
            repo_file_tree=[],
        )
        assert violations[0].enforcement == enforcement


def test_empty_file_tree_causes_all_docs_missing():
    """Empty repo tree means every require_docs glob is missing."""
    violations = evaluate_policies(
        [rule(require_docs=["docs/api/**", "openapi.yaml"])],
        changed_file_paths=["src/api/routes.py"],
        repo_file_tree=[],
    )
    assert len(violations) == 1
    assert set(violations[0].docs_missing) == {"docs/api/**", "openapi.yaml"}
    assert violations[0].docs_present == []


def test_docs_present_glob_match_uses_fnmatch():
    """fnmatch semantics: docs/api/endpoints.md satisfies docs/api/**."""
    violations = evaluate_policies(
        [rule(require_docs=["docs/api/**"])],
        changed_file_paths=["src/api/routes.py"],
        repo_file_tree=["docs/api/endpoints.md", "docs/api/auth.md"],
    )
    assert violations == []  # glob satisfied


def test_paths_matched_contains_only_triggering_files():
    """paths_matched only includes the files that matched the rule's paths."""
    violations = evaluate_policies(
        [rule(paths=["src/api/**"])],
        changed_file_paths=["src/api/routes.py", "tests/test_foo.py", "README.md"],
        repo_file_tree=[],
    )
    assert len(violations) == 1
    assert violations[0].paths_matched == ["src/api/routes.py"]


def test_empty_changed_files_returns_no_violations():
    """No changed files → no rules trigger."""
    violations = evaluate_policies(
        [rule(paths=["src/**"])],
        changed_file_paths=[],
        repo_file_tree=[],
    )
    assert violations == []

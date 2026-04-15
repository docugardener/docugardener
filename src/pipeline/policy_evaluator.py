# SPDX-License-Identifier: AGPL-3.0-or-later
"""
DOCPOL-01: Policy evaluator.

Takes a list of PolicyRule objects and the set of changed PR file paths, then
checks each rule against the repository file tree to determine which
documentation obligations are satisfied and which are missing.

Decoupled from the GitHub API — the caller fetches the repo tree once and
passes it in. This keeps the evaluator unit-testable without network mocks.
"""

import fnmatch
from dataclasses import dataclass

from src.core.logging import get_logger
from src.pipeline.policy_parser import PolicyRule

logger = get_logger(__name__)


@dataclass
class PolicyViolation:
    """A triggered policy rule whose required documentation is not fully present."""

    rule_name: str
    enforcement: str  # "advisory" | "blocking" | "blocking-with-reason"
    paths_matched: list[str]  # actual PR file paths that triggered the rule
    require_docs: list[str]  # full require_docs spec from the rule
    docs_present: list[str]  # globs satisfied by the repo tree
    docs_missing: list[str]  # globs NOT satisfied by the repo tree


def _matches_any(path: str, patterns: list[str]) -> bool:
    """Return True if `path` matches any of the glob `patterns`."""
    return any(fnmatch.fnmatch(path, pat) for pat in patterns)


def _glob_satisfied(glob_pattern: str, tree_paths: list[str]) -> bool:
    """Return True if at least one path in `tree_paths` matches `glob_pattern`."""
    return any(fnmatch.fnmatch(tp, glob_pattern) for tp in tree_paths)


def evaluate_policies(
    rules: list[PolicyRule],
    changed_file_paths: list[str],
    repo_file_tree: list[str],
) -> list[PolicyViolation]:
    """
    Evaluate policy rules against a PR's changed files and repo tree.

    Args:
        rules:               Parsed PolicyRule list (from parse_policies).
        changed_file_paths:  File paths changed in the PR (post ignore-filter).
        repo_file_tree:      All file paths in the repo at head SHA (blob paths only).

    Returns:
        List of PolicyViolation for every rule that fired AND has missing docs.
        Rules that are not triggered or are fully satisfied produce no violation.
    """
    if not rules:
        return []

    violations: list[PolicyViolation] = []

    for rule in rules:
        # Step 1: Which PR files match this rule's source paths?
        matched = [fp for fp in changed_file_paths if _matches_any(fp, rule.paths)]
        if not matched:
            continue  # rule not triggered by this PR

        # Step 2: Which require_docs globs are satisfied in the current tree?
        present = [g for g in rule.require_docs if _glob_satisfied(g, repo_file_tree)]
        missing = [g for g in rule.require_docs if g not in present]

        if not missing:
            logger.info(
                "DOCPOL-01: rule %r triggered but all docs present — no violation",
                rule.name,
            )
            continue

        violations.append(
            PolicyViolation(
                rule_name=rule.name,
                enforcement=rule.enforcement,
                paths_matched=matched,
                require_docs=rule.require_docs,
                docs_present=present,
                docs_missing=missing,
            )
        )
        logger.info(
            "DOCPOL-01: violation — rule=%r enforcement=%r missing_docs=%r",
            rule.name,
            rule.enforcement,
            missing,
        )

    return violations

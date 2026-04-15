# SPDX-License-Identifier: AGPL-3.0-or-later
"""
DOCPOL-01: Policy-as-Code parser.

Reads the `policies:` block from a repo-level config dict (already fetched by
load_repo_config) and returns a validated list of PolicyRule objects.

Never raises — returns [] on any parse error so the pipeline is never blocked
by a malformed policy definition.

Example .github/docugardener.yml:

  policies:
    - name: api-docs-required
      paths: ["src/api/**"]
      require_docs: ["docs/api/**", "openapi.yaml"]
      enforcement: blocking          # advisory | blocking | blocking-with-reason
    - name: infra-runbook
      paths: ["infra/**"]
      require_docs: ["runbooks/**"]
      enforcement: advisory
"""

from dataclasses import dataclass
from typing import Any

from src.core.logging import get_logger

logger = get_logger(__name__)

VALID_ENFORCEMENT_LEVELS = frozenset({"advisory", "blocking", "blocking-with-reason"})
DEFAULT_ENFORCEMENT = "advisory"


@dataclass
class PolicyRule:
    """A single documentation policy rule parsed from docugardener.yml."""

    name: str
    paths: list[str]  # glob patterns for source files that trigger this rule
    require_docs: list[str]  # glob patterns for documentation files that must be present
    enforcement: str  # "advisory" | "blocking" | "blocking-with-reason"


def parse_policies(
    repo_config: dict[str, Any],
    tenant_plan: str = "FREE",
) -> list[PolicyRule]:
    """
    Extract and validate the `policies:` list from a repo config dict.

    Args:
        repo_config:  The parsed .github/docugardener.yml dict (may be empty).
        tenant_plan:  The tenant's billing plan — reserved for future plan-gating.

    Returns:
        List of valid PolicyRule objects. Empty list if none defined or on error.
    """
    raw = repo_config.get("policies")
    if not raw:
        return []

    if not isinstance(raw, list):
        logger.warning("DOCPOL-01: `policies` must be a list — ignoring")
        return []

    rules: list[PolicyRule] = []

    for idx, entry in enumerate(raw):
        if not isinstance(entry, dict):
            logger.warning("DOCPOL-01: policy entry %d is not a mapping — skipping", idx)
            continue

        name = entry.get("name")
        if not name or not isinstance(name, str):
            logger.warning("DOCPOL-01: policy entry %d missing `name` — skipping", idx)
            continue

        paths = entry.get("paths")
        if not paths or not isinstance(paths, list) or not all(isinstance(p, str) for p in paths):
            logger.warning("DOCPOL-01: rule %r missing valid `paths` list — skipping", name)
            continue

        require_docs = entry.get("require_docs")
        if (
            not require_docs
            or not isinstance(require_docs, list)
            or not all(isinstance(p, str) for p in require_docs)
        ):
            logger.warning("DOCPOL-01: rule %r missing valid `require_docs` list — skipping", name)
            continue

        enforcement = entry.get("enforcement", DEFAULT_ENFORCEMENT)
        if enforcement not in VALID_ENFORCEMENT_LEVELS:
            logger.warning(
                "DOCPOL-01: rule %r has unknown enforcement %r — defaulting to advisory",
                name,
                enforcement,
            )
            enforcement = DEFAULT_ENFORCEMENT

        rules.append(
            PolicyRule(
                name=name,
                paths=list(paths),
                require_docs=list(require_docs),
                enforcement=enforcement,
            )
        )

    logger.info("DOCPOL-01: parsed %d policy rule(s)", len(rules))
    return rules

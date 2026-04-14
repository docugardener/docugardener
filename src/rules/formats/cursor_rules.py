# SPDX-License-Identifier: AGPL-3.0-or-later
"""
AGV-01: Cursor rules renderer.

Produces .cursor/rules/docugardener.mdc — a Cursor rule file in MDC format
that Cursor reads for workspace-level AI coding instructions.

MDC format uses YAML frontmatter (description, globs, alwaysApply) followed
by a markdown body.  Format is intentionally stable plain text — no
templating libraries — so that changes to the rendered output are always
directly traceable to policy changes.
"""

from __future__ import annotations

from src.pipeline.policy_parser import PolicyRule


def _globs_from_rules(rules: list[PolicyRule]) -> list[str]:
    """Collect unique path globs across all rules (preserving order)."""
    seen: set[str] = set()
    result: list[str] = []
    for rule in rules:
        for p in rule.paths:
            if p not in seen:
                seen.add(p)
                result.append(p)
    return result


def _short_enforcement(enforcement: str) -> str:
    return {
        "blocking": "blocking",
        "blocking-with-reason": "blocking (reason required)",
        "advisory": "advisory",
    }.get(enforcement, enforcement)


def render_cursor_rules(rules: list[PolicyRule], generated_on: str = "") -> str:
    """
    Render a .cursor/rules/docugardener.mdc file from the given policy rules.

    Args:
        rules:        Validated PolicyRule list.
        generated_on: ISO date string for the generation timestamp.

    Returns:
        Complete MDC file content as a string.
    """
    # --- Frontmatter ---
    # globs must be a YAML sequence (Cursor 0.43+); alwaysApply still supported
    globs = _globs_from_rules(rules)
    if globs:
        globs_lines = ["globs:"] + [f"  - {g}" for g in globs]
    else:
        globs_lines = ["globs:"]  # empty = applies to all files

    lines: list[str] = [
        "---",
        "description: Documentation requirements enforced by DocuGardener",
        *globs_lines,
        "alwaysApply: true",
        "---",
        "",
        "# DocuGardener Documentation Rules",
        "",
        "> Auto-generated from DocuGardener policy. **Do not edit manually.**",
    ]
    if generated_on:
        lines.append(f"> Last generated: {generated_on}")
    lines.append("")

    if not rules:
        lines += [
            "No custom documentation policy rules are configured for this repository.",
            "DocuGardener will apply default drift detection on every PR.",
            "",
        ]
    else:
        lines.append(
            "When modifying code in this repository, follow these documentation rules:"
        )
        lines.append("")
        for rule in rules:
            paths_str = ", ".join(f"`{p}`" for p in rule.paths)
            docs_str = ", ".join(f"`{d}`" for d in rule.require_docs)
            enforcement_str = _short_enforcement(rule.enforcement)
            lines.append(
                f"- **{rule.name}**: files matching {paths_str} → "
                f"update {docs_str} ({enforcement_str})"
            )
        lines.append("")

    lines += [
        "DocuGardener validates these requirements in CI on every PR.",
        "",
    ]

    return "\n".join(lines)

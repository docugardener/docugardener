# SPDX-License-Identifier: AGPL-3.0-or-later
"""
RULES-01: GitHub Copilot instructions renderer.

Produces .github/copilot-instructions.md — the file GitHub Copilot reads
to inject repository-level context into its suggestions.

Format is intentionally compact: one bullet per rule.  Copilot's context
window is limited, so verbosity here reduces the space available for
code context.
"""

from __future__ import annotations

from src.pipeline.policy_parser import PolicyRule


def _paths_inline(paths: list[str]) -> str:
    return ", ".join(f"`{p}`" for p in paths)


def _docs_inline(require_docs: list[str]) -> str:
    return ", ".join(f"`{d}`" for d in require_docs)


def _short_enforcement(enforcement: str) -> str:
    return {
        "blocking":             "blocking",
        "blocking-with-reason": "blocking-with-reason",
        "advisory":             "advisory",
    }.get(enforcement, enforcement)


def render_copilot_instructions(rules: list[PolicyRule], generated_on: str = "") -> str:
    """
    Render .github/copilot-instructions.md from the given policy rules.

    Args:
        rules:        Validated PolicyRule list.
        generated_on: ISO date string for the generation timestamp header.

    Returns:
        Complete copilot-instructions.md file content as a string.
    """
    lines: list[str] = [
        "# Documentation Requirements (DocuGardener)",
        "",
        "> Auto-generated. **Do not edit manually.**",
    ]
    if generated_on:
        lines.append(f"> Last generated: {generated_on}")
    lines += [
        "",
        "When writing or modifying code, follow these documentation rules:",
        "",
    ]

    if not rules:
        lines += [
            "- No custom rules configured. "
              "DocuGardener will apply default drift detection on every PR.",
            "",
        ]
    else:
        for rule in rules:
            paths_str = _paths_inline(rule.paths)
            docs_str = _docs_inline(rule.require_docs)
            enforcement_str = _short_enforcement(rule.enforcement)
            lines.append(
                f"- Files matching {paths_str}: update {docs_str} "
                f"({enforcement_str})"
            )
        lines.append("")

    lines += [
        "DocuGardener validates these requirements in CI on every PR.",
        "",
    ]

    return "\n".join(lines)

# SPDX-License-Identifier: AGPL-3.0-or-later
"""
AGV-02: CLAUDE.md renderer.

Produces CLAUDE.md — the file Claude Code reads from the project root
for custom project-level instructions.

Format is plain markdown with no frontmatter.  Claude Code's context
window is generous, so the format can be moderately verbose (between
Copilot's compact bullets and AGENTS.md's full sections).
"""

from __future__ import annotations

from src.pipeline.policy_parser import PolicyRule


def _short_enforcement(enforcement: str) -> str:
    return {
        "blocking": "blocking — CI will fail",
        "blocking-with-reason": "blocking — dismiss reason required",
        "advisory": "advisory — CI will warn",
    }.get(enforcement, enforcement)


def render_claude_md(rules: list[PolicyRule], generated_on: str = "") -> str:
    """
    Render a CLAUDE.md file from the given policy rules.

    Args:
        rules:        Validated PolicyRule list.
        generated_on: ISO date string for the generation timestamp.

    Returns:
        Complete CLAUDE.md file content as a string.
    """
    lines: list[str] = [
        "# Documentation Rules (DocuGardener)",
        "",
        "> Auto-generated from DocuGardener policy. **Do not edit manually.**",
    ]
    if generated_on:
        lines.append(f"> Last generated: {generated_on}")
    lines += [
        "",
        "## Documentation Obligations",
        "",
    ]

    if not rules:
        lines += [
            "No custom documentation policy rules are configured for this repository.",
            "DocuGardener will apply default drift detection on every PR.",
            "",
        ]
    else:
        lines.append(
            "When modifying code in this repository, the following documentation "
            "requirements apply:"
        )
        lines.append("")
        for rule in rules:
            paths_str = ", ".join(f"`{p}`" for p in rule.paths)
            docs_str = ", ".join(f"`{d}`" for d in rule.require_docs)
            enforcement_str = _short_enforcement(rule.enforcement)
            lines += [
                f"### {rule.name}",
                "",
                f"- **Applies to:** {paths_str}",
                f"- **Required docs:** {docs_str}",
                f"- **Enforcement:** {enforcement_str}",
                "",
            ]

    lines += [
        "## Validation",
        "",
        "DocuGardener validates these requirements in CI on every PR.",
        "If a finding appears incorrect, use the feedback links in the PR comment",
        "to report a false positive.",
        "",
    ]

    return "\n".join(lines)

# SPDX-License-Identifier: AGPL-3.0-or-later
"""
RULES-01: AGENTS.md renderer.

Produces a verbose, agent-readable instruction file that most agent
frameworks (Claude Code, Gemini CLI, generic OpenAI-compatible agents)
pick up from the repository root.

Format is intentionally stable plain text — no templating libraries —
so that changes to the rendered output are always directly traceable to
policy changes.
"""

from __future__ import annotations

from src.pipeline.policy_parser import PolicyRule

_ENFORCEMENT_LABELS = {
    "blocking": "Blocking — CI will fail and block merge if this doc is not updated",
    "blocking-with-reason": "Blocking with reason required — CI will block merge; a dismiss reason must be provided",
    "advisory": "Advisory — CI will warn but will not block merge",
}


def _enforcement_label(enforcement: str) -> str:
    return _ENFORCEMENT_LABELS.get(enforcement, enforcement)


def _paths_display(paths: list[str]) -> str:
    # Join multiple path patterns with a separator for readability
    return ", ".join(f"`{p}`" for p in paths)


def _docs_display(require_docs: list[str]) -> str:
    return ", ".join(f"`{d}`" for d in require_docs)


def render_agents_md(rules: list[PolicyRule], generated_on: str = "") -> str:
    """
    Render a AGENTS.md instruction file from the given policy rules.

    Args:
        rules:        Validated PolicyRule list.
        generated_on: ISO date string for the generation timestamp header.

    Returns:
        Complete AGENTS.md file content as a string.
    """
    lines: list[str] = [
        "# DocuGardener Agent Rules",
        "",
        "> Auto-generated from DocuGardener policy. **Do not edit manually.**",
    ]
    if generated_on:
        lines.append(f"> Last generated: {generated_on}")
    lines += [
        "",
        "---",
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
            lines += [
                f"### Rule: `{rule.name}`",
                "",
                f"- **Applies to:** {_paths_display(rule.paths)}",
                f"- **Required documentation:** {_docs_display(rule.require_docs)}",
                f"- **Enforcement:** {_enforcement_label(rule.enforcement)}",
                "",
            ]

    lines += [
        "---",
        "",
        "## How to Check Before Opening a PR",
        "",
        "Use any of the following methods to validate documentation compliance before pushing:",
        "",
        "- **VS Code extension:** Install the DocuGardener extension and run a pre-push check.",
        "- **CLI (any agent):** Run `docugardener check <file>` from the terminal.",
        "- **DocuGardener CI:** A check run will be posted automatically on every PR.",
        "  If documentation is missing or outdated, the check run will fail.",
        "",
        "---",
        "",
        "## Agent Compatibility",
        "",
        "This file is read automatically by the following AI coding agents when they open this repository:",
        "",
        "- **Claude Code** (Anthropic) — reads `AGENTS.md` from project root",
        "- **OpenAI Codex / o3** — reads `AGENTS.md` from project root",
        "- **Gemini CLI** — reads `AGENTS.md` from project root",
        "- **Generic OpenAI-compatible agents** — any agent following the AGENTS.md convention",
        "",
        "For IDE-specific instructions see also: `.github/copilot-instructions.md` (Copilot),",
        "`CLAUDE.md` (Claude Code project file), `.cursor/rules/docugardener.mdc` (Cursor).",
        "",
        "---",
        "",
        "## Escalation",
        "",
        "If a CI finding appears to be incorrect, use the feedback links in the PR comment",
        "to report a false positive. Feedback is used to improve analysis accuracy over time.",
        "",
    ]

    return "\n".join(lines)

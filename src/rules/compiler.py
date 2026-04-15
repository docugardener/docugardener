# SPDX-License-Identifier: AGPL-3.0-or-later
"""
RULES-01 / AGV-01: Agent Rules Compiler.

Compiles DOCPOL-01 policy rules into agent-native instruction artifacts.
No LLM calls — pure deterministic text rendering.

Supported formats:
  - "agents_md"             → AGENTS.md
  - "copilot_instructions"  → .github/copilot-instructions.md
  - "cursor_rules"          → .cursor/rules/docugardener.mdc
  - "claude_md"             → CLAUDE.md
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date

from src.core.logging import get_logger
from src.pipeline.policy_parser import PolicyRule
from src.rules.formats.agents_md import render_agents_md
from src.rules.formats.claude_md import render_claude_md
from src.rules.formats.copilot import render_copilot_instructions
from src.rules.formats.cursor_rules import render_cursor_rules

logger = get_logger(__name__)

SUPPORTED_FORMATS = frozenset({"agents_md", "copilot_instructions", "cursor_rules", "claude_md"})

# Default output paths per format
DEFAULT_OUTPUT_PATHS: dict[str, str] = {
    "agents_md": "AGENTS.md",
    "copilot_instructions": ".github/copilot-instructions.md",
    "cursor_rules": ".cursor/rules/docugardener.mdc",
    "claude_md": "CLAUDE.md",
}


@dataclass
class CompileTarget:
    format: str  # "agents_md" | "copilot_instructions" | "cursor_rules" | "claude_md"
    output_path: str  # path in repo, e.g. "AGENTS.md"

    @classmethod
    def for_format(cls, fmt: str) -> CompileTarget:
        if fmt not in SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported format: {fmt!r}. Supported: {SUPPORTED_FORMATS}")
        return cls(format=fmt, output_path=DEFAULT_OUTPUT_PATHS[fmt])


@dataclass
class CompileResult:
    content: str
    content_hash: str  # SHA-256 hex digest
    target: CompileTarget


class RulesCompiler:
    """
    Stateless compiler: policy rules + target → rendered file content.

    Usage:
        compiler = RulesCompiler()
        result = compiler.compile(rules, CompileTarget.for_format("agents_md"))
    """

    def compile(
        self,
        rules: list[PolicyRule],
        target: CompileTarget,
        generated_on: date | None = None,
    ) -> CompileResult:
        """
        Render policy rules into an instruction artifact for the given target format.

        Args:
            rules:        Parsed PolicyRule list from policy_parser.parse_policies().
            target:       Output format + path descriptor.
            generated_on: Override date stamp (useful for deterministic tests).

        Returns:
            CompileResult with content string and its SHA-256 hash.
        """
        if target.format not in SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported format: {target.format!r}")

        stamp = (generated_on or date.today()).isoformat()

        if target.format == "agents_md":
            content = render_agents_md(rules, generated_on=stamp)
        elif target.format == "copilot_instructions":
            content = render_copilot_instructions(rules, generated_on=stamp)
        elif target.format == "cursor_rules":
            content = render_cursor_rules(rules, generated_on=stamp)
        elif target.format == "claude_md":
            content = render_claude_md(rules, generated_on=stamp)
        else:
            raise ValueError(f"Unsupported format: {target.format!r}")

        content_hash = hashlib.sha256(content.encode()).hexdigest()
        logger.info(
            "RULES-01: compiled artifact",
            format=target.format,
            rules_count=len(rules),
            hash=content_hash[:8],
        )
        return CompileResult(content=content, content_hash=content_hash, target=target)

    def compute_expected_hash(
        self,
        rules: list[PolicyRule],
        target: CompileTarget,
        generated_on: date | None = None,
    ) -> str:
        """Return the SHA-256 hash that compile() would produce, without storing the content."""
        return self.compile(rules, target, generated_on=generated_on).content_hash

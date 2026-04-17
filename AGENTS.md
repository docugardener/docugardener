# DocuGardener Agent Rules

> Auto-generated from DocuGardener policy. **Do not edit manually.**
> Last generated: 2026-04-17

---

## Documentation Obligations

No custom documentation policy rules are configured for this repository.
DocuGardener will apply default drift detection on every PR.

---

## How to Check Before Opening a PR

Use any of the following methods to validate documentation compliance before pushing:

- **VS Code extension:** Install the DocuGardener extension and run a pre-push check.
- **CLI (any agent):** Run `docugardener check <file>` from the terminal.
- **DocuGardener CI:** A check run will be posted automatically on every PR.
  If documentation is missing or outdated, the check run will fail.

---

## Agent Compatibility

This file is read automatically by the following AI coding agents when they open this repository:

- **Claude Code** (Anthropic) — reads `AGENTS.md` from project root
- **OpenAI Codex / o3** — reads `AGENTS.md` from project root
- **Gemini CLI** — reads `AGENTS.md` from project root
- **Generic OpenAI-compatible agents** — any agent following the AGENTS.md convention

For IDE-specific instructions see also: `.github/copilot-instructions.md` (Copilot),
`CLAUDE.md` (Claude Code project file), `.cursor/rules/docugardener.mdc` (Cursor).

---

## Escalation

If a CI finding appears to be incorrect, use the feedback links in the PR comment
to report a false positive. Feedback is used to improve analysis accuracy over time.

"""
BETA-19 — Agent Rules Compiler (4 Formats).

Calls the FastAPI /repos/{repo_id}/rules/preview endpoint with all 4 supported
formats and verifies:
  - All 4 items are returned (agents_md, copilot_instructions, cursor_rules, claude_md)
  - Each item has a non-empty output_path and content
  - Cursor rules format contains YAML frontmatter (description / globs / alwaysApply)
  - CLAUDE.md format has no YAML frontmatter header

No PR or GitHub commit required — this is a pure API test.
"""
from __future__ import annotations

import pytest
import requests

from tests.e2e.helpers import (
    API_BASE,
    REPO_ID,
    TENANT_ID,
    reset_timer,
    step,
)

_ALL_FORMATS = ["agents_md", "copilot_instructions", "cursor_rules", "claude_md"]

_EXPECTED_PATHS = {
    "agents_md":            "AGENTS.md",
    "copilot_instructions": ".github/copilot-instructions.md",
    "cursor_rules":         ".cursor/rules/docugardener.mdc",
    "claude_md":            "CLAUDE.md",
}


@pytest.mark.e2e
def test_beta19_agent_rules_all_formats():
    """Preview all 4 agent rule formats; verify content and format-specific structure."""
    reset_timer()

    step(1, f"Call POST {API_BASE}/repos/{REPO_ID[:8]}…/rules/preview for all 4 formats")
    resp = requests.post(
        f"{API_BASE}/repos/{REPO_ID}/rules/preview",
        json={"formats": _ALL_FORMATS},
        headers={"X-Tenant-ID": TENANT_ID},
        timeout=30,
    )
    print(f"         → status={resp.status_code}", flush=True)
    assert resp.status_code == 200, (
        f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
    )

    items = resp.json().get("items", [])
    print(f"         → {len(items)} format(s) returned", flush=True)

    step(2, "Verify all 4 formats are present")
    returned_formats = {item["format"] for item in items}
    for fmt in _ALL_FORMATS:
        assert fmt in returned_formats, f"Missing format: {fmt!r}"
    print(f"         → formats: {sorted(returned_formats)}", flush=True)

    step(3, "Verify each item has correct output_path and non-empty content")
    items_by_fmt = {item["format"]: item for item in items}
    for fmt, expected_path in _EXPECTED_PATHS.items():
        item = items_by_fmt[fmt]
        assert item["output_path"] == expected_path, (
            f"Format {fmt!r}: expected output_path={expected_path!r}, got {item['output_path']!r}"
        )
        assert item["content"], f"Format {fmt!r}: content is empty"
        print(f"         → {fmt:<25}  path={item['output_path']}", flush=True)

    step(4, "Verify Cursor rules has YAML frontmatter (description / alwaysApply)")
    cursor_content = items_by_fmt["cursor_rules"]["content"]
    assert cursor_content.startswith("---"), (
        f"cursor_rules must start with '---' YAML frontmatter, got: {cursor_content[:80]!r}"
    )
    assert "alwaysApply" in cursor_content, (
        "cursor_rules frontmatter missing 'alwaysApply' field"
    )
    print(f"         → cursor_rules frontmatter present ✓", flush=True)

    step(5, "Verify CLAUDE.md has NO YAML frontmatter")
    claude_content = items_by_fmt["claude_md"]["content"]
    assert not claude_content.startswith("---"), (
        f"claude_md must NOT have YAML frontmatter, but starts with '---'"
    )
    print(f"         → claude_md: no frontmatter ✓", flush=True)

    step("✅", "BETA-19 (Agent Rules Compiler — 4 Formats) PASSED")

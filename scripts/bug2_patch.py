#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""
BUG-2 patch script — apply Cache-Control / force-dynamic + SemanticDiffViewer
in-flight polling.

This script applies MINIMAL targeted changes to the two files that still need
patching. InboxPageClient.tsx was already rewritten by the agent.

Usage (from repo root):
  python3 scripts/bug2_patch.py             # apply
  python3 scripts/bug2_patch.py --dry-run   # preview
"""

import re
import sys
from pathlib import Path

BASE = Path(__file__).parent.parent
DRY_RUN = "--dry-run" in sys.argv


def read(rel: str) -> str:
    return (BASE / rel).read_text(encoding="utf-8")


def write_if_changed(rel: str, original: str, patched: str) -> bool:
    if patched == original:
        print(f"  SKIP  {rel} (no changes needed)")
        return False
    if DRY_RUN:
        # Show a compact diff
        orig_lines = original.splitlines()
        new_lines = patched.splitlines()
        print(f"  [DRY RUN] {rel} — {len(new_lines) - len(orig_lines):+d} lines")
        for i, (a, b) in enumerate(zip(orig_lines, new_lines)):
            if a != b:
                print(f"    line {i+1}: - {a!r}")
                print(f"           + {b!r}")
        return False
    (BASE / rel).write_text(patched, encoding="utf-8")
    print(f"  WROTE {rel}")
    return True


# ─── Patch A: web/app/api/inbox/route.ts ─────────────────────────────────────
# BUG-2 fix: add force-dynamic + Cache-Control headers

def patch_inbox_route() -> None:
    rel = "web/app/api/inbox/route.ts"
    src = read(rel)
    out = src

    # A1. Add force-dynamic export if not already present
    if "force-dynamic" not in out:
        # Insert before the first export function declaration
        m = re.search(r"^(export (?:async )?function )", out, re.MULTILINE)
        if m:
            comment_and_export = (
                "// BUG-2 FIX: prevent Next.js from caching this route handler\n"
                "export const dynamic = 'force-dynamic';\n\n"
            )
            out = out[: m.start()] + comment_and_export + out[m.start() :]
        else:
            # Fallback: insert after last import block
            lines = out.splitlines(keepends=True)
            last_import_idx = 0
            for idx, line in enumerate(lines):
                if re.match(r"^import ", line):
                    last_import_idx = idx
            insert_block = (
                "\n// BUG-2 FIX: prevent Next.js from caching this route handler\n"
                "export const dynamic = 'force-dynamic';\n"
            )
            lines.insert(last_import_idx + 1, insert_block)
            out = "".join(lines)

    # A2. Add Cache-Control to the primary success response
    if "Cache-Control" not in out:
        def add_cache_headers(m: re.Match) -> str:
            arg = m.group(1).strip()
            # Only patch success responses (not error objects)
            if re.match(r"\{\s*error", arg):
                return m.group(0)
            return (
                f"return NextResponse.json({arg}, {{\n"
                f"      headers: {{\n"
                f"        // BUG-2 FIX: prevent CDN/browser caching\n"
                f'        "Cache-Control": "no-store, no-cache, must-revalidate",\n'
                f'        Pragma: "no-cache",\n'
                f"      }},\n"
                f"    }});"
            )

        out = re.sub(r"return NextResponse\.json\(([^)]+)\);", add_cache_headers, out)

    write_if_changed(rel, src, out)


# ─── Patch B: web/components/inbox/SemanticDiffViewer.tsx ────────────────────
# BUG-2 fix: add 10s in-flight polling so detail panel auto-updates

def patch_semantic_viewer() -> None:
    rel = "web/components/inbox/SemanticDiffViewer.tsx"
    src = read(rel)
    out = src

    # Skip if already patched
    if any(kw in out for kw in ["itemIsInFlight", "IN_FLIGHT_JOB_STATUSES",
                                  "POLL_DETAIL", "detailPollId"]):
        print(f"  SKIP  {rel} (already has in-flight polling)")
        return

    # Also skip if onStatusChange already wired to a setInterval
    if "onStatusChange" in out and "setInterval" in out:
        print(f"  SKIP  {rel} (setInterval + onStatusChange already present)")
        return

    # Find injection point: just before the `return (` of the component body.
    # We use a regex that looks for the return at exactly 2-space indentation.
    return_match = re.search(r"\n  return \(", out)
    if return_match is None:
        print(f"  WARN  {rel}: could not find 'return (' — skipping in-flight poll")
        return

    poll_code = """
  // BUG-2 FIX: when the job is PROCESSING / ANALYZING / AUTO_FIXING, poll
  // the parent every 10 s. This keeps the detail panel's spinner and status
  // badge current without requiring a full page reload.
  const IN_FLIGHT_JOB_STATUSES = new Set(["PROCESSING", "PENDING"]);
  const IN_FLIGHT_TRIAGE_STATUSES = new Set(["ANALYZING", "AUTO_FIXING"]);
  const itemIsInFlight =
    IN_FLIGHT_JOB_STATUSES.has(item.status) ||
    (item.triageStatus != null &&
      IN_FLIGHT_TRIAGE_STATUSES.has(item.triageStatus));

  useEffect(() => {
    if (!itemIsInFlight || typeof onStatusChange !== "function") return;
    const detailPollId = setInterval(() => {
      void onStatusChange();
    }, 10_000);
    return () => clearInterval(detailPollId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIsInFlight, onStatusChange]);
"""

    inject_at = return_match.start()
    out = out[:inject_at] + poll_code + out[inject_at:]

    # Ensure useEffect is in the React import if it wasn't already used
    if "useEffect" not in src:
        # Try: import { ..., useState } from 'react'  →  import { ..., useState, useEffect }
        out, n = re.subn(
            r"(import \{)([^}]+)(\} from ['\"]react['\"])",
            lambda m: f"{m.group(1)}{m.group(2).rstrip()}, useEffect {m.group(3)}",
            out,
            count=1,
        )
        if n == 0:
            # Fallback: import React, { useCallback } pattern
            out, n2 = re.subn(
                r"(import React,\s*\{)([^}]+)(\})",
                lambda m: f"{m.group(1)}{m.group(2).rstrip()}, useEffect{m.group(3)}",
                out,
                count=1,
            )
            if n2 == 0:
                print(f"  WARN  {rel}: could not add useEffect to imports automatically")

    # Check onStatusChange is in props (just warn, don't auto-add)
    if "onStatusChange" not in src:
        print(
            f"  WARN  {rel}: 'onStatusChange' not in props — "
            "add `onStatusChange?: () => void | Promise<void>` to the props type"
        )

    write_if_changed(rel, src, out)


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("BUG-2 patch script")
    print("==================")
    print()

    print("A) web/app/api/inbox/route.ts")
    patch_inbox_route()

    print()
    print("B) web/components/inbox/SemanticDiffViewer.tsx")
    patch_semantic_viewer()

    print()
    print("Done. Next:")
    print("  cd web && npx tsc --noEmit")
    print("  cd web && npx vitest run --reporter=verbose 2>&1 | tail -30")

"""
B-Pack — Concurrent load test.

Creates N PRs in rapid succession (all with copilot/ prefix), then polls all
jobs concurrently until each reaches RESOLVED.  Records per-job timing and
prints a performance summary at the end.

Intent: verify engine correctness under real-world load and establish a
processing-time baseline for regression detection.

Configuration:
    E2E_BPACK_SIZE   Number of PRs to fire  (default: 5)

Rule: all N jobs must complete successfully within the wall-clock budget.
"""

from __future__ import annotations

import os
import time
import uuid as _uuid_mod
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any

import pytest

from tests.e2e.helpers import (
    close_pr,
    create_pr,
    is_pr_merged,
    reset_timer,
    set_merge_config,
    step,
    wait_for_triage_resolved,
)

BPACK_SIZE = int(os.getenv("E2E_BPACK_SIZE", "5"))

# Worker is single-process (sequential): each job takes ~90s (LLM + fix PR + merge).
# The Nth job only starts after N-1 jobs complete, so the last job finishes at
# roughly N × 90s.  Each polling thread must wait for this worst-case queue depth.
# Use a generous per-job poll timeout so threads don't expire before their job is done.
_JOB_RUNTIME_SECS = 90  # conservative per-job estimate
PER_JOB_TIMEOUT = BPACK_SIZE * _JOB_RUNTIME_SECS + 60  # covers tail-of-queue wait
TOTAL_TIMEOUT = PER_JOB_TIMEOUT + 120  # overall wall-clock budget


# ── Per-job result container ──────────────────────────────────────────────────


@dataclass
class _JobResult:
    pr_number: int
    branch: str
    tmp_dir: str
    created_at: float = 0.0
    resolved_at: float = 0.0
    job_data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None

    @property
    def elapsed(self) -> float:
        return (
            (self.resolved_at - self.created_at) if (self.resolved_at and self.created_at) else 0.0
        )


# ── Unique code snippet per PR slot ──────────────────────────────────────────


def _make_snippet(n: int, uid: str) -> str:
    """Each slot gets a standalone module — uid prevents doc-cache hits on re-runs.

    Writing to a *new* file per PR (src/batch_{n:02d}_{uid}.py) means each fix PR
    creates a *new* doc file and never conflicts with sibling fix PRs that are
    concurrently merging changes to the same docs file.
    """
    return f"""\
\"\"\"Batch payment processor for slot {n:02d} (e2e run {uid}).\"\"\"


def process_batch_payment_{n:02d}_{uid}(order_ids: list, unit_amount: float) -> dict:
    \"\"\"Process a batch of payment orders for slot {n:02d}.

    Iterates over the supplied order IDs, applies a {n}% batch discount to
    each, and returns an aggregated settlement record for the batch along
    with per-order breakdowns.

    Args:
        order_ids:    List of order identifier strings to process.
        unit_amount:  Base amount per order before discount (must be > 0).
    \"\"\"
    if unit_amount <= 0:
        raise ValueError("unit_amount must be positive")
    discount_pct = {n}
    results = []
    for oid in order_ids:
        discount = round(unit_amount * discount_pct / 100, 2)
        results.append({{"order_id": oid, "gross": unit_amount, "discount": discount,
                         "net": round(unit_amount - discount, 2)}})
    total_net = round(sum(r["net"] for r in results), 2)
    return {{"slot": {n}, "count": len(order_ids), "total_net": total_net, "orders": results}}
"""


# ── Thread worker: poll one job until RESOLVED ───────────────────────────────


def _poll_until_resolved(jr: _JobResult, db_url: str) -> _JobResult:
    from sqlalchemy import create_engine

    engine = create_engine(db_url)
    try:
        with engine.connect() as conn:
            try:
                jr.job_data = wait_for_triage_resolved(conn, jr.pr_number, timeout=PER_JOB_TIMEOUT)
                jr.resolved_at = time.time()
            except Exception as exc:
                jr.error = str(exc)
    finally:
        engine.dispose()
    return jr


# ── Test ──────────────────────────────────────────────────────────────────────


@pytest.mark.e2e
def test_bpack_load(db, db_engine):
    """Fire {N} copilot/ PRs, verify all resolve correctly, report per-job timing."""
    reset_timer()
    suite_start = time.time()
    results: list[_JobResult] = []

    try:
        # ── Step 1: Configure tenant ───────────────────────────────────────────
        step(1, f"Configure tenant — auto-merge: squash, waitForCI: False  [{BPACK_SIZE} PRs]")
        set_merge_config(db, method="squash", wait_for_ci=False, enabled=True)

        # ── Step 2: Create all PRs sequentially ───────────────────────────────
        step(2, f"Creating {BPACK_SIZE} PRs with copilot/ prefix...")
        for n in range(1, BPACK_SIZE + 1):
            uid = _uuid_mod.uuid4().hex[:6]
            # Each PR writes to its own new file so that the N concurrent fix PRs
            # each create a *different* doc file → zero merge conflicts between them.
            pr_number, branch, tmp_dir = create_pr(
                scenario=f"bp{n:02d}",
                code_snippet=_make_snippet(n, uid),
                pr_title=f"feat: add process_batch_payment_{n:02d}_{uid} endpoint",
                uid=uid,
                target_file=f"src/batch_{n:02d}_{uid}.py",
                append=False,
            )
            jr = _JobResult(
                pr_number=pr_number, branch=branch, tmp_dir=tmp_dir, created_at=time.time()
            )
            results.append(jr)
            print(f"         → [{n}/{BPACK_SIZE}] PR #{pr_number}  branch: {branch}", flush=True)
            time.sleep(1)  # brief pause — avoids overwhelming smee delivery queue

        # ── Step 3: Poll all jobs concurrently ────────────────────────────────
        step(3, f"Polling all {BPACK_SIZE} jobs concurrently (total budget: {TOTAL_TIMEOUT} s)...")
        # Use render_as_string to preserve password (str() masks it in SQLAlchemy 2.x)
        db_url = db_engine.url.render_as_string(hide_password=False)
        with ThreadPoolExecutor(max_workers=BPACK_SIZE) as pool:
            futures = {pool.submit(_poll_until_resolved, jr, db_url): jr for jr in results}
            for future in as_completed(futures, timeout=TOTAL_TIMEOUT):
                jr = future.result()
                icon = "✅" if not jr.error else "❌"
                print(
                    f"         {icon} PR #{jr.pr_number:>4}  "
                    f"elapsed={jr.elapsed:.1f}s  "
                    f"{'RESOLVED' if not jr.error else jr.error[:80]}",
                    flush=True,
                )

        # ── Step 4: Assert all resolved ───────────────────────────────────────
        step(4, "Asserting all jobs resolved, fix PRs created and auto-merged")
        failures = [jr for jr in results if jr.error]
        assert not failures, f"{len(failures)}/{BPACK_SIZE} jobs failed:\n" + "\n".join(
            f"  PR #{jr.pr_number}: {jr.error}" for jr in failures
        )

        for jr in results:
            res = jr.job_data.get("result") or {}
            assert jr.job_data.get("triageStatus") == "RESOLVED", (
                f"PR #{jr.pr_number}: triageStatus={jr.job_data.get('triageStatus')}"
            )
            assert res.get("autoMergeMethod") == "squash", (
                f"PR #{jr.pr_number}: autoMergeMethod={res.get('autoMergeMethod')}"
            )
            assert res.get("fixPrUrl"), f"PR #{jr.pr_number}: result.fixPrUrl is empty"

        # ── Step 5: Verify fix PRs on GitHub ──────────────────────────────────
        step(5, "Verifying fix PRs merged on GitHub")
        for jr in results:
            fix_url = (jr.job_data.get("result") or {}).get("fixPrUrl")
            assert is_pr_merged(fix_url), f"PR #{jr.pr_number}: fix PR {fix_url} not merged"

        # ── Step 6: Performance report ────────────────────────────────────────
        step(6, "Performance summary")
        times = sorted(jr.elapsed for jr in results if jr.elapsed)
        wall = time.time() - suite_start
        print(
            f"\n  ┌─ B-Pack Performance ({BPACK_SIZE} PRs) ─────────────────────────────\n"
            f"  │  min:  {min(times):.1f}s\n"
            f"  │  max:  {max(times):.1f}s\n"
            f"  │  avg:  {sum(times) / len(times):.1f}s\n"
            f"  │  total wall time: {wall:.1f}s\n"
            f"  └──────────────────────────────────────────────────────────────",
            flush=True,
        )

        step("✅", f"B-Pack ({BPACK_SIZE} PRs) PASSED")

    finally:
        for jr in results:
            close_pr(jr.pr_number, jr.branch, jr.tmp_dir)

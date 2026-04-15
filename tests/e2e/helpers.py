"""Shared helpers for e2e tests: GitHub operations, DB polling, config updates."""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import time
import uuid
from datetime import UTC
from typing import Any

import requests
from sqlalchemy import Connection, text

# ── Configuration ─────────────────────────────────────────────────────────────

TEST_REPO = os.getenv("E2E_TEST_REPO", "alexeykopachev/docugardener-test")
TENANT_ID = os.getenv("E2E_TENANT_ID", "cmmjpxq3x0005bul35iu3viuv")
REPO_ID = os.getenv("E2E_REPO_ID", "cmn68ihbe000bcm4yd55l2um7")
API_BASE = os.getenv("E2E_API_BASE", "http://localhost:8000")  # FastAPI backend
WEB_BASE = os.getenv("E2E_WEB_BASE", "http://localhost:3003")  # Next.js frontend

# ── Step logger ───────────────────────────────────────────────────────────────

_test_start: float = 0.0


def reset_timer() -> None:
    global _test_start
    _test_start = time.time()


def step(n: int | str, description: str) -> None:
    """Print a timestamped step banner — visible with pytest -s."""
    elapsed = time.time() - _test_start
    prefix = f"STEP {n}" if isinstance(n, int) else str(n)
    print(f"\n  [{elapsed:5.1f}s] ── {prefix}: {description}", flush=True)


# ── Shell helper ──────────────────────────────────────────────────────────────


def _run(
    cmd: list[str],
    cwd: str | None = None,
    check: bool = True,
    timeout: int = 60,
) -> subprocess.CompletedProcess:
    result = subprocess.run(
        cmd, cwd=cwd, check=False, capture_output=True, text=True, timeout=timeout
    )
    if check and result.returncode != 0:
        raise RuntimeError(
            f"Command failed: {' '.join(cmd)}\nstdout: {result.stdout}\nstderr: {result.stderr}"
        )
    return result


# ── GitHub: create test PR ────────────────────────────────────────────────────


def new_uid() -> str:
    """Return a 6-char hex uid for use in unique branch/function names."""
    return uuid.uuid4().hex[:6]


def create_pr(
    scenario: str,
    code_snippet: str,
    pr_title: str,
    uid: str | None = None,
    target_file: str = "src/payments.py",
    append: bool = True,
    branch_prefix: str = "copilot",
) -> tuple[int, str, str]:
    """Clone test repo, create a branch, commit a code change, open a PR.

    Branch name follows ``{branch_prefix}/e2e-{scenario}-{uid6}``.  Using
    ``branch_prefix="copilot"`` (the default) activates AI Author Mode so
    DocuGardener auto-creates a fix PR.  Use any other prefix (e.g.
    ``branch_prefix="e2e"``) for tests that need a human-triage workflow.

    Args:
        target_file:   Repo-relative path of the file to write the snippet into.
        append:        If True, append; if False, create a new file.
        branch_prefix: Branch name prefix before ``/e2e-``.

    Returns:
        (pr_number, branch_name, tmp_dir)

    The caller must call ``close_pr(pr_number, branch_name, tmp_dir)`` in cleanup.
    """
    if uid is None:
        uid = new_uid()
    branch = f"{branch_prefix}/e2e-{scenario}-{uid}"
    tmp_dir = f"/tmp/dg-e2e-{uid}"

    if os.path.exists(tmp_dir):
        shutil.rmtree(tmp_dir)

    _run(["gh", "repo", "clone", TEST_REPO, tmp_dir])
    _run(["git", "checkout", "-b", branch], cwd=tmp_dir)

    file_path = os.path.join(tmp_dir, target_file)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    mode = "a" if append else "w"
    with open(file_path, mode, encoding="utf-8") as fh:
        prefix = "\n\n" if append else ""
        fh.write(f"{prefix}{code_snippet}\n")

    _run(["git", "add", target_file], cwd=tmp_dir)
    _run(["git", "commit", "-m", f"feat({scenario}): add e2e test function {uid}"], cwd=tmp_dir)
    _run(["git", "push", "origin", branch], cwd=tmp_dir)

    # Retry PR creation — GitHub GraphQL endpoint occasionally returns 502/503
    _pr_cmd = [
        "gh",
        "pr",
        "create",
        "--repo",
        TEST_REPO,
        "--title",
        pr_title,
        "--body",
        f"Automated e2e test — scenario: {scenario}",
        "--head",
        branch,
        "--base",
        "main",
    ]
    for _attempt in range(3):
        result = _run(_pr_cmd, cwd=tmp_dir, check=False)
        if result.returncode == 0:
            break
        if _attempt < 2:
            print(
                f"         [create_pr] gh pr create failed (attempt {_attempt + 1}), retrying in 5s...",
                flush=True,
            )
            time.sleep(5)
    else:
        raise RuntimeError(
            f"gh pr create failed after 3 attempts:\n{result.stdout}\n{result.stderr}"
        )

    # gh outputs the PR URL as the last non-empty line
    pr_url = result.stdout.strip().splitlines()[-1]
    pr_number = int(pr_url.rstrip("/").split("/")[-1])
    return pr_number, branch, tmp_dir


# ── GitHub: repo file management (main branch) ───────────────────────────────


def push_main_file(path: str, content: str, message: str) -> str:
    """Create or update a file on the main branch of TEST_REPO via GitHub API.

    Returns the file's blob SHA (needed for later deletion).
    """
    encoded = base64.b64encode(content.encode()).decode()
    # Get current SHA if the file already exists (required for updates)
    r = _run(
        ["gh", "api", f"/repos/{TEST_REPO}/contents/{path}", "--jq", ".sha"],
        check=False,
    )
    current_sha = r.stdout.strip() if r.returncode == 0 else ""

    args = [
        "gh",
        "api",
        f"/repos/{TEST_REPO}/contents/{path}",
        "--method",
        "PUT",
        "-f",
        f"message={message}",
        "-f",
        f"content={encoded}",
        "-f",
        "branch=main",
    ]
    if current_sha:
        args += ["-f", f"sha={current_sha}"]

    result = _run(args + ["--jq", ".content.sha"])
    return result.stdout.strip()


def delete_main_file(path: str, message: str) -> None:
    """Delete a file from the main branch of TEST_REPO. Silent if not found."""
    r = _run(
        ["gh", "api", f"/repos/{TEST_REPO}/contents/{path}", "--jq", ".sha"],
        check=False,
    )
    if r.returncode != 0 or not r.stdout.strip():
        return  # file already gone
    sha = r.stdout.strip()
    _run(
        [
            "gh",
            "api",
            f"/repos/{TEST_REPO}/contents/{path}",
            "--method",
            "DELETE",
            "-f",
            f"message={message}",
            "-f",
            f"sha={sha}",
            "-f",
            "branch=main",
        ],
        check=False,
    )


# ── GitHub: PR state queries ──────────────────────────────────────────────────


def is_pr_merged(pr_url: str) -> bool:
    """Return True if the PR's state is MERGED on GitHub."""
    pr_num = int(pr_url.rstrip("/").split("/")[-1])
    r = _run(
        ["gh", "pr", "view", str(pr_num), "--repo", TEST_REPO, "--json", "state", "-q", ".state"],
        check=False,
    )
    return r.stdout.strip() == "MERGED"


def get_pr_body(pr_url: str) -> str:
    pr_num = int(pr_url.rstrip("/").split("/")[-1])
    r = _run(
        ["gh", "pr", "view", str(pr_num), "--repo", TEST_REPO, "--json", "body", "-q", ".body"]
    )
    return r.stdout.strip()


def get_pr_check_conclusion(pr_number: int) -> str | None:
    """Return the DocuGardener check run conclusion for a PR, or None if not found."""
    r = _run(
        [
            "gh",
            "api",
            f"/repos/{TEST_REPO}/commits",
            "--jq",
            ".[0].sha",
        ],  # placeholder — get head SHA via PR
        check=False,
    )
    # Use gh pr view to get headRefOid
    r2 = _run(
        [
            "gh",
            "pr",
            "view",
            str(pr_number),
            "--repo",
            TEST_REPO,
            "--json",
            "headRefOid",
            "-q",
            ".headRefOid",
        ],
        check=False,
    )
    sha = r2.stdout.strip()
    if not sha:
        return None
    r3 = _run(
        [
            "gh",
            "api",
            f"/repos/{TEST_REPO}/commits/{sha}/check-runs",
            "--jq",
            '.check_runs[] | select(.app.slug | startswith("docugardener")) | .conclusion',
        ],
        check=False,
    )
    conclusion = r3.stdout.strip().strip('"')
    return conclusion or None


def wait_for_check_run(pr_number: int, timeout: int = 180) -> str | None:
    """Poll until DocuGardener check run has a conclusion. Returns conclusion string."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        c = get_pr_check_conclusion(pr_number)
        if c:
            return c
        time.sleep(5)
    return None


# ── GitHub: Issues ────────────────────────────────────────────────────────────


def get_open_issues_for_pr(pr_number: int) -> list[dict]:
    """Return open GitHub issues mentioning PR #{pr_number} in title."""
    r = _run(
        [
            "gh",
            "issue",
            "list",
            "--repo",
            TEST_REPO,
            "--state",
            "open",
            "--json",
            "number,title,state",
        ],
        check=False,
    )
    if r.returncode != 0:
        return []
    issues = json.loads(r.stdout or "[]")
    return [i for i in issues if f"PR #{pr_number}" in i.get("title", "")]


def get_issue_state(issue_number: int) -> str:
    """Return 'open' or 'closed' for a GitHub issue."""
    r = _run(
        [
            "gh",
            "issue",
            "view",
            str(issue_number),
            "--repo",
            TEST_REPO,
            "--json",
            "state",
            "-q",
            ".state",
        ],
        check=False,
    )
    return r.stdout.strip().lower()


def close_github_issue(issue_number: int) -> None:
    """Close a GitHub issue (cleanup)."""
    _run(
        ["gh", "issue", "close", str(issue_number), "--repo", TEST_REPO],
        check=False,
    )


# ── FastAPI backend helpers ───────────────────────────────────────────────────


def dismiss_job(job_id: str, reason: str) -> None:
    """Call FastAPI PATCH /inbox/{job_id} to dismiss (IGNORED) with a reason.

    X-Tenant-ID is required by TenantContextMiddleware (SEC-07).
    """
    resp = requests.patch(
        f"{API_BASE}/inbox/{job_id}",
        params={"status": "IGNORED", "dismiss_reason": reason},
        headers={"X-Tenant-ID": TENANT_ID},
        timeout=15,
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"dismiss_job failed: {resp.status_code} {resp.text}")


# ── DB: job polling ───────────────────────────────────────────────────────────

_JOB_SELECT = (
    'SELECT id, status, "triageStatus", "aiAuthored", result, "createdAt" '
    'FROM "Job" WHERE "prNumber" = :pr ORDER BY "createdAt" DESC LIMIT 1'
)
# Note: fixPrUrl is in result["fixPrUrl"] (written by handler.py line 638).
# The Prisma column job.fixPrUrl is NOT in the SQLAlchemy model, so that assignment
# is silently dropped — always read from result JSON instead.


def _fetch_job(conn: Connection, pr_number: int) -> dict[str, Any] | None:
    row = conn.execute(text(_JOB_SELECT), {"pr": pr_number}).fetchone()
    return dict(row._mapping) if row else None


def wait_for_job_completed(conn: Connection, pr_number: int, timeout: int = 180) -> dict[str, Any]:
    """Poll until job.status in (COMPLETED, FAILED).  Raises TimeoutError on expiry."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = _fetch_job(conn, pr_number)
        if job and job["status"] in ("COMPLETED", "FAILED"):
            return job
        time.sleep(3)
    job = _fetch_job(conn, pr_number)
    raise TimeoutError(
        f"Job for PR #{pr_number} not COMPLETED within {timeout}s. "
        f"Current: {job['status'] if job else 'not found'}"
    )


def wait_for_triage_resolved(
    conn: Connection, pr_number: int, timeout: int = 180
) -> dict[str, Any]:
    """Poll until job triageStatus=RESOLVED AND the worker's EPIC-05 commit has landed.

    The fix-PR-merged webhook can set triageStatus=RESOLVED before the worker stores
    autoMergeMethod/autoMergeSkipReason (because job_manager.complete_job is called
    before the auto-merge section runs in handler.py).  We wait for either field to
    appear, which confirms the worker's final EPIC-05 db.commit() has completed.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = _fetch_job(conn, pr_number)
        if job and job["triageStatus"] == "RESOLVED":
            result = job.get("result") or {}
            if result.get("autoMergeMethod") or result.get("autoMergeSkipReason"):
                return job
            # RESOLVED but EPIC-05 fields not yet committed — worker still writing
            time.sleep(2)
            continue
        time.sleep(3)
    job = _fetch_job(conn, pr_number)
    raise TimeoutError(
        f"Job for PR #{pr_number} not RESOLVED (with EPIC-05 fields) within {timeout}s. "
        f"State: {json.dumps({k: str(v) for k, v in (job or {}).items()}, indent=2)}"
    )


def wait_for_triage_ignored(conn: Connection, pr_number: int, timeout: int = 60) -> dict[str, Any]:
    """Poll until job triageStatus=IGNORED (dismiss completed)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = _fetch_job(conn, pr_number)
        if job and job["triageStatus"] == "IGNORED":
            return job
        time.sleep(3)
    job = _fetch_job(conn, pr_number)
    raise TimeoutError(
        f"Job for PR #{pr_number} not IGNORED within {timeout}s. "
        f"Current triageStatus: {job.get('triageStatus') if job else 'not found'}"
    )


def get_job(conn: Connection, pr_number: int) -> dict[str, Any] | None:
    return _fetch_job(conn, pr_number)


# ── DB: tenant config ─────────────────────────────────────────────────────────


def set_merge_config(
    conn: Connection,
    method: str,
    wait_for_ci: bool = False,
    enabled: bool = True,
) -> None:
    """Merge-patch the tenant's workflowConfig with auto-merge settings."""
    patch = json.dumps(
        {
            "autoMergeEnabled": enabled,
            "autoMergeMethod": method,  # key used by handler.py
            "waitForCI": wait_for_ci,
        }
    )
    conn.execute(
        text(
            'UPDATE "Tenant" SET "workflowConfig" = "workflowConfig" || CAST(:p AS jsonb) WHERE id = :tid'
        ),
        {"p": patch, "tid": TENANT_ID},
    )
    conn.commit()


def patch_workflow_config(conn: Connection, patch: dict) -> None:
    """Generic JSONB merge-patch on workflowConfig for any key."""
    conn.execute(
        text(
            'UPDATE "Tenant" SET "workflowConfig" = "workflowConfig" || CAST(:p AS jsonb) WHERE id = :tid'
        ),
        {"p": json.dumps(patch), "tid": TENANT_ID},
    )
    conn.commit()


def get_tenant_plan(conn: Connection) -> str:
    """Return the current tenant plan string."""
    row = conn.execute(
        text('SELECT plan FROM "Tenant" WHERE id = :tid'),
        {"tid": TENANT_ID},
    ).fetchone()
    return row[0] if row else "FREE"


def set_tenant_plan(conn: Connection, plan: str) -> None:
    """Directly set the tenant plan (e.g. 'FREE', 'PRO', 'TEAM')."""
    conn.execute(
        text('UPDATE "Tenant" SET plan = :plan WHERE id = :tid'),
        {"plan": plan, "tid": TENANT_ID},
    )
    conn.commit()


# ── DB: quota helpers ─────────────────────────────────────────────────────────


def insert_fake_completed_jobs(conn: Connection, count: int) -> list[str]:
    """Insert fake COMPLETED Job rows for this month to simulate quota exhaustion.

    Returns the list of inserted job IDs for later cleanup.
    """
    import uuid as _uuid
    from datetime import datetime

    ids = []
    now = datetime.now(UTC)
    for _ in range(count):
        job_id = f"e2e-fake-{_uuid.uuid4().hex[:20]}"
        conn.execute(
            text(
                'INSERT INTO "Job" (id, "tenantId", "repositoryId", status, "triageStatus", "prNumber", "createdAt", "updatedAt") '
                "VALUES (:id, :tid, :rid, 'COMPLETED', 'IGNORED', -1, :now, :now)"
            ),
            {"id": job_id, "tid": TENANT_ID, "rid": REPO_ID, "now": now},
        )
        ids.append(job_id)
    conn.commit()
    return ids


def delete_fake_jobs(conn: Connection, job_ids: list[str]) -> None:
    """Remove previously inserted fake job rows."""
    if not job_ids:
        return
    for jid in job_ids:
        conn.execute(text('DELETE FROM "Job" WHERE id = :id'), {"id": jid})
    conn.commit()


# ── Cleanup ───────────────────────────────────────────────────────────────────


def close_pr(pr_number: int, branch: str, tmp_dir: str | None = None) -> None:
    """Close the original PR (if still open) and delete its branch."""
    _run(
        ["gh", "pr", "close", str(pr_number), "--repo", TEST_REPO, "--delete-branch"],
        check=False,
    )
    # Belt-and-braces: also delete branch via API in case it wasn't merged
    _run(
        ["gh", "api", f"/repos/{TEST_REPO}/git/refs/heads/{branch}", "-X", "DELETE"],
        check=False,
    )
    if tmp_dir and os.path.exists(tmp_dir):
        shutil.rmtree(tmp_dir, ignore_errors=True)

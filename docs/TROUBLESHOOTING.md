# DocuGardener Troubleshooting Guide

> **Session Log**: Issues encountered during initial development phase.

This document serves as a reference for developers to avoid repeating known issues. Each entry follows a consistent **Problem - Root Cause - Fix** format.

---

## Table of Contents

1. [Infrastructure and Operations](#1-infrastructure-and-operations)
   - [RQ Job Timeout](#11-rq-job-timeout-default-120s)
   - [FastAPI Picks Up Wrong Uvicorn Process](#12-fastapi-picks-up-wrong-uvicorn-process)
   - [Smee Webhook Proxy Not Running](#13-smee-webhook-proxy-not-running)
   - [Docker Services Down After Restart](#14-docker-services-redispostgresweaviate-down-after-restart)
   - [GitHub App Missing Permissions](#15-github-app-missing-contents-write-permission)
2. [Code Bugs](#2-code-bugs)
   - [fail_job() Destroyed Existing Analysis Data](#21-fail_job-destroyed-existing-analysis-data)
   - [Documentation Generation Gated by Drift Score Threshold](#22-documentation-generation-gated-by-drift-score-threshold)
   - [Shallow Git Clone Couldnt Resolve PR HEAD SHA](#23-shallow-git-clone-couldnt-resolve-pr-head-sha)
   - [DocuGardener Analyzed Its Own Fix PRs](#24-docugardener-analyzed-its-own-fix-prs-infinite-loop)
   - [check_run_id Not Persisted](#25-check_run_id-not-persisted--ignore-couldnt-update-github-check-run)
   - [Absolute Docker Paths Leaked into Analysis Result](#26-absolute-docker-paths-leaked-into-analysis-result)
   - [DriftAnalysis Schema Mismatch (v1.0 vs v2.1)](#27-driftanalysis-schema-mismatch-v10-vs-v21)
3. [Workflow and State Machine](#3-workflow-and-state-machine)
   - [No Terminal RESOLVED State](#31-design-gap-no-terminal-resolved-state)
   - [Ignore Had Wrong Semantics](#32-design-gap-ignore-had-wrong-semantics)
   - [Significant Severity Was Non-Blocking](#33-design-gap-significant-severity-was-non-blocking-neutral)
   - [Color Coding in DriftAlertList Was Inverted](#34-design-gap-color-coding-in-driftalertlist-was-inverted)
4. [Local Development Checklist](#4-local-development-checklist)

---

## 1. Infrastructure and Operations

### 1.1 RQ Job Timeout (Default 120s)

| Attribute | Details |
|-----------|---------|
| **Symptom** | Worker silently drops jobs after 120 seconds; job stays in `PROCESSING` status indefinitely |
| **Root Cause** | RQ default `job_timeout=180` (or similar default). Multi-retry LLM verification on complex PRs takes 2-3 minutes, exceeding this limit. |
| **Affected Component** | `src/worker/queue.py`, `src/worker/jobs.py` |

**Fix:**

1. Set the environment variable in `.env`:

   ```bash
   MAX_PROCESSING_TIME=600
   ```

2. Pass the timeout explicitly when enqueuing jobs:

   ```python
   queue.enqueue(
       process_pr_job,
       job_id,
       job_timeout=settings.max_processing_time
   )
   ```

3. Start FastAPI with the environment variable set:

   ```bash
   MAX_PROCESSING_TIME=600 nohup .venv/bin/python -m uvicorn src.main:app \
       --host 0.0.0.0 --port 8000 --reload > uvicorn.log 2>&1 &
   ```

**Verification:**

- Check worker logs for timeout errors
- Monitor job status transitions in the database

---

### 1.2 FastAPI Picks Up Wrong Uvicorn Process

| Attribute | Details |
|-----------|---------|
| **Symptom** | Code changes not reflected after restart; `Address already in use` errors on port 8000 |
| **Root Cause** | Multiple uvicorn processes on port 8000; old process (started with system Python at `/opt/homebrew/...`) survives `pkill -f uvicorn src.api.main` |
| **Affected Component** | Local development environment |

**Fix:**

1. Kill ALL uvicorn processes properly:

   ```bash
   pkill -f "uvicorn src"
   ```

2. Verify no stray processes remain:

   ```bash
   ps aux | grep uvicorn
   ```

3. Start a new instance with the correct command:

   ```bash
   MAX_PROCESSING_TIME=600 nohup .venv/bin/python -m uvicorn src.main:app \
       --host 0.0.0.0 --port 8000 --reload > uvicorn.log 2>&1 &
   ```

**Important Notes:**

- The module path is `src.main:app` (NOT `src.api.main:app`)
- Entry point is `src/main.py` which imports from `src/api/`
- Always use the virtualenv Python (`.venv/bin/python`), not system Python

---

### 1.3 Smee Webhook Proxy Not Running

| Attribute | Details |
|-----------|---------|
| **Symptom** | GitHub webhooks not received; no entries in `uvicorn.log` for `/webhooks/github` endpoint |
| **Root Cause** | Smee process not started after machine restart |
| **Affected Component** | Webhook delivery pipeline |

**Fix:**

Start the smee client:

```bash
smee --url https://smee.io/ZmzXvcX2jMSluM0X --target http://localhost:8000/webhooks/github
```

**Verification:**

- Check smee output for `Connected` message
- Look for incoming webhook events in smee terminal
- Verify entries appear in `uvicorn.log` when PRs are opened/updated

---

### 1.4 Docker Services (Redis/Postgres/Weaviate) Down After Restart

| Attribute | Details |
|-----------|---------|
| **Symptom** | Worker fails immediately; DB connection refused; Weaviate errors |
| **Root Cause** | Colima (Docker runtime) stopped; containers not running |
| **Affected Component** | All backend services |

**Fix Sequence:**

1. Start Colima:

   ```bash
   colima start
   ```

2. Start Docker services:

   ```bash
   cd docker && docker-compose up -d postgres redis weaviate
   ```

3. Verify containers are running:

   ```bash
   docker ps
   ```

**Expected Output:**

```
CONTAINER ID   IMAGE              STATUS   PORTS
xxxx           postgres:15        Up       0.0.0.0:5432->5432/tcp
xxxx           redis:7            Up       0.0.0.0:6379->6379/tcp
xxxx           semitechnologies/weaviate  Up  0.0.0.0:8080->8080/tcp
```

---

### 1.5 GitHub App Missing `contents: write` Permission

| Attribute | Details |
|-----------|---------|
| **Symptom** | `git push` returns HTTP 403; `committer.apply_and_push` returns `None`; job fails with "Git committer failed" |
| **Root Cause** | GitHub App was created with `contents: read` only |
| **Affected Component** | `src/github/committer.py` |

**Fix:**

1. Navigate to GitHub App settings:

   ```
   https://github.com/settings/apps/{app-name}
   ```

2. Go to **Permissions & Events** section

3. Change **Repository permissions > Contents** from "Read" to **"Read & write"**

4. Save changes

5. Approve the permission change at the installation level:

   ```
   https://github.com/settings/installations/{installation-id}
   ```

**Verification:**

Check App permissions via GitHub API using App JWT authentication:

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     https://api.github.com/app/installations/{installation-id}
```

---

### 1.6 Persistent Environment Reset (Clean Slate)

| Attribute | Details |
|-----------|---------|
| **Symptom** | Need to test onboarding from scratch; stale data interfering with new setup |
| **Danger Level** | **HIGH (DESTRUCTIVE)** — Deletes all jobs, repos, and tenant data |
| **Affected Component** | PostgreSQL DB, local development state |

**Fix (Terminal):**

Run this command to clear existing data and reset the primary user's tenant association:

```bash
export PYTHONPATH=$PYTHONPATH:.
.venv/bin/python3 -c "from src.pipeline.job_manager import SessionLocal; from src.storage.sql_models import Tenant, Repository, Job, User; db = SessionLocal(); db.query(Job).delete(); db.query(Repository).delete(); db.query(User).update({User.tenantId: None}); db.query(Tenant).delete(); db.commit(); print('Environment Reset Successful')"
```

**Verification:**

Confirm data is wiped:

```bash
.venv/bin/python3 -c "from src.pipeline.job_manager import SessionLocal; from src.storage.sql_models import Tenant; db = SessionLocal(); t = db.query(Tenant).first(); print(f'Tenants remaining: {1 if t else 0}')"
```

---

## 2. Code Bugs

### 2.1 `fail_job()` Destroyed Existing Analysis Data

| Attribute | Details |
|-----------|---------|
| **File** | `src/pipeline/job_manager.py` |
| **Symptom** | After any failed fix-PR attempt, clicking "Accept Changes" again shows "No documentation updates found to apply" even though analysis was successful |
| **Root Cause** | `fail_job(job_id, error)` called `update_status(job_id, JobStatus.FAILED, {"error": error})` which REPLACED the entire `job.result` dict with `{"error": "..."}`, destroying the drift analysis and documentation updates |

**Before (Broken):**

```python
def fail_job(job_id: str, error: str):
    update_status(job_id, JobStatus.FAILED, {"error": error})  # OVERWRITES result!
```

**After (Fixed):**

```python
def fail_job(job_id: str, error: str):
    """Mark job as failed while PRESERVING existing result data."""
    with get_session() as session:
        job = session.query(Job).filter(Job.id == job_id).first()

        # READ existing result first, then MERGE the error key
        existing_result = dict(job.result) if job and isinstance(job.result, dict) else {}
        existing_result["error"] = error

        update_data = {
            "status": JobStatus.FAILED,
            "completedAt": datetime.utcnow(),
            "result": existing_result
        }
        # ... apply update
```

**Impact:**

- Any job that failed during fix-PR creation (e.g., git push error) was permanently broken
- Users had to close and reopen the original PR to re-trigger analysis

---

### 2.2 Documentation Generation Gated by Drift Score Threshold

| Attribute | Details |
|-----------|---------|
| **File** | `src/pipeline/analyzer.py` |
| **Symptom** | PRs with `drift_score < 70` (the `DRIFT_SCORE_THRESHOLD`) never generated documentation updates; "Accept Changes" would always fail with "No documentation updates found" |
| **Root Cause** | The condition `if result.drift_analysis.drift_score >= settings.drift_score_threshold:` was used to gate BOTH PR blocking AND documentation generation. These are independent concerns. |

**Before (Broken):**

```python
# ~line 290 (webhook path) and ~line 427 (CLI path)
if result.drift_analysis.drift_score >= settings.drift_score_threshold:
    # Generate documentation updates
    doc_updates = generate_documentation_updates(...)
```

**After (Fixed):**

```python
if meaningful_changes:
    # Documentation is generated whenever semantic drift is detected,
    # regardless of the numeric score threshold.
    # The threshold is only for BLOCKING PRs, not for generating docs.
    doc_updates = generate_documentation_updates(...)
```

**Important:**

- This bug affected TWO locations in `analyzer.py`:
  - Webhook/bot path (~line 290)
  - Local CLI path (~line 427)
- Both locations needed the same fix

---

### 2.3 Shallow Git Clone Couldnt Resolve PR HEAD SHA

| Attribute | Details |
|-----------|---------|
| **File** | `src/github/committer.py` |
| **Symptom** | `git checkout {sha}` fails with `fatal: unable to read tree {sha}` or `reference is not a tree` |
| **Root Cause** | `git.Repo.clone_from(url, tmp_dir, depth=50)` without `no_single_branch=True` only clones the default branch. PRs on feature branches have HEAD SHAs that are unreachable from the default branch clone. |

**Before (Broken):**

```python
repo = git.Repo.clone_from(self.repo_url, tmp_dir, depth=50)
# PR HEAD SHA is not reachable!
repo.git.checkout(pr_head_sha)  # FAILS
```

**After (Fixed):**

```python
repo = git.Repo.clone_from(
    self.repo_url,
    tmp_dir,
    depth=50,
    no_single_branch=True  # Clone all remote branches
)
repo.git.checkout(pr_head_sha)  # Works
```

---

### 2.4 DocuGardener Analyzed Its Own Fix PRs (Infinite Loop)

| Attribute | Details |
|-----------|---------|
| **File** | `src/api/webhooks.py` |
| **Symptom** | After fix PR created (branch `docugardener-fix-105-94801d`), a new inbox alert appeared for that PR; clicking Accept would create another fix PR, creating an infinite loop |
| **Root Cause** | No filter on PR authorship or branch name in webhook handler |

**Fix:**

Added loop prevention check after the action filter:

```python
@router.post("/webhooks/github")
async def github_webhook(request: Request):
    payload = await request.json()
    action = payload.get("action")
    pull_request = payload.get("pull_request", {})

    # ... existing action filter ...

    # LOOP PREVENTION: Skip our own fix PRs
    head_ref: str = pull_request.get("head", {}).get("ref", "")
    if head_ref.startswith("docugardener-fix-"):
        return {
            "status": "skipped",
            "reason": "DocuGardener fix PR - not analyzed to prevent loop"
        }

    # ... continue processing ...
```

---

### 2.5 `check_run_id` Not Persisted - Ignore Couldnt Update GitHub Check Run

| Attribute | Details |
|-----------|---------|
| **File** | `src/pipeline/handler.py` |
| **Symptom** | Clicking "No Update Required" dismissed the inbox alert but the GitHub Check Run stayed yellow/blocking |
| **Root Cause** | `check_run_id` was fetched at job start but never saved to `job.result`; when Ignore was clicked later there was no way to find the check run to update it |

**Fix:**

Added `check_run_id` and `installation_id` to `result_payload` at job completion:

```python
# In handler.py, after creating/fetching check_run_id
result_payload = {
    "drift_analysis": drift_result.dict(),
    "documentation_updates": doc_updates,
    "pr_number": pr_number,
    "repo_full_name": repo_full_name,
    # NEW: Persist these for later use by ignore_drift_job
    "check_run_id": check_run_id,
    "installation_id": installation_id,
}
```

**Note:**

- Jobs created before this fix will have `check_run_id=None` in their result
- `ignore_drift_job` handles this gracefully (logs warning, no crash)

---

### 2.6 Absolute Docker Paths Leaked into Analysis Result

| Attribute | Details |
|-----------|---------|
| **File** | `src/pipeline/analyzer.py` |
| **Symptom** | `LiveCodeBlock` in Inbox shows 500 error; Slack alerts show file paths starting with `/tmp/docugardener...` |
| **Root Cause** | `CodeParser.parse_file(file_path)` was called with an absolute `Path` from the ephemeral Docker container. `CodeEntity` then stored this absolute path in its `file_path` attribute, which was saved to the DB. |

**Before (Broken):**

```python
# analyzer.py
file_path = repo_path / file_change.path
new_entities = self.parser.parse_file(file_path) # Absolute!
```

**After (Fixed):**

```python
# analyzer.py
content = file_path.read_text(encoding="utf-8")
new_entities = self.parser.parse_content(
    content=content,
    file_path=file_change.path, # Relative path!
    language=self.parser.detect_language(file_change.path)
)
```

**Verification:**

- View `Job` results in database
- Ensure `file_path` is a clean relative path (e.g., `src/utils.py`)

---

### 2.7 DriftAnalysis Schema Mismatch (v1.0 vs v2.1)

| Attribute | Details |
|-----------|---------|
| **File** | `web/components/inbox/SemanticDiffViewer.tsx` |
| **Symptom** | Inbox shows "No semantic drift items detected" even when alerts exist; frontend crashes when accessing `drift_analysis.items` |
| **Root Cause** | Backend updated the `DriftAnalysis` schema from using an `items` array to a `reasons` array (v2.1). The React frontend was hardcoded to look for `items`. |

**Fix:**

Implemented an inclusive fallback mechanism in the frontend:

```typescript
// SemanticDiffViewer.tsx
const driftItems = alert.result?.drift_analysis?.items || 
                   alert.result?.drift_analysis?.reasons || [];
```

Also updated the detail mapping to correctly resolve `itemFilePath` from the new schema's nested objects.

---

### 2.8 Missing `datetime` Import in `process_fix_pr()` (Silent Auto-Merge Failure)

| Attribute | Details |
|-----------|---------|
| **File** | `src/pipeline/handler.py` — `process_fix_pr()` |
| **Discovered** | 2026-02-22 — caught by TEST-01 unit tests (`test_auto_pr_epic05.py`) |
| **Symptom** | Auto-merge path silently failed: `committer.auto_merge_pr()` was never called, fix PR triageStatus was never set to RESOLVED, and `post_pr_comment()` was never invoked. No exception surfaced to the caller. |
| **Root Cause** | `process_fix_pr()` used `datetime.utcnow()` at two points inside its body but never imported `datetime`. The resulting `NameError` was swallowed by the outer `except Exception` block which called `job_manager.fail_job()` and returned early — before the auto-merge logic was reached. Tests for the `auto_merge=False` path passed (because they asserted that things were NOT called, and the exception made that true), masking the bug. |

**Fix:**

Added `from datetime import datetime` to the lazy imports block at the top of `process_fix_pr()`:

```python
async def process_fix_pr(job_id: str, auto_merge: bool = False) -> None:
    from datetime import datetime          # ← added
    from src.pipeline.job_manager import get_db, JobStatus
    from src.storage.sql_models import Job, Tenant
    ...
```

**Lesson:** When an `except Exception` block calls a cleanup function and swallows the error, failing tests that assert positive outcomes (mock was called) are the only reliable signal. Tests that assert negative outcomes (mock was NOT called) will pass spuriously.

---

## 3. Workflow and State Machine

### 3.1 Design Gap: No Terminal RESOLVED State

| Attribute | Details |
|-----------|---------|
| **Problem** | After fix PR was merged on GitHub, the original inbox alert had no way to become `RESOLVED` automatically |

**Fix:**

1. Added webhook handler for `pull_request` events where:
   - Action is `closed`
   - `merged=true`
   - Branch matches pattern `docugardener-fix-{N}-*`

2. Handler logic:
   - Extract original PR number from branch name
   - Find the associated job
   - Set `triageStatus = RESOLVED`

3. Schema changes required:
   - Added `RESOLVED` to `TriageStatus` Python enum (`src/storage/sql_models.py`)
   - Updated Prisma schema
   - Ran `prisma db push` to apply migration

---

### 3.2 Design Gap: "Ignore" Had Wrong Semantics

| Attribute | Details |
|-----------|---------|
| **Problem** | The label "Ignore Drift" implied the user was ignoring the drift (leaving PR blocked) when in fact it cleared the Check Run to neutral (unblocked the PR) |
| **File** | `web/src/components/SemanticDiffViewer.tsx` |

**Fix:**

Renamed button from "Ignore Drift" to **"No Update Required"** to accurately reflect the action being taken.

---

### 3.3 Design Gap: `significant` Severity Was Non-Blocking (Neutral)

| Attribute | Details |
|-----------|---------|
| **Problem** | Only `critical` severity set Check Run to `failure`; `significant` was `neutral` (advisory), meaning significant documentation drift didnt block merging |
| **File** | `src/pipeline/reporter.py` |

**Before:**

```python
CHECK_RUN_CONCLUSION = {
    "critical": "failure",
    "significant": "neutral",  # Non-blocking!
    "minor": "success",
}
```

**After:**

```python
CHECK_RUN_CONCLUSION = {
    "critical": "failure",
    "significant": "failure",  # Now blocks merging
    "minor": "success",
}
```

---

### 3.4 Design Gap: Color Coding in DriftAlertList Was Inverted

| Attribute | Details |
|-----------|---------|
| **Problem** | `getScoreColor(score)` returned GREEN for score >= 80 (high drift = bad) and RED for score < 50 (low drift = OK). This was backwards. |
| **File** | `web/src/components/DriftAlertList.tsx` |

**Before (Broken):**

```typescript
function getScoreColor(score: number): string {
    if (score >= 80) return "text-green-600";  // High drift = green (WRONG)
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";  // Low drift = red (WRONG)
}
```

**After (Fixed):**

```typescript
function getScoreColor(score: number): string {
    if (score >= 80) return "text-red-600";    // High drift = red (BAD)
    if (score >= 50) return "text-yellow-600"; // Medium drift = yellow
    return "text-green-600";                   // Low drift = green (OK)
}
```

---

## 4. Local Development Checklist

Use this checklist before testing webhook flows to ensure all services are running:

### Pre-flight Checks

```bash
# 1. Start Docker runtime and verify containers
colima start
docker ps  # Confirm: postgres, redis, weaviate running

# 2. Start smee webhook proxy
smee --url https://smee.io/ZmzXvcX2jMSluM0X \
     --target http://localhost:8000/webhooks/github

# 3. Start FastAPI backend
MAX_PROCESSING_TIME=600 nohup .venv/bin/python -m uvicorn src.main:app \
    --host 0.0.0.0 --port 8000 --reload > uvicorn.log 2>&1 &

# 4. Start RQ worker
cd /path/to/docugardener && \
    .venv/bin/rq worker --with-scheduler

# 5. Start Next.js dev server
cd web && npm run dev
```

### Verification

```bash
# Health check
curl http://localhost:8000/health
# Expected: {"status":"healthy"}

# Check for stray processes on port 8000
lsof -i :8000

# Tail logs
tail -f uvicorn.log
tail -f worker.log
```

### Checklist Summary

| Service | Command | Verification |
|---------|---------|--------------|
| Docker (Colima) | `colima start` | `docker ps` shows 3+ containers |
| Smee | `smee --url ... --target ...` | "Connected" in terminal |
| FastAPI | `uvicorn src.main:app ...` | `curl localhost:8000/health` |
| RQ Worker | `rq worker --with-scheduler` | No connection errors in output |
| Next.js | `npm run dev` | `localhost:3000` loads |

---

## Appendix: Quick Reference

### Common Error Messages and Solutions

| Error Message | Likely Cause | Solution |
|---------------|--------------|----------|
| "Address already in use :8000" | Stray uvicorn process | `pkill -f "uvicorn src"` |
| "No documentation updates found to apply" | Bug #2.1 or #2.2 | Check `fail_job()` logic and threshold gating |
| "fatal: unable to read tree {sha}" | Bug #2.3 | Add `no_single_branch=True` to clone |
| "Git committer failed" / HTTP 403 | Missing write permission | Update GitHub App permissions |
| Job stuck in PROCESSING | Bug #1.1 | Set `MAX_PROCESSING_TIME=600` |

### File Reference

| Component | File Path |
|-----------|-----------|
| Job Manager | `src/pipeline/job_manager.py` |
| Analyzer | `src/pipeline/analyzer.py` |
| Git Committer | `src/github/committer.py` |
| Webhook Handler | `src/api/webhooks.py` |
| Pipeline Handler | `src/pipeline/handler.py` |
| Reporter | `src/pipeline/reporter.py` |
| Worker Queue | `src/worker/queue.py` |
| SQL Models | `src/storage/sql_models.py` |
| DriftAlertList | `web/src/components/DriftAlertList.tsx` |
| SemanticDiffViewer | `web/src/components/SemanticDiffViewer.tsx` |

---

*Last updated: 2026-02-22 (Bug 2.8 added — TEST-01 phase)*
*Document covers issues from WORK-01 and TEST-01 development phases*

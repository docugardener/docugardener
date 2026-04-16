# SPDX-License-Identifier: AGPL-3.0-or-later
# QA-BUGS-01 — Inbox & Pipeline Bug Fixes (QA-03 findings)

> **Sprint:** Post-QA-03 production bug fixes — 2026-04-16
> **Found during:** QA-03 live GitHub App testing on `docugardener/docugardener`

---

## BUG-1 — Duplicate Inbox Items per PR Synchronize Event

**Priority:** P0 | **Effort:** S | **Layer:** Backend + Frontend

### Problem
Every `pull_request: synchronize` webhook event (i.e. every new commit pushed to an open PR) creates a **new** Inbox item for the same PR. A PR with 3 commits gets 3 separate Inbox items. The user must manually dismiss/triage duplicates.

### Root cause
`src/api/webhooks.py` calls `create_job()` unconditionally on `synchronize`. No check for an existing open/untriaged job for the same `(tenant_id, repo, pr_number)`.

### Expected behaviour
- If an open job already exists for `(tenant_id, repo, pr_number)` with status `PROCESSING` or triageStatus `NEEDS_REVIEW` → **update** that job's `head_sha` and re-queue analysis; do not create a new row.
- If the previous job is already `RESOLVED`, `DISMISSED`, or `FAILED` → create a new job (fresh analysis for the new commit).

### Acceptance criteria
- [ ] Pushing 3 commits to an open PR produces 1 Inbox item (updated, not 3 new ones)
- [ ] `head_sha` on the job row reflects the latest commit after each push
- [ ] If the previous finding was RESOLVED/DISMISSED, a new push creates a new item
- [ ] Unit test: `test_duplicate_sync_upserts_existing_job`
- [ ] Existing synchronize tests still pass

### Files likely touched
- `src/api/webhooks.py` — add upsert logic before `create_job()`
- `src/pipeline/job_manager.py` — add `find_open_job(tenant_id, repo, pr_number)` helper
- `tests/unit/test_webhooks_duplicate_sync.py` — new test file

---

## BUG-2 — Inbox Does Not Auto-Refresh

**Priority:** P1 | **Effort:** S | **Layer:** Frontend

### Problem
The Inbox page does not update when:
1. A new job completes and creates an Inbox item (user must F5 to see it)
2. An existing item changes status (e.g. ANALYZING → NEEDS_REVIEW, or AI_FIXING → FIX_PR_OPEN)

BETA-BUG-03 was supposedly fixed (30s poll added to `InboxPageClient`) but is broken in production.

### Investigation needed
1. Check `web/components/inbox/InboxPageClient.tsx` — is the 30s `setInterval` actually running?
2. Check if the poll fires but the server returns stale data (Next.js fetch cache issue)
3. Check if the poll is silently erroring (network, auth)

### Expected behaviour
- Inbox list refreshes automatically every 30s without user interaction
- When a selected item changes status, the detail panel updates without full page reload
- Selection is preserved across refreshes

### Acceptance criteria
- [ ] New job appears in Inbox within 35s of being created — no manual refresh needed
- [ ] Status chip updates in-place when job transitions (ANALYZING → NEEDS_REVIEW)
- [ ] Detail panel refreshes when open item changes state
- [ ] No full-page reload; selection preserved
- [ ] Vitest test: poll interval fires and calls fetch

### Files likely touched
- `web/components/inbox/InboxPageClient.tsx` — fix/verify poll interval
- Possibly add `cache: 'no-store'` or `revalidate: 0` to the fetch in the inbox API call

---

## BUG-4 — FAILED Status Shown When Auto-Fix Push Fails (Misleading Error)

**Priority:** P2 | **Effort:** XS | **Layer:** Backend + Frontend

### Problem
When the auto-fix PR push fails (e.g. GitHub App missing `Contents: write` permission), the job is marked `FAILED` in the UI. The user sees a red `FAILED` badge with no explanation — they don't know if the analysis failed or the fix push failed, and there's no actionable guidance.

### Expected behaviour
- Job status should distinguish between **analysis failure** and **fix PR failure**
- On fix PR failure: show `FIX_PR_FAILED` status (amber, not red) with message: "Fix PR could not be pushed. Check GitHub App permissions (`Contents: write` required)."
- The analysis findings and drift score remain visible

### Acceptance criteria
- [ ] `FIX_PR_FAILED` triageStatus added to Prisma schema + migration
- [ ] `process_fix_pr` sets `FIX_PR_FAILED` (not `FAILED`) when push errors
- [ ] `getUiStatus()` returns `FIX_PR_FAILED` → amber badge + descriptive tooltip
- [ ] Inbox detail panel shows actionable error message on `FIX_PR_FAILED`
- [ ] Unit test covers the new status transition

### Files likely touched
- `prisma/schema.prisma` — add `FIX_PR_FAILED` to `TriageStatus` enum
- `src/pipeline/handler.py` — set `FIX_PR_FAILED` in committer error handler
- `web/lib/job-status.ts` — add `FIX_PR_FAILED` to `UiStatus`
- `web/components/inbox/SemanticDiffViewer.tsx` — amber banner with fix instructions

---

## BUG-5 — Weaviate Namespace Empty (RAG Context Missing)

**Priority:** P2 | **Effort:** M | **Layer:** Backend

### Problem
Every analysis logs: `"Query failed, possibly tenant does not exist"` from Weaviate. The tenant namespace `cmmjpxq3x0005bul35iu3viuv` has never been indexed. All drift detection runs without RAG context — LLM works from diff alone, no historical documentation embeddings.

### Root cause
The Weaviate indexer (`src/storage/indexer.py`) must be triggered manually or via nightly rollup for the initial index build. For the production tenant, this has never been run.

### Fix
1. Trigger an initial full-repo index for the production tenant's connected repos
2. Verify the nightly rollup scheduler runs the indexer on schedule

### Acceptance criteria
- [ ] `docker exec docugardener-worker python -c "from src.storage.indexer import index_tenant; ..."` runs without error
- [ ] Subsequent analysis jobs no longer log `Query failed` from Weaviate
- [ ] Nightly rollup job verified to be scheduled and running

### Files likely touched
- `src/storage/indexer.py` — verify indexing logic
- `src/jobs/nightly_rollup.py` — verify scheduler trigger
- Manual: trigger initial index via admin script

---

## BUG-6 — FutureWarning: get_sentence_embedding_dimension Deprecated

**Priority:** P3 | **Effort:** XS | **Layer:** Backend

### Problem
Worker logs on every analysis:
```
FutureWarning: The `get_sentence_embedding_dimension` method has been renamed to `get_embedding_dimension`.
```

Will break on next major sentence-transformers version bump.

### Fix
`src/analysis/embeddings.py:44` — replace `get_sentence_embedding_dimension()` with `get_embedding_dimension()`.

### Acceptance criteria
- [ ] No FutureWarning in worker logs after fix
- [ ] Existing embedding tests pass

---

## Non-Bug Observation: Inbox Upsert Missing = Silent Caddy Bug Masked

BUG-3 (Caddy routing — **already fixed** 2026-04-16, commits `6fa4825` + `ec9b7e6`):
- All GitHub webhooks were routing to Next.js (404) instead of FastAPI
- Root cause: GitHub App manifest sets webhook URL to `/api/webhooks/github`; Caddy only routed `/webhooks/*`
- Fix: added `handle /api/webhooks/*` block with `uri strip_prefix /api` in `docker/Caddyfile`
- **Impact:** Zero analysis jobs ran on any live PR before 2026-04-16

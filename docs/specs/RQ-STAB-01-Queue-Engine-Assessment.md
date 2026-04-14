# RQ-STAB-01 — Queue Processing Engine: Reliability, Performance & Extensibility Assessment

**Date:** 2026-03-28
**Scope:** DocuGardener's RQ/Redis worker engine vs NestFleet's pg-boss reference implementation
**Goal:** Identify gaps; produce a prioritised refactoring roadmap toward a reliable, performant, production-grade engine

---

## Executive Summary

DocuGardener's queue engine is a **prototype-grade implementation** that works acceptably under low single-tenant load but has multiple critical correctness gaps that will cause data loss, ghost jobs, and invisible failures at scale or after any worker interruption. NestFleet's pg-boss architecture solves almost every one of these gaps elegantly and should be used as the direct reference for the refactoring.

**Verdict by axis:**

| Axis | Score | Notes |
|---|---|---|
| **Reliability** | 3 / 10 | No retries, no orphan recovery, broken RQ failure signal for fix PR jobs |
| **Performance** | 5 / 10 | One job at a time per process, fresh event loop per job, single queue |
| **Observability** | 3 / 10 | No per-job audit trace, no OTel, RQ failure registry not actionable |
| **Extensibility** | 4 / 10 | No queue priority, no concurrency per job type, no transactional dispatch |

---

## Part 1 — How DocuGardener's Engine Works Today

```
GitHub Webhook
    │
    ▼
webhooks.py (FastAPI)
    │  ─ dedup: Redis SET NX (delivery_id, 5m TTL) + SQL idempotency check
    │  ─ quota + license guards
    │
    ▼
get_queue().enqueue(analyze_pr_job, job_timeout=120s)
    │
    │  ← Redis "default" queue (single queue for everything)
    │
    ▼
Worker process (1 container, 1 job at a time)
    │
    ├─ analyze_pr_job()
    │     asyncio.run(process_pull_request())   ← new event loop per job
    │     on success: complete_job() → SQL COMPLETED
    │     on epic05/scale04: enqueue(create_fix_pr_job)   ← separate, non-atomic
    │     on error: fail_job() → SQL FAILED, re-raise → RQ marks failed
    │
    └─ create_fix_pr_job()
          asyncio.run(process_fix_pr())
          on success: SQL RESOLVED   ← RQ sees success even if SQL is FAILED
          on error:   fail_job()     ← does NOT re-raise → RQ sees success ❌
```

---

## Part 2 — Critical Gaps (P0 — Fix Before Production)

### GAP-1 — No Retry on Any Job

**What happens:** Any transient error — LLM timeout, GitHub API 502, network blip during clone — permanently fails the job. The user sees a failed scan and gets no second chance.

**Reality check:** LLM calls (Gemini/OpenAI) routinely return 429, 503. GitHub API returns 502 under load. `git clone` over HTTPS fails on flaky connectivity. **All of these are transient.** Currently, every one of them is a permanent failure.

```python
# Today — zero retry config:
queue.enqueue(analyze_pr_job, ..., job_timeout=120)

# NestFleet pattern:
await boss.send(queue, data, { retryLimit: 2, retryDelay: 30, retryBackoff: true })
```

**Fix:** Add `Retry(max=3, interval=[30, 60, 120])` to all `enqueue()` calls. RQ supports this natively.

---

### GAP-2 — Orphaned PROCESSING Jobs After Worker Crash

**What happens:**
1. Worker picks up job → SQL `status=PROCESSING`, `startedAt` set
2. Worker crashes (OOM, SIGKILL, Python segfault)
3. RQ leaves the job in `StartedJobRegistry` (Redis) — never re-queued
4. SQL `Job` row stays `PROCESSING` forever
5. GitHub Check Run stays `"in_progress"` forever
6. The PR author sees the DocuGardener check running for days

There is **no heartbeat, no stale job sweeper, no recovery process**. This is the single most dangerous production correctness gap.

**NestFleet's solution:** pg-boss maintains a heartbeat per running job. If the worker dies, pg-boss automatically detects the missing heartbeat and re-queues the job for retry.

**DocuGardener fix (two-step):**

Step 1 — Stale job sweeper cron (can implement this week):
```python
# In src/scheduler/manager.py — add alongside existing nightly rollups
async def sweep_stale_jobs():
    """Mark jobs stuck in PROCESSING for > 10 min as FAILED and update check runs."""
    cutoff = datetime.utcnow() - timedelta(minutes=10)
    stale = db.query(Job).filter(
        Job.status == JobStatus.PROCESSING,
        Job.startedAt < cutoff
    ).all()
    for job in stale:
        job_manager.fail_job(job.id, "Job timed out — worker may have crashed")
        # Also update GitHub check run to conclusion=failure
```

Step 2 (medium-term) — Move to pg-boss or Celery which handle this automatically.

---

### GAP-3 — `process_fix_pr` Does Not Re-raise: RQ Sees Success on Failure

**The bug:**
```python
# src/pipeline/handler.py — process_fix_pr outer except block
except Exception as e:
    logger.error(...)
    job_manager.fail_job(job_id, str(e))
    # Does NOT re-raise — intentional per comment
```

This means when fix PR creation fails (e.g., `apply_and_push()` fails), the `create_fix_pr_job` RQ job is marked **`finished`** (success) by RQ, while SQL shows `FAILED`. The RQ failed job registry will never contain these failures. You cannot detect them from the RQ side. Failed fix PRs are invisible at the infrastructure level.

**Fix:** Re-raise after `fail_job()`, same as `analyze_pr_job` does:
```python
except Exception as e:
    logger.error(...)
    job_manager.fail_job(job_id, str(e))
    raise  # let RQ mark the job as failed too
```

---

### GAP-4 — Non-Atomic Dispatch: Job Enqueue and DB State Are Separate Operations

**The race condition:**
```python
# handler.py — EPIC-05 path
job_manager.complete_job(job_id, result_payload)   # 1. SQL write
# ← if process crashes here, fix PR job is never enqueued
get_queue().enqueue(create_fix_pr_job, job_id)     # 2. Redis write
```

If the worker crashes between lines 1 and 2, the analysis job is `COMPLETED` in SQL with `auto_fix_enqueued=True` but the fix PR job was never actually placed on the queue. The inbox shows the spinner forever with no job running.

This is the **exact bug** that caused PRs 118/119 to show a stuck spinner for minutes — we manually patched the flag without enqueuing the actual job.

**NestFleet's solution — transactional dispatch:**
```ts
// DB state change + job enqueue in same PG transaction — atomically guaranteed
await tx`UPDATE cases SET status = 'processing' WHERE id = ${caseId}`
await tx`INSERT INTO pgboss.job (name, data, ...) VALUES (...)`
```

**DocuGardener fix (near-term):** Switch to pg-boss (see Part 4), or implement a PostgreSQL-backed job table with transactional semantics. At minimum, add a recovery mechanism that re-enqueues jobs where `auto_fix_enqueued=True` but `fixPrUrl` is null and no active RQ job exists.

---

## Part 3 — High-Priority Gaps (P1 — Fix in Next Sprint)

### GAP-5 — Single Queue for Everything: Priority Inversion

All three job types compete on `"default"`:

| Job | Importance | Typical duration |
|---|---|---|
| `analyze_pr_job` | High — blocks PR check | 15–45s |
| `create_fix_pr_job` | High — user waiting in inbox | 20–60s |
| `ignore_drift_job` | Low — fire-and-forget | 2–5s |

A burst of 10 webhook events will queue 10 `analyze_pr_job` runs. Any `create_fix_pr_job` enqueued during this burst waits behind all 10, even though a user is actively watching the inbox spinner.

**NestFleet's solution:** Separate queues with separate `localConcurrency` per queue. High-urgency queues get more workers and skip the backlog of lower-priority work.

**DocuGardener fix:**
```python
# src/worker/queue.py
HIGH_QUEUE = "high"      # create_fix_pr_job, ignore_drift_job
DEFAULT_QUEUE = "default"  # analyze_pr_job

# Enqueue accordingly:
get_queue("high").enqueue(create_fix_pr_job, ...)
get_queue("default").enqueue(analyze_pr_job, ...)

# Worker startup: listen to both
# rq worker high default --url redis://redis:6379/0
# RQ processes "high" first when both have pending jobs
```

---

### GAP-6 — `asyncio.run()` Per Job: Event Loop Thrash

```python
# src/worker/jobs.py — every single job
def analyze_pr_job(...):
    asyncio.run(process_pull_request(...))   # creates + tears down event loop
```

`asyncio.run()` creates a new event loop, runs the coroutine to completion, then destroys the loop. For a worker processing 20 jobs/hour, this is fine. For 200+ jobs/hour, the overhead adds up and, more critically, it prevents HTTP connection pooling — every job re-establishes TCP connections to GitHub, Gemini, Weaviate, and PostgreSQL.

**Better approach:** Use `rq`'s async job support (available via `aio-rq`) or implement the worker as a native async process using `asyncio` directly:
```python
async def analyze_pr_job_async(...):
    await process_pull_request(...)

# Or keep the sync wrapper but reuse an event loop:
_loop = asyncio.new_event_loop()

def analyze_pr_job(...):
    _loop.run_until_complete(process_pull_request(...))
```

Or better: migrate to Celery with async task support, which handles this properly.

---

### GAP-7 — `result_ttl` / `failure_ttl` Not Set: Redis Grows Unbounded

```python
# Current — uses RQ defaults:
queue.enqueue(analyze_pr_job, ...)
# RQ default: result_ttl=500s, failure_ttl=-1 (never expires)
```

Every failed job is stored in Redis indefinitely (`failure_ttl=-1`). The return value of successful jobs is retained for 500 seconds, which is fine. But the failed job registry grows forever. In a production system processing thousands of PRs per month, this becomes a memory and operational problem.

**Fix:**
```python
queue.enqueue(
    analyze_pr_job,
    ...,
    result_ttl=3600,         # keep success result 1h (already in SQL, Redis is cache)
    failure_ttl=7 * 86400,   # keep failed jobs 7 days for debugging
)
```

---

### GAP-8 — GitHub Check Run Can Get Stuck `"in_progress"` on Analysis Exception

```python
# process_pull_request — simplified structure:
try:
    check_run_id = create_initial_check_run()   # sets "in_progress"
    create_job()
    result = await analyzer.analyze_pr(...)
    complete_job()
except Exception as e:
    fail_job()
    raise
finally:
    # reporter.report_to_pr() is NOT in finally — it's after the raise in the happy path
```

If `analyzer.analyze_pr()` raises (LLM crash, timeout), `reporter.report_to_pr()` is never called, the check run stays `"in_progress"` on the PR forever. This is a user-facing bug — the PR shows DocuGardener as pending indefinitely.

**Fix:** Move `reporter.report_to_pr()` into a `finally` block that captures the failure result:
```python
final_result = None
try:
    ...
    final_result = analysis_result
except Exception as e:
    final_result = error_result(str(e))
    raise
finally:
    if check_run_id and final_result:
        await reporter.report_to_pr(final_result, check_run_id, job_id, tenant_id)
```

---

## Part 4 — Medium-Priority Gaps (P2 — Next Two Sprints)

### GAP-9 — No Per-Job Audit Record

NestFleet records every job execution in `agent_runs`:
- `outcome` (success/abstain/error/validation_failure)
- `model_id`, `input_tokens`, `output_tokens`, `duration_ms`
- `error_code`, `error_message`
- `otel_trace_id`, `otel_span_id`

DocuGardener has no equivalent. You can only answer "what happened to job X" by reading the raw `job.result` JSON. There is no queryable table for "show me all jobs that failed due to LLM timeout in the last 7 days" or "what was the p95 analysis duration this week".

**Fix:** Add a `job_runs` table:
```sql
CREATE TABLE job_runs (
    id          TEXT PRIMARY KEY,
    job_id      TEXT REFERENCES jobs(id),
    job_type    TEXT,                          -- analyze_pr | create_fix_pr | ignore_drift
    outcome     TEXT,                          -- success | error | timeout
    model_id    TEXT,
    input_tokens  INT,
    output_tokens INT,
    duration_ms   INT,
    error_code  TEXT,
    error_message TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

### GAP-10 — No OpenTelemetry Tracing

NestFleet opens an OTel span per job and propagates trace context through the entire chain:
```ts
const span = tracer.startSpan(`agent.run.${actionType}`, { ... })
context.with(trace.setSpan(context.active(), span), async () => {
    await this.execute(job)
})
```

DocuGardener has Prometheus metrics (`JOBS_COMPLETED.labels(status=...)`) but no distributed tracing. You cannot answer "which part of job X was slow — the GitHub fetch, the LLM call, or the fix PR push" without reading logs manually.

**Fix:** Add OTel SDK, instrument `analyze_pr_job` and `create_fix_pr_job` with spans. Existing Grafana + Prometheus stack can be extended with Tempo for trace storage.

---

### GAP-11 — No Horizontal Scaling Strategy

Current compose: 1 worker container, 1 job at a time. To scale up:

```yaml
# docker-compose.yml — correct way to scale RQ:
worker:
  command: rq worker high default --url redis://redis:6379/0
  deploy:
    replicas: 4   # 4 independent worker processes
```

Or in dev: `docker compose up --scale worker=4`. This is the correct RQ scaling model (multiple processes, not `--concurrency` which doesn't exist in RQ's CLI).

For production (Kubernetes): HPA on queue depth (`rq info --interval 1` → Prometheus exporter → HPA trigger).

---

### GAP-12 — Dedup Logic Is Hand-Rolled When It Should Be Queue-Level

```python
# webhooks.py — two separate dedup mechanisms:
# 1. Redis SET NX on delivery_id (5-min TTL)
# 2. SQL query for non-FAILED job with same (pr_number, head_sha)
```

NestFleet handles this with `singletonKey` at the queue level — pg-boss enforces uniqueness in the `pgboss.job` table with a DB-level constraint. DocuGardener's hand-rolled approach has a gap: the Redis TTL check and the SQL check are not atomic, so under concurrent webhook delivery (GitHub sends the same event twice in rapid succession), both checks can pass simultaneously for two parallel webhook requests.

---

## Part 5 — Architectural Comparison: RQ vs pg-boss

| Capability | DocuGardener (RQ) | NestFleet (pg-boss) |
|---|---|---|
| **Retry on failure** | ❌ None | ✅ `retryLimit` + exponential backoff |
| **Dead-letter queue** | ❌ Manual (Redis failed registry, never cleaned) | ✅ Automatic after retry exhaustion |
| **Orphan recovery** | ❌ None — stuck PROCESSING forever | ✅ Heartbeat-based auto-requeue |
| **Transactional dispatch** | ❌ DB write + Redis enqueue are separate | ✅ Both in same PG transaction |
| **Priority queues** | ❌ Single "default" queue | ✅ Separate queues per job type |
| **Concurrency control** | ❌ 1 per process (no config) | ✅ `localConcurrency` per queue |
| **singletonKey dedup** | ❌ Hand-rolled, non-atomic | ✅ DB-level constraint |
| **Per-job audit record** | ❌ None | ✅ `agent_runs` table |
| **OTel tracing** | ❌ None | ✅ Span per job, trace propagation |
| **Scheduled jobs** | ⚠️ External scheduler, not queue-integrated | ✅ `boss.schedule()` built-in |
| **Stale job detection** | ❌ None | ✅ Heartbeat timeout |
| **Queue depth metrics** | ⚠️ Prometheus count only | ✅ pg-boss built-in monitoring |
| **Storage** | Redis (separate dependency) | PostgreSQL (already present) |
| **Schema migrations** | N/A | ✅ Auto-managed via `migrate: true` |

---

## Part 6 — Recommended Refactoring Path

### Phase 1: Harden RQ (1–2 days, ship now)
Closes GAP-1, GAP-3, GAP-5, GAP-7, GAP-8 without changing the queue backend.

1. **Add retries** to all `enqueue()` calls:
   ```python
   from rq import Retry
   ANALYSIS_RETRY = Retry(max=3, interval=[30, 60, 120])
   FIX_PR_RETRY   = Retry(max=2, interval=[60, 120])
   ```

2. **Fix `process_fix_pr` to re-raise** after `fail_job()`.

3. **Add priority queues** — `create_fix_pr_job` and `ignore_drift_job` → `"high"` queue; `analyze_pr_job` → `"default"`. Worker listens to both: `rq worker high default`.

4. **Set `result_ttl` and `failure_ttl`** on all enqueue calls.

5. **Move `reporter.report_to_pr()`** into a `finally` block so check runs always resolve.

6. **Add stale job sweeper** to `src/scheduler/manager.py` — runs every 5 minutes, detects jobs stuck in PROCESSING > 10 min, marks them failed, updates check runs.

### Phase 2: Replace Redis Queue with pg-boss (1 week)
Closes GAP-2, GAP-4, GAP-9, GAP-11, GAP-12 — the structural reliability gaps.

pg-boss is a Node.js library, but its queue storage is a plain PostgreSQL schema. For a Python application, you interact with it via raw SQL `INSERT INTO pgboss.job`. This is a tested pattern and gives you all the reliability guarantees:

```python
# Transactional dispatch — Python side
async with db.begin():
    await db.execute("UPDATE jobs SET status='COMPLETED', result=:r WHERE id=:id", ...)
    await db.execute("""
        INSERT INTO pgboss.job (name, data, retry_limit, retry_delay, retry_backoff, singleton_key)
        VALUES (:name, :data::jsonb, 3, 30, true, :key)
    """, name="create_fix_pr", data=json.dumps({"job_id": job_id}), key=f"fix-pr:{job_id}")
```

A thin TypeScript/Node.js worker process (matching NestFleet's pattern) processes the pg-boss queue. This is the cleanest path and eliminates the Redis dependency entirely.

**Alternative:** Use **Celery with PostgreSQL backend** (SQLAlchemy result backend). Celery is the mature Python-native solution with built-in retry, priority queues, canvas (chains/chords for job sequences), and Flower for monitoring. Requires no TypeScript. Tradeoff: heavier dependency than pg-boss, but Python-native.

### Phase 3: Observability (parallel, low risk)
Add `job_runs` table and OTel instrumentation. These are additive changes that don't touch the core job logic.

---

## Part 7 — Decision Recommendation

Given that:
- DocuGardener already uses PostgreSQL as its primary data store
- NestFleet's pg-boss pattern is battle-tested in your own production system
- Redis is an additional operational dependency that provides no unique value beyond the queue (DocuGardener doesn't use Redis for caching or pub/sub)
- The transactional dispatch gap (GAP-4) is architecturally unsolvable within pure RQ

**Recommendation: migrate to pg-boss (via Python-side raw SQL inserts) in Phase 2, keeping a thin Node.js worker process running alongside the FastAPI app (same Docker network, same PG connection string).** This matches the NestFleet architecture exactly and gives you all 12 reliability capabilities listed in the comparison table.

Short-term this week: ship Phase 1 (harden RQ) to close the three P0 gaps without disrupting the current architecture.

---

## Quick Reference — Priority Matrix

| # | Gap | Severity | Effort | Phase |
|---|---|---|---|---|
| GAP-1 | No retries | P0 | 1h | 1 |
| GAP-2 | Orphaned PROCESSING jobs | P0 | 2h sweeper / 1w pg-boss | 1+2 |
| GAP-3 | process_fix_pr doesn't re-raise | P0 | 30m | 1 |
| GAP-4 | Non-atomic dispatch | P0 | 1w | 2 |
| GAP-5 | Single queue, priority inversion | P1 | 2h | 1 |
| GAP-6 | asyncio.run() per job | P1 | 3h | 2 |
| GAP-7 | Unbounded Redis growth | P1 | 30m | 1 |
| GAP-8 | Check run stuck "in_progress" | P1 | 2h | 1 |
| GAP-9 | No per-job audit record | P2 | 1d | 3 |
| GAP-10 | No OTel tracing | P2 | 2d | 3 |
| GAP-11 | No horizontal scaling config | P2 | 1h | 1 |
| GAP-12 | Hand-rolled dedup, non-atomic | P2 | 1w | 2 |

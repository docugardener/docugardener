# DocuGardener Production Runbook

> **Audience:** On-call engineer responding to a Grafana alert from the `docugardener-ops` contact point.
> **Scope:** Single-host Hetzner VPS running `docker/docker-compose.prod.yml`.
> **Alert source:** Grafana Unified Alerting, rules in `docker/grafana/provisioning/alerting/alerts.yml`. Delivery webhook URL is set via the `GRAFANA_ALERT_WEBHOOK_URL` env var on the `grafana` container.
> **Compose shortcut used throughout:** `docker compose --env-file .env.production -f docker/docker-compose.prod.yml …`

---

## Quick Reference

| # | Alert | Severity | `for` window | MTTD target | Section |
|---|-------|----------|--------------|-------------|---------|
| 1 | API Error Rate >5% | critical | 5m | <30 min | [ALERT-01](#alert-01-api-error-rate-5) |
| 2 | RQ Queue Depth >100 | warning | 5m | <2 h | [ALERT-02](#alert-02-rq-queue-depth-100) |
| 3 | Webhook Failure Rate >10% | warning | 5m | <2 h | [ALERT-03](#alert-03-webhook-failure-rate-10) |
| 4 | LLM Error Rate >5% | warning | 10m | <2 h | [ALERT-04](#alert-04-llm-error-rate-5) |
| 5 | RQ Queue Stuck — Jobs Not Processing | critical | 5m | <30 min | [ALERT-05](#alert-05-rq-queue-stuck--jobs-not-processing) |
| 6 | RQ Worker Silent — No Jobs Completed in 10 min | critical | 10m | <30 min | [ALERT-06](#alert-06-rq-worker-silent--no-jobs-completed-in-10-min) |

**Response SLA:**
- **critical** → acknowledge within 5 min, resolve or downgrade within 30 min.
- **warning** → acknowledge within 30 min, resolve within 2 h.
- **info** (none currently) → handle next business day.

---

## Service Architecture

### Container inventory (from `docker-compose.prod.yml`)

| Container | Image / Process | Role | Ports (internal) |
|-----------|----------------|------|-----------------|
| `docugardener-caddy` | `caddy:2-alpine` | TLS termination + reverse proxy | 80, 443, 443/udp |
| `docugardener-web` | Next.js 14 | Marketing + dashboard UI | 3001 |
| `docugardener-migrate` | `prisma migrate deploy` | One-shot DB migrator, exits 0 | — |
| `docugardener` | FastAPI + Uvicorn | API, webhook sink, `/metrics` | 8000 |
| `docugardener-worker` | `rq worker default` | Executes analysis / fix PR jobs | — |
| `docugardener-scheduler` | `python -m src.scheduler.manager` | APScheduler; includes stale-job sweeper | — |
| `docugardener-redis` | `valkey/valkey:7-alpine` | RQ broker (password-protected) | 6379 |
| `docugardener-weaviate` | `weaviate:1.27.0` | Ephemeral vector store for RAG | 8080 |
| `docugardener-postgres` | `postgres:15-alpine` | Web + tenant DB (`docugardener-web`) | 5432 |
| `docugardener-backup` | `postgres:15-alpine` + crond | Nightly PG/Weaviate dump @ 02:00 | — |
| `docugardener-prometheus` | `prom/prometheus:v2.54.0` | Scrapes `docugardener:8000/metrics` every 15s | 9090 |
| `docugardener-grafana` | `grafana:11.4.0` | Dashboards + alerting | 3000 |

All services live on the `docugardener-network` Docker bridge. Only Caddy has host port bindings; everything else is reachable only via the internal network or SSH tunnel.

### Request / job flow

```
 GitHub ──(webhook)──► Caddy ─► FastAPI (docugardener)
                                   │
                                   ├──► Postgres (tenant / jobs)
                                   │
                                   └──► Redis ──► Worker (RQ)
                                                     │
                                                     ├──► Weaviate (RAG)
                                                     ├──► LLM provider (Gemini / Anthropic / OpenAI)
                                                     └──► GitHub API (fix PR)
```

The scheduler runs an APScheduler job every 60 seconds (`IntervalTrigger(seconds=60)`) that inspects PROCESSING jobs older than `max_processing_time + 30s` and transitions them to FAILED. This is the **stale job sweeper** and is the last line of defence when a worker dies mid-job.

---

## Standard Diagnostic Commands

All commands assume you are in the repo root and `.env.production` is populated.

### Container state

```bash
# Running containers (DG only)
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}" | grep docugardener

# Full compose view (shows exited services too)
docker compose --env-file .env.production -f docker/docker-compose.prod.yml ps

# Last 100 log lines of one service
docker logs docugardener-worker --tail 100
docker logs docugardener --tail 100
docker logs docugardener-web --tail 100

# Follow logs live
docker logs -f docugardener-worker
```

### FastAPI health

```bash
# Inside the docker network (from any DG container):
docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
  exec docugardener curl -sf http://localhost:8000/health | python3 -m json.tool

# From the host via Caddy:
curl -sf https://$DOMAIN/health | python3 -m json.tool
```

### Redis / RQ queue depth

```bash
# Auth against the password-protected Redis:
docker exec docugardener-redis redis-cli -a "$REDIS_PASSWORD" ping
# → PONG

# Queue depths (default = analysis, high = fix/ignore priority):
docker exec docugardener-redis redis-cli -a "$REDIS_PASSWORD" llen rq:queue:default
docker exec docugardener-redis redis-cli -a "$REDIS_PASSWORD" llen rq:queue:high

# Failed job registry count:
docker exec docugardener-redis redis-cli -a "$REDIS_PASSWORD" zcard rq:failed:default

# Number of workers currently registered:
docker exec docugardener-redis redis-cli -a "$REDIS_PASSWORD" scard rq:workers
```

> Prefix commands with `REDISCLI_AUTH=$REDIS_PASSWORD` and drop `-a` if you want the password off the process list.

### Prometheus queries (via Grafana Explore or port-forward)

Scrape target is `docugardener:8000/metrics`. Useful PromQL:

```promql
# Current queue depth
docugardener_queue_size{queue_name="default"}

# Jobs completed in the last 10 min
increase(docugardener_jobs_completed_total[10m])

# 5xx ratio over 5m
sum(rate(docugardener_http_requests_total{status=~"5.."}[5m]))
  / clamp_min(sum(rate(docugardener_http_requests_total[5m])), 0.001)

# LLM error ratio over 10m
sum(rate(docugardener_llm_errors_total[10m]))
  / clamp_min(sum(rate(docugardener_llm_requests_total[10m])), 0.001)
```

### Exec shell for deep debugging

```bash
docker exec -it docugardener bash           # FastAPI container
docker exec -it docugardener-worker bash    # Worker container
docker exec -it docugardener-postgres psql -U postgres -d docugardener-web
```

---

## Alert Response Procedures

### ALERT-01: API Error Rate >5%

**Severity:** critical • **MTTD target:** <30 min • **Grafana UID:** `mon01-api-error-rate`

**Trigger expression**
```
sum(rate(docugardener_http_requests_total{status=~"5.."}[5m]))
  / clamp_min(sum(rate(docugardener_http_requests_total[5m])), 0.001) > 0.05
  for 5m
```

**Typical symptoms**
- Users report 500s in the dashboard.
- Sentry / logs show recurring tracebacks from a single endpoint.
- Caddy access logs show spikes of 5xx to `/api/…` routes.

**Diagnosis**

1. Confirm the API container is actually up:
   ```bash
   docker ps | grep docugardener$
   ```
   If status is `Restarting` or `Exited`, jump to fix step A.
2. Pull the last 100 lines and group by traceback signature:
   ```bash
   docker logs docugardener --tail 500 | grep -E "ERROR|Traceback" | tail -50
   ```
3. Identify whether errors are concentrated on one route:
   ```promql
   topk(5, sum by (path) (rate(docugardener_http_requests_total{status=~"5.."}[5m])))
   ```
4. Check downstream dependencies — a 503-heavy mix usually means Postgres or Redis is unreachable:
   ```bash
   docker exec docugardener-postgres pg_isready -U postgres
   docker exec docugardener-redis redis-cli -a "$REDIS_PASSWORD" ping
   ```
5. Check startup guard failures in the API container (missing `ENCRYPTION_KEY` will crash-loop):
   ```bash
   docker logs docugardener 2>&1 | grep -Ei "encryption_key|startup|missing env"
   ```

**Fix actions**

- **A — Container unhealthy / restarting:**
  ```bash
  docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
    restart docugardener
  # Any time the backend is recreated, also restart web so nginx/Caddy links stay live:
  docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
    restart web
  ```
- **B — DB / Redis down:** run the corresponding restart (see [Common Fixes](#common-fixes-quick-reference)).
- **C — Regression in last deploy:** roll back to the previous image tag:
  ```bash
  git log --oneline -n 5
  git checkout <previous-tag>
  docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d --build docugardener web
  ```
- **D — Single noisy endpoint under load:** temporarily rate-limit at Caddy or disable the feature flag; open a BUG ticket.

**Escalation**

If error rate stays above 5% after 30 min of triage or the API is down entirely → page the platform on-call (secondary contact) and open a SEV-1 in the incident channel.

---

### ALERT-02: RQ Queue Depth >100

**Severity:** warning • **MTTD target:** <2 h • **Grafana UID:** `mon01-queue-depth`

**Trigger expression**
```
docugardener_queue_size{queue_name="default"} > 100   for 5m
```

**Typical symptoms**
- Dashboard "Pending jobs" card shows 100+.
- Users report delayed PR analysis comments.
- Worker is alive (completing jobs) but cannot keep up.

**Diagnosis**

1. Confirm the worker is actually processing (distinguish from ALERT-05/06):
   ```bash
   docker logs docugardener-worker --tail 50 | grep -E "Processing|Result is|Worker"
   ```
   You should see fresh "Processing job …" lines.
2. Check queue depth evolution over the last hour:
   ```promql
   docugardener_queue_size{queue_name="default"}[1h]
   ```
   Climbing → producer > consumer. Flat or oscillating → transient spike.
3. Inspect recent completion throughput:
   ```promql
   rate(docugardener_jobs_completed_total[5m])
   ```
4. Check for slow upstreams — the worker usually stalls on LLM calls or GitHub API:
   ```bash
   docker logs docugardener-worker --tail 200 | grep -E "timeout|rate.?limit|429|529"
   ```

**Fix actions**

- **A — Sustained spike (bulk install, repo-wide scan):** wait it out; the queue drains naturally. Monitor with:
  ```bash
  watch -n 5 'docker exec docugardener-redis redis-cli -a "$REDIS_PASSWORD" llen rq:queue:default'
  ```
- **B — Worker is slow:** scale horizontally by starting an additional worker. Compose does not support `--scale` for a uniquely-named container, so spin up a sidecar:
  ```bash
  docker run -d --name docugardener-worker-2 \
    --network docugardener-docugardener-network \
    --env-file .env.production \
    $(docker inspect docugardener-worker --format '{{.Config.Image}}') \
    rq worker high default --url "redis://:${REDIS_PASSWORD}@redis:6379/0"
  ```
  Remove it once depth < 20.
- **C — Retry storm:** check `rq:failed:default` — if it is huge, failing jobs may be re-enqueued in a loop. See [ALERT-04](#alert-04-llm-error-rate-5) for provider-side failure handling.

**Escalation**

If depth > 500 or climbing for > 1 h → escalate to platform on-call and consider a producer-side brake (pause webhooks at Caddy) while investigating.

---

### ALERT-03: Webhook Failure Rate >10%

**Severity:** warning • **MTTD target:** <2 h • **Grafana UID:** `mon01-webhook-failure-rate`

**Trigger expression**
```
sum(rate(docugardener_webhooks_failed_total[5m]))
  / clamp_min(sum(rate(docugardener_webhooks_received_total[5m])), 0.001) > 0.10
  for 5m
```

**Typical symptoms**
- GitHub webhook deliveries show red × in the App admin UI.
- Jobs are not being enqueued despite PRs being opened.

**Diagnosis**

1. Tail webhook-specific logs:
   ```bash
   docker logs docugardener --tail 500 2>&1 | grep -Ei "webhook|signature|hmac"
   ```
2. Common failure modes to look for:
   - `401 invalid signature` → `GITHUB_WEBHOOK_SECRET` mismatch between GitHub App and the container.
   - `403 unauthorized installation` → GitHub App installation revoked on the repo.
   - `503 upstream down` → DB or Redis unreachable, webhook handler cannot enqueue.
3. Verify the GitHub App private key is mounted:
   ```bash
   docker exec docugardener ls -l /app/secrets/github-app.pem
   ```
4. Verify the secret loaded by the app matches what GitHub is signing with:
   ```bash
   docker exec docugardener env | grep GITHUB_WEBHOOK_SECRET | head -c 40
   ```
   Cross-check against the GitHub App settings page.
5. In the GitHub App admin UI, open **Advanced → Recent Deliveries**, click a failing delivery, and hit **Redeliver** once a fix is in place.

**Fix actions**

- **A — Signature mismatch:** update `GITHUB_WEBHOOK_SECRET` in `.env.production`, then:
  ```bash
  docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
    up -d --force-recreate docugardener web
  ```
- **B — Private key missing or wrong:** replace `secrets/github-app.pem`, `docker restart docugardener`.
- **C — Downstream down:** resolve the underlying DB/Redis issue first (see [ALERT-05](#alert-05-rq-queue-stuck--jobs-not-processing) or [Common Fixes](#common-fixes-quick-reference)).
- After the fix, redeliver a handful of failed webhooks from the GitHub UI to confirm recovery.

**Escalation**

If > 50% of webhooks fail for > 30 min, downgrade is impossible → treat as SEV-2 and loop in platform on-call.

---

### ALERT-04: LLM Error Rate >5%

**Severity:** warning • **MTTD target:** <2 h • **Grafana UID:** `mon01-llm-error-rate`

**Trigger expression**
```
sum(rate(docugardener_llm_errors_total[10m]))
  / clamp_min(sum(rate(docugardener_llm_requests_total[10m])), 0.001) > 0.05
  for 10m
```

**Typical symptoms**
- Jobs complete but `triageStatus=FAILED` with `pipeline_steps` showing `verifier` error.
- Worker logs show repeated `429`, `529`, `401`, or `deadline exceeded`.

**Diagnosis**

1. Break errors down by provider:
   ```promql
   sum by (provider) (rate(docugardener_llm_errors_total[10m]))
   ```
2. Tail the worker for the most recent failure signature:
   ```bash
   docker logs docugardener-worker --tail 500 2>&1 \
     | grep -E "LLMProvider|anthropic|gemini|openai|429|529|401|403"
   ```
3. Check the provider's public status page (Gemini, OpenAI, Anthropic). A 5xx spike from the provider is usually their incident, not ours. The 529 code is Anthropic overload and is in `_TRANSIENT_HTTP_CODES`, so retries should already be happening — confirm in logs.
4. API key issues — 401/403 suggests a rotated or expired key:
   ```bash
   docker exec docugardener-worker env | grep -E "GEMINI_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY" \
     | sed 's/=.*/=<redacted>/'
   ```

**Fix actions**

- **A — Provider outage:** no action; confirm the upstream status page, post a status notice. Transient retries should drain the queue once the provider recovers.
- **B — Rate limiting (429):** reduce worker concurrency (run fewer worker processes) or wait out the window. If sustained, consider upgrading the provider plan or switching default provider in `src/core/config.py` (`llm_provider`).
- **C — Expired/revoked key:** rotate the key, update `.env.production`, then:
  ```bash
  docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
    up -d --force-recreate worker scheduler
  ```
- **D — BYOK tenant with bad key:** the error is tenant-scoped, not a platform incident. Contact the tenant; the alert should self-resolve once their share of traffic normalises.

**Escalation**

Only escalate if the error is platform-wide (all tenants on bundled Gemini key) and not caused by a provider incident.

---

### ALERT-05: RQ Queue Stuck — Jobs Not Processing

**Severity:** critical • **MTTD target:** <30 min • **Grafana UID:** `rq-queue-stuck`

**Trigger expression**
```
docugardener_queue_size{queue_name="default"} > 0   for 5m
```

This alert asserts "queue is non-empty for 5+ minutes" — it catches a worker-down scenario earlier than ALERT-06. Any single stuck job is enough to fire it.

**Typical symptoms**
- Queue depth non-zero but flat.
- Worker container is missing or in a crash loop.
- `ENCRYPTION_KEY` startup guard triggered on the worker.

**Diagnosis**

1. Is the worker container running?
   ```bash
   docker ps --filter name=docugardener-worker --format "{{.Names}}\t{{.Status}}"
   ```
   Missing or `Restarting` → go straight to fix step A.
2. If running, look for the last "Processing job" line:
   ```bash
   docker logs docugardener-worker --tail 200 | grep -E "Processing job|Worker rq"
   ```
3. Check the encryption key guard:
   ```bash
   docker logs docugardener-worker 2>&1 | grep -Ei "encryption_key|startup guard|missing"
   ```
4. Confirm the worker can reach Redis:
   ```bash
   docker exec docugardener-worker python -c \
     "import os, redis; r=redis.from_url(os.environ['REDIS_URL']); print(r.ping())"
   ```
5. If Redis was restarted recently, the worker may still be connected to a dead socket — it must be restarted too.

**Fix actions**

- **A — Worker down / restarting:**
  ```bash
  docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
    restart worker scheduler
  ```
  The scheduler restart is deliberate — it runs the stale-job sweeper (see [Stale Job Sweeper](#stale-job-sweeper)) and will recover any PROCESSING jobs whose worker died mid-execution.
- **B — Redis restarted without worker restart:** same command as A.
- **C — `ENCRYPTION_KEY` missing:** this is a startup guard fault. Set `ENCRYPTION_KEY` in `.env.production` and force-recreate:
  ```bash
  docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
    up -d --force-recreate docugardener worker scheduler
  ```
- **D — Job that is wedging the worker:** identify the job id from logs and requeue or delete it:
  ```bash
  # From inside the worker container:
  docker exec -it docugardener-worker python -c \
    "from rq import Queue; from rq.job import Job; import os, redis; \
     r=redis.from_url(os.environ['REDIS_URL']); \
     print(Queue('default', connection=r).get_job_ids()[:10])"
  ```

**Verify recovery**

```bash
# Queue should drain and completions should tick:
docker exec docugardener-redis redis-cli -a "$REDIS_PASSWORD" llen rq:queue:default
docker logs docugardener-worker --tail 20 | grep "Result is"
```

---

### ALERT-06: RQ Worker Silent — No Jobs Completed in 10 min

**Severity:** critical • **MTTD target:** <30 min • **Grafana UID:** `worker-silent`

**Trigger expression**
```
docugardener_queue_size{queue_name="default"} > 0
  AND  increase(docugardener_jobs_completed_total[10m]) == 0
  for 10m
```

This is the "harder" worker-down signal — queue is backing up and completion counter is flat. If ALERT-05 fired first, this one typically follows 5 minutes later.

**Typical symptoms**
- Same as ALERT-05 but with more evidence of a stuck worker rather than a missing one.
- A single extremely slow job (deep repo clone, huge LLM context) may also trigger this without the worker actually being broken.

**Diagnosis**

1. Follow worker logs live for 60 seconds:
   ```bash
   docker logs -f docugardener-worker
   ```
   - If you see activity but no "Result is Finished" → one job is hogging the worker.
   - If you see nothing → worker is dead.
2. Inspect what the worker is currently doing:
   ```bash
   docker exec docugardener-worker ps -ef | grep rq
   ```
3. Confirm the stale-job sweeper is running:
   ```bash
   docker logs docugardener-scheduler --tail 200 | grep -Ei "stale|sweeper"
   ```
   You should see a log line every 60 seconds.
4. Check for shallow-clone fallback loops or GitHub API timeouts:
   ```bash
   docker logs docugardener-worker --tail 500 2>&1 | grep -E "GitCommandError|timeout|shallow"
   ```

**Fix actions**

- **A — Worker truly silent:** restart as in ALERT-05 step A.
- **B — One runaway job:** find the job id from logs, then force-fail it:
  ```bash
  docker exec -it docugardener-worker python -c \
    "from rq.job import Job; import os, redis; \
     r=redis.from_url(os.environ['REDIS_URL']); \
     j=Job.fetch('<JOB_ID>', connection=r); j.cancel(); j.delete()"
  ```
  Then restart the worker so RQ cleans up its current execution slot.
- **C — Scheduler dead (stale sweeper not running):** restart it:
  ```bash
  docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
    restart scheduler
  ```
  The sweeper will transition any PROCESSING job older than `max_processing_time + 30s` to FAILED within 60 s.

---

## Stale Job Sweeper

The sweeper is the safety net for worker-crash scenarios and is defined in `src/jobs/stale_sweeper.py`.

- **Runs in:** `docugardener-scheduler`
- **Cadence:** `IntervalTrigger(seconds=60)`
- **Behaviour:** scans `Job` rows with `status=PROCESSING` and `updated_at < now - (max_processing_time + 30s)`, marks them `FAILED`, and emits a structured log line.
- **Recovery lag:** ≤ 60 s after a worker kill (SIGKILL or host crash).

**Verify it is healthy:**
```bash
docker logs docugardener-scheduler --tail 200 | grep -Ei "stale_sweeper|sweeper_tick"
```
A silent scheduler while PROCESSING jobs are piling up is itself an incident — restart with:
```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml restart scheduler
```

---

## Common Fixes Quick Reference

| Symptom | Likely cause | Fix command |
|---------|--------------|-------------|
| Worker container missing / crash-looping | `ENCRYPTION_KEY` unset, Redis password wrong, or image regression | `docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d --force-recreate worker scheduler` |
| `redis-cli ping` fails | Redis down or wrong password in env | `docker compose … restart redis` then restart worker + API |
| FastAPI crash on boot | `ENCRYPTION_KEY` missing (startup guard) | Set key in `.env.production`; `up -d --force-recreate docugardener worker scheduler` |
| Webhooks all 401 | `GITHUB_WEBHOOK_SECRET` mismatch | Update env; restart `docugardener`; redeliver from GitHub UI |
| Webhooks all 403 | GitHub App install revoked or private key missing | Verify `/app/secrets/github-app.pem`; re-install App on repo |
| Queue flat but worker alive | Idle — no producers. Not an incident | Verify with `llen rq:queue:default` and `llen rq:queue:high` |
| Queue climbing, worker alive | LLM rate limit or slow upstream | Check [ALERT-04](#alert-04-llm-error-rate-5); consider sidecar worker |
| DB migrate failure on deploy | Prisma migration drift | `docker logs docugardener-migrate`; fix and re-run with `docker compose … run --rm migrate` |
| Grafana alert never resolves | Metric stuck — Prometheus cannot scrape | `docker logs docugardener-prometheus --tail 50`; curl `http://docugardener:8000/metrics` from inside network |
| Weaviate 503 in job logs | Weaviate OOM / disk full | `docker logs docugardener-weaviate --tail 100`; `df -h /var/lib/docker` |
| 5xx storm right after deploy | Regression | `git checkout <previous-tag> && docker compose … up -d --build docugardener web` |

**Canonical worker restart (most common fix):**
```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
  restart worker scheduler
docker exec docugardener-redis redis-cli -a "$REDIS_PASSWORD" ping
docker logs docugardener-worker --tail 20
```

**Detect missing `ENCRYPTION_KEY`:**
```bash
docker logs docugardener 2>&1       | grep -i encryption_key
docker logs docugardener-worker 2>&1 | grep -i encryption_key
docker logs docugardener-scheduler 2>&1 | grep -i encryption_key
# Any match → the startup guard has tripped; set the env var and force-recreate.
```

**Grep patterns that are useful across services:**
| Pattern | Meaning |
|---------|--------|
| `grep -E "Traceback\|ERROR"` | Uncaught exceptions |
| `grep -Ei "timeout\|deadline"` | Upstream slowness |
| `grep -E "429\|529"` | LLM rate limit / overload |
| `grep -i "signature"` | GitHub webhook HMAC mismatch |
| `grep -i "startup guard"` | Missing required env var at boot |
| `grep -i "on_failure"` | RQ failure callback fired |

---

## Escalation Policy

| Severity | Who to notify | When | Channel |
|----------|---------------|------|---------|
| critical | Primary on-call (you) | Immediately on page | — |
| critical (unresolved >30 min) | Secondary on-call + engineering lead | 30 min after first page | Incident channel |
| critical (data loss / breach) | Founder + security lead | Immediately | Direct call + incident channel |
| warning | Primary on-call | Ack within 30 min, investigate within 2 h | Incident channel thread |
| warning (unresolved >4 h) | Secondary on-call | 4 h after first alert | Incident channel |
| info | Primary on-call | Next business day | Ticket only |

**Paging path:** Grafana → webhook (`GRAFANA_ALERT_WEBHOOK_URL`) → PagerDuty/Slack/email per the receiver wired to that URL.

**Status page:** if customer-visible for > 5 min, post a notice on the public status page (see `DG-SAAS-07` in `docs/backlog.md` for current URL).

---

## Post-Incident Checklist

Run through this after the alert auto-resolves:

1. **Confirm resolved:**
   - [ ] Alert in Grafana shows `Normal`.
   - [ ] Queue depth back under 20 (if queue alert).
   - [ ] Error rate back under 1% for 10 consecutive minutes.
   - [ ] Worker has logged at least one successful "Result is Finished" since fix.
2. **Update status page** if a public notice was posted — mark as resolved.
3. **Record the incident:**
   - Alert name, start/end time, customer impact, root cause, fix applied.
   - File under `docs/incidents/YYYY-MM-DD-<slug>.md`.
4. **Write a post-mortem** if:
   - Severity was critical **and** duration > 30 min, **or**
   - Customer data was at risk, **or**
   - Same alert fired ≥ 2 times in the last 7 days.
5. **Update this runbook** if you discovered a new failure mode or a better fix — append to the relevant alert section and mention it in the commit.
6. **File follow-up tickets** in `docs/backlog.md` for anything that would prevent recurrence (e.g. add a new alert, refactor, capacity upgrade).
7. **Verify backups are current:**
   ```bash
   docker exec docugardener-backup ls -lh /backups | tail -5
   ```
   Last backup should be < 24 h old per `backup-cron`.

---

## Appendix: Metric Catalogue

| Metric | Type | Source | Used by |
|--------|------|--------|---------|
| `docugardener_http_requests_total{status,path,method}` | counter | FastAPI middleware | ALERT-01 |
| `docugardener_webhooks_received_total` | counter | `src/api/webhooks.py` | ALERT-03 |
| `docugardener_webhooks_failed_total` | counter | `src/api/webhooks.py` | ALERT-03 |
| `docugardener_llm_requests_total{provider}` | counter | `src/agents/llm.py` | ALERT-04 |
| `docugardener_llm_errors_total{provider}` | counter | `src/agents/llm.py` | ALERT-04 |
| `docugardener_queue_size{queue_name}` | gauge | Prometheus scrape on FastAPI `/metrics` | ALERT-02, ALERT-05, ALERT-06 |
| `docugardener_jobs_completed_total` | counter | `src/worker/jobs.py` on success | ALERT-06 |

All metrics are scraped from `docugardener:8000/metrics` at 15 s resolution. The worker scrape target is provisioned in `docker/prometheus.yml` but currently commented out — worker-local metrics are emitted via Redis and surfaced by the API process.

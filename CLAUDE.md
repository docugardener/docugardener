# DocuGardener — Claude Agent Rules

> **Product:** AI-powered documentation drift detection and auto-fix for software teams.
> **Model:** AGPL open-source + SaaS-first. Stripe billing. No client-installed mode.
> **Stage:** Post-launch, active SaaS (2026-04-onwards).

---

## Stack

### Backend (Python/FastAPI)
- **Runtime:** Python 3.12, FastAPI, Uvicorn
- **Queue:** Redis + RQ (high/default priority queues)
- **DB:** PostgreSQL via SQLAlchemy + Alembic migrations; Prisma for web schema
- **Vector DB:** Weaviate (ephemeral RAG, zero-retention)
- **Auth:** GitHub App (JWT), Magic Link, Okta SSO/SAML
- **Secrets:** Infisical (dev + prod), `.env` locally
- **Entry:** `src/main.py`, workers via `src/worker/`

### Frontend (Next.js)
- **Framework:** Next.js 14 App Router, React, TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Auth:** NextAuth.js
- **Location:** `web/`

### VS Code Extension
- **Location:** `vscode-extension/`
- **Build:** `npm run compile && npm run package`

### Infrastructure
- **Docker:** `docker/docker-compose.yml` + `Makefile` targets
- **Docker host:** `unix://$HOME/.colima/default/docker.sock`
- **Helm:** `helm/` (Kubernetes deployment)
- **CI:** GitHub Actions (`.github/`)

---

## Test Commands & Baselines

| Suite | Command | Minimum |
|-------|---------|---------|
| Python unit+integration | `.venv/bin/pytest tests/unit/ tests/integration/ -q` | 1389+ passing, 0 failing |
| Python e2e | `E2E_ENABLED=1 pytest tests/e2e/ -m e2e -v -s` | All passing |
| Web (Vitest) | `cd web && npx vitest run` | 1063+ passing, 0 failing |
| Web e2e (Playwright) | `cd web && npx playwright test` | 0 regressions |
| TypeScript check | `cd web && npx tsc --noEmit` | 0 errors |

**A feature is NOT done until all suites pass with zero regressions.**

---

## Backlog & Specs

- **Canonical backlog:** `docs/backlog.md` (normalised format for agent use)
- **Active detail:** `docs/active/active-backlog.md` (historical record)
- **Specs:** `docs/specs/FEAT-XXX-<slug>.md`
- **Branch naming:** `feat/FEAT-XXX-slug`

---

## Code Conventions

### Python
- Type hints on every function signature — no bare `dict`, use TypedDict or dataclass
- Structured logging with correlation IDs — never `print()`
- HTTP error codes: 400 bad input, 401 unauth, 403 forbidden, 503 upstream down
- RQ jobs: always define `on_failure` callback; use `Retry(max=3, interval=[30,60,120])`
- All DB sessions via context manager — never leak `SessionLocal`

### TypeScript / Next.js
- No `any` — use proper types or `unknown` with narrowing
- API routes: always validate input with Zod before touching DB
- Prisma: use transactions for multi-table writes
- RBAC: every API route must check role (`ADMIN | VIEWER | AUDITOR | BILLING_ADMIN`)
- Feature gates: use `canAccessTenant()` from `@/lib/features` — never raw plan string comparison

### General
- No secrets in code or logs — use `os.getenv()` / `process.env`
- No TODO comments without a linked FEAT/BUG ID
- All new files: AGPL-3.0-or-later SPDX header

---

## Git Push Discipline (Actions Minutes Budget)

GitHub Actions minutes are a shared, finite resource. Every `git push` triggers a full CI run (~20 min). **Minimize pushes — local testing is the primary development loop.**

### Rules
1. **Never push a single fix in isolation.** Batch all related changes (feature + tests + docs + lint fixes) into one commit and one push.
2. **All suites must pass locally before any push.** Run the full table from "Test Commands & Baselines" above. If any suite fails locally, fix it before touching `git push`.
3. **Lint before push.** Always run `ruff check src/ tests/ --fix && ruff format src/ tests/` (Python) and `npx tsc --noEmit` (TypeScript) locally — never let CI catch a lint error.
4. **One push per logical unit of work.** A feature, a sprint, a bug — that's one push. Do not push intermediate "it compiles" states.
5. **Never push to investigate a test failure.** Reproduce and fix locally first. CI is for final verification, not debugging.
6. **Wait for CI to go green before the next push.** Never stack pushes — if CI is running, hold until it finishes.

### Default workflow
```
code → local tests → ruff/tsc → commit → local tests again → push
```
Push is the **last step**, not a checkpoint along the way.

### VPS testing while CI is failing

When CI is broken and you need the code on VPS to test, use one of these — **not** a normal push:

**Option A — skip CI on this push (zero minutes consumed):**
```bash
git commit -m "wip: test X on VPS [skip ci]"
git push origin main
# Then manually trigger deploy (no CI run needed):
gh workflow run deploy.yml --repo docugardener/docugardener
```

**Option B — deploy without any push (code already on main):**
```bash
gh workflow run deploy.yml --repo docugardener/docugardener
```
This SSHes to VPS and runs `git pull + docker compose up` against whatever is already on `main`. Zero CI minutes. Zero push required.

**Option C — deploy directly via SSH (fastest, truly zero Actions):**
```bash
ssh deploy@46.225.145.115 "cd /opt/docugardener && git pull origin main && docker compose --env-file /opt/docugardener/.env -f docker/docker-compose.prod.yml up --build -d"
```

Use `[skip ci]` in the commit message any time you're iterating on a VPS fix and CI is known-failing. Strip it from the final "clean" commit before the CI-passing push.

---

## Checkpoint Protocol (Mandatory)

The orchestrator **must pause** at these gates and wait for ✅:

| Gate | Trigger |
|------|---------|
| G1 — Plan | Before any file write |
| G2 — Migration | Before Alembic / Prisma migration |
| G3 — Docker ops | Before `docker-compose` build/restart |
| G4 — Test report | After all suites pass locally |
| G5 — Commit+Push | Before `git push` — confirm all suites green + batch complete |

---

## Docker / Dev Environment

```bash
# Start all services
make dev-up

# Check health
make dev-check

# Restart after backend change
make dev-restart

# Docker host (always set)
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
```

Container restart order: `db → redis → weaviate → docugardener (FastAPI) → worker → web`

**nginx rule:** any time backend container is recreated, restart web immediately.

---

## Security Rules (Non-Negotiable)

- All endpoints under `/api/` must have RBAC role check — no exceptions
- `ENCRYPTION_KEY` must be set before any service starts (startup guard in `src/main.py`)
- GitHub tokens: TTL enforced, never logged
- Tenant data: always scoped by `tenantId` in every DB query
- CORS: locked to `ALLOWED_ORIGINS` env var — no wildcard in prod

---

## Feature Size Reference

| Size | Scope | Orchestration |
|------|-------|--------------|
| S | 1–3 files, no new API | Orchestrator direct |
| M | 1 new endpoint or component | + 1 subagent |
| L | Cross-layer (FastAPI + Next.js + tests) | + backend-dev, frontend-dev, test-engineer |
| XL | New subsystem (e.g. new pipeline stage, new queue system) | Agent Teams — user enables manually |

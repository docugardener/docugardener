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

## Checkpoint Protocol (Mandatory)

The orchestrator **must pause** at these gates and wait for ✅:

| Gate | Trigger |
|------|---------|
| G1 — Plan | Before any file write |
| G2 — Migration | Before Alembic / Prisma migration |
| G3 — Docker ops | Before `docker-compose` build/restart |
| G4 — Test report | After all suites pass |
| G5 — Commit | Before `git commit` |

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

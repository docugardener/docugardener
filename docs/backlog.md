# DocuGardener — Agent Backlog

> **Canonical backlog for agent consumption.**
> Historical phases and completed work: see `docs/active/active-backlog.md`
> Specs: `docs/specs/FEAT-XXX-<slug>.md`

---

## Active Items

### Wave 2 — Infrastructure + CI/CD ✅ COMPLETE (2026-04-15)

### Post-Launch Bugs

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| BUG-01 | Phantom repos reappear in Settings → Repositories after navigation | S | P1 | ✅ done | — | — |

### Wave 4 — Growth Gate (≥50 paying tenants)

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| FEAT-005 | AGV-05 Policy Packs implementation (schema design ✅ FEAT-009 complete) | L | P1 | todo | — | docs/specs/FEAT-005-Agent-Governance-Module.md |
| FEAT-007 | AGV-06 Risk-class controls | L | P2 | todo | — | docs/specs/FEAT-005-Agent-Governance-Module.md |
| FEAT-008 | SDLC-DES-01 Post-deploy verification design doc | S | P2 | todo | — | — |

### Wave 5 — Platform Moat (≥50 tenants + ≥3 months history + auth review)

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| FEAT-001 | MCP-01 DocuGardener MCP Server — all 5 spec gates must pass before start | XL | P2 | todo | — | docs/specs/FEAT-001-MCP-01-DocuGardener-MCP-Server.md |

---

## Done

| ID | Title | Completed |
|----|-------|-----------|
| INF-01 | Provision Hetzner VPS: Ubuntu 24.04, Docker, deploy user, SSH hardening | 2026-04-15 — IP 46.225.145.115 |
| INF-02 | Cloudflare DNS: A record docugardener.dev → Hetzner IP, TLS via Caddy | 2026-04-15 |
| INF-04 | GitHub Actions CD pipeline: SSH deploy → docker compose up --build → smoke test | 2026-04-15 — deploy with docugardener-ops key, 30m timeout |
| INF-05 | GitHub repo secrets: HETZNER_HOST, HETZNER_SSH_KEY wired; all prod env vars in /opt/docugardener/.env | 2026-04-15 |
| INF-06 | First live deploy to Hetzner: docugardener.dev live, user signed in, repo sync working | 2026-04-15 |
| CI-FIX-01 | Fix pip-audit flags (--require-hashes + --severity invalid in 2.10.0) → pip-audit --skip-editable \|\| true | 2026-04-15 |
| CI-FIX-02 | Fix e2e: PORT=3001 npm start + PLAYWRIGHT_BASE_URL=http://localhost:3001 + NEXT_PUBLIC_DEV_LOGIN=true at build | 2026-04-15 |
| CI-FIX-03 | Fix deploy smoke test: curl -sf + \|\| echo "000" produced STATUS=000000 → use -s, drop fallback | 2026-04-15 |
| CI-FIX-04 | Fix Trivy CRITICAL/HIGH CVEs: add apt-get upgrade -y in Dockerfile production stage | 2026-04-15 |
| GH-APP-01 | GitHub App swap: personal app 3390449 → org app 3391474 (DocuGardener-main under docugardener org) | 2026-04-15 — tenant DB updated: appId, privateKey, webhookSecret, installationId=124270429 |
| SEC-01 | Rotate all live credentials (test keys only in local sandbox) | 2026-04-14 |
| SEC-02 | Bulk-add AGPL-3.0-or-later SPDX headers — all Python + TypeScript files | 2026-04-14 |
| SEC-03 | Fix docker-compose.yml: env-substitute POSTGRES_PASSWORD + extract Smee URL to env var | 2026-04-14 |
| SEC-04 | Fix helm/docugardener/Chart.yaml: license annotation → AGPL-3.0-or-later | 2026-04-14 |
| SEC-05 | Verify .gitignore covers secrets/, .env*, *.pem | 2026-04-14 |
| SEC-OWN-01 | Owner console two-factor protection: OWNER_ACCESS_TOKEN + HMAC-SHA256 cookie | 2026-04-14 — spec at docs/specs/SEC-OWN-01-owner-console-two-factor.md |
| PUB-01 | Git init → first clean commit → push to github.com/docugardener (private) | 2026-04-14 |
| PUB-02 | Billing stub: BILLING_ENABLED flag; pricing blurred; upgrade buttons → waitlist; billing page gated | 2026-04-14 |
| PUB-03 | ORGA-01: domain docugardener.dev registered + GitHub org exists + DNS verified | 2026-04-14 — Cloudflare full config pending INF-02 |
| FEAT-010 | DG-SAAS-06 Signup & Onboarding UX rework | 2026-04-14 — spec at docs/specs/FEAT-010-DG-SAAS-06-Signup-Onboarding-UX.md |
| FEAT-006 | PKG-07 In-product upgrade context cards (free→paid conversion UX) | 2026-04-14 |
| FEAT-004 | DG-SAAS-09 Post-launch monitoring baseline (alerting, SLA checks, runbook) | 2026-04-14 — runbook at docs/runbook.md |
| FEAT-009 | AGV-04 Policy Pack Schema design | 2026-03-14 — spec at docs/specs/FEAT-009-AGV-04-Policy-Pack-Schema.md |
| FEAT-002 | ORGA-01 Domain registration (docugardener.dev registered) | 2026-04-14 — GitHub org exists; DNS + GWS pending (→ INF-02, INF-03) |

> Full completed history: `docs/active/active-backlog.md` (Phases 1–13 + all sprints)

---

## Priority Notes

- **BUG-01 (phantom repos)** — Root cause: sync API sets `enabled: false` for repos removed from the installation (`updateMany`), but the settings server component fetches ALL repos with no `enabled` filter. After sync the client state is correct (response only includes synced repos), but on next navigation the server re-renders and passes all DB rows as `initialRepos`, phantoms included. **Validated fix — 2 files, no migration:**
  1. `web/app/api/repos/route.ts` — replace the blanket `updateMany(enabled: false)` with: `deleteMany` repos not in installation that have **no jobs** (safe — no FK constraint); keep `updateMany(enabled: false)` for repos that do have jobs (preserves history). Validated: `Job → Repository` has no `onDelete: Cascade` so a naive delete would throw FK error on repos with jobs.
  2. `web/app/dashboard/settings/page.tsx` — add `enabled: true` to the `allRepos` query. Consistent with existing behaviour: the upsert in sync already forces `enabled: true`, so Sync is already the source of truth; the Disable toggle is session-scoped.
  - Option (a) adding a new schema field was considered but rejected: migration is safe but blast radius is 7+ files (settings × 2, repos route, reports, risk-zones, audit export) plus an ongoing "must remember" filter burden on all future repo queries.
- **Wave 2 is COMPLETE** — production is live at docugardener.dev as of 2026-04-15.
- **GitHub App** is DocuGardener-main (ID 3391474) under the `docugardener` org, installationId 124270429.
- **CI is green** (or in-flight for final fix push 95bffe1 after e2e/smoke-test/Trivy fixes).
- **FEAT-001 MCP-01** downgraded P0→P2. Gate requires ≥50 active tenants + 3mo history. Re-evaluate post-launch.
- **INF-03** (Google Workspace) still pending — not blocking production.

---

## Size Reference

| Size | Scope | Orchestration |
|------|-------|--------------|
| S | 1–3 files, no new API | Orchestrator direct |
| M | 1 new endpoint or component | + 1 subagent |
| L | Cross-layer (FastAPI + Next.js + tests) | + backend-dev, frontend-dev, test-engineer |
| XL | New subsystem | Agent Teams — user enables manually |

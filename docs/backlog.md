# DocuGardener — Agent Backlog

> **Canonical backlog for agent consumption.**
> Historical phases and completed work: see `docs/active/active-backlog.md`
> Specs: `docs/specs/FEAT-XXX-<slug>.md`

---

## Active Items

### Wave 2 — Infrastructure + CI/CD *(primary blocker — no Hetzner yet)*

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| INF-01 | Provision Hetzner VPS: Ubuntu 24.04, Docker, ufw rules, SSH hardening | M | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-02 | Cloudflare DNS + full config: A record docugardener.dev → Hetzner IP | S | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-03 | Google Workspace: verify info@docugardener.dev + aliases operational | S | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-04 | GitHub Actions CD pipeline: build api/web/worker → GHCR → SSH deploy → smoke test | M | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-05 | GitHub repo secrets: HETZNER_SSH_KEY, HETZNER_HOST, OWNER_EMAIL, CRON_SECRET + all prod env vars | S | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-06 | DG-SAAS-04 Production deployment: first live deploy to Hetzner via CI/CD | L | P0 | todo | — | docs/active/active-backlog.md |

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

- **Wave 2 is the sole remaining blocker** — no code work is pending; all gates are infrastructure.
- **INF-01** (Hetzner VPS) must be done before INF-02, INF-04, INF-05, INF-06.
- **INF-02** Cloudflare config is partially done (DNS verified); full config requires Hetzner IP.
- **FEAT-001 MCP-01** downgraded P0→P2. Gate requires ≥50 active tenants + 3mo history. Re-evaluate post-launch.
- **SEC-01** test credentials in local sandbox; rotate before prod deploy (INF-06).

---

## Size Reference

| Size | Scope | Orchestration |
|------|-------|--------------|
| S | 1–3 files, no new API | Orchestrator direct |
| M | 1 new endpoint or component | + 1 subagent |
| L | Cross-layer (FastAPI + Next.js + tests) | + backend-dev, frontend-dev, test-engineer |
| XL | New subsystem | Agent Teams — user enables manually |

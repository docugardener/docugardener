# DocuGardener — Agent Backlog

> **Canonical backlog for agent consumption.**
> Historical phases and completed work: see `docs/active/active-backlog.md`
> Specs: `docs/specs/FEAT-XXX-<slug>.md`

---

## Active Items

### Wave 0 — Pre-commit Security (do before `git init`)

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| SEC-01 | Rotate all live credentials (Gemini, Stripe, HMAC, SMTP, GitHub webhook secret, encryption keys) | S | P0 | todo | — | docs/specs/SEC-publish-readiness.md |
| SEC-02 | Bulk-add AGPL-3.0-or-later SPDX headers — all Python + TypeScript files | S | P0 | todo | — | docs/specs/SEC-publish-readiness.md |
| SEC-03 | Fix docker-compose.yml: env-substitute POSTGRES_PASSWORD + extract Smee URL to env var | S | P0 | todo | — | docs/specs/SEC-publish-readiness.md |
| SEC-04 | Fix helm/docugardener/Chart.yaml: license annotation BUSL-1.1 → AGPL-3.0-or-later | S | P0 | todo | — | docs/specs/SEC-publish-readiness.md |
| SEC-05 | Verify .gitignore covers secrets/, .env*, *.pem; confirm clean state before first commit | S | P0 | todo | — | docs/specs/SEC-publish-readiness.md |

### Wave 1 — Git Init + Publish-Ready Code

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| PUB-01 | Git init → first clean commit → push to github.com/docugardener (private) | S | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| PUB-02 | Billing stub: BILLING_ENABLED flag + waitlist form; upgrade buttons → waitlist; Stripe routes → 404 | M | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| PUB-03 | ORGA-01: verify domain (docugardener.dev) + GitHub org config complete | S | P0 | todo | — | docs/specs/PUB-01-github-publish.md |

### Wave 2 — Infrastructure + CI/CD

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| INF-01 | Provision Hetzner VPS: Ubuntu 24.04, Docker, ufw rules, SSH hardening | M | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-02 | Cloudflare DNS: A record docugardener.dev → Hetzner IP | S | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-03 | Google Workspace: verify info@docugardener.dev + aliases operational | S | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-04 | GitHub Actions CD pipeline: build api/web/worker → GHCR → SSH deploy → smoke test | M | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-05 | GitHub repo secrets: HETZNER_SSH_KEY, HETZNER_HOST, OWNER_EMAIL, CRON_SECRET + all prod env vars | S | P0 | todo | — | docs/specs/PUB-01-github-publish.md |
| INF-06 | DG-SAAS-04 Production deployment: first live deploy to Hetzner via CI/CD | L | P0 | todo | — | docs/active/active-backlog.md |

### Wave 3 — Post-Launch Essentials (Day 1–14)

| ID | Title | Size | Priority | Status | Branch | Spec |
|----|-------|------|----------|--------|--------|------|
| FEAT-010 | DG-SAAS-06 Signup & Onboarding UX rework | L | P1 | todo | — | docs/specs/FEAT-010-DG-SAAS-06-Signup-Onboarding-UX.md |
| FEAT-006 | PKG-07 In-product upgrade context cards (free→paid conversion UX) | M | P1 | todo | — | docs/active/active-backlog.md |
| FEAT-004 | DG-SAAS-09 Post-launch monitoring baseline (alerting, SLA checks, runbook) | M | P1 | todo | — | docs/active/active-backlog.md |

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
| FEAT-009 | AGV-04 Policy Pack Schema design | 2026-03-14 — spec at docs/specs/FEAT-009-AGV-04-Policy-Pack-Schema.md |
| FEAT-002 | ORGA-01 Domain registration (docugardener.dev registered) | 2026-04-14 — GitHub org exists; DNS + GWS pending (→ INF-02, INF-03) |

> Full completed history: `docs/active/active-backlog.md` (Phases 1–13 + all sprints)

---

## Priority Notes

- **FEAT-001 MCP-01** was P0 — downgraded to P2. Gate G3 requires ≥50 active tenants with ≥3 months history. Production has not launched yet. Re-evaluate after 3 months post-launch.
- **FEAT-009 AGV-04** was open — closed. Design document exists and is complete at `docs/specs/FEAT-009-AGV-04-Policy-Pack-Schema.md`.
- **FEAT-002 ORGA-01** split: domain registration is done; remaining steps (DNS, GWS) captured as INF-02 + INF-03.
- **SEC-01 through SEC-05** are hard gates — no `git init` until all five are resolved.
- **PUB-02 billing stub** is required before public launch — Stripe checkout is currently fully wired, not stubbed.

---

## Size Reference

| Size | Scope | Orchestration |
|------|-------|--------------|
| S | 1–3 files, no new API | Orchestrator direct |
| M | 1 new endpoint or component | + 1 subagent |
| L | Cross-layer (FastAPI + Next.js + tests) | + backend-dev, frontend-dev, test-engineer |
| XL | New subsystem | Agent Teams — user enables manually |

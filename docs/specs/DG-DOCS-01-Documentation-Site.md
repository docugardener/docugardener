# DG-DOCS-01 — Documentation Site

**Status:** Spec complete · Implemented (27/27 pages done; 1 P2 page deferred — kubernetes)
**Priority:** P1 · Effort: XL
**Date:** 2026-03-30 · **Updated:** 2026-03-30

---

## Motivation

DocuGardener is shipping as AGPL open-source + SaaS-first. Both audiences need documentation:
- **SaaS users** — how to connect GitHub, use the triage inbox, configure billing, invite teammates
- **Self-hosters / contributors** — how to run the stack locally or in production, environment variables, architecture, contributing guide

No public docs exist today. All knowledge lives in internal specs and DEPLOYMENT.md. This creates friction for both acquisition and open-source adoption.

---

## Site Architecture

### Hosting
Docs live at `/docs` within the existing Next.js app — same domain, consistent design, no extra hosting. Layout uses `DocsLayout` (sidebar nav + content area) wrapping static TSX pages.

### URL Structure

```
/docs                              → Overview & what is DocuGardener
/docs/quickstart                   → Get started with SaaS (< 5 min)
/docs/self-hosting                 → AGPL self-hosting guide ★ P0
/docs/self-hosting/prerequisites   → System requirements
/docs/self-hosting/github-app      → Manual GitHub App setup
/docs/self-hosting/environment     → All environment variables
/docs/self-hosting/docker          → Docker Compose production
/docs/self-hosting/kubernetes      → Helm chart (TEAM/Enterprise)
/docs/self-hosting/upgrades        → Upgrading between versions

/docs/user-guide                   → User guide index
/docs/user-guide/drift-detection   → How drift detection works
/docs/user-guide/triage-inbox      → Using the triage inbox
/docs/user-guide/auto-fix          → Auto-fix & AI Author Mode
/docs/user-guide/repositories      → Connecting & managing repos
/docs/user-guide/notifications     → Slack & email notifications
/docs/user-guide/policies          → Documentation policies (YAML)
/docs/user-guide/team              → Team & RBAC
/docs/user-guide/billing           → Plans, billing, cancellation
/docs/user-guide/agent-governance  → Cross-vendor agent instructions

/docs/developer                    → Developer guide index
/docs/developer/architecture       → System architecture overview
/docs/developer/api-reference      → REST API reference
/docs/developer/webhooks           → GitHub webhook events
/docs/developer/environment        → All env vars (complete reference)
/docs/developer/contributing       → Contributing guide (AGPL)
/docs/developer/testing            → Running tests
```

---

## Navigation Component

`DocsLayout` sidebar groups:
```
Getting Started
  ├─ Overview
  ├─ Quick Start (SaaS)
  └─ Self-Hosting Guide

User Guide
  ├─ Drift Detection
  ├─ Triage Inbox
  ├─ Auto-Fix & AI Author Mode
  ├─ Repositories
  ├─ Notifications
  ├─ Documentation Policies
  ├─ Team & RBAC
  ├─ Billing
  └─ Agent Governance

Developer Guide
  ├─ Architecture
  ├─ API Reference
  ├─ Webhooks
  ├─ Environment Variables
  ├─ Contributing
  └─ Running Tests

Self-Hosting
  ├─ Prerequisites
  ├─ GitHub App Setup
  ├─ Environment Variables
  ├─ Docker Compose
  ├─ Kubernetes / Helm
  └─ Upgrading
```

---

## Implementation Plan

### DG-DOCS-01-A — Infrastructure ✅ DONE
- [x] `web/components/docs/DocsLayout.tsx` — sidebar + content layout
- [x] `web/components/docs/DocsSidebar.tsx` — collapsible nav groups
- [ ] `web/components/docs/DocsBreadcrumb.tsx` — breadcrumb component *(deferred)*
- [x] `web/app/docs/layout.tsx` — Next.js layout wrapping DocsLayout
- [x] Add "Docs" link to `MarketingHeader` (between FAQ and Sign In)

### DG-DOCS-01-B — Getting Started ✅ DONE
- [x] `web/app/docs/page.tsx` — overview / what is DocuGardener
- [x] `web/app/docs/quickstart/page.tsx` — SaaS quick start (5 steps)
- [x] `web/app/docs/self-hosting/page.tsx` — self-hosting overview ★

### DG-DOCS-01-C — Self-Hosting Deep Dive ✅ DONE (Kubernetes P2 deferred)
- [x] `web/app/docs/self-hosting/prerequisites/page.tsx`
- [x] `web/app/docs/self-hosting/github-app/page.tsx` ← **✅ 2026-03-30**
- [x] `web/app/docs/self-hosting/environment/page.tsx`
- [x] `web/app/docs/self-hosting/docker/page.tsx`
- [ ] `web/app/docs/self-hosting/kubernetes/page.tsx` ← **P2 deferred (TEAM/Enterprise)**
- [x] `web/app/docs/self-hosting/upgrades/page.tsx` ← **✅ 2026-03-30**

### DG-DOCS-01-D — User Guide ✅ DONE (9/9 pages)
- [x] `web/app/docs/user-guide/page.tsx` — index
- [x] `web/app/docs/user-guide/drift-detection/page.tsx`
- [x] `web/app/docs/user-guide/triage-inbox/page.tsx`
- [x] `web/app/docs/user-guide/auto-fix/page.tsx`
- [x] `web/app/docs/user-guide/repositories/page.tsx` ← **✅ 2026-03-30**
- [x] `web/app/docs/user-guide/notifications/page.tsx` ← **✅ 2026-03-30**
- [x] `web/app/docs/user-guide/policies/page.tsx` ← **✅ 2026-03-30**
- [x] `web/app/docs/user-guide/team/page.tsx`
- [x] `web/app/docs/user-guide/billing/page.tsx` ← **✅ 2026-03-30**
- [x] `web/app/docs/user-guide/agent-governance/page.tsx` ← **✅ 2026-03-30**

### DG-DOCS-01-E — Developer Guide ✅ DONE (7/7 pages)
- [x] `web/app/docs/developer/page.tsx` — index
- [x] `web/app/docs/developer/architecture/page.tsx` ← **✅ 2026-03-30**
- [x] `web/app/docs/developer/api-reference/page.tsx` ← **✅ 2026-03-30**
- [x] `web/app/docs/developer/webhooks/page.tsx` ← **✅ 2026-03-30**
- [x] `web/app/docs/developer/environment/page.tsx` ← **✅ 2026-03-30**
- [x] `web/app/docs/developer/contributing/page.tsx`
- [x] `web/app/docs/developer/testing/page.tsx` ← **✅ 2026-03-30**

---

## Acceptance Criteria

- [x] `/docs` renders with sidebar navigation and consistent design
- [x] `/docs/self-hosting` is complete with all commands, env vars, and deployment steps
- [x] "Docs" link appears in MarketingHeader
- [x] All pages are statically rendered (no data fetching)
- [ ] Mobile-responsive sidebar (collapses to top nav on mobile)
- [x] No P1 sidebar links return 404 (all 7 P1 pages shipped 2026-03-30)
- [x] All developer guide pages complete (architecture, api-reference, webhooks, environment, testing) — shipped 2026-03-30
- [ ] P2: `kubernetes/page.tsx` — Helm chart guide (TEAM/Enterprise) — deferred post-prod

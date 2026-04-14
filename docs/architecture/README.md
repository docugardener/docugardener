# DocuGardener — Software Architecture Document Pack

> **Version:** 1.0 | **Date:** 2026-03-12 | **State:** Current Implementation + Known Gaps
> **Audience:** Technical stakeholders, due diligence reviewers, founder reference
> **Supersedes:** `docs/DocuGardener_Software_Architecture_Specification.md` (V1 monolith draft)

---

## Overview

This SAD pack provides a comprehensive, code-verified architectural description of DocuGardener — a CI-native documentation drift detection platform for regulated industries.

The pack follows an arc42-inspired structure decomposed into four focused documents, each targeting specific stakeholder concerns.

## Document Index

| # | Document | Scope | Key Audiences |
|---|----------|-------|---------------|
| **SAD-01** | [System Context & Architecture Overview](SAD-01-System-Context.md) | Business context, stakeholders, constraints, C4 Level 1+2, quality goals, architectural decision records (ADRs) | CTO, investors, technical due diligence |
| **SAD-02** | [Component & Data Architecture](SAD-02-Component-Data-Architecture.md) | C4 Level 3 decomposition, data model (ERD), API contracts, integration map, analysis pipeline, vector DB architecture | Backend engineers, security reviewers |
| **SAD-03** | [Deployment & Operations](SAD-03-Deployment-Operations.md) | Infrastructure topology (dev/prod/K8s), Docker Compose, Helm chart, CI/CD pipelines, monitoring, disaster recovery, **Hetzner scaling & failover roadmap** | DevOps, SREs, on-prem customers |
| **SAD-04** | [Security & Compliance Architecture](SAD-04-Security-Compliance.md) | Authentication flows, RBAC, encryption at rest, zero-retention proof, audit hash chain, GDPR/SOC2 posture, threat model, risk register | Security auditors, enterprise buyers, compliance |

## Reading Guide

- **For a 15-minute executive overview:** Read SAD-01 sections 2-6 (business context through C4 Level 2)
- **For technical due diligence:** Read all four documents sequentially
- **For security review:** Start with SAD-04, then SAD-02 sections 5 (integrations) and 6 (pipeline)
- **For deployment planning:** SAD-03 covers all three deployment modes + Hetzner scaling roadmap (Section 9)
- **For API integration:** SAD-02 section 4 has the complete endpoint catalog

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    DocuGardener Platform                     │
│                                                             │
│  ┌──────────────────┐    ┌───────────────────────────────┐  │
│  │  Control Plane    │    │  Analysis Plane               │  │
│  │  (Next.js 14)     │    │  (Python FastAPI)             │  │
│  │                   │    │                               │  │
│  │  - Dashboard UI   │    │  - Webhook ingestion          │  │
│  │  - Auth (NextAuth)│    │  - AST parsing (tree-sitter)  │  │
│  │  - Billing/Stripe │    │  - LLM verification (2-stage) │  │
│  │  - Audit logging  │    │  - Notification dispatch      │  │
│  │  - Team mgmt      │    │  - SAML SSO + SCIM 2.0       │  │
│  │  - Settings       │    │  - Plugin check API           │  │
│  └────────┬─────────┘    └──────────┬────────────────────┘  │
│           │     Shared PostgreSQL    │                       │
│           └──────────┬───────────────┘                       │
│                      │                                       │
│  ┌──────────┐  ┌─────┴─────┐  ┌────────────┐               │
│  │ Valkey   │  │ PostgreSQL│  │ Weaviate   │               │
│  │ (Queue)  │  │ (Data)    │  │ (Vectors)  │               │
│  └──────────┘  └───────────┘  └────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Key Numbers (as of 2026-03-12)

| Metric | Value |
|--------|-------|
| Python backend modules | 17 core packages |
| Next.js API routes | 30+ endpoints |
| Python unit tests | 704 passing |
| Vitest unit tests | 381 passing |
| Playwright E2E tests | 37/51 passing |
| Prometheus metrics | 20+ custom metrics |
| Audit event types | 21 |
| External integrations | 9 (GitHub, Stripe, Slack, Jira, Linear, Resend, SAML IdP, SCIM, Ollama) |
| Deployment modes | 3 (Docker dev, Docker prod, Helm K8s) |

## Known Gaps Summary

| Priority | Count | Key Items |
|----------|-------|-----------|
| P0 (Critical) | 1 active | Secret material in repository (remediation in progress) |
| P1 (High) | 2 active | GitHub token TTL (SEC-08), Valkey in prod compose (OPS-02) |
| P2 (Medium) | 3 active | Account linking, execution mode taxonomy, deploy workflow |

Full gap analysis: [SAD-04 Section 8](SAD-04-Security-Compliance.md#8-known-security-gaps--risk-register)

## Related Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Product Specification | `docs/DocuGardener_Product_Specification.md` | Features, pricing, market context |
| Master Backlog | `docs/specs/DocuGardener_Implementation_Backlog.md` | All work items, acceptance criteria |
| SA Assessment | `docs/specs/Deep Code Review - SA Assessment Mar 2026.md` | Code review findings (input to SAD-04 gaps) |
| Production Playbook | `docs/Production-Infrastructure-Playbook.md` | Ops runbook, infrastructure decisions |
| Deployment Guide | `docs/DEPLOYMENT.md` | Step-by-step self-hosting |
| Troubleshooting | `docs/TROUBLESHOOTING.md` | Common issues + remediations |
| GTM Strategy | `docs/specs/GTM-09-SaaS-First-Bootstrap-Strategy.md` | Go-to-market decision record |

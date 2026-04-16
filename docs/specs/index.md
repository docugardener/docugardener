# DocuGardener Product Specifications

Master index of detailed feature specifications for the "MVP to Enterprise" roadmap.

## 📚 Specification Library

| ID | Title | Scope | Status |
|----|-------|-------|--------|
| [EPIC-01](epic-01-admin.md) | **Enterprise Administration ("Control Plane")** | Admin Dashboard, GitHub App Onboarding, User Management, Billing. | ✅ Drafted · 🟢 Mostly Implemented |
| [EPIC-02](epic-02-security.md) | **Security & Compliance** | BYOK (Bring Your Own Key), Multi-tenancy Architecture, Data Residency. | ✅ Implemented (Secure Vault & Encryption) |
| [EPIC-03](epic-03-workflow.md) | **Workflow & Integrations** | Slack/Jira Notifications, Config Templates (`.github/docugardener.yml`). | ✅ Fully Implemented |
| [EPIC-04](epic-04-dx.md) | **Developer Experience (DX)** | "Fix it for me" Button (GitHub Suggestions), IDE Pre-flight Check. | 🟢 DX-01 Implemented · DX-02 Pending |
| _(inline)_ | **Agentic Scale ("Deflection" Model)** | Fast Path, Bot Filtering, Auto-Heal, Confidence Intervals, Nightly Rollups. | ✅ SCALE-01/02/03/04/05 All Implemented |
| _(strategy)_ | [**DocuGardener Strategic Refactoring Ideas - Mar 2026**](DocuGardener%20Strategic%20Refactoring%20Ideas%20Mar%202026.md) | Business model challenge, tiering, GTM, monetization, legal/compliance, competitor framing. | ✅ Drafted |
| _(prompt)_ | [**DocuGardener Owner Review Prompt - Strategic Refactoring Mar 2026**](DocuGardener%20Owner%20Review%20Prompt%20-%20Strategic%20Refactoring%20Mar%202026.md) | Reusable owner-group prompt for accept/reject review, current-state mapping, and impact-sorted change selection. | ✅ Drafted |
| _(legal)_ | [**GTM-06 Legal Template Preparation - Mar 2026**](GTM-06%20Legal%20Template%20Preparation%20-%20Mar%202026.md) | DocuGardener-specific brief for DPA, ToS, Privacy Policy, subprocessor register, and AI governance note. | ✅ Drafted |
| _(strategy)_ | [**Phase 4 — Market Position Feature Specs**](Phase-4-Market-Position-Feature-Specs.md) | Detailed specs for market-strengthening features with user stories, monetization fit, and integration complexity. | ✅ Drafted |
| _(strategy)_ | [**Phase 5 — Agent Ecosystem Feature Specs**](Phase-5-Agent-Ecosystem-Feature-Specs.md) | Detailed specs for Agent Rules Compiler and DocuGardener MCP Server, including architecture fit, open-core boundary, monetization, and rollout order. | ✅ Drafted |
| _(strategy)_ | [**Phase 6 — AgentGardener Product Spec**](Phase-6-AgentGardener-Product-Spec.md) | Adjacent-product recommendation and high-level product specification for a cross-vendor agent instruction lifecycle and policy control plane, including market verification, GTM wedge, and 12-month build path. | ✅ Drafted |
| _(strategy)_ | [**GTM-09 — SaaS-First Bootstrap Strategy**](GTM-09-SaaS-First-Bootstrap-Strategy.md) | Decision record: drop OSS community edition, go SaaS-first. Acquisition channels, stability target, competitive moat ranking. | ✅ Drafted 2026-03-12 |
| _(strategy)_ | [**PlatformCloud Strategy & Commercial Flow Assessment - Mar 2026**](../Archive/PlatformCloud%20Strategy%20%26%20Commercial%20Flow%20Assessment%20-%20Mar%202026.md) | Decision-oriented assessment of SaaS-first vs self-hosted vs hybrid for the product family. **ARCHIVED 2026-03-30** — superseded by strategic pivot to AGPL SaaS-first. See Phase 12 in main backlog. | ⛔ Archived |
| _(distribution)_ | **Phase-8-Hybrid-Distribution-Model** | Hybrid client-installed distribution spec with PlatformCloud billing proxy. **ARCHIVED 2026-03-30** — PlatformCloud is frozen. | ⛔ Archived |
| [PH15](PH15-self-hosted-hardening.md) | **Phase 15 — Self-Hosted Hardening & Settings Readiness** | Platform LLM €10 cap, README self-hosted framing, SAML/SSO Okta prod validation, Agent Governance advisory framing, Helm OCI publish spike, Integrations failure surface. | 🔲 Planned — next sprint |
| [SEC-publish](SEC-publish-readiness.md) | **SEC — Public GitHub Publish Readiness** | Pre-publish audit findings + remediation. All B1–B5 blockers resolved 2026-04-16. M1–M3 / L1–L2 deferred. | ✅ Blockers resolved |

---

## 🏗️ Architecture Standards

* **Frontend**: Next.js 14+ (App Router), Tailwind CSS, Shadcn UI.
* **Backend**: Python FastAPI (Worker Nodes), Next.js API Routes (Control Plane).
* **Database**: PostgreSQL (User/Tenant Data), Redis (Queues).
* **Vectors**: Weaviate (Managed/Self-hosted).
* **Auth**: NextAuth.js (GitHub Provider).

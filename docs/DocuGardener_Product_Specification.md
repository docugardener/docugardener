# DocuGardener: Product Specification
>
> **CI-native documentation verification layer for docs-as-code teams.**
>
> _Sometimes described as "Grammarly for Documentation Drift" — but more precisely, a verification gate that lives in your pipeline._

## 1. Executive Summary

### The Problem

In modern DevOps, code moves fast. Documentation doesn't.
For FinTech, MedTech, and Enterprise SaaS, this gap isn't just "technical debt" — it is a **compliance risk**. Auditors demand accurate documentation, but manual updates are unreliable. When `api/payment.ts` changes but `docs/payments.md` doesn't, you have "Documentation Drift."

### The Solution

**DocuGardener** is an autonomous AI agent that lives in your CI/CD pipeline. It acts as an **Invisible Guardian**, reading every Pull Request to verify if documentation matches the code.

- **No Drift**: If code changes contradict documentation, the PR is blocked.
- **No Friction**: It suggests the exact fix in a comment.
- **No Risk**: It runs in an ephemeral, zero-retention environment.

**Value Prop**: _DocuGardener turns documentation from a "lagging chore" into a "guaranteed artifact."_

**Architecture principle**: Deterministic where possible, model-assisted where useful, auditable everywhere.

---

## 2. Engineering Principles

Stale docs break deployments. Undocumented API changes cause production incidents. Audit gaps create compliance risk. DocuGardener exists to eliminate all three.

DocuGardener operates on **Three Pillars**:

1. **Code-Coupling**: Docs are treated as a dependency of the code.
2. **Continuous Verification**: Truth is verified at the commit level, not the release level.
3. **Zero-Trust Security**: We assume your code is sensitive. We don't want to hold it.

These are engineering principles, not abstractions. Every feature traces back to at least one pillar.

### The Adoption Equation — Why Teams Use It (And How to Prevent Bypass)

Any mandatory gate in a development process will be bypassed under time pressure. This is not a technology problem — it is an organizational behavior problem. DocuGardener is designed to address this structurally.

**The bypass problem in plain terms:**

If "No Update Required" is a one-click dismiss for any severity level, teams under deadline pressure will always click it. Within weeks the tool becomes a notification with a close button, and documentation drift accumulates exactly as before.

**Where the real value lives — the auto-draft, not the gate:**

The primary value of DocuGardener is not enforcement — it is **eliminating the cost of writing documentation updates**. The Team Lead's decision changes from:

> _"I need to write/update these docs"_ -> skipped, costs 30-60 min, no accountability
>
> _"I need to merge this auto-generated doc PR"_ -> done in 30 seconds, full audit trail

When `autoHeal` is enabled for significant/critical drift, DocuGardener drafts the fix and creates a PR. The human just approves or closes it in GitHub — the same workflow they already use.

**Structural protections against bypass:**

| Mechanism | How it helps |
|---|---|
| Severity-gated blocking (`critical` + `significant` = `failure`) | Developers cannot merge without a documented decision |
| Required reason on "No Update Required" | Creates friction proportional to severity; discourages casual bypass; persisted for audit |
| Audit trail | Every ignored critical drift is timestamped and attributed; visible to management |
| Ignore rate metrics on Reports dashboard | Makes bypass behavior visible organizationally |
| `autoHeal` mode | Removes the work from the decision — merging a 2-line doc PR is not a burden |

As teams adopt AI coding tools (GitHub Copilot, Cursor, Devin), the volume of PRs increases without proportional increases in human review time. DocuGardener's **AI Author Mode** closes the loop entirely for AI-authored PRs: no human touchpoint required. The more AI coding adoption, the higher DocuGardener's ROI.

**The honest verdict:**

DocuGardener is valuable when positioned as a **documentation co-author**, not a documentation enforcer. Teams that understand this adopt it sustainably. Teams sold on it as "automatic docs compliance" bypass it within a sprint.

---

## 3. Core Capabilities

Capabilities are organized around two narratives: reducing developer friction (Platform Engineering) and producing auditable evidence for regulated teams (Compliance & Governance).

### Platform Engineering

These features reduce friction and prevent stale merges.

**PR Drift Detection & Surgical Fixes**

- Analyzes PR diffs to find code changes that impact documentation semantics.
- Deterministically flags renames or signature updates to functions/APIs.
- Instead of generic complaints ("Update your docs"), DocuGardener drafts the precise Markdown update and offers it as a "Apply Suggestion" snippet.

**Triage Inbox**

- A unified, high-performance queue to review, accept, or ignore documentation drift across all repositories. Features high-contrast semantic diffs, keyboard-driven navigation (`j`/`k`, `a`, `i`), and a focus-optimized Zinc palette.

**Auto-Fix PR (`autoHeal`)**

- When significant or critical drift is detected, DocuGardener drafts the documentation update and opens a PR. The developer just reviews and merges.

**AI Author Mode (Zero-Touch Documentation)**

- When code is generated by an AI assistant (Copilot, Cursor, etc.), DocuGardener detects the signature, automatically drafts the documentation update, and merges it once CI tests pass. No human intervention required.

**VS Code Extension (Pre-push Check)**

- Shift feedback left by running drift checks locally before pushing. DocuGardener's extension provides real-time diagnostics on staged changes, highlighting potential documentation conflicts directly in the editor.
- Backed by a stateless `/check` endpoint for instant semantic verification without repository cloning or database persistence.

**Git Diff Simulator**

- Real-time "Red Teaming" tool to paste raw Git Diffs and see how the bot would score them against current rules. Using a high-contrast mono interface optimized for the Soft Dark theme.

**Smart Language Parser & Context-Aware RAG**

- Automatically detects Python, TypeScript, Go, etc., regardless of file extension.
- Retrieves only the relevant documentation snippets, ignoring the noise.

**Holistic Scoring & Blast Radius**

- Calculates a "Blast Radius" for every change, weighting core system files higher than leaf files (like tests or docs). Ensures your team focuses on critical architectural drift first.

**Nightly Rollup Reports**

- An automated scheduler runs nightly at 02:00 UTC, aggregating all drift analysis jobs from the past 24 hours. For each repository with detected drift, a GitHub Issue is created summarizing the health of your documentation garden.

**Persona-First Interaction**

- Configurable "System Personalities" (e.g., "Strict Auditor" vs. "Helpful Librarian") via Gemini System Instructions to match your engineering culture.

**Prompt Engineering Playground**

- Direct override of system instructions per tenant to fine-tune AI verification strictness.

### Compliance & Governance

These features produce auditable evidence for regulated teams.

**Audit Log (SHA-256 Hash Chain)**

- Every verification job, triage decision, and dismiss action is cryptographically logged using a SHA-256 hash chain. Each event's hash incorporates the previous event's hash, making tampering detectable.

**Role-Based Access Control (4 Roles)**

- ADMIN, MEMBER, AUDITOR, BILLING_ADMIN. Permissions are enforced at every endpoint.

**Required Dismiss Reason**

- When a developer dismisses a critical or significant drift finding, they must provide a reason. This creates an evidence trail: every dismissed finding has an attributed justification, visible in the audit log.

**Compliance Export**

- One-click PDF export to prove to auditors: _"Every change to the Payment API in Q3 was accompanied by a verified documentation update."_

**SSO/SAML**

- Standard SSO integration for identity federation. Available on the Team plan.

**Session Management**

- Configurable idle timeout and session revocation for organizations with strict security policies.

**Ignore-Rate Analytics**

- Deep-dive reporting on bypass patterns, severity breakdowns, and triage trends. Makes bypass behavior visible to management before it becomes a compliance gap.

**Fleet Health Dashboard**

- A Bento-grid style view of all repositories, showing "Drift Velocity" and "Health Scores." Features a premium **Soft Dark** interface for high-performance monitoring.

**Billing & Usage Monitoring**

- Real-time token tracking and cost attribution across LLM providers, with hard budget guards to prevent unexpected spend.

**Prompt Guardrails**

- Domain-anchored prompts restrict LLM behavior to documentation verification tasks. Content validation rejects responses that deviate from expected output structure. Forbidden pattern detection prevents prompt injection and data exfiltration attempts.

**Legal Readiness**

- Data Processing Agreement (DPA), Terms of Service, and Privacy Policy are in preparation for launch.

---

## 4. Security Architecture
>
> _This is our primary moat against generic AI coding tools._

### Zero-Retention Architecture

- **Ephemeral By Design**: Code is cloned into a RAM-disk (tmpfs), analyzed, and wiped instantly after the job.
- **No Long-Term Storage**: We never store your source code in our database.

### BYOK (Bring Your Own Key)

- **Sovereign AI**: All plans support BYOK. Teams can plug in their own **Azure OpenAI**, **Vertex AI**, or **local Ollama** endpoints.
- **Trusted Agreements**: When using cloud BYOK, application traffic flows through _your_ enterprise agreement with Microsoft/Google, ensuring data privacy guarantees remain intact.
- **Local Model Support**: Teams that require full data sovereignty can run analysis against a local Ollama instance — no code leaves the network.

### Strict Multi-Tenancy

- **Namespace Isolation**: Vector embeddings are strictly partitioned by Tenant ID at the database level.
- **Context Middleware**: It is physically impossible for Client A to query Client B's data.

**Architecture principle**: Deterministic where possible, model-assisted where useful, auditable everywhere. Every security control is verifiable, not assumed.

---

## 5. Key Use Cases
>
> _We save you when it matters most._

### Target Documentation Types

DocuGardener's beachhead focus is on the documentation types most tightly coupled to code changes and most likely to cause production incidents when stale:

- **API docs** (Swagger/OpenAPI specifications)
- **Onboarding & setup docs** (README, getting-started guides, docker-compose instructions)
- **Runbooks** (incident response procedures, operational playbooks)
- **Architecture Decision Records** (ADRs)

### The "Broken API" Incident

- **Problem**: A developer adds a required parameter to the `POST /checkout` endpoint but forgets to update the Swagger docs.
- **Risk**: Integrators and Front-end teams push broken code based on stale docs.
- **DocuGardener Fix**: The PR is blocked instantly. _"Code signature changed in `checkout_api.py`. Please update `api_docs.md` before merging."_

### The "Compliance Panic"

- **Problem**: SOC2 Audit is next week. The CTO asks: "Is our architecture diagram up to date?" Everyone scrambles to manually check 50 repos.
- **Risk**: Failed audit or frantic, error-prone manual work.
- **DocuGardener Fix**: Access the **Compliance Export**. Download a PDF certifying that 100% of merged PRs this quarter had verified documentation updates. Sleep easy.

### The "New Hire" Onboarding

- **Problem**: A new Senior Engineer joins. They read the Wiki to set up the dev environment, but the commands are 6 months old and fail.
- **Risk**: Wasted weeks, frustration, and lost trust in internal knowledge.
- **DocuGardener Fix**: Because every `README.md` is drift-checked against the `docker-compose.yml`, the onboarding instructions are guaranteed to be executable and correct.

### Integrations

- **Jira Integration Lifecycle**: Connect your development tickets to your documentation. DocuGardener automatically extracts Jira ticket keys from PRs and posts status updates directly to the ticket, maintaining a compliance trail without manual Jira management.
- **Slack Notifications**: Channel-level alerts for drift events, triage actions, and nightly rollup summaries.

---

## 6. Plans & Pricing

> **⚠️ Canonical entitlement source:** The definitive plan × feature matrix lives in `docs/specs/DocuGardener_Implementation_Backlog.md` → §Feature × Plan Matrix (PO/SA validated 2026-03-08). This section provides a narrative summary. In case of conflict, the backlog matrix takes precedence and this section must be updated to match.

Pricing is structured around **repositories and PR analyses** as the primary dimensions, with seat limits as a secondary constraint.

**Try Pro free for 14 days on one private repo. No credit card required.**

### Free

_For open-source projects and individual developers._

| Dimension | Limit |
|---|---|
| Repositories | 1 public repo |
| PR analyses / month | 50 |
| Seats | 1 |

**Includes**: Core drift detection, triage inbox, auto-fix PR, AI author mode, VS Code pre-push check, BYOK (cloud + local Ollama), drift simulator, basic billing visibility.

### Pro ($29/mo)

_For growing teams that need integrations and analytics._

| Dimension | Limit |
|---|---|
| Repositories | 5 (public + private) |
| PR analyses / month | 500 |
| Seats | 10 |

**Adds**: Slack and Jira integrations, ignore-rate analytics, prompt engineering playground, nightly rollup digest, audit log (90-day retention), AUDITOR and BILLING_ADMIN roles.

### Team ($79/mo)

_For teams where security, identity, audit, and deployment sovereignty are requirements — not nice-to-haves._

| Dimension | Limit |
|---|---|
| Repositories | Unlimited |
| PR analyses / month | Unlimited |
| Seats | 100 |

**Adds**: SSO/SAML (Okta, Entra ID, Google Workspace), SCIM user provisioning, session idle timeout + session revocation, compliance evidence export (CSV/JSON for SOC 2 audits), environment profile export (`MODE-01`), drift coverage KPI + evidence timeline (`EVID-01`), sovereign / air-gap deployment, policy-pack inheritance with centralized governance (AGV-04 direction), priority support.

All plans include BYOK (cloud and local Ollama) and zero-retention architecture. Zero-config onboarding: link a repository and get your first drift analysis in under 3 minutes with no credit card required.

---

## 7. Strategic Roadmap

| Phase | Goal | Key Features | Status |
| :--- | :--- | :--- | :--- |
| **V1** | **Core Complete** | AI Author Mode, Jira/Slack Integrations, Admin Dashboard, BYOK Vault, Drift Detection, Triage Inbox. | Core functionality complete. Phase 0 launch hardening items remain. |
| **Phase 0** | **Launch Hardening** | Repo quota enforcement, PR quota visibility, FREE-tier LLM budget cap, billing KPI dashboard, private repo filtering. | Complete |
| **V2 (Enterprise)** | **Compliance & Scale** | Audit Log with hash chain (ENT-11), RBAC 4-role model (ENT-10), SSO/SAML + session management (ENT-12). Helm chart & OCI publishing (ENT-13) pending. | ENT-10/11/12 complete. ENT-13 in progress. |

---

## 8. Market Context

### Go-to-Market Motion

**Platform-led adoption, compliance-led expansion.** Individual developers and small teams adopt DocuGardener for the drift detection and auto-fix workflow (Free and Pro). Once embedded in CI, platform engineering and compliance teams expand to Team for audit logs, RBAC, SSO, and evidence export. The tool sells itself bottom-up; the compliance story closes the enterprise deal.

### Competitive Differentiation

DocuGardener wins on **CI-native verification + zero-retention architecture + cryptographic audit trail**. The closest comparable is Swimm, which is IDE-centric and focused on code-coupled documentation authoring. DocuGardener does not compete on docs-portal aesthetics against Mintlify or GitBook — those are publishing tools, not verification tools.

### Why Invest Now

1. **Regulatory Tailwinds**: AI regulation (EU AI Act) and tightening Fintech standards make "verified docs" mandatory, not optional.
2. **AI Fatigue**: Teams are tired of "Magic Code Generators" that hallucinate. They want **Verification** and **Guardrails**.
3. **First Mover**: No one else is focusing strictly on the _synchronization_ problem with a zero-retention promise.

---

## 9. Legal & Employment Compliance (Strategic Checklist)

> [!IMPORTANT]
> This section is a strategic internal checklist for the founder/owner regarding the transition from employment (EPAM) to independent product launch. It does not replace professional legal advice.

### 9.1 Intellectual Property (IP) Sovereignty

- [ ] **Hardware Isolation**: Verify 100% of code commits were made on personal hardware.
- [ ] **Temporal Isolation**: Verify all work occurred outside contracted employment hours (nights/weekends).
- [ ] **Task Independence**: Audit codebase to ensure no proprietary methods, internal EPAM prompts, or client-specific knowledge was utilized (referencing § 69b UrhG "Duty of Tasks").
- [ ] **Infrastructure Cleanliness**: Ensure zero use of employer-provided cloud credits (Azure/AWS/GCP), IDE licenses, or VPNs.

### 9.2 Employment & Competition

- [ ] **Nebentätigkeitsanzeige**: Formal submission of side-project notice to EPAM HR/Manager.
- [ ] **Conflict Analysis**: Verify DocuGardener is positioned as a _product/tool_ while employer is a _service provider_, avoiding direct competition for the same client projects.
- [ ] **Post-Contractual Non-Compete**: Review current contract for any clauses that might delay a full-time transition into the SaaS entity.

### 9.3 Business Entity & Liability

- [ ] **Entity Selection**: Evaluate **UG (haftungsbeschränkt)** vs **GmbH** to seal personal liability against technical failure risks.
- [ ] **Gewerbeanmeldung**: Register trade as a software producer/SaaS provider in the relevant German municipality.
- [ ] **Tax Identity**: Obtain a VAT ID (USt-IdNr.) and decide on _Kleinunternehmerregelung_ status based on initial revenue projection.

### 9.4 Compliance & Data Privacy (GDPR/DSGVO)

- [ ] **Data Processing Agreement (DPA)**: Establish a template for SaaS customers, especially regarding code analysis flows.
- [ ] **Impressum (Imprint)**: Prepare a legally compliant imprint for the landing page per § 5 TMG.
- [ ] **Privacy Policy**: Draft a comprehensive policy covering ephemeral data handling and zero-retention promises.
- [ ] **VAT MOSS**: Configure billing pipeline (e.g., via Stripe/Paddle) to handle international VAT requirements for digital services.

# Phase 7 — Agent Governance Module

Date: 2026-03-14
Revised: 2026-03-14

Status:
- approved strategic direction
- high-level product specification
- **Pre-production items (AGV-01–04) complete 2026-03-14**
- Post-production items (AGV-05–10) gated on ≥50 paying tenants

Internal codename: `AgentGardener`

Positioning: **DocuGardener Agent Governance** — a platform module, not a separate product.

---

## 1. Executive Summary

The next major expansion of DocuGardener is not another documentation feature and not a standalone product. It is:

> A cross-vendor **Agent Instruction Lifecycle and Policy Control Plane**, shipped as the **Agent Governance module** inside DocuGardener.

The codebase already contains the nucleus:
- `RULES-01` Agent Rules Compiler (4 formats: `AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules/docugardener.mdc`, `CLAUDE.md`) — complete as of 2026-03-14
- Preview, propose-as-PR, staleness detection, artifact storage, and settings UI are production-ready
- AGV-01–04 pre-production work complete; cross-vendor positioning established

Existing implementation:
- `src/rules/compiler.py` — deterministic instruction compiler (4 formats)
- `src/rules/formats/` — `agents_md.py`, `copilot.py`, `cursor_rules.py`, `claude_md.py`
- `src/api/rules.py` — REST endpoints for compile/preview/propose
- `src/jobs/rules_staleness.py` — daily staleness cron
- `web/components/settings/AgentRulesPanel.tsx` — 4-tab UI (Agent Governance)
- `web/components/settings/AgentRulesPanel.tsx` — 2-tab settings UI
- Prisma `RulesArtifact` model — artifact persistence

This is not speculative. It extends working code into a broader category with meaningful whitespace.

---

## 2. Market Verification

### 2.1 What major players already cover

#### GitHub / Cursor / Anthropic

These vendors provide the primitives:
- Repository instructions and `AGENTS.md` behavior ([GitHub Docs](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions))
- Copilot Spaces ([GitHub Docs](https://docs.github.com/en/copilot/concepts/context/spaces))
- Copilot Memory ([GitHub Docs](https://docs.github.com/en/copilot/concepts/agents/copilot-memory))
- Claude Code MCP connectivity ([Claude Code Docs](https://code.claude.com/docs/en/mcp))
- Cursor workspace/team rules

Interpretation:
- Vendors are giving teams building blocks
- They are not yet owning the cross-vendor lifecycle management problem

#### Broad agent governance

- MuleSoft positions AI Agent Governance for enterprise agent control ([MuleSoft](https://www.mulesoft.com/platform/ai/ai-agent-governance))

Interpretation:
- A broad "govern all enterprise agents" category is forming
- Entering head-on from scratch would be expensive and diluted

#### AI SRE / incident automation

- incident.io ([incident.io](https://incident.io/ai-sre))
- PagerDuty Runbook Automation ([PagerDuty](https://www.pagerduty.com/platform/automation/runbook/))
- Rootly AI SRE ([Rootly](https://rootly.com/sre/rootly-ai-sre-faster-incident-response-automation))

Interpretation: Mature operational platforms. Direct competition would be misguided.

#### API governance

- Redocly ([Redocly](https://redocly.com/api-governance))

Interpretation: Mature market. Not the best whitespace.

### 2.2 What remains under-served

The gap is not "agent features." The gap is:

> One governed control plane that manages how multiple coding-agent ecosystems should behave inside a software organization.

Specifically:
- How instruction artifacts are generated and stay in sync
- How they are reviewed and approved
- How conflicting agent instructions are detected
- How sensitive repos get stricter agent constraints
- How evidence of agent-policy changes is tracked

This is narrower than generic agent governance and more actionable for the same buyers who already need DocuGardener.

### 2.3 Market decision

Best adjacent module: **Agent Governance** (codename AgentGardener)

Not recommended:
- Generic MCP gateway / broad agent governance
- AI SRE / incident automation
- Standalone API governance
- Generic team memory/context tool

### 2.4 Addressable Market Sizing

**Target profile:** Engineering organizations with 50+ developers using 2+ AI coding tools (Copilot + Claude Code, Copilot + Cursor, etc.) across 10+ repositories.

Order-of-magnitude estimate:
- ~500K companies globally use GitHub (source: GitHub 2024 reports)
- ~15–20% of enterprise teams actively use AI coding assistants (growing 30–50% YoY)
- ~5–10% of those use 2+ AI coding tools simultaneously
- Rough addressable: **5,000–10,000 organizations** as of mid-2026

Near-term serviceable market (GitHub-heavy, English-speaking, compliance-aware):
- **~1,000–2,000 organizations**

Revenue model impact:
- At $79/mo Team tier, 100 paying tenants = ~$95K ARR
- Agent Governance features drive Pro→Team upgrades (2–3× ARPU lift)
- Governance features (policy packs, approval workflows) justify Enterprise tier ($199+/mo)

**Timing assessment:** The market is early but growing fast. Starting now allows us to establish position before vendors absorb this layer. If multi-tool adoption doubles by 2027 (likely), we're 12 months ahead.

---

## 3. Why Now

Three forces converging:

1. AI-assisted development is becoming default rather than optional
2. Coding-agent behavior is increasingly configured through repo-native files and external context systems
3. Platform and security teams now need to control AI behavior across vendors, not just inside one editor

The market is in an unstable but open stage:
- Big vendors have primitives
- Enterprises already feel the governance pain
- Few products own the lifecycle problem end-to-end

Starting now lets DocuGardener occupy this focused category before it collapses into generic agent platforms.

---

## 4. Why Us

### 4.1 Existing policy model

The platform already has: repo-linked policy, documentation obligations, severity, escalation behavior, plan-gated governance surfaces. Stronger starting point than building from zero.

### 4.2 Existing GitHub control plane

GitHub App integration, PR creation, repo settings, audit log, tenant model, role model — exactly the substrate required for instruction lifecycle management.

### 4.3 Existing implementation

The platform ships a meaningful subset today: deterministic compiler, artifact records, preview, propose-as-PR, daily staleness check, settings UI. The wedge is proven, not imagined.

### 4.4 Credible product narrative

DocuGardener already stands for verification, guardrails, auditability, and CI-native truth enforcement. Agent Governance inherits that positioning naturally.

---

## 5. Why Not the Other Options

### 5.1 Not generic AI SRE
Crowded (incident.io, PagerDuty, Rootly). Different buyer motion. Operationally heavier. Moves away from core strength.

### 5.2 Not standalone API governance
Already mature. Many incumbents. Too narrow if separated from DocuGardener.

### 5.3 Not broad MCP governance
Major enterprise platforms converging. Security surface too large for first expansion. Drifts into infrastructure abstraction.

### 5.4 Not generic context/memory tool
Vendors already provide primitives. Weak differentiation. Low buyer urgency vs policy control.

---

## 6. Product Vision

### 6.1 Problem

As organizations adopt Copilot, Claude Code, Cursor, and internal agents:
- Instruction files multiply across repos
- Rules diverge across tools
- Local agent behavior drifts from CI rules
- Nobody can answer which instructions are authoritative
- Sensitive repos lack stronger agent constraints
- Policy changes are not governed or auditable

Result: inconsistent agent behavior, unsafe AI workflows, duplicated admin work, no credible compliance story.

### 6.2 Solution

DocuGardener's Agent Governance module provides a central policy layer for coding agents. It turns agent instructions from handcrafted repo files into governed, generated, monitored artifacts.

### 6.3 Value Proposition

> DocuGardener gives platform teams one source of truth for how coding agents should behave — across repositories, vendors, and risk levels.

### 6.4 Product Pillars

1. **Policy First** — agent behavior comes from governed policy, not scattered manual files
2. **Vendor-Aware, Vendor-Neutral** — compile once, apply across ecosystems
3. **Drift Visible** — instruction artifacts can be stale, conflicting, or bypassed; the product shows that
4. **Governed by Default** — policy changes, exceptions, and generated updates are attributable and reviewable
5. **Close to the Repo** — GitHub-native workflows, no separate developer universe

---

## 7. Personas and Jobs-to-Be-Done

### Platform Engineering
- **Job:** Standardize coding-agent behavior across repos and tools
- **Pain:** Multiple instruction formats, no synchronization, no safe way to scale AI coding norms

### Security / Compliance
- **Job:** Ensure agents do not operate without guardrails in sensitive code areas
- **Pain:** Unclear control surface, no audit trail of instruction changes, no explainable governance

### Engineering Leadership
- **Job:** Scale AI-assisted development without losing trust or control
- **Pain:** Inconsistent agent outputs, hidden local agent behavior, rising quality variance

### Developer Experience / Developer Productivity
- **Job:** Reduce surprise failures and align agents with CI expectations
- **Pain:** Agents do one thing locally, CI demands another; repeated prompt writing across tools

---

## 8. Scope Boundaries

### In Scope
- Coding-agent instruction generation and lifecycle management
- Instruction drift detection
- Cross-vendor instruction compilation
- Policy inheritance and reuse (org → team → repo)
- Approval / exception flows for instruction changes
- Evidence and reporting on instruction state
- Repository risk-class-based agent rules

### Out of Scope (Initial)
- Generic enterprise agent gateway
- Incident response orchestration
- Observability automation
- Full MCP marketplace / registry
- Standalone memory/search assistant
- Path-level granular controls (deferred to later quarters — see Section 9.2.C)

---

## 9. Core Capabilities

### 9.1 Foundation — Already Present in DocuGardener

- Deterministic instruction compilation for `AGENTS.md` and `.github/copilot-instructions.md`
- Artifact persistence (Prisma `RulesArtifact` model)
- Preview and propose-as-PR
- Daily staleness checks (`src/jobs/rules_staleness.py`)
- 2-tab settings UI (`AgentRulesPanel.tsx`)

This is the seed, not the final product.

### 9.2 Required Extensions

#### A. Multi-Format Instruction Lifecycle

Add target formats:
- `.github/instructions/*.instructions.md` (GitHub Copilot custom instructions)
- `.cursor/rules/*` (Cursor workspace/team rules)
- `CLAUDE.md` (Claude Code project instructions)
- Future vendor formats via adapter pattern

Need: format-specific renderers, capability matrix by vendor, deprecation/version handling.

**Priority:** Front-loaded to Q2 to reduce platform commoditization risk (see Section 12).

#### B. Policy Packs and Inheritance

Support:
- Org-wide base policies
- Team-level overlays
- Repo-level overrides
- Restricted override zones (org admin can lock certain rules)

Need: inheritance model, effective-policy preview, conflict resolution rules.

**Architecture note:** Effective policy calculation must be fast enough for webhook-triggered compilation. For an org with 200 repos × 3 inheritance levels × 5 vendor formats = 3,000 evaluations per staleness cron. Requires caching with invalidation on policy-pack changes.

#### C. Risk-Class Controls

**Initial scope (Q2):** Tag repos with risk class (Low / Medium / High). Apply different policy packs per class. Example: High-risk repos (auth, billing, infra) get stricter agent guardrails — suggestion-only mode, mandatory human review.

**Deferred (Q4+):** Path-level granularity within repos. The combinatorial complexity (path patterns × risk classes × agent vendors × inheritance levels) is high and requires the policy-pack model to be stable first.

#### D. Drift and Conflict Detection

Detect:
- Generated files modified manually (hash mismatch)
- Instruction files out of sync with active policy
- Conflicting instructions across multiple artifacts in the same repo
- Policy contradictions across vendors (e.g., AGENTS.md says "always add tests", Cursor rule says "skip tests for small changes")

#### E. Governance and Approval Workflow

Support:
- Propose update PR (existing)
- Approval requirement for high-risk policy changes
- Exception reason capture when bypassing generated policy
- Audit log of policy and artifact history (extends existing ENT-11 audit)

#### F. Agent Surface Inventory

Provide:
- Inventory of active agent instruction artifacts per repo
- Which agent ecosystems are configured per repo
- Which repos are uncovered (no agent instructions at all)
- Which repos are stale (instructions older than policy)
- Dashboard view with coverage percentage and drift indicators

#### G. Feedback and Quality Analytics

Reuse `FEED-01` and future signals to show:
- Which policies correlate with false positives
- Which repos ignore or override generated instructions
- Which agent surfaces create the most conflict
- Net effectiveness score per policy pack

#### H. Future Layer — Live Agent Context (MCP)

This is where `MCP-01` fits later:
- Not as the first expansion
- As a second layer after policy semantics are mature
- Read-only context queries via MCP protocol

---

## 10. Product Packaging

### Module, Not Standalone Product

Ship as a module inside the DocuGardener platform:
- Same brand, same billing, same onboarding
- Shared GitHub App, policy engine, audit model, auth, billing, and settings
- Lower distribution cost
- Cross-sell from existing DocuGardener users

**External positioning:** "DocuGardener — Agent Governance" (not "AgentGardener")

**Internal codename:** AgentGardener (for backlog items, branch names, internal communication)

### Plan Gating

| Capability | FREE | PRO | TEAM | ENTERPRISE |
|---|---|---|---|---|
| Agent Rules (2 formats, per-repo) | 1 repo | All repos | All repos | All repos |
| Multi-vendor compilation (3+ formats) | — | — | All repos | All repos |
| Policy packs & inheritance | — | — | Yes | Yes |
| Risk-class controls | — | — | Yes | Yes |
| Governance approvals & exceptions | — | — | — | Yes |
| Agent surface inventory | — | Basic | Full | Full |
| Drift/conflict detection | — | Basic | Full | Full |
| MCP live context (future) | — | — | — | Yes |

### Standalone Product Conditions (revisit later)

Promote to standalone branding only when:
- Agent Governance revenue exceeds 40–50% of total DocuGardener revenue
- Buyer persona diverges (pure AI platform teams who don't care about docs)
- 200+ paying tenants and bandwidth for two GTM motions

Until then: one product, expanding surface area (like Datadog's module model).

---

## 11. Platform Risk and Defensibility

### 11.1 Platform Risk

The spec's biggest risk: GitHub, Cursor, or Anthropic build the management layer natively.

Specific threats:
- **GitHub** already has org-level custom instructions and iterates fast on Copilot governance. "Org instruction policy packs with inheritance" is one product cycle away for them.
- **Cursor** is moving toward team/workspace rules. Their `.cursor/rules` are already team-shareable.
- Any single vendor shipping "sync instructions across repos" as a native feature would erode single-vendor compilation value.

### 11.2 Mitigation Strategy

Our moat is **not** "we compile AGENTS.md." It is:

1. **Cross-vendor** — no single vendor will build management for competitors' instruction formats
2. **Governance evidence** — audit trail + governed artifacts = compliance value vendors won't prioritize
3. **Drift detection across ecosystems** — requires understanding multiple formats simultaneously

The 12-month build path front-loads cross-vendor support to Q2 specifically to reduce single-vendor commoditization risk.

### 11.3 Defensibility (Compounding Advantages)

Three moats that strengthen over time:

1. **Feedback loop** — FEED-01 data accumulates; new entrants start from zero. Every thumbs-up/down on a generated instruction makes the next compilation smarter.
2. **Policy-as-code corpus** — once orgs encode their agent policies in our inheritance model, switching costs are real. Migrating 50 policy packs with 3 inheritance levels is non-trivial.
3. **Compliance evidence chain** — audit log + governed artifacts + exception tracking = vendor lock-in for regulated teams. A SOC2 auditor who accepts DocuGardener evidence won't want to re-validate a new tool.

---

## 12. 12-Month Build Path

### Quarter 1 — Productize + Second Format

**Goal:** Turn RULES-01 from a feature into a product surface. Add at least one more vendor format to establish cross-vendor positioning early.

**Deliverables:**
- Product narrative update: "Documentation + Agent Governance" positioning
- UX polish on existing rules workflow (AgentRulesPanel)
- `.cursor/rules` format adapter (second vendor — establishes cross-vendor story)
- Policy-pack data model design (schema + API contract)
- Agent surface inventory: basic dashboard showing coverage and staleness per repo
- Features page and marketing update

**Success criteria:**
- ≥30% of existing tenants enable agent rules on ≥1 repo within 30 days of announcement
- 2 vendor formats compiling correctly
- Agent surface inventory visible in dashboard for all TEAM+ tenants

### Quarter 2 — Policy Packs, Governance, and Third Format

**Goal:** Move from per-repo compilation to centralized control. Add third vendor format.

**Deliverables:**
- Org-level policy packs with repo inheritance and overrides
- `CLAUDE.md` format adapter (third vendor)
- Repo risk-class tagging (Low/Medium/High) with per-class policy packs
- Policy change approval flow (require review for High-risk repos)
- Conflict detection: contradictions between instruction files in same repo
- Richer audit history for policy changes (extends ENT-11)

**Success criteria:**
- ≥3 tenants using org-level policy packs
- Median time to apply policy change across 10 repos < 5 minutes
- 3 vendor formats compiling correctly
- High-risk repos visually distinguished in inventory dashboard

### Quarter 3 — Full Cross-Vendor + Drift Intelligence

**Goal:** Make the module definitively cross-vendor. Add drift intelligence.

**Deliverables:**
- `.github/instructions/*.instructions.md` format adapter (fourth vendor surface)
- Cross-vendor conflict detection (e.g., AGENTS.md vs CLAUDE.md contradictions)
- Vendor format version handling and deprecation warnings
- Drift dashboard: manual-edit detection (hash mismatch), staleness trends, conflict rate
- Exception tracking: log and report when teams bypass generated policy
- Effective-policy preview: "show me what this repo's agents will actually see"

**Success criteria:**
- ≥4 vendor formats actively compiled per tenant (for TEAM+ tenants)
- Drift detection catches ≥80% of manual instruction edits within 24h
- Exception bypass rate visible per tenant in governance dashboard

### Quarter 4 — Intelligence and MCP Foundation

**Goal:** Make Agent Governance intelligent and begin MCP design.

**Deliverables:**
- Analytics: instruction drift trends, exception patterns, policy effectiveness scores
- Uncovered-repo recommendations ("these 12 repos have no agent instructions")
- False-positive / conflict learning loop from FEED-01 and rule usage data
- Policy effectiveness correlation: which policy packs produce lowest false-positive rates
- Scoped design for read-only MCP context layer (architecture + API contract, no implementation)
- Path-level risk controls design (architecture only — implementation in next cycle)

**Success criteria:**
- Net retention rate for Agent Governance-active tenants ≥10% higher than non-active
- ≥5 tenants using analytics to refine their policy packs
- MCP design document reviewed and approved
- Agent Governance contributes ≥20% of Pro→Team upgrade conversions

---

## 13. GTM Wedge

### Primary wedge

Sell to the same teams that already feel DocuGardener pain:
- Platform engineering
- Security engineering
- Compliance-aware engineering leadership

### Message

> "Your coding agents are already being configured. DocuGardener makes that configuration governed, synchronized, and reviewable — across every tool your team uses."

### Entry use case

Start with:
- GitHub-heavy teams using Copilot plus at least one other agent ecosystem
- Teams already struggling with AI coding standardization
- Teams wanting local agent behavior aligned with CI expectations

### Commercial path

1. Existing DocuGardener customer enables Agent Rules for one repo (FREE/PRO)
2. Sees value in sync + propose + staleness across repos
3. Upgrades to TEAM for policy packs, inheritance, and multi-vendor compilation
4. Expands to ENTERPRISE for governance approvals, exception tracking, and eventually live MCP context

### Why it works as a module, not a product

- Shared budget line with documentation governance
- Same buyer persona, same procurement motion
- One product with expanding surface = stronger story than two thin products
- Cross-sell is automatic — every DocuGardener tenant sees Agent Governance in their settings

---

## 14. Why This Module Can Win

DocuGardener's Agent Governance does not need to beat GitHub, Cursor, or Anthropic at their own platforms.

It solves the layer they cannot own:
- **Cross-vendor coordination** — no vendor will manage competitors' formats
- **Lifecycle management** — generate, propose, approve, monitor, evidence
- **Policy inheritance** — org → team → repo, with override controls
- **Governance and evidence** — audit trail, exception tracking, compliance reporting
- **Risk-aware instruction control** — different rules for different repo sensitivity levels

It benefits from a powerful asymmetry:
- The primitives are becoming standard (more vendors = more instruction files)
- The management problem gets worse as adoption increases
- That favors a focused control-plane module

---

## 15. Success Metrics

### Adoption
| Metric | Q1 Target | Q2 Target | Q4 Target |
|---|---|---|---|
| Repos with managed agent artifacts | 50 | 200 | 1,000 |
| % of connected repos with ≥1 governed artifact | 10% | 25% | 50% |
| Tenants using 2+ vendor formats | — | 10 | 50 |
| Tenants using policy packs | — | 3 | 20 |

### Governance
| Metric | Q2 Target | Q4 Target |
|---|---|---|
| % of artifacts in sync (not stale) | 70% | 85% |
| % of High-risk repos with stricter rules | 50% | 80% |
| Policy changes proposed vs manually bypassed | 3:1 | 5:1 |

### Business
| Metric | Q2 Target | Q4 Target |
|---|---|---|
| Attach rate (DocuGardener → Agent Governance enabled) | 20% | 40% |
| Pro→Team conversion influenced by Agent Governance | 10% | 20% |
| Agent Governance contribution to expansion revenue | 15% | 30% |

### Quality
| Metric | Baseline | Q4 Target |
|---|---|---|
| CI surprises from local agent/CI mismatch | unmeasured | ≥30% reduction (self-reported) |
| Manual instruction maintenance hours/mo | unmeasured | ≥50% reduction (self-reported) |
| False-positive rate in generated artifacts | FEED-01 baseline | ≤15% |

---

## 16. Recommended Next Steps

1. **Adopt Agent Governance as the official Phase 7 direction** in the DocuGardener backlog.
2. **Update platform narrative** from "documentation verification" to "truth and governance for AI-native software delivery."
3. **Re-scope RULES-01 roadmap** from feature completion to productization (Q1 deliverables).
4. **Prioritize `.cursor/rules` adapter** as the Q1 second-format target (highest adoption after GitHub).
5. **Delay broad MCP ambitions** (MCP-01) until policy packs and governance semantics are stable (Q4 design only).
6. **Keep OpsGardener** / operational truth verification as a later-track exploration, not the next expansion.
7. **Do not create a separate brand** until Agent Governance revenue exceeds 40% of total.

---

## 17. Sources

- GitHub repository instructions and `AGENTS.md`: [GitHub Docs](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- GitHub Copilot Spaces: [GitHub Docs](https://docs.github.com/en/copilot/concepts/context/spaces)
- GitHub Copilot Memory: [GitHub Docs](https://docs.github.com/en/copilot/concepts/agents/copilot-memory)
- Claude Code MCP: [Claude Code Docs](https://code.claude.com/docs/en/mcp)
- incident.io AI SRE: [incident.io](https://incident.io/ai-sre)
- PagerDuty Runbook Automation: [PagerDuty](https://www.pagerduty.com/platform/automation/runbook/)
- Rootly AI SRE: [Rootly](https://rootly.com/sre/rootly-ai-sre-faster-incident-response-automation)
- MuleSoft Agent Governance: [MuleSoft](https://www.mulesoft.com/platform/ai/ai-agent-governance)
- Redocly API Governance: [Redocly](https://redocly.com/api-governance)

---

## Appendix A — Revision History

| Date | Change | Author |
|---|---|---|
| 2026-03-14 | Original spec as "Phase 6 — AgentGardener Product Spec" | Alexey Kopachev |
| 2026-03-14 | Refactored per SA review: repositioned as DocuGardener module (not standalone product); added TAM sizing (Section 2.4); added platform risk and defensibility analysis (Section 11); front-loaded cross-vendor to Q1–Q2; descoped path-level controls to Q4+; replaced descriptive success criteria with measurable targets; added plan-gating matrix; added standalone-product conditions | Alexey Kopachev, SA Review |

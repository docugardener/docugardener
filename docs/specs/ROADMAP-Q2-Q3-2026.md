# DocuGardener — Q2–Q3 2026 Roadmap

> **Created:** 2026-04-17
> **Planning horizon:** April 17 → September 30, 2026 (~23 weeks)
> **Team capacity:** 1–2 people (including owner)
> **Hard external deadline:** EU AI Act GPAI obligations — **August 2, 2026**
> **Ordering principle:** Revenue-first → compliance window → moat-deepening
> **Scope discipline:** Must-haves only. Nice-to-haves listed at the end and deferred.

## Context & Source of Truth

This roadmap is derived from:
- `docs/specs/AUDIT-01-Pre-Launch-Critical-Audit.md` — pre-launch critical audit (2026-04-16)
- `docs/specs/SA-MANAGED-AGENTS-01-Assessment.md` — LLM optimization section (LLM-OPT-01..05)
- `PORTFOLIO-01-Cross-Project-Investment-Analysis.md` — portfolio focus decision
- 10-point 12-month forsee analysis (SME/PO review, 2026-04-17)

**Epic selection:** The Product Owner selects epics from this roadmap into the active backlog manually, one at a time. **Do not mass-import** items from this document into `docs/backlog.md`.

---

## Roadmap at a Glance

| # | Epic | Quarter | Size | Forsee Point |
|---|------|---------|------|--------------|
| 1 | Onboarding + Marketplace Launch | Q2 (April) | L | #5 TAM |
| 2 | Funnel Instrumentation | Q2 (April) | M | #5 TAM |
| 3 | Observability Foundation | Q2 (May) | M | #9 Tech Debt |
| 4 | LLM-OPT-01 Prompt Caching | Q2 (May) | M | #3 Commoditization |
| 5 | EU AI Act Compliance Pack | Q2 (May–June) | L | #4 AI Act |
| 6 | AI Act Audit Log Export | Q2 (June) | M | #4 AI Act |
| 7 | Enterprise Tier Launch | Q3 (July) | M | #8 Pricing |
| 8 | Claude Code MCP Server | Q3 (July) | M | #1, #7 Agents |
| 9 | LLM-OPT-03 Parallel Entities | Q3 (August) | M | #3 Commoditization |
| 10 | Helm Chart Publication | Q3 (August) | S | #2 Mintlify |
| 11 | Cross-Repo Drift Prototype | Q3 (August–September) | L | #6 R&D Frontier |
| 12 | State of Documentation Drift 2026 Report | Q3 (September) | M | #10 Category |
| 13 | AI Author Mode Quality Pass | Q3 (September) | M | #2 Mintlify |

**Decision gate at end of Q3:** <50 paying customers → evaluate pivot to API contract drift.

---

## Q2 — Revenue Activation + Compliance Window (April–June 2026)

The only quarter where the EU AI Act deadline is binary. Miss it, lose the enterprise window for 12 months.

### EPIC-01 — Onboarding + GitHub Marketplace Launch
**Forsee:** #5 TAM | **Size:** L | **Target weeks:** April 17 – May 8 (3 weeks)

**Why now:** Everything else is theoretical until the first paying customer lands. Audit identified zero onboarding funnel as P0.

**Scope:**
- 3-step install wizard: Connect GitHub App → Pick repos → Trigger sample analysis
- Flip `BILLING_ENABLED=true` in production, verify Stripe checkout end-to-end
- GitHub Marketplace listing (logo, screenshots, category selection, billing integration)
- Empty-state dashboard copy that nudges to first analysis
- Welcome email sequence (Day 0, Day 1, Day 3, Day 7)
- "First drift detected" celebration moment (PR comment + email)

**Success metric:** First paying PRO customer within 21 days of Marketplace listing.

**Depends on:** CI pipeline hardening (audit P0 — can ship in parallel).

---

### EPIC-02 — Funnel Instrumentation
**Forsee:** #5 TAM | **Size:** M | **Target weeks:** April 24 – May 1 (parallel with EPIC-01)

**Why now:** Every subsequent decision depends on real conversion data. Flying blind is not acceptable past week 4.

**Scope:**
- Event schema: `install_started`, `install_completed`, `first_analysis_triggered`, `first_drift_detected`, `pr_comment_viewed`, `repo_limit_hit`, `upgrade_prompt_shown`, `upgrade_clicked`, `subscription_started`
- PostHog or self-hosted Plausible — pick one in 1 day, do not debate for a week
- Weekly funnel dashboard: install → first analysis → repo limit → upgrade
- Cohort tracking by install week

**Success metric:** Weekly funnel report auto-generated every Monday.

---

### EPIC-03 — Observability Foundation
**Forsee:** #9 Tech Debt | **Size:** M | **Target weeks:** May 1 – 15 (2 weeks)

**Why now:** RQ queue depth, LLM latency, and webhook backpressure are the three failure modes that will break before month 6. You cannot debug what you don't measure.

**Scope:**
- Grafana dashboards: RQ queue depth by priority, LLM call p50/p95/p99 latency by provider, webhook processing time, Weaviate query latency, DB connection pool utilization
- PagerDuty hooks for: RQ queue >100 items >5min, webhook 429s from GitHub, LLM provider 5xx rate >5%, stale jobs not being swept
- Weekly operational review doc (5 minutes to write, captures what broke)
- Stale-job sweeper metrics exposed (from RQ-STAB-02 already shipped)

**Success metric:** Every production incident detected by alerting before a customer reports it.

---

### EPIC-04 — LLM-OPT-01 Prompt Caching
**Forsee:** #3 LLM Commoditization | **Size:** M | **Target weeks:** May 15 – 29 (2 weeks)

**Why now:** Margin insurance before scaling. The `verifier.py` two-stage pipeline sends the same system prompts + tool definitions 4× per PR. Prompt caching cuts inference cost 40–70% immediately.

**Scope:**
- Anthropic: add `cache_control: {type: "ephemeral"}` on system + tool blocks (explicit, 1,024+ token minimums)
- OpenAI: confirm automatic caching is active (prompt structure ≥1,024 tokens — already is)
- Gemini: already implicit, no change needed; validate 90% discount appearing on bills
- BYOK users: caching respects their keys, add "cache hit rate" to usage dashboard
- Verify cache effectiveness via cost-per-analysis metric week-over-week

**Success metric:** 40%+ reduction in LLM cost per analysis within 2 weeks of deploy.

**Explicitly deferred:** LLM-OPT-02 (Batch API), LLM-OPT-04 (model tier selection), LLM-OPT-05 (streaming). Ship OPT-01 alone and measure.

**Reference:** `docs/specs/SA-MANAGED-AGENTS-01-Assessment.md` Section 8.

---

### EPIC-05 — EU AI Act Compliance Pack
**Forsee:** #4 AI Act | **Size:** L | **Target weeks:** May 22 – July 3 (6 weeks) — **MUST SHIP BEFORE AUGUST 2**

**Why now:** GPAI obligations binding August 2, 2026. This is the single highest-leverage competitive moment of the year. Most competitors will miss it.

**Scope:**
- `/trust` public page with: DPA (Data Processing Addendum), Sub-processor list, Model cards for each supported LLM provider, Risk assessment summary, Data retention policy, Incident response commitments
- Model cards per provider: Gemini Flash, Claude Haiku/Sonnet, GPT-4.1, Ollama — intended use, limitations, bias notes, training data transparency as published by vendors
- Human-in-the-loop attestation: "DG proposes changes; humans merge PRs" — document as Article 14 compliance
- Customer-facing one-pager: "DocuGardener & the EU AI Act" — PDF sales asset
- Update ToS + Privacy Policy with AI Act language

**Success metric:** By July 15, can answer "are you AI Act compliant?" in an enterprise RFP with "yes, here's the link."

**Does NOT need:** external legal review as blocker. Ship a credible v1 based on public guidance; upgrade after first enterprise customer demands it.

---

### EPIC-06 — AI Act Audit Log Export
**Forsee:** #4 AI Act + #8 Enterprise | **Size:** M | **Target weeks:** June 12 – 26 (2 weeks)

**Why now:** Article 12 requires tamper-evident logs. ENT-11 hash-chained audit log already exists — need customer-facing export.

**Scope:**
- Audit export formats: JSON (default), CSV (human-readable), AI Act template (structured for regulator queries)
- Include: every LLM call (provider, model, token count, cost), every auto-merge decision, every policy violation, every rule change, every user action
- Signed export with tenant public key (proves tamper-evidence)
- API endpoint `/api/audit/export?format=ai_act&from=X&to=Y` — feature-gated to TEAM+

**Success metric:** Audit export is the demo moment in every enterprise call.

---

## Q3 — Moat Deepening + Category Definition (July–September 2026)

Revenue is flowing. Focus shifts from "will they pay?" to "why do we win?"

### EPIC-07 — Enterprise Tier Launch
**Forsee:** #8 Pricing | **Size:** M | **Target weeks:** July 3 – 24 (3 weeks)

**Why now:** Procurement teams ignore sub-$500/mo tools. Enterprise tier unlocks logos that would otherwise never evaluate DG.

**Scope:**
- New plan: **ENTERPRISE @ $1,199/mo** or **$11,988/yr** (one price, stop debating)
- Includes: SSO (Okta already shipped), SLA 99.9% uptime with credits, dedicated onboarding (1 hour Zoom), priority support channel, audit log retention 7 years, custom policy engine rules, quarterly business review
- Checkout flow: inbound "Contact sales" form → manual Stripe invoice (no self-serve for enterprise, preserves positioning)
- `/pricing` page reworked with three columns, ENTERPRISE third
- ENTERPRISE feature flag gate in `canAccessTenant`

**Success metric:** One ENTERPRISE close by end of Q3. Conversion rate not the goal; positioning is.

---

### EPIC-08 — Claude Code MCP Server
**Forsee:** #1 Copilot + #7 Agent Platforms | **Size:** M | **Target weeks:** July 17 – August 7 (3 weeks)

**Why now:** Claude Code is the fastest-growing IDE agent. MCP servers are the distribution channel. First good drift-detection MCP wins the category inside Claude Code.

**Note:** FEAT-001 (MCP-01) is already specced at XL for full production server. This epic is a **scoped-down subset** for IDE-native presence — not full enterprise MCP. Revisit FEAT-001 post-Wave-5 gate.

**Scope:**
- MCP server exposing: `check_pr_for_drift`, `fetch_drift_rules`, `get_recent_drift_history`, `propose_fix_for_drift`
- Published to `mcp.docugardener.dev` + npm package `@docugardener/mcp`
- Authentication via personal access token flow (reuse existing PAT infra)
- Documentation: "Using DocuGardener in Claude Code" — full setup in 3 min
- Blog launch: "We built an MCP server for doc drift" (becomes content asset)

**Success metric:** 500+ MCP installs in first 30 days. Counts as organic top-of-funnel.

**Reference:** `docs/specs/FEAT-001-MCP-01-DocuGardener-MCP-Server.md` (full scope).

---

### EPIC-09 — LLM-OPT-03 Parallel Entity Analysis
**Forsee:** #3 LLM Commoditization | **Size:** M | **Target weeks:** August 7 – 21 (2 weeks)

**Why now:** Current pipeline analyzes entities sequentially. `asyncio.gather` cuts wall-clock latency 30–80% for PRs with 3+ changed files. Latency is a sales conversation.

**Scope:**
- Refactor `src/pipeline/handler.py` to parallelize per-entity verifier calls with `asyncio.gather`
- Concurrency cap (semaphore) — default 5, configurable per tenant plan (ENTERPRISE = 10)
- Respect rate limit headers from each provider; back off gracefully
- Observability: p50/p95 analysis latency before/after
- Tests for ordering guarantees in the final report

**Success metric:** p95 analysis latency drops from >30s to <12s for 3-file PRs.

---

### EPIC-10 — Helm Chart Publication + Self-Hosting Docs
**Forsee:** #2 Mintlify | **Size:** S | **Target weeks:** August 21 – 28 (1 week)

**Why now:** "Self-host with your own keys" is the argument Mintlify cannot make. Making it trivially easy to self-host is the moat.

**Scope:**
- Publish Helm chart to Artifact Hub (`docugardener/docugardener`)
- Terraform module for AWS single-VPS deployment (public repo)
- Self-hosting guide refresh: exact commands, common pitfalls, upgrade path
- "Self-hosted vs Hosted" decision page

**Success metric:** 10+ GitHub stars on the Terraform module within 30 days. Self-host is a credibility signal even if nobody uses it.

---

### EPIC-11 — Cross-Repo Drift Prototype
**Forsee:** #6 R&D Frontier | **Size:** L | **Target weeks:** August 14 – September 18 (5 weeks)

**Why now:** No competitor has cross-repo drift. Even a prototype demo creates sales asymmetry. Don't build production — build a show.

**Scope:**
- Demo scenario: 3 synthetic repos (API, SDK, docs portal) with a breaking change in API repo
- Extend Weaviate ingestion to link entities across tenant namespaces
- LLM call surfaces: "This change in `api/users.py` affects `sdk-js/README.md` (moved endpoint) and `docs-portal/quickstart.md` (code sample)"
- Video demo recording (3 min)
- Gate behind `CROSS_REPO_BETA=true` flag — not yet a paid feature
- Landing page section: "Coming soon — cross-repo drift detection"

**Success metric:** Demo video used in at least 3 enterprise sales conversations by end of Q3.

**Explicitly not building:** production-ready multi-repo orchestration, repo graph visualization, multi-tenant cross-repo (that's 2027 work).

**⚠️ SACRIFICE CANDIDATE:** If Q2 epics slip, EPIC-11 is the only purely-strategic L-size epic and the first to cut. Name it now so nobody debates in August.

---

### EPIC-12 — State of Documentation Drift 2026 Report
**Forsee:** #10 Category Definition | **Size:** M | **Target weeks:** September 4 – 25 (3 weeks)

**Why now:** Whoever publishes the authoritative data becomes the category reference. First-mover window closes end of 2026.

**Scope:**
- Data sourced from DG's own anonymized production corpus: % of PRs that drift, average drift severity, time-to-fix distribution, top drift categories (stale params, outdated return types, broken code samples)
- Industry breakdown (where we have signal: FinTech, SaaS, OSS)
- Published as: 20-page PDF + interactive web page + press release
- Distribution: Hacker News, dev.to, LinkedIn, relevant subreddits
- Outreach list: 20 DevTools journalists + analysts

**Success metric:** 1+ citation in industry press. 500+ report downloads.

---

### EPIC-13 — AI Author Mode Quality Pass
**Forsee:** #2 Mintlify | **Size:** M | **Target weeks:** September 11 – 25 (2 weeks)

**Why now:** The detection side is commoditizing. The *fix PR quality* is the differentiator. If Mintlify ships Autopilot pre-merge, this is what keeps DG ahead.

**Scope:**
- Golden dataset: 50 real drift cases + expected fix PRs, scored by human reviewer
- Prompt engineering: improve Fix PR context (include neighboring functions, import graph, project style guide if present)
- A/B framework: compare current prompt vs candidate prompts on golden set
- Metric: "Fix PR merge rate" — of auto-proposed fixes, what % merged without edits?
- Weekly golden-set regression test (can't let this degrade silently)

**Success metric:** Fix PR merge-without-edit rate moves from baseline to 60%+.

---

## Explicitly Deferred to Q4+

Listed so the team sees what we're *not* doing and why:

| Item | Why Deferred |
|------|--------------|
| LLM-OPT-02 Batch API | OPT-01 captures 80% of cost savings; batch adds latency tradeoff |
| LLM-OPT-04 Model auto-selection | Complexity high, customer-invisible; ship after OPT-03 data |
| LLM-OPT-05 Streaming responses | UX polish, not revenue-critical |
| GitLab / Bitbucket support | +40% TAM but 3-month engineering cost; revisit when >$10K MRR |
| SOC 2 Type II certification | 9-month process; start Q4 for 2027 readiness |
| Cursor extension | Ship after MCP data shows IDE-native demand |
| API contract drift (adjacency) | Conditional on Q3 decision gate |
| Dev conference speaking | Q4 onward, after compliance pack + report ship |
| Owner dashboard deeper analytics (DG-OWN-04..05) | Blocked on production scale data |
| Cross-repo production features | 2027 — prototype first, validate demand |
| FEAT-001 Full MCP-01 Production Server | Wave 5 gate (≥50 tenants + 3mo history) — EPIC-08 is a scoped subset |

---

## Decision Gates

**Gate 1 — June 30 (end of Q2):**
- Paying PRO customers: target 10, floor 5
- If <5: the onboarding isn't working — do not start Q3 epics until funnel is fixed
- AI Act compliance pack shipped: must be binary yes/no

**Gate 2 — September 30 (end of Q3):**
- Paying customers (PRO + TEAM + ENTERPRISE): target 50, floor 25
- If <25: serious conversation about adjacency pivot (API contract drift, runbook drift)
- MRR target: $2,500–$4,000
- If cross-repo prototype not generating sales conversations: deprioritize for 2027

---

## Plan Risks (PO Disclosure)

1. **EPIC-05 (AI Act) has a hard deadline.** If EPIC-01 or 02 slips, EPIC-05 still ships on time — EPIC-01 can slip a week, EPIC-05 cannot. Protect the path.

2. **1–2 person team runs this only if every epic ships at size-M pace.** If EPIC-01 (L) actually takes 5 weeks instead of 3, the plan compresses EPIC-05 dangerously. The pre-agreed mitigation is to cut **EPIC-11 (cross-repo prototype)** first — it is the only L-size epic that is purely strategic, not defensive. Everything else is load-bearing.

---

## Epic-to-Backlog Promotion Protocol

When the PO selects an epic to start:
1. Copy the epic block into a new `docs/specs/FEAT-NNN-<slug>.md` spec
2. Break into user stories with acceptance criteria (see Rule 8, Spec Gathering)
3. Add a single row to `docs/backlog.md` Active Items table
4. Update `MEMORY.md` → Backlog Status section
5. Create branch `feat/FEAT-NNN-slug` following project convention

**Do not import epics in bulk.** One at a time, PO-selected.

---

*Based on: AUDIT-01 pre-launch audit (2026-04-16), SA-MANAGED-AGENTS-01 (2026-04-16), PORTFOLIO-01 cross-project analysis (2026-04-16), and the 12-month forsee analysis (2026-04-17).*

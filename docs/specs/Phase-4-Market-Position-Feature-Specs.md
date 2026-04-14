# Phase 4 — Market Position Feature Specs

## Purpose

This document converts the previously suggested market-strengthening features into DocuGardener-specific product specifications.

It is tied to the current documented product core:

- CI-native documentation verification
- pull-request drift detection
- exact remediation suggestions and auto-fix PRs
- auditability and dismiss-reason workflows
- zero-retention / BYOK / local-model posture
- split Control Plane / Analysis Plane architecture

Primary source anchors:

- `docs/DocuGardener_Product_Specification.md`
- `docs/DocuGardener_Software_Architecture_Specification.md`
- `docs/specs/DocuGardener_Implementation_Backlog.md`
- `docs/specs/GTM-08-GTM-Motion-Playbook.md`

---

## Priority Summary

> **PO/SA review applied 2026-03-10.** Priorities reclassified based on overlap with already-shipped features (GTM-04, C-3) and scope adjustments. See `feature_review_verdict.md` for full rationale.

### P0 — Must strengthen the core wedge now

1. `DOCPOL-01` Policy-as-Code for Documentation Rules
2. `MAP-01` Documentation Coverage and Risk Map

### P1 — Strengthen adoption, evidence, and remediation trust

1. `FIX-01` Verified Auto-Fix — Confidence Score *(scope reduced: confidence metadata only, full state machine deferred)*
2. `EVID-01` Trust-Grade Evidence Pack *(rescoped: delta vs already-shipped GTM-04 + C-3 only)*
3. `IDE-01` IDE-Native Drift Review — VS Code Only *(JetBrains deferred)*

### P2 — Strengthen enterprise moat and deployment clarity

1. `MODE-01` First-Class Execution Modes

---

## 1. P0 Features

## DOCPOL-01 - Policy-as-Code for Documentation Rules

### Why this matters

This feature turns DocuGardener from "smart drift detector" into a policy-enforced documentation control layer.
It directly strengthens the current core promise: code changes should not merge unless the required documentation obligations are satisfied.

### Current-state tie-in

Already present in the product:

- PR drift detection
- severity scoring
- GitHub check-run gating
- triage inbox
- prompt guardrails
- existing workflow config patterns

Gap:

There is no first-class policy layer that lets teams declare documentation obligations explicitly per path, file type, service, or change class.

### User stories

#### Story 1

As a platform engineer, I want to declare documentation rules in configuration, so that documentation requirements are enforced consistently across repositories.

#### Story 2

As an engineering lead, I want API, runbook, and onboarding rules to be different, so that the tool reflects the actual risk of each documentation type.

#### Story 3

As a compliance-minded admin, I want exceptions to policy to be visible and auditable, so that the team cannot silently bypass documentation obligations.

### Proposed capability

Add a policy definition layer in `.github/docugardener.yml` or equivalent tenant-level config with rules such as:

- path-based obligations
- file-pattern mapping
- "if changed path matches X, docs Y or Z must also change"
- required reviewer reason for exceptions
- severity override by policy
- per-doc-type enforcement modes

### Acceptance criteria

- [ ] Repository-level config supports rules such as:
  - `if paths: ["src/api/**"] then require_docs: ["docs/api/**", "openapi.yaml"]`
  - `if paths: ["infra/**"] then require_docs: ["runbooks/**"]`
- [ ] A rule can set enforcement level:
  - advisory
  - blocking
  - blocking with required reason on dismiss
- [ ] GitHub check-run output names the triggering policy rule when drift is found.
- [ ] Triage Inbox shows the policy that fired and the expected documentation target.
- [ ] Audit log records policy-triggered dismissals with rule ID and actor.

### Monetization fit

- Free: basic repository-local rules only
- Pro: richer rule syntax, multiple rule sets, policy templates
- Team: centrally managed policy packs, exception reporting, compliance-oriented controls

Commercial leverage:

- strong Pro conversion lever for private repos
- strong Team/regulated buyer lever because it turns drift detection into enforceable governance

### Integration complexity

Complexity: `Medium`

Control Plane impact:

- settings UI for rule templates and validation
- repo settings page updates
- triage UI surfaces policy metadata

Analysis Plane impact:

- config parser and schema validator
- policy evaluation stage before or alongside current drift scoring
- enriched result payload and check-run summary

Storage impact:

- possible schema addition for normalized policy evaluation output in `job.result`
- optional persisted tenant-level default policy pack

Architecture fit:

- aligns cleanly with current Control Plane / Analysis Plane split
- does not require architectural refactor
- builds directly on current webhook -> analysis -> check-run -> inbox flow

Risks:

- rule UX can become too complex
- bad configs can create noisy false positives

Recommended scope:

- start with path-based `require_docs` rules only
- do not attempt full DSL in v1

---

## MAP-01 - Documentation Coverage and Risk Map

> **Promoted to P0 by PO/SA review 2026-03-10.** Management visibility drives the Pro → Team conversion lever, which is the highest-priority commercial gap.

### Why this matters

Current DocuGardener is excellent at per-PR detection.
This feature makes it stronger as a management product by answering:

> Where is our documentation risk concentrated right now?

That improves differentiation against generic reviewers and helps sell beyond individual developer utility.

### Current-state tie-in

Already present in the product:

- fleet dashboard
- drift velocity
- ignore-rate analytics
- repo-level reporting
- governance proof point KPIs (C-3: % PRs with drift, avg time to triage, % critical dismissed)

Gap:

The dashboard does not yet provide a coverage/risk map across code areas and documentation obligations.

### User stories

#### Story 1

As an engineering manager, I want to see which repos, services, or documentation types are under-documented or frequently stale, so that I can prioritize investment.

#### Story 2

As a platform engineer, I want to know which high-risk code areas have weak documentation linkage, so that I can improve rules and ownership.

#### Story 3

As a compliance lead, I want a compact control-plane view of documentation risk hotspots, so that I can ask targeted questions instead of broad ones.

### Proposed capability

Build a risk-oriented map in the Control Plane using:

- documentation type
- repo
- service / directory
- severity history
- unresolved drift count
- dismiss rate
- remediation time

### Acceptance criteria

- [ ] Reports page includes a "Top Risk Zones" view.
- [ ] Risk can be filtered by repo, doc type, and time range.
- [ ] Each risk zone drills down into recent drift events and owning paths.
- [ ] Dashboard exposes a single health score with drilldown, not just disconnected widgets.

### Monetization fit

- Free: none
- Pro: repo and documentation-type risk views
- Team: org-wide risk and evidence coverage rollups

Commercial leverage:

- supports manager-led Pro retention
- helps Team sales with operational governance story

### Integration complexity

Complexity: `Medium`

Control Plane impact:

- primary work area; charts, tables, drilldowns

Analysis Plane impact:

- minimal if based on existing job data
- optional future enrichment for path-to-doc linkage scoring

Storage impact:

- likely derived-query work, not major schema changes

Architecture fit:

- clean fit with existing dashboard / reports pages
- mostly additive to the Control Plane

Risks:

- can become vanity analytics if not tied to action
- every metric must drill down to an actionable item (an open PR, unresolved drift, inbox link)

Recommended scope:

- ship "Top Risk Zones" and "doc type health" before any graph-heavy experience

---

## 2. P1 Features

## FIX-01 - Verified Auto-Fix — Confidence Score

> **Scope reduced by PO/SA review 2026-03-10.** Ships `confidence_score` and `recheck_status` metadata only. The full 6-state remediation machine is deferred until customer evidence justifies the additional complexity.

### Why this matters

DocuGardener already has auto-fix PR behavior.
The next step is to add visible trust signals to auto-fix output so developers and leads can judge fix quality at a glance.

### Current-state tie-in

Already present in the product:

- surgical suggestions
- auto-fix PR flow
- AI Author Mode
- CI-gated auto-merge for AI-authored flows
- state machine with `RESOLVED`

Gap:

The current remediation path is strong, but auto-fix output carries no visible confidence signal. Developers cannot distinguish high-confidence fixes from best-effort drafts.

### User stories

#### Story 1

As a developer, I want to see a confidence score on the suggested doc fix, so that I know whether to merge it quickly or review it carefully.

#### Story 2

As a team lead, I want auto-fix PRs to show whether a re-check passed, so that I can distinguish verified fixes from unverified ones.

### Proposed capability

Extend the existing auto-fix feature with trust metadata:

- `confidence_score` (0–100) on every generated fix
- `recheck_status` (`passed` / `failed` / `skipped`) indicating whether a second verification pass was run
- Surface both in the fix PR body, check-run annotation, and Inbox detail view

### Acceptance criteria

- [ ] After generating a fix, the system runs a second verification pass against the proposed documentation change.
- [ ] The PR or Inbox surfaces `recheck_status` and `confidence_score`.
- [ ] Reports surface auto-fix success rate.

### What is explicitly deferred

- Full 6-state remediation machine (`DETECTED → DRAFTED → RECHECKED → APPROVED_FOR_AUTOMATION → MERGED → ESCALATED_TO_HUMAN`)
- Severity-based auto-merge policy controls
- `ESCALATED_TO_HUMAN` routing

These will be reconsidered once customer data on fix quality and trust issues is available.

### Monetization fit

- Free: confidence score visible on suggested fixes
- Pro: recheck verification pass on auto-fix PRs
- Team: auto-fix success rate analytics

Commercial leverage:

- supports Pro conversion by improving auto-fix trust
- produces data to justify the full remediation loop later

### Integration complexity

Complexity: `Low-Medium`

Control Plane impact:

- Inbox detail view: show `confidence_score` and `recheck_status`
- Reports: auto-fix success rate metric

Analysis Plane impact:

- post-generation re-check stage in worker pipeline
- `confidence_score` computed from verifier output
- result payload changes (two new fields)

GitHub integration impact:

- fix-PR body includes confidence and recheck metadata
- check-run summary includes recheck status

Architecture fit:

- minor addition to existing analyzer + verifier pipeline
- no state machine changes

Risks:

- added latency from re-check pass (~2-5s per fix)

---

## EVID-01 - Trust-Grade Evidence Pack

> **Rescoped by PO/SA review 2026-03-10.** Substantial evidence export capability is already shipped. This spec covers **only the delta** vs already-implemented features.

### Why this matters

This feature strengthens the differentiator generic AI code review tools do not own: documentation governance evidence.
It converts existing audit and dismissal data into something a security, compliance, or leadership buyer can actually use.

### Already shipped (not in scope)

The following capabilities are **already implemented** and should not be re-scoped:

| Capability | Shipped In | Status |
|---|---|---|
| CSV/JSON evidence export with date range filter | GTM-04 | ✅ 2026-03-09 |
| Event-type filter on export | GTM-04 | ✅ 2026-03-09 |
| Rate limiting on export (1/min/tenant) | GTM-04 | ✅ 2026-03-09 |
| TEAM plan gating on export | GTM-04 | ✅ 2026-03-09 |
| Export UI with format dropdown and date picker | GTM-04 | ✅ 2026-03-09 |
| % PRs with drift KPI tile | C-3/IDEA-14 | ✅ 2026-03-10 |
| Avg time to triage KPI tile | C-3/IDEA-14 | ✅ 2026-03-10 |
| % critical drift dismissed KPI tile | C-3/IDEA-14 | ✅ 2026-03-10 |
| Ignore-rate analytics (trend + severity + top reasons) | V2-ANALYTICS | ✅ 2026-02-23 |

### Remaining delta (in scope)

The following capabilities are **not yet implemented** and constitute the EVID-01 deliverable:

1. **End-to-end drift event timeline view** — a single drift event detail page showing the full state transition: detected → suggested → dismissed/accepted → resolved/still open. Currently, drift events are only viewable as list items in the inbox; there is no drill-down timeline.

2. **Export filter expansion** — add `repo`, `severity`, `actor`, and `status` as filter dimensions on the existing export endpoint. Currently only `date range` and `event type` are supported.

3. **Export row enrichment** — each export row should include cross-reference IDs linking to the underlying `Job`, PR number/URL, and audit entry hash. Currently, rows contain audit log entries without job/PR linkage.

4. **Evidence coverage metric** — a new KPI showing "% of PRs with a complete evidence chain" (drift detected + triage decision recorded + resolution state known). This extends the existing C-3 metrics.

5. **Dismiss rate by severity breakdown** — extend the existing `% critical drift dismissed` (C-3) to show dismiss rate across all severity levels, not just critical.

### User stories

#### Story 1

As an auditor, I want to inspect a single drift event end-to-end, so that I can understand the decision chain without asking engineering to reconstruct it manually.

#### Story 2

As a compliance lead, I want to filter evidence exports by repository and actor, so that I can produce a scoped report for a specific team's audit.

#### Story 3

As an engineering manager, I want to know what percentage of PRs have a complete evidence chain, so that I can identify governance gaps.

### Acceptance criteria

- [ ] A single drift event detail view shows end-to-end state transition: detected → suggested → dismissed/accepted → resolved/still open.
- [ ] Export endpoint accepts `repo`, `severity`, `actor`, and `status` filter parameters in addition to existing `date range` and `event` filters.
- [ ] Export rows include `job_id`, `pr_number`, `pr_url`, and `audit_hash` fields.
- [ ] Reports page shows "Evidence Coverage" KPI: % of PRs with complete evidence chain.
- [ ] Reports page shows dismiss rate broken down by severity level (not just critical).

### Monetization fit

- Free: no evidence features
- Pro: basic export with expanded filters
- Team: full evidence pack, drift event timeline, evidence coverage metric

Commercial leverage:

- strongest Team plan feature in regulated accounts
- supports security / compliance expansion after engineering adoption

### Integration complexity

Complexity: `Low-Medium` *(reduced from original Medium due to already-shipped export infrastructure)*

Control Plane impact:

- new drift event detail page
- expand export API filters
- 2 new report KPI tiles

Analysis Plane impact:

- none; all data already exists in job results and audit log

Storage impact:

- may require normalizing event timeline fields in existing `job.result`

Architecture fit:

- very strong fit with existing audit-log, inbox, and reporting architecture
- no major runtime-path change required

Risks:

- data consistency issues if historical jobs lack some fields
- export semantics become audit-like before legal copy is fully aligned (GTM-06)

Recommended scope:

- ship drift event timeline + filter expansion first
- defer signed bundles / external attestations to later

## IDE-01 - IDE-Native Drift Review — VS Code Only

> **Scope reduced by PO/SA review 2026-03-10.** JetBrains plugin deferred — no proven demand signal. Will be reconsidered when VS Code extension usage data justifies a second client platform.

### Why this matters

The VS Code extension already exists.
The strategic upgrade is to make IDE review feel like a first-class DocuGardener experience rather than a thin remote check client.

### Current-state tie-in

Already present in the product:

- VS Code plugin
- stateless `/check` endpoint
- staged-file local review

Gap:

- no policy explanation in-IDE
- no richer remediation UX for linked docs

### User stories

#### Story 1

As a developer, I want to see which documentation file is likely affected before I push, so that I can fix the issue immediately.

#### Story 2

As a team lead, I want local checks to reflect the same repository policy as CI, so that developers get consistent feedback.

#### Story 3

As a privacy-sensitive evaluator, I want local or BYOK-backed review options, so that I can test DocuGardener in restrictive environments.

### Proposed capability

Extend VS Code support with:

- linked-doc suggestions in diagnostics
- policy reason in local warnings
- richer "why this fired" explanations
- direct-open of suggested documentation target from diagnostics

### Acceptance criteria

- [ ] VS Code diagnostics include suggested impacted docs and triggering rule.
- [ ] `/check` accepts policy context and returns structured reasons.
- [ ] Extension can open the suggested documentation target directly.

### What is explicitly deferred

- JetBrains plugin (no demand signal; will be reconsidered when VS Code usage data justifies it)

### Monetization fit

- Free: baseline local check stays available for adoption
- Pro: team-managed policy-aware IDE review
- Team: hardened BYOK/local deployment support and enterprise rollout guide

Commercial leverage:

- supports self-serve activation
- reduces time-to-value
- improves retention more than direct monetization

### Integration complexity

Complexity: `Low-Medium`

Control Plane impact:

- minimal, except possible settings copy and plugin-key UX expansion

Analysis Plane impact:

- `/check` schema expansion
- reuse of policy evaluation logic from `DOCPOL-01`

Client impact:

- VS Code extension enhancement only

Architecture fit:

- very strong fit; `/check` already exists specifically for this channel

Risks:

- too much IDE polish before policy engine exists

Recommended scope:

- make this depend on `DOCPOL-01`
- improve VS Code first

---

## 3. P2 Feature

## MODE-01 - First-Class Execution Modes

### Why this matters

DocuGardener already supports platform LLM, BYOK cloud, and BYOK local/on-prem technically.
What is missing is productized visibility and control around those modes.

This is valuable because enterprise buyers often evaluate trust boundaries before they evaluate UX polish.

### Current-state tie-in

Already present in the product:

- platform LLM mode
- BYOK cloud
- BYOK local / Ollama
- on-prem Helm
- legal prep around processor boundaries

Gap:

The product does not yet present execution mode as a first-class operating model with clear capability boundaries and decision support.

### User stories

#### Story 1

As a security lead, I want to see exactly which execution mode a tenant uses, so that I can approve or restrict deployment based on data boundary requirements.

#### Story 2

As an admin, I want to understand which hosted features change under BYOK or local mode, so that I do not assume platform services behave identically.

#### Story 3

As a sales engineer, I want a clear product surface for SaaS, BYOK, and sovereign modes, so that enterprise evaluation is easier to explain.

### Proposed capability

Expose execution mode as a first-class control-plane concept:

- platform mode
- BYOK cloud mode
- BYOK local mode
- sovereign / on-prem mode

Each mode should clearly state:

- data path
- available hosted services
- policy limitations
- cost responsibility

### Acceptance criteria

- [ ] Settings page shows active execution mode and its implications.
- [ ] Billing / usage clearly reflects hosted vs self-hosted service boundaries.
- [ ] Reports and onboarding copy explain which features depend on platform-hosted services.
- [ ] Team-plan admins can export an environment profile summary for security review.

### Monetization fit

- Free: visibility only
- Pro: clearer BYOK cloud positioning
- Team: execution-mode governance and environment summary
- Sovereign: direct sales support for on-prem and zero-egress accounts

Commercial leverage:

- better enterprise trust and smoother security review
- modest near-term monetization, strong strategic value

### Integration complexity

Complexity: `Low-Medium`

Control Plane impact:

- settings, onboarding, billing copy, trust UI

Analysis Plane impact:

- minimal runtime changes
- mostly metadata and capability signaling

Architecture fit:

- excellent fit, since the modes already exist in architecture and product docs

Risks:

- can become mostly messaging if not tied to real behavior flags

Recommended scope:

- do not treat as a major engineering program
- treat as productization of already-supported architecture

---

## 4. Monetization Fit Summary

| Feature | Priority | Primary Commercial Role | Best Plan Fit | Monetization Strength |
|---|---|---|---|---|
| `DOCPOL-01` Policy-as-Code | **P0** | Differentiates core product and upgrades drift detection into governance | Pro / Team | High |
| `MAP-01` Coverage and Risk Map | **P0** | Management visibility and Pro → Team conversion lever | Pro / Team | High |
| `FIX-01` Confidence Score | **P1** | Improves auto-fix trust and produces data for future automation | Pro / Team | Medium |
| `EVID-01` Evidence Pack (delta) | **P1** | Compliance expansion and audit buying motion | Team | High |
| `IDE-01` VS Code Enhancement | **P1** | Adoption, activation, and retention | Free / Pro | Medium |
| `MODE-01` Execution Modes | **P2** | Enterprise trust and security review acceleration | Team / Sovereign | Medium-High |

---

## 5. Integration Complexity Summary

| Feature | Priority | Complexity | Main Plane Impact | Main Dependency |
|---|---|---|---|---|
| `DOCPOL-01` | P0 | Medium | Analysis Plane first, then Control Plane | config schema + policy evaluation |
| `MAP-01` | P0 | Medium | Control Plane | quality of existing reporting data |
| `FIX-01` | P1 | Low-Medium | Analysis Plane + result payload | existing auto-fix path |
| `EVID-01` | P1 | Low-Medium | Control Plane | GTM-04 export infra + C-3 metrics |
| `IDE-01` | P1 | Low-Medium | `/check` API + VS Code extension | `DOCPOL-01` structured output |
| `MODE-01` | P2 | Low-Medium | Control Plane / packaging UX | finalized capability matrix |

---

## 6. Recommended Build Order

> Revised by PO/SA review 2026-03-10.

### P0 order

1. `DOCPOL-01` — Policy-as-Code
2. `MAP-01` — Documentation Coverage and Risk Map

Reason:

- policy creates the strongest product control and the rule layer everything else builds on
- management visibility makes policy outcomes visible — together they answer "what are your rules?" and "where are they failing?"
- this pair drives the Pro → Team conversion lever, which is the highest-priority commercial gap

### P1 order

1. `FIX-01` — Confidence Score (reduced)
2. `EVID-01` — Evidence Pack (rescoped delta)
3. `IDE-01` — VS Code Enhancement

Reason:

- confidence metadata is low-cost and produces data for future automation decisions
- evidence delta extends already-shipped export infrastructure with minimal new engineering
- VS Code enhancement gets much better once policy output is structured (`DOCPOL-01` dependency)

### P2 order

1. `MODE-01` — First-Class Execution Modes

Reason:

- mostly productization of capabilities already present
- better done after feature/package boundaries stabilize

---

## 7. Definition of Done Pattern

For every accepted feature above, completion means:

- [ ] user stories are implemented against the current Control Plane / Analysis Plane architecture
- [ ] plan gating and monetization fit are reflected in the pricing / feature matrix
- [ ] documentation is updated in product spec, backlog, and FAQ / landing copy where needed
- [ ] telemetry or reporting exists to measure adoption or business impact
- [ ] tests cover the new control path or workflow state change

---

## 8. Final Product Recommendation

> Updated by PO/SA review 2026-03-10.

If DocuGardener wants to strengthen its market position without diluting its wedge, the next feature investments should not chase generic code review breadth.

They should deepen the current moat:

1. explicit documentation policy
2. management-facing risk visibility
3. verified remediation trust signals
4. evidence-grade governance (extending what is already shipped)

That sequence keeps DocuGardener anchored to its best market position:

> CI-native documentation verification with remediation and auditability.

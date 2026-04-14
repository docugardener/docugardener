# Phase 5 — Agent Ecosystem Feature Specs

**Date:** 2026-03-12
**SA/PO Review applied:** 2026-03-12 (see amendment notes throughout)

Purpose:
- define 2 distinctive agent-native feature bets that strengthen DocuGardener's market position
- assess whether they can stand alone as complementary tools
- tie them to the current DocuGardener core, architecture, and monetization model

Scope:
0. `FEED-01` Analysis Feedback Signal ← **Phase 5 Prerequisite** (added by SA/PO review)
1. `RULES-01` Agent Rules Compiler ← Phase 5A
2. `MCP-01` DocuGardener MCP Server ← Phase 5B

---

## 0. SA/PO Review Amendments Summary

The following amendments were applied to the original spec during SA/PO review on 2026-03-12:

| Amendment | Applies To | Reason |
|---|---|---|
| Added FEED-01 as prerequisite | All of Phase 5 | Feedback data is the foundation both RULES-01 and MCP-01 depend on for quality |
| Fixed OSS framing → SaaS free-tier | RULES-01, MCP-01 | GTM-09 decision: no OSS community edition at this stage |
| Scoped RULES-01 to 2 output formats | RULES-01 | Too many formats day-one = 5× maintenance burden when formats evolve |
| Added policy adoption gate | RULES-01 | Feature is useless if tenants have no custom policy rules — DOCPOL-01 adoption must reach 30% first |
| Added hard prerequisite gates | MCP-01 | Premature launch with empty data destroys first impressions permanently |
| Added auth design review gate | MCP-01 | New external auth surface requires explicit security review before implementation |
| Added /check endpoint relationship | MCP-01 | Clarifies how MCP and VS Code extension compose, not compete |
| Added deep solution design | All | Identifies all affected existing modules, new data models, API contracts |

---

## 1. Strategic Thesis

DocuGardener is strongest when it is not just a PR gate, but the system that tells coding agents:
- what documentation obligations exist
- which docs are affected by a change
- when a change is non-compliant
- what evidence is needed to prove a compliant outcome

Recent product direction across AI coding tools shows a shift away from "single chatbox assistants" toward:
- repository-native instructions and rules
- MCP-based external context access
- background agents that operate across repos and workflows

For DocuGardener, this creates a strong expansion path:
- own the static policy layer for agent behavior (RULES-01)
- then own the live documentation context layer for agent workflows (MCP-01)

A competitor can copy a PR review surface faster than it can copy a trusted policy-and-context layer embedded across multiple agent ecosystems.

---

## 2. Current-State Tie-In

Already present in the product:
- PR drift detection pipeline (fully operational)
- auto-fix PR generation (FIX-01)
- AI Author Mode
- VS Code `/check` endpoint (IDE-01)
- audit log and evidence export (ENT-11, EVID-01)
- plan-gated settings and execution-mode framing (MODE-01)
- `DOCPOL-01` policy-as-code (path patterns, severity, doc targets)
- `MAP-01` risk visibility (repo vitality index, risk zones)
- `PromptManager` with per-tenant DB-stored prompt overrides

Gap before Phase 5:
- DocuGardener mostly acts after code changes are pushed or proposed
- it does not yet become a first-class upstream dependency for coding agents
- agent instructions are fragmented across tools and repos
- live documentation context is not exposed as a reusable external interface
- no feedback loop between developers and analysis quality

---

## 3. FEED-01 — Analysis Feedback Signal (Phase 5 Prerequisite)

**Status: ✅ Completed 2026-03-13**

### Why this is a prerequisite

RULES-01 compiler quality depends on knowing which policy rules generate false positives.
MCP-01 impacted-doc lookup quality depends on knowing when previous analysis was wrong.
Without feedback data, both features launch on top of uncalibrated analysis, and first impressions are permanent.

**Estimated effort:** 1 week / 1 engineer
**Gate:** FEED-01 must be shipped and collecting real signal for at least 4 weeks before MCP-01 begins implementation.

### Concept

When DocuGardener posts a drift analysis comment on a GitHub PR, append two signed one-click feedback links. Developer clicks without leaving GitHub. Signal is recorded. Dashboard surfaces false-positive rate per repo and per tenant.

### Implementation Design

**Feedback link generation** (`src/pipeline/handler.py` — comment posting):

When the analysis comment is built, compute a signed token:
```python
import hmac, hashlib
token = hmac.new(
    settings.feedback_hmac_secret.encode(),
    f"{job_id}:{tenant_id}".encode(),
    hashlib.sha256
).hexdigest()[:24]
```

Append to comment footer:
```
---
*Was this analysis helpful?*
[✅ Looks accurate](https://app.docugardener.dev/api/feedback?j={job_id}&s=up&t={token}) · [⚠️ Report false positive](https://app.docugardener.dev/api/feedback?j={job_id}&s=down&t={token})
```

**New API route** (`web/app/api/feedback/route.ts`):
- `GET /api/feedback?j={job_id}&s=up|down&t={token}`
- Verify HMAC token (constant-time comparison)
- Write to `AnalysisFeedback` table
- Return 200 with simple HTML confirmation (or redirect back to PR)
- Idempotent — second click from same job updates existing record

**New Prisma model:**
```prisma
model AnalysisFeedback {
  id        String   @id @default(cuid())
  jobId     String
  tenantId  String
  signal    String   // "up" | "down"
  source    String   @default("pr_comment")
  createdAt DateTime @default(now())
  job       Job      @relation(fields: [jobId], references: [id])
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  @@unique([jobId, source])
}
```

**New env var:** `FEEDBACK_HMAC_SECRET` — 32-byte hex secret, added to `.env.example` and production config.

**Dashboard surfaces:**
- `web/app/dashboard/jobs/page.tsx` — add signal badge column (👍 / 👎 / no response)
- `web/app/dashboard/reports/page.tsx` — Governance tab: "False Positive Rate (last 30 days)" KPI card

**Future use (not in scope for FEED-01):**
- Per-tenant GRACE_THRESHOLD calibration based on historical false-positive rate
- Prompt improvement signal for PromptManager
- RULES-01: which policy rules trigger the most false positives → inform compiler output

### Acceptance Criteria

- [ ] Feedback links appear in every drift analysis PR comment
- [ ] Links are signed (HMAC token) — cannot be forged without the server secret
- [ ] GET /api/feedback records signal to DB, returns confirmation
- [ ] Idempotent — clicking twice from same job does not create duplicate records
- [ ] Jobs dashboard shows signal badge per job
- [ ] Reports governance tab shows false-positive rate metric (plan-gated: PRO+)
- [ ] New env var `FEEDBACK_HMAC_SECRET` documented and validated at startup

### Existing Files Affected

| File | Change |
|---|---|
| `src/pipeline/handler.py` | Append feedback links to comment template |
| `src/core/config.py` | Add `feedback_hmac_secret` setting |
| `web/app/api/feedback/route.ts` | New route — HMAC verify + DB write |
| `web/app/dashboard/jobs/page.tsx` | Signal badge column |
| `web/app/dashboard/reports/page.tsx` | False-positive rate KPI |
| `prisma/schema.prisma` | New `AnalysisFeedback` model |
| `.env.example` | `FEEDBACK_HMAC_SECRET` |
| `docker/docker-compose.yml` | `FEEDBACK_HMAC_SECRET` env var |

### Monetization

- Free: signal visible in Jobs list (basic)
- PRO+: false-positive rate KPI in Reports
- Team: org-level false-positive trend (future)

---

## 4. RULES-01 — Agent Rules Compiler (Phase 5A)

**Status: ✅ Completed 2026-03-13**

### Why this matters

This feature turns DocuGardener from a downstream reviewer into the source of truth for how AI coding agents should behave around documentation.

**Shift-left value:** Instead of catching drift after a PR is opened, the agent knows documentation obligations before writing code. The CI block becomes confirmation rather than surprise — a meaningful change in the product's emotional register.

### Prerequisites Before Starting

- [ ] FEED-01 shipped
- [ ] At least 30% of active tenants have at least one custom DOCPOL-01 policy rule configured. If this gate is not met, the compiler generates the same boilerplate for everyone — the feature has no differentiated value.

### Scope Constraint (SA/PO Amendment)

**Phase 5A ships exactly two output formats:**
1. `AGENTS.md` — format-agnostic, growing adoption across Claude Code, Gemini CLI, and generic agent frameworks
2. `.github/copilot-instructions.md` — largest installed base (GitHub Copilot)

Additional formats (Cursor rules, CLAUDE.md, GEMINI.md) are added in Phase 5A.1 based on tenant demand signals. Shipping five formats day-one means maintaining five slightly-different template renderers through every policy schema evolution.

### SaaS Tier Design (replaces OSS framing)

> **Amendment:** original spec proposed an OSS CLI for the "free" tier. Per GTM-09, there is no OSS community edition. All tiers are SaaS.

| Tier | Capability |
|---|---|
| **Free** | Generate one target format, one repo, via web UI. No sync monitoring. No PR automation. |
| **PRO** | All formats, unlimited repos, sync-status monitoring, PR-based proposed updates |
| **TEAM** | Centralized policy packs, org-level sync dashboard, exception governance, audit trail of generated rule changes |

### Concept

A compiler that reads DocuGardener policy and emits agent-native instruction artifacts. Policy is the single source of truth — instruction files in the repo are derived outputs, not handcrafted.

### User Stories

**Story 1:** As a platform engineer, I want one policy source for documentation behavior across AI coding tools, so that Copilot, Cursor, Claude Code, and local agents do not drift apart.

**Story 2:** As a team lead, I want agent rules to reflect the same documentation obligations as CI, so that developers get consistent guidance before they open a PR.

**Story 3:** As a compliance-minded admin, I want agent instruction files to be generated from governed policy rather than edited ad hoc, so that I can prove how agent behavior is controlled.

### Solution Design

**New module:** `src/rules/`

```
src/rules/
  __init__.py
  compiler.py          # Core compiler — policy → rendered instruction string
  sync.py              # Staleness detection (hash comparison)
  formats/
    __init__.py
    agents_md.py       # AGENTS.md renderer (Phase 5A)
    copilot.py         # .github/copilot-instructions.md renderer (Phase 5A)
    cursor.py          # .cursor/rules/ renderer (Phase 5A.1 — future)
```

**Compiler interface** (`src/rules/compiler.py`):
```python
@dataclass
class CompileTarget:
    format: str        # "agents_md" | "copilot_instructions"
    output_path: str   # e.g. "AGENTS.md" or ".github/copilot-instructions.md"

@dataclass
class CompileResult:
    content: str       # rendered file content
    content_hash: str  # SHA-256 of content (for sync detection)
    target: CompileTarget

class RulesCompiler:
    def compile(self,
                policy_rules: list[dict],
                tenant_policy_template: dict | None,
                target: CompileTarget) -> CompileResult: ...

    def compute_expected_hash(self,
                              policy_rules: list[dict],
                              target: CompileTarget) -> str: ...
```

**AGENTS.md output template:**
```markdown
# DocuGardener Agent Rules

> Auto-generated from DocuGardener policy. Do not edit manually.
> Last generated: {date} | Source policy hash: {hash[:8]}

## Documentation Obligations

When modifying code in this repository, the following documentation requirements apply:

{for each policy rule:}
### Rule: {rule.description or rule.pathPattern}
- **Applies to:** `{rule.pathPattern}`
- **Required update:** `{rule.docTarget}`
- **Severity:** {rule.severity} ({blocking → "CI will block merge if not updated" | advisory → "CI will warn but not block"})

## How to Check Before Opening a PR

Run the DocuGardener VS Code extension or use the pre-push hook.
DocuGardener CI will validate documentation compliance automatically on every PR.

## Escalation

If this analysis seems incorrect, use the feedback links in the PR comment.
```

**Copilot instructions output template:**
```markdown
# Documentation Requirements (DocuGardener)

> Auto-generated. Do not edit manually.

When writing or modifying code, follow these documentation rules:

{for each policy rule (concise form):}
- Files matching `{rule.pathPattern}`: update `{rule.docTarget}` ({rule.severity})

DocuGardener will validate these requirements in CI on every PR.
```

**Staleness detection** (`src/rules/sync.py`):
```python
def is_stale(current_content: str | None, expected_hash: str) -> bool:
    if current_content is None:
        return True  # Never generated
    actual_hash = hashlib.sha256(current_content.encode()).hexdigest()
    return actual_hash != expected_hash
```

**New Prisma model:**
```prisma
model RulesArtifact {
  id              String    @id @default(cuid())
  tenantId        String
  repoId          String    // maps to Repo.id
  targetFormat    String    // "agents_md" | "copilot_instructions"
  outputPath      String    // path in repo e.g. "AGENTS.md"
  lastHash        String?   // hash of last generated content
  lastGeneratedAt DateTime?
  lastPrUrl       String?   // GitHub PR URL for last proposed update
  isStale         Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, repoId, targetFormat])
}
```

**New API routes** (`web/app/api/repos/[id]/rules/`):

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/repos/[id]/rules` | List `RulesArtifact[]` for repo with staleness status |
| `POST` | `/api/repos/[id]/rules/preview` | Run compiler, return rendered content + diff vs current file |
| `POST` | `/api/repos/[id]/rules/generate` | Create/update file via GitHub App, return PR URL |

**GitHub App flow for generate:**
1. Fetch current file content via `GET /repos/{owner}/{repo}/contents/{path}` (handles missing gracefully)
2. Run compiler to get new content + hash
3. If content unchanged → update `isStale=false`, return `{ status: "in_sync" }`
4. If changed → create branch `docugardener/rules-update-{YYYY-MM-DD}`, commit file, open PR via existing GitHub App token (reuses `src/github/` module already used by FIX-01)
5. Store PR URL in `RulesArtifact.lastPrUrl`

**Frontend — new "Agent Rules" tab in Settings:**

`web/app/dashboard/settings/page.tsx` — add "Agent Rules" tab (PRO+ plan gate)

`web/components/settings/AgentRulesCard.tsx` — per-repo card showing:
- Selected target formats (checkboxes: AGENTS.md, Copilot instructions)
- Sync status badge: `In Sync ✅` / `Stale ⚠️` / `Never Generated ○`
- Last generated date and link to last PR
- "Preview" button → modal with rendered content and diff
- "Propose Update" button → calls `/generate`, opens PR URL

**Staleness cron:** Add a staleness check job to `src/scheduler/manager.py` — runs daily, compares expected hash against GitHub API file content for each `RulesArtifact`, updates `isStale` flag.

### Architecture Impact

| Layer | Change | Risk |
|---|---|---|
| Backend | New `src/rules/` module | Low — additive, no existing code modified |
| API | 3 new routes under `/api/repos/[id]/rules/` | Low |
| GitHub App | Reuse existing token + PR creation from FIX-01 | Low — proven pattern |
| Scheduler | Add staleness check cron task | Low |
| Frontend | New "Agent Rules" tab in Settings | Low |
| DB | New `RulesArtifact` model + migration | Low |
| DOCPOL-01 dependency | Reads from `workflowConfig.policyRules` — already exists | Low |

### Acceptance Criteria

- [x] `RulesCompiler.compile()` accepts policy rules and renders AGENTS.md output
- [x] `RulesCompiler.compile()` renders `.github/copilot-instructions.md` output
- [x] Generated output includes: path patterns, doc targets, severity, escalation guidance
- [x] Staleness detection correctly identifies when existing file differs from what policy would generate
- [x] Preview endpoint returns rendered content and diff vs current file
- [x] Generate endpoint creates a GitHub PR with updated instruction file
- [x] Settings UI shows sync status per repo per format
- [x] PRO+ plan gate enforced on API and UI (Free: single format, single repo only)
- [ ] TEAM plan: centralized policy pack visible in org-level sync dashboard (deferred to Phase 5A.1)
- [x] Staleness cron runs daily and updates `isStale` flags
- [x] Unit tests: compiler output for each format, staleness detection, hash stability

### Existing Files Affected

| File | Change |
|---|---|
| `src/scheduler/manager.py` | Add staleness check cron task |
| `web/app/dashboard/settings/page.tsx` | Add "Agent Rules" tab |
| `prisma/schema.prisma` | New `RulesArtifact` model |

### Risks

- **Policy adoption gate not met:** compiler generates boilerplate — mitigated by hard gate (30% custom policy adoption before shipping)
- **Format spec churn:** AGENTS.md format is not yet fully standardized — mitigated by scoping to 2 formats and keeping templates as plain text (easy to update)
- **GitHub API rate limits:** staleness cron queries GitHub for each artifact — mitigated by batching and using conditional requests (`If-None-Match` ETag)

### Estimated Effort

2–3 weeks / 1 engineer

---

## 5. MCP-01 — DocuGardener MCP Server (Phase 5B)

### Why this matters

This feature turns DocuGardener into a live documentation intelligence layer for coding agents. Instead of only blocking or commenting in CI, DocuGardener becomes queryable during authoring, review, remediation, and audit workflows.

**Long-term moat:** CI gates can be bypassed or dismissed. An AI assistant that proactively surfaces documentation obligations during coding cannot be bypassed the same way. This changes the product's stickiness category from "enforcement" to "infrastructure."

### Hard Prerequisite Gates

> **Amendment:** These gates are explicit go/no-go conditions. They must be verified before any MCP-01 implementation begins.

| Gate | Condition | Rationale |
|---|---|---|
| **G1** | FEED-01 running for ≥4 weeks with real signal | MCP queries amplify analysis quality — calibration must come first |
| **G2** | RULES-01 shipped | Confirms policy semantics are stable enough to expose externally |
| **G3** | ≥50 active tenants with ≥3 months of analysis history | Queries return empty results without data density — first impressions are permanent |
| **G4** | Auth design review complete | New external auth surface; tenant isolation must be reviewed before implementation |
| **G5** | `/check` endpoint relationship resolved | Decide if MCP becomes the internal substrate that `/check` calls, or they remain separate |

### SaaS Tier Design (replaces OSS framing)

> **Amendment:** original spec proposed a local open-source MCP server. This is reframed: local mode is a **Sovereign tier SaaS feature** (for self-hosted deployments), not a community OSS tool.

| Tier | Capability |
|---|---|
| **Free** | Not available |
| **PRO** | Hosted MCP access — impacted-doc lookup, policy preview, repo risk summary, unresolved drift. 100 queries/day. |
| **TEAM** | Org-wide context, evidence-chain visibility, governed access, 1,000 queries/day, usage dashboard |
| **Sovereign** | Self-hosted MCP endpoint, private-network deployment, custom auth, unlimited queries |

### Concept

An MCP server that allows agents and IDEs to query DocuGardener's live policy and documentation intelligence. All queries are read-only, tenant-scoped, and permission-aware.

### User Stories

**Story 1:** As a developer using an AI coding assistant, I want the agent to know which documentation files are likely affected by my change, so I receive correct guidance before CI fails my PR.

**Story 2:** As a platform engineer, I want coding agents to query DocuGardener's live policy and documentation context, so the same documentation logic is reused across IDEs, agents, and CI.

**Story 3:** As a security or compliance reviewer, I want externally connected agents to operate within tenant-aware, permission-aware boundaries, so documentation context access remains governed.

### /check Endpoint Relationship

> **Amendment:** The existing VS Code `/check` endpoint runs a full LLM analysis pipeline (the entire VerificationAgent). MCP tools are deliberately different — they are **fast DB lookups only, no LLM calls.**

| | `/check` (VS Code) | MCP tools |
|---|---|---|
| Speed | ~2–5 seconds (LLM call) | ~50–200ms (DB/Weaviate query) |
| Depth | Full drift analysis + suggestions | Historical data + policy lookup |
| Use case | Pre-push preview (developer action) | Agent context enrichment (background, mid-flow) |
| LLM call | Yes | No |

Future architecture (Phase 5B.1, not in scope now): `/check` calls MCP tools internally for the policy and impacted-doc lookup phase, running LLM only for the analysis step. This creates a single source of truth.

### Solution Design

**Implementation approach:** FastAPI router under `/mcp/v1/` in the main application. Not a separate process — avoids operational complexity. MCP HTTP transport spec allows REST-style endpoints.

**New module:** `src/api/mcp.py`

**Auth model — new Prisma model:**
```prisma
model MCPClient {
  id          String    @id @default(cuid())
  tenantId    String
  name        String    // e.g. "Claude Code", "Cursor", "Custom"
  tokenHash   String    @unique  // SHA-256 of token (same pattern as plugin API key)
  scopes      String[]  // ["impacted_docs", "policy", "risk", "drift"]
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
  revokedAt   DateTime?
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
}
```

Token issuance: `POST /api/settings/mcp/clients` → generates token (shown once, stored hashed, same pattern as plugin API key). Token resolved to tenant at request time, same mechanism as `_get_tenant_by_api_key()` in `src/api/check.py`.

**Middleware update** (`src/api/middleware.py`):
Add `/mcp/v1` to `self_auth_prefixes` — MCP routes authenticate via bearer token, not `X-Tenant-ID`.

**MCP tools exposed:**

**1. `get_impacted_docs`**
```
Input:  { "files": ["src/api/auth.py", "src/models/user.py"] }
Output: { "targets": [{ "doc_path": "docs/api/auth.md", "confidence": 0.87, "last_seen": "2026-03-10" }] }
```
Implementation:
- Query `Job.changedFiles` (JSON column) for jobs where input files appeared
- Extract `required_updates` from those jobs → deduplicate doc targets
- Score by frequency + recency
- Fallback: Weaviate similarity search on file paths → related doc content

**2. `check_policy`**
```
Input:  { "files": ["src/api/auth.py"] }
Output: { "matches": [{ "rule": "...", "doc_target": "docs/api/auth.md", "severity": "blocking" }] }
```
Implementation: Pattern-match `files` against `workflowConfig.policyRules[].pathPattern` using existing DOCPOL-01 matching logic. Pure Python, no DB call beyond loading policy config.

**3. `get_repo_risk`**
```
Input:  { "repo": "owner/repo-name" }
Output: { "vitality_index": 72, "unresolved_drift": 3, "last_analysis": "2026-03-11", "severity_distribution": {...} }
```
Implementation: Aggregate from `Job` table for matching repo. Reuses MAP-01 vitality index calculation.

**4. `get_unresolved_drift`**
```
Input:  { "repo": "owner/repo-name", "limit": 10 }
Output: { "items": [{ "pr": 142, "score": 78, "severity": "significant", "summary": "..." }] }
```
Implementation: Query `Job` table for status not in `["RESOLVED", "AUTO_FIXED"]`, ordered by drift score descending.

**5. `get_policy_rules`**
```
Input:  { "repo": "owner/repo-name" }
Output: { "rules": [...], "default_severity": "advisory", "blocking_threshold": 60 }
```
Implementation: Read from tenant's `workflowConfig.policyRules`. Returns the same policy RULES-01 compiles from.

**Router structure** (`src/api/mcp.py`):
```python
router = APIRouter(prefix="/mcp/v1")

@router.post("/tools/call")
async def call_tool(request: MCPToolRequest, token: str = Depends(verify_mcp_token)):
    tenant = await resolve_tenant_from_mcp_token(token)
    set_tenant_id(tenant.id)
    match request.tool:
        case "get_impacted_docs": return await _get_impacted_docs(tenant, request.params)
        case "check_policy":      return await _check_policy(tenant, request.params)
        case "get_repo_risk":     return await _get_repo_risk(tenant, request.params)
        case "get_unresolved_drift": return await _get_unresolved_drift(tenant, request.params)
        case "get_policy_rules":  return await _get_policy_rules(tenant, request.params)
        case _: raise HTTPException(404, f"Unknown tool: {request.tool}")

@router.get("/tools")
async def list_tools(token: str = Depends(verify_mcp_token)):
    """Returns tool schemas for MCP client discovery."""
    ...
```

**Rate limiting:** Apply existing `RateLimiter` from `src/monitoring/performance.py` — 100 req/min per token for PRO, 500 req/min for TEAM/Sovereign.

**Audit logging:** New `AuditEvent.MCP_QUERY` event written for each tool call: `{ tool_name, client_id, tenant_id, result_count, duration_ms }`.

**Sovereign / local mode (self-hosted only):**
A lightweight Python package `docugardener-mcp` published separately:
- Reads policy from `.github/docugardener.yml` in local filesystem
- Calls the self-hosted `/check` endpoint for analysis
- Runs as stdio MCP server (standard MCP local mode — works with Claude Code `mcpServers` config)
- No Postgres/Weaviate required for basic policy lookup tools
- Full hosted-mode tools available by pointing at self-hosted DocuGardener instance

**Frontend additions:**
- `web/app/dashboard/settings/page.tsx` — new "MCP Clients" section in Security tab (TEAM+ only)
- `web/components/settings/MCPClientsPanel.tsx` — create/revoke MCP client tokens, show name + last used + scopes
- `web/app/api/settings/mcp/route.ts` — `GET` list clients, `POST` create client (returns token once), `DELETE` revoke

**New env var:** `MCP_ENABLED=true` — feature flag for gradual rollout.

### Architecture Impact

| Layer | Change | Risk |
|---|---|---|
| Backend | New `src/api/mcp.py` router | Medium — new auth surface |
| Middleware | Add `/mcp/v1` to `self_auth_prefixes` | Low |
| Auth | New `MCPClient` model + token resolution | Medium — security-sensitive |
| DB | `MCPClient` model, `AnalysisFeedback` already exists | Low |
| `Job` model | May need `changedFiles` JSON indexing for impacted-doc query performance | Medium — check existing schema |
| Audit | New `MCP_QUERY` event type in `AuditEvent` enum | Low |
| Frontend | MCP client management UI in Settings Security tab | Low |
| Rate limiting | Extend existing `RateLimiter` to MCP router | Low |

### Acceptance Criteria

- [ ] MCP server exposes: `get_impacted_docs`, `check_policy`, `get_repo_risk`, `get_unresolved_drift`, `get_policy_rules`
- [ ] All responses are tenant-scoped — no cross-tenant data leak possible
- [ ] All tool calls are read-only — no state mutation via MCP
- [ ] `GET /mcp/v1/tools` returns tool schema for MCP client discovery
- [ ] Auth: bearer token resolves to tenant + scope check
- [ ] Rate limiting: 100 req/min PRO, 500 req/min TEAM/Sovereign
- [ ] `MCP_QUERY` audit log event written for every tool invocation
- [ ] Token issuance/revocation UI in Settings Security tab (TEAM+)
- [ ] Sovereign local-mode package (`docugardener-mcp`) runnable as stdio MCP server
- [ ] Security review sign-off before launch (tenant isolation verified)
- [ ] Documentation: what data each tool can and cannot return, scopes, rate limits

### Existing Files Affected

| File | Change |
|---|---|
| `src/main.py` | Include MCP router |
| `src/api/middleware.py` | Add `/mcp/v1` to `self_auth_prefixes` |
| `src/api/check.py` | Potentially refactor `_get_tenant_by_api_key()` into shared auth util |
| `web/lib/audit.ts` | Add `MCP_QUERY` to `AuditEvent` enum |
| `web/app/dashboard/settings/page.tsx` | Add MCP clients section to Security tab |
| `prisma/schema.prisma` | New `MCPClient` model + `AuditEvent.MCP_QUERY` |

### Risks

- **Tenant isolation failure** — mitigated by dedicated security review gate before implementation and targeted integration tests
- **Empty results on early launch** — mitigated by G3 gate (50+ tenants, 3+ months history)
- **Query performance** — `get_impacted_docs` scans `Job.changedFiles` JSON column; requires GIN index on this column if not already present
- **MCP spec evolution** — MCP HTTP transport spec is still maturing; implementation uses thin adapter layer so transport changes are isolated

### Estimated Effort

4–6 weeks / 1 engineer (including auth design review and security testing)

---

## 6. Comparative Moat Assessment

### RULES-01

Defensibility: moderate as a raw generator, strong as a standardized policy control layer backed by GitHub App automation, governance reporting, and audit trail of generated rule changes.

Main moat contribution: makes DocuGardener the source of truth for agent behavior around docs — policy lives in one place, instruction files are derived outputs.

### MCP-01

Defensibility: more technically and operationally demanding to replicate correctly. Strongest when backed by mature policy semantics, real analysis history, and enterprise-grade auth/isolation.

Main moat contribution: makes DocuGardener the live context provider for documentation-aware agents — the product becomes infrastructure, not just a gate.

### Together

- RULES-01: static agent governance layer
- MCP-01: live agent context layer

These create a two-layer position that is harder to compete with than either feature alone, and harder still to replicate without DocuGardener's existing data foundation.

---

## 7. Build Order

```
FEED-01 (prerequisite — 1 week)
    │
    ▼
RULES-01 Phase 5A (2–3 weeks)
    │  ← wait: policy adoption gate, FEED-01 signal collecting
    ▼
[Gate check: ≥50 active tenants, ≥3 months history, auth design review]
    │
    ▼
MCP-01 Phase 5B (4–6 weeks)
```

### Why this order

- FEED-01 is the fastest path to a data advantage no clone can replicate
- RULES-01 builds on proven DOCPOL-01 foundation with low integration risk
- RULES-01 stabilizes policy semantics that MCP-01 depends on
- MCP-01 needs data density and policy maturity that only time + RULES-01 adoption produces

---

## 8. KPI / Success Metrics

### FEED-01
- % of analysis comments that receive a signal (target: >20% within 60 days)
- False-positive rate per tenant (target: <15% for PRO+ tenants)
- Trend: false-positive rate decreasing over time as prompt calibration improves

### RULES-01
- % of repos with at least one generated instruction artifact
- % of repos where artifact is in-sync (not stale)
- Reduction in policy-triggered CI failures 30 days after rule generation adoption
- PRO conversion rate among repos that use the compiler

### MCP-01
- Number of active MCP clients per tenant
- Tool query volume per tenant per day
- % of PRs where `get_impacted_docs` was queried before the PR was opened
- Reduction in time-to-remediation for drift findings in tenants using MCP
- TEAM/Sovereign conversion rate influenced by MCP client creation

---

## 9. Final Recommendation

The sequence and gates defined in this spec are the correct production path:

1. `FEED-01` because it is the data foundation — 1 week of engineering, permanent compounding advantage
2. `RULES-01` because it is the practical near-term wedge — shift-left value, low integration risk, builds on DOCPOL-01
3. `MCP-01` because it is the long-term platform moat — high-upside but must land on a foundation of real data and stable policy semantics

This keeps DocuGardener anchored to its strongest market position:

> documentation verification, remediation, and governance for agent-native software development

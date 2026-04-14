# SA-MANAGED-AGENTS-01: Anthropic Managed Agents — Fit Assessment for DocuGardener

> **Author:** SA | **Date:** 2026-04-09 | **Status:** Assessment complete
> **Source:** [Claude Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview), [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Blog announcement](https://claude.com/blog/claude-managed-agents)

---

## 1. Executive Summary

Anthropic's **Claude Managed Agents** (beta, April 2026) is a fully managed agent runtime: you define an Agent (model + system prompt + tools), an Environment (container config), and launch Sessions that execute autonomously with bash, file I/O, web search, and MCP server access. Sessions are long-running, stateful, and billed at **standard Claude token rates + $0.08/session-hour**.

**Verdict:** Managed Agents is architecturally **misaligned** with DocuGardener's core pipeline. It solves a problem DG doesn't have (agent loop + sandbox infrastructure) while introducing problems DG can't afford (vendor lock-in, cost inflation, loss of multi-provider BYOK). However, there is **one strong fit** at the periphery: a future **AI-powered documentation authoring agent** that could run as a Managed Agent session, triggered by DG's existing pipeline when zero-touch doc generation is needed.

---

## 2. What Managed Agents Actually Is

### Core Concepts

| Concept | What It Is | DG Equivalent |
|---------|-----------|---------------|
| **Agent** | Model + system prompt + tools + MCP servers | `VerificationAgent` in `verifier.py` |
| **Environment** | Container template (packages, network, files) | RQ worker process + ephemeral `/tmp/` clone |
| **Session** | Running agent instance; persistent file system | Single `analyze_pr_job` execution |
| **Events** | SSE stream: user turns, tool calls, status | RQ job status + webhook callback |

### Built-in Tools

| Tool | DG Pipeline Usage |
|------|------------------|
| Bash | Git clone/push only (in `committer.py`) — not LLM-driven |
| Read/Write/Edit | Doc file writes (in `committer.py`) — deterministic, not LLM-driven |
| Glob/Grep | Code search (in `analyzer.py`) — already done before LLM call |
| Web search/fetch | Not used in pipeline |
| MCP servers | Not used |

### Pricing

| SKU | Rate |
|-----|------|
| Sonnet 4.6 input | $3/MTok |
| Sonnet 4.6 output | $15/MTok |
| Haiku 4.5 input | $1/MTok |
| Haiku 4.5 output | $5/MTok |
| Session runtime | $0.08/hr (while `running`) |
| Web search | $10/1K searches |

**Key constraint:** Managed Agents is Anthropic-only. No Gemini, no OpenAI, no Ollama. Claude models exclusively.

---

## 3. DG's Current LLM Architecture (Functional Map)

### LLM Touchpoints

DocuGardener has **exactly 4 LLM call sites**, all in `src/agents/verifier.py`:

| Call | Purpose | Input | Output | Avg Tokens |
|------|---------|-------|--------|------------|
| **Generator Stage 1** | Draft documentation from code change | Entity change + existing docs + vector context | `DocumentationDraft` (markdown) | ~2K in / ~4K out |
| **Verifier Stage 2** | Hallucination check on draft | Code + draft | `VerificationResult` (verdict + issues) | ~3K in / ~1K out |
| **Drift Proposal** | Summarize drift from changes | Change list + deterministic score | JSON (summary, required_updates) | ~2K in / ~2K out |
| **Drift Verification** | Audit drift proposal | Code diff + proposal | `DriftAnalysis` (score, severity, block_merge) | ~3K in / ~1K out |

**Total per PR analysis: ~10K input + ~8K output tokens, 4 sequential LLM calls.**

### What the LLM Does NOT Do

- No tool calling (no function_call, no tool_use)
- No code execution
- No file I/O
- No web search
- No multi-turn conversation
- No autonomous decision-making about what to do next

The LLM is a **stateless text processor**: prompt in → structured JSON/markdown out. The pipeline orchestration (what to analyze, what to write, where to commit) is entirely deterministic Python code.

### Multi-Provider BYOK Architecture

```
Tenant A → Gemini 2.5 Flash (BYOK key) → $0.10/$0.40 per MTok
Tenant B → OpenAI GPT-4o (BYOK key)   → $2.50/$10.00 per MTok  
Tenant C → Ollama Gemma 27B (self-hosted) → $0.00
Tenant D → Bundled Gemini (platform key) → $0.10/$0.40 per MTok
Tenant E → Anthropic Sonnet (BYOK key)  → $3.00/$15.00 per MTok
```

This is the **core BYOK value proposition**: tenants choose their own provider, model, and cost profile. The LLM abstraction layer (`LLMClient` ABC → `GeminiClient`, `OpenAIClient`, `AnthropicClient`, `OllamaClient`) is what makes this possible.

---

## 4. Fit Analysis: Where Managed Agents Maps to DG

### 4.1 Core PR Analysis Pipeline — ❌ DOES NOT FIT

| Managed Agents Feature | DG Pipeline Reality | Fit |
|----------------------|---------------------|-----|
| Long-running sessions (hours) | PR analysis completes in 10–60 seconds | ❌ Overkill |
| Sandboxed container (bash, files) | LLM never touches filesystem; all I/O is deterministic Python | ❌ Unused |
| Agent toolset (read/write/grep) | Code parsing done BEFORE LLM call; LLM receives pre-processed context | ❌ Unused |
| Stateful session persistence | Each analysis is stateless; no conversation history between PRs | ❌ Mismatch |
| SSE event streaming | Webhook → RQ job → callback; no user watching in real-time | ❌ Unnecessary |
| Multi-agent coordination | Two-stage generator/verifier is sequential, not multi-agent | ❌ Unnecessary |
| MCP server support | DG has no MCP servers | ❌ N/A |

**Why it doesn't fit:** DG's LLM usage is the simplest possible pattern — 4 sequential `generate(prompt) → text` calls with no tools, no conversation, no autonomy. Wrapping this in a Managed Agent session adds:
- Container provisioning latency (~seconds) on top of a 10-second pipeline
- $0.08/hr session runtime overhead (minimum billing unclear, likely ≥1 minute)
- Anthropic-only model lock (kills BYOK for Gemini/OpenAI/Ollama)
- Loss of per-tenant provider routing

### 4.2 Auto-Fix PR Generation — ❌ DOES NOT FIT

The fix PR flow (`committer.py`) is:
1. Clone repo → checkout SHA → write doc files → commit → push → create PR → auto-merge

This is **100% deterministic git/GitHub API operations**. The LLM has already finished by this point. There is nothing for a Managed Agent to do here that `GitCommitter` doesn't already handle.

### 4.3 Agent Rules Compiler — ❌ DOES NOT FIT

Deterministic template rendering. No LLM involved.

### 4.4 Future: AI Documentation Authoring Agent — ✅ POTENTIAL FIT

If DG evolves toward a more autonomous documentation authoring mode (beyond the current "detect drift → suggest fix" pattern), a Managed Agent could be valuable:

**Scenario:** "Given this repository, write comprehensive API documentation from scratch."

This would need:
- File system access (read source code across the repo)
- Bash (run tests, check build, validate generated docs)
- Multi-turn reasoning (iterate on documentation quality)
- Long-running execution (full repo scan could take minutes)
- Web search (look up library documentation for context)

**This is the only DG use case where Managed Agents adds genuine value.** But it's a future feature, not a current architectural need.

### 4.5 VS Code Extension MCP Bridge — ⚠️ WEAK FIT

The VS Code extension could theoretically use a Managed Agent session as its LLM backend, giving IDE users an agent that can read/edit files and run commands. But:
- DG's VS Code extension is a drift viewer, not an autonomous editor
- IDE agent capabilities already exist via Copilot, Cursor, Claude Code
- Adding another agent framework creates UX confusion

**Not worth pursuing.**

---

## 5. NFR Analysis

### 5.1 Vendor Lock-in — ⛔ CRITICAL RISK

| Dimension | Current State | With Managed Agents |
|-----------|--------------|-------------------|
| LLM Provider | 4 providers (Gemini, OpenAI, Anthropic, Ollama) | Anthropic only |
| Model selection | Tenant-configurable | Anthropic models only |
| BYOK | Full support | Only Anthropic keys |
| Self-hosted LLM | Ollama supported | Impossible |
| Infrastructure | Any cloud / on-prem | Anthropic cloud only |
| API surface | Standard Messages API (portable) | Proprietary Sessions/Events API |

**Impact:** Adopting Managed Agents for the core pipeline would **destroy DG's BYOK value proposition** — the #2 differentiator after ephemeral security. Tenants who chose DG specifically because they can bring their own Gemini key or run Ollama on-prem would lose that capability.

**AGPL self-hosting would be impossible.** Self-hosters can't run Managed Agent sessions on their own infrastructure. The AGPL promise of "full functionality when self-hosted" breaks.

### 5.2 Cost Impact — ⛔ SIGNIFICANT INCREASE

**Current cost per PR analysis (bundled Gemini 2.5 Flash):**
```
Input:  10K tokens × $0.10/MTok = $0.001
Output:  8K tokens × $0.40/MTok = $0.0032
Total: ~$0.0042 per PR analysis
```

**Same analysis via Managed Agents (Sonnet 4.6):**
```
Input:  10K tokens × $3.00/MTok  = $0.030
Output:  8K tokens × $15.00/MTok = $0.120
Session: ~30s runtime × $0.08/hr = $0.0007
Total: ~$0.151 per PR analysis
```

**Cost multiplier: 36x** for the same work. Even with Haiku 4.5:
```
Input:  10K tokens × $1.00/MTok = $0.010
Output:  8K tokens × $5.00/MTok = $0.040
Session runtime:                  $0.0007
Total: ~$0.051 per PR analysis
```
**Still 12x more expensive** than Gemini Flash.

At DG's FREE tier (50 analyses/month):
- Current: $0.21/month/tenant (Gemini)
- Managed Agents Haiku: $2.55/month/tenant
- Managed Agents Sonnet: $7.55/month/tenant

At PRO tier (500 analyses/month):
- Current: $2.10/month/tenant
- Managed Agents Haiku: $25.50/month/tenant
- Managed Agents Sonnet: $75.50/month/tenant

**This destroys the unit economics of the FREE tier** and significantly compresses PRO margins.

### 5.3 Extendability — ⚠️ MIXED

| Aspect | Assessment |
|--------|-----------|
| Adding new LLM tools | ✅ Managed Agents makes tool addition easy (define schema, agent calls it) |
| Adding new providers | ❌ Impossible — Anthropic only |
| Custom agent behaviors | ✅ System prompt + tool configuration is flexible |
| Self-evaluation / iteration | ✅ Research preview feature could improve draft quality |
| Multi-agent coordination | ✅ Could enable parallel analysis of different file groups |
| MCP integration | ✅ Native MCP support could connect to GitHub, Jira, etc. |

The extendability story is strong **within the Anthropic ecosystem** but zero outside it.

### 5.4 Latency — ⚠️ REGRESSION

Current pipeline latency: **10–60 seconds** (4 LLM calls + code parsing + git operations).

Managed Agents adds:
- Container provisioning: 2–5 seconds (first session; warm containers may be faster)
- Agent loop overhead: Each tool call is a round-trip through Anthropic's infrastructure
- SSE streaming overhead: Event serialization/deserialization

Estimated regression: **+5–15 seconds** per analysis for no functional benefit.

### 5.5 Data Residency / Compliance — ⚠️ CONCERN

DG's ephemeral security promise: "Code is analyzed in RAM and wiped instantly."

With Managed Agents:
- Code would be uploaded to Anthropic's containers
- Session state persists server-side (event history)
- File system within session is persistent during session lifetime
- No explicit data retention guarantees in beta docs

For regulated industries (FinTech, MedTech — DG's target market), sending source code to a third-party managed container is a harder compliance sell than sending a text prompt to an LLM API.

---

## 6. Recommendation Matrix

| Use Case | Fit | Recommendation | Rationale |
|----------|-----|---------------|-----------|
| **Core PR analysis pipeline** | ❌ | **Do NOT adopt** | Kills BYOK, 12–36x cost increase, adds latency, no functional benefit |
| **Auto-fix PR generation** | ❌ | **Do NOT adopt** | Deterministic git ops; no LLM involvement |
| **Agent rules compiler** | ❌ | **Do NOT adopt** | No LLM involvement |
| **VS Code extension** | ❌ | **Do NOT adopt** | DG extension is a viewer, not an agent |
| **Future: full-repo doc authoring** | ✅ | **Evaluate when feature is scoped** | Genuine fit for autonomous, long-running, tool-using agent work |
| **Owner dashboard AI assistant** | ⚠️ | **Low priority; evaluate post-launch** | Could answer owner questions about tenant health; not a current need |

---

## 7. Strategic Recommendation

### Do Not Adopt for Core Pipeline

The core analysis pipeline should remain as-is: 4 direct `generate()` calls through the multi-provider `LLMClient` abstraction. This preserves:
- BYOK (4 providers)
- AGPL self-hosting capability (Ollama on-prem)
- $0.004/analysis unit economics (Gemini Flash)
- Ephemeral security guarantee (no code in third-party containers)
- Sub-60-second pipeline latency

### Watch for Future Use Cases

Monitor Managed Agents maturity for:
1. **Full-repo documentation generation** (AGV-05+ territory): If DG adds a "write docs from scratch" mode, Managed Agents is the right infrastructure. The agent needs to read files, run code, iterate — exactly what Sessions provide.
2. **Multi-provider support in Managed Agents**: If Anthropic adds Gemini/OpenAI model routing within Sessions, the vendor lock concern diminishes significantly.
3. **Self-hosted Managed Agents runtime**: If Anthropic releases an on-prem agent runtime (unlikely in near term), AGPL compatibility improves.

### Concrete Next Steps

| Action | Priority | Timeline |
|--------|----------|----------|
| No code changes to core pipeline | — | — |
| Add this assessment to `docs/specs/` | P0 | Done |
| Re-evaluate when AGV-05 (policy packs) is scoped | P2 | Q3 2026 |
| Track Managed Agents GA + multi-provider support | P3 | Ongoing |
| If Managed Agents adds Gemini/OpenAI routing → reassess | P1 | When announced |

---

## 8. What WOULD Improve DG's LLM Layer Instead

Instead of Managed Agents, these five changes genuinely improve DG's architecture — all work within the existing multi-provider model, require no vendor lock-in, and reduce costs rather than inflating them.

| ID | Improvement | Effort | Impact |
|----|------------|--------|--------|
| **LLM-OPT-01** | Prompt caching for system prompts (all providers support it) | S | 40–60% input cost reduction |
| **LLM-OPT-02** | Batch API for non-urgent analyses (50% token discount) | M | 50% cost reduction for queued work |
| **LLM-OPT-03** | Parallel generator/verifier calls per entity (currently sequential) | S | 30–50% latency reduction |
| **LLM-OPT-04** | Model auto-selection (Haiku for simple changes, Sonnet for complex) | M | Cost optimization without quality loss |
| **LLM-OPT-05** | Streaming responses (progressive UI update in triage panel) | M | Perceived latency improvement |

---

### LLM-OPT-01 — Prompt Caching for System Prompts

**Priority:** P0 | **Effort:** S | **Impact:** 40–60% input cost reduction

#### The Problem

DG makes 4 LLM calls per PR analysis. Each call sends the full system prompt (~150–200 tokens for base, up to ~2K when domain-anchored via `prompt_manager`). The system prompts are **identical across all calls for the same tenant** within a session, and nearly identical across sessions (they only change when a tenant edits their custom prompt in Settings).

Currently, `prompt_manager.get_prompt(tenant_id, key)` fetches from the DB on every call. The system prompt is assembled at runtime: `DOMAIN_PREAMBLE + custom_content + DOMAIN_POSTAMBLE`. No caching is applied at any level.

#### What All Providers Offer

All 4 of DG's supported providers now have prompt caching:

| Provider | Caching Type | Min Tokens | Discount | TTL | Activation |
|----------|-------------|-----------|----------|-----|-----------|
| **Gemini** | Implicit (auto, Gemini 2.5+) | None for implicit | **90% off** cached input | Auto-managed | Automatic — no code change needed |
| **Gemini** | Explicit (manual) | 32,768 tokens | 90% off | Configurable | `CachedContent.create()` API |
| **OpenAI** | Automatic | 1,024 tokens | **50–90% off** | 5–10 min idle, max 1h | Automatic — no code change needed |
| **Anthropic** | Explicit (`cache_control`) | 1,024–4,096 (model-dependent) | **90% off** reads (10% of base); writes 1.25× | 5 min or 1 hour | Add `cache_control` to request |
| **Ollama** | N/A | — | — | — | Local; no token cost |

#### Implementation

**Layer 1: Application-level prompt caching (all providers)**

Cache the assembled system prompt per `(tenant_id, prompt_key)` in `prompt_manager`:

```python
# src/storage/prompt_manager.py
_prompt_cache: dict[tuple[str, str], tuple[str, float]] = {}  # (tenant_id, key) → (prompt, timestamp)
PROMPT_CACHE_TTL = 300  # 5 minutes

def get_prompt(tenant_id: str, key: str) -> str:
    cache_key = (tenant_id, key)
    if cache_key in _prompt_cache:
        cached, ts = _prompt_cache[cache_key]
        if time.time() - ts < PROMPT_CACHE_TTL:
            return cached
    # DB fetch + assemble
    prompt = _DOMAIN_PREAMBLE + db_fetch(tenant_id, key) + _DOMAIN_POSTAMBLE
    _prompt_cache[cache_key] = (prompt, time.time())
    return prompt
```

This eliminates redundant DB queries (4 per analysis → 0 after first call).

**Layer 2: Anthropic provider-level caching**

For tenants using Anthropic, add `cache_control` to the system prompt block in `AnthropicClient.generate()`:

```python
# In AnthropicClient.generate():
response = await self.client.messages.create(
    model=self.model,
    max_tokens=config.max_tokens,
    system=[{
        "type": "text",
        "text": system_prompt,
        "cache_control": {"type": "ephemeral"},  # 5-min cache
    }],
    messages=[{"role": "user", "content": prompt}],
)
```

The system prompt (~200 tokens base) is below Anthropic's 1,024–4,096 minimum for some models. However, when combined with the user prompt preamble (entity context, related docs), the cacheable prefix often exceeds the threshold. Use explicit breakpoints to ensure the static portion (system prompt + entity schema description) is cached.

**Layer 3: Gemini and OpenAI — already automatic**

Gemini 2.5+ implicit caching and OpenAI automatic caching require **zero code changes**. They cache the longest matching prefix automatically. Since DG's system prompts are placed first in every call, they will be cached on the second call within a session.

#### Cost Impact (500 analyses/month, bundled Gemini Flash)

```
Current input cost:    500 × 10K tokens × $0.10/MTok = $0.50/month
With 90% cache hit:    500 × (1K new + 9K cached×0.1) × $0.10/MTok = $0.095/month
Savings: ~80%
```

For Anthropic BYOK tenants (Sonnet):
```
Current input cost:    500 × 10K × $3.00/MTok = $15.00/month
With cache (10% read):  500 × (1K×$3.00 + 9K×$0.30)/MTok = $2.85/month
Savings: ~81%
```

#### Files to Change

| File | Change |
|------|--------|
| `src/storage/prompt_manager.py` | Add in-memory TTL cache for assembled prompts |
| `src/agents/llm.py` (`AnthropicClient`) | Add `cache_control` to system prompt block |
| No change needed for Gemini/OpenAI | Automatic caching is already active |

---

### LLM-OPT-02 — Batch API for Non-Urgent Analyses

**Priority:** P1 | **Effort:** M | **Impact:** 50% cost reduction for queued work

#### The Problem

Every PR analysis is processed individually as a real-time RQ job. But not all analyses are equally urgent:

- **Urgent:** `pull_request.opened` / `pull_request.synchronize` — developer is actively waiting for the check run
- **Non-urgent:** Scheduled re-analyses, bulk repo scans, drift audits, batch imports

Currently, all analyses pay full real-time token rates. The Batch API (available on Anthropic and OpenAI) provides a **50% discount** for requests that can tolerate up to 24 hours latency (most finish in <1 hour).

#### Provider Support

| Provider | Batch API | Discount | Max Latency | Batch Size |
|----------|----------|---------|-------------|-----------|
| **Anthropic** | Message Batches API | 50% all tokens | 24h (typically <1h) | 100,000 requests |
| **OpenAI** | Batch API | 50% all tokens | 24h (typically <1h) | 50,000 requests |
| **Gemini** | Not available | — | — | — |
| **Ollama** | N/A (local) | — | — | — |

#### Architecture

Add a new queue tier: `QUEUE_BATCH` alongside existing `QUEUE_HIGH` and `QUEUE_DEFAULT`.

```
Webhook handler
  ├── pull_request.opened → QUEUE_DEFAULT (real-time)
  ├── pull_request.synchronize → QUEUE_DEFAULT (real-time)
  ├── ignore_drift / fix_pr → QUEUE_HIGH (urgent)
  └── scheduled_scan / bulk_audit → QUEUE_BATCH (batched)
```

**Batch collection flow:**

1. Non-urgent jobs enqueued to `QUEUE_BATCH` with `batch_eligible=True` metadata
2. A **batch scheduler** (runs every 5 minutes via `IntervalTrigger`) collects pending batch jobs
3. For each provider that supports batching:
   - Assemble LLM call parameters (system prompt + user prompt + config) for each job
   - Submit as a single batch request to the provider's Batch API
   - Store `batch_id` → `[job_ids]` mapping in Redis
4. A **batch poller** (runs every 60 seconds) checks batch status
5. When batch completes: extract results, update job records, trigger check run updates

```python
# Anthropic Batch API usage
batch = client.beta.messages.batches.create(
    requests=[
        {
            "custom_id": f"job-{job_id}",
            "params": {
                "model": "claude-sonnet-4-6",
                "max_tokens": 16384,
                "system": system_prompt,
                "messages": [{"role": "user", "content": prompt}],
            },
        }
        for job_id, system_prompt, prompt in batch_items
    ]
)
# Poll: client.beta.messages.batches.retrieve(batch.id)
# Results: client.beta.messages.batches.results(batch.id)
```

#### When to Use

| Trigger | Queue | Batch Eligible |
|---------|-------|---------------|
| `pull_request.opened` | QUEUE_DEFAULT | No — developer waiting |
| `pull_request.synchronize` | QUEUE_DEFAULT | No — developer waiting |
| Accept/Ignore/Fix actions | QUEUE_HIGH | No — user action |
| Scheduled daily repo scan | QUEUE_BATCH | **Yes** |
| Bulk import (onboarding) | QUEUE_BATCH | **Yes** |
| Re-analysis after rules change | QUEUE_BATCH | **Yes** |
| Drift audit (compliance report) | QUEUE_BATCH | **Yes** |

#### Cost Impact

Assuming 30% of monthly volume is batch-eligible (scheduled scans, bulk imports):

```
PRO tier: 500 analyses/month
Real-time (70%): 350 × $0.004 = $1.40
Batch (30%):     150 × $0.002 = $0.30  (50% off)
Total: $1.70 vs current $2.10 → 19% savings
```

For Anthropic BYOK:
```
Real-time (70%): 350 × $0.150 = $52.50
Batch (30%):     150 × $0.075 = $11.25
Total: $63.75 vs current $75.00 → 15% savings
```

The savings scale linearly with batch-eligible volume. Enterprise tenants running nightly drift audits across 50+ repos would see the highest impact.

#### Files to Change

| File | Change |
|------|--------|
| `src/worker/queue.py` | Add `QUEUE_BATCH` constant |
| `src/worker/jobs.py` | Add `batch_analyze_pr_job()` that defers LLM calls |
| `src/agents/llm.py` | Add `generate_batch()` method to `AnthropicClient` and `OpenAIClient` |
| `src/scheduler/manager.py` | Add batch collector (5min) + batch poller (60s) triggers |
| New: `src/worker/batch_manager.py` | Batch assembly, submission, polling, result distribution |

#### Limitations

- **Gemini has no Batch API** — bundled Gemini tenants continue at real-time rates
- **Batch latency is non-deterministic** — jobs may take up to 24h (SLA), though typically <1h
- **Check run UX** — batched analyses should show "Queued (batch)" status, not "In progress"
- **Not suitable** for any user-facing interaction where the developer is waiting

---

### LLM-OPT-03 — Parallel Entity Analysis

**Priority:** P0 | **Effort:** S | **Impact:** 30–50% latency reduction

#### The Problem

DG processes entities **sequentially** in a for-loop (up to 5 per PR):

```python
# Current: src/pipeline/analyzer.py, line ~319
for change in meaningful_changes[:5]:
    draft = await self.verifier.generate_documentation(
        change=change,
        related_docs=related_docs,
    )
    if draft.is_verified:
        result.documentation_updates.append(draft)
```

Each `generate_documentation()` involves 2 LLM calls (generator + verifier), each taking ~1–2 seconds. With 5 entities: **10–20 seconds of serial LLM wait time**.

These calls are **independent** — entity A's documentation draft has no dependency on entity B's draft. They can safely run in parallel.

#### Implementation

Replace the sequential loop with `asyncio.gather()`:

```python
# Proposed: src/pipeline/analyzer.py
async def _generate_doc_for_entity(
    self, change: EntityChange, related_docs: list[str]
) -> DocumentationDraft | None:
    """Generate + verify docs for a single entity. Returns None if not verified."""
    draft = await self.verifier.generate_documentation(
        change=change,
        related_docs=related_docs,
    )
    return draft if draft.is_verified else None

# In analyze_pr():
tasks = [
    self._generate_doc_for_entity(change, related_docs)
    for change in meaningful_changes[:5]
]
drafts = await asyncio.gather(*tasks, return_exceptions=True)

for draft in drafts:
    if isinstance(draft, Exception):
        logger.warning("Entity doc generation failed", exc_info=draft)
        continue
    if draft is not None:
        result.documentation_updates.append(draft)
```

#### Rate Limiting Consideration

The per-tenant rate limiter (`LLMTenantRateLimiter`: 60 calls/min, burst=10) applies. With 5 entities × 2 calls each = 10 concurrent LLM calls, this exactly hits the burst limit. Options:

1. **Keep burst=10** — all 5 entities fire in parallel, burst absorbs it. This is the recommended approach since PR analyses are infrequent per tenant (minutes apart).
2. **Semaphore throttle** — limit to 3 concurrent entities if rate limit is a concern:
   ```python
   sem = asyncio.Semaphore(3)
   async def _throttled_generate(change, related_docs):
       async with sem:
           return await self._generate_doc_for_entity(change, related_docs)
   ```

#### Latency Impact

| Entities | Current (sequential) | Proposed (parallel) | Improvement |
|----------|---------------------|-------------------|------------|
| 2 | ~4s | ~2s | 50% |
| 3 | ~6s | ~2s | 67% |
| 5 | ~10s | ~2s | 80% |

The parallel wall-clock time is bounded by the **slowest single entity**, not the sum. With typical LLM response times of 1–2s, the total drops to ~2s regardless of entity count.

#### Drift Analysis — Already Efficient

`analyze_drift()` processes all changes in a **single LLM call** (2 calls total: proposal + verification). No parallelization needed here — it's already the optimal pattern.

#### Files to Change

| File | Change |
|------|--------|
| `src/pipeline/analyzer.py` | Replace sequential entity loop with `asyncio.gather()` |
| `src/agents/verifier.py` | No change (already async) |
| `src/agents/llm.py` | No change (rate limiter already handles burst) |

**This is the highest-ROI optimization**: minimal code change, zero infrastructure cost, immediate latency improvement.

---

### LLM-OPT-04 — Model Auto-Selection by Complexity

**Priority:** P1 | **Effort:** M | **Impact:** Cost optimization without quality loss

#### The Problem

Today, DG uses **one model for everything** within a tenant's analysis. A single-line typo fix in a README gets the same model (e.g., Sonnet 4.6 at $3/$15 per MTok) as a 500-line refactor of a core API module. The quality requirements are vastly different:

- **Simple changes** (cosmetic, renamed variable, docstring tweak): Haiku-class model is sufficient
- **Complex changes** (new public API, major refactor, security-sensitive code): Sonnet/Pro-class model needed

#### Complexity Signals Already Available

DG's pipeline already computes signals that indicate analysis complexity — they just aren't used for model selection:

| Signal | Source | Location | What It Tells |
|--------|--------|----------|--------------|
| `change_type` | SemanticDiff | `analyzer.py` | `COSMETIC` / `RENAMED` / `SIGNATURE_CHANGED` / `LOGIC_MODIFIED` / `ADDED` / `DELETED` |
| `is_public` | Code parser | `EntityChange` | Public API surface vs internal |
| `diff_line_count` | GitHub API | `changed_files` | Size of the change |
| `entity_count` | Pipeline | `meaningful_changes` | Number of entities affected |
| `kern_tier` | Holistic scorer | `scorer.py` | `Kernel` / `Feature` / `Leaf` classification |
| `blast_radius` | Holistic scorer | `scorer.py` | Cross-file reference count |
| `directory_weight` | Holistic scorer | `scorer.py` | 2.0× for critical paths, ≤0.5× for leaf |

#### Model Tier Strategy

Define a `select_model_tier()` function that maps complexity signals to model quality requirements:

```python
# src/agents/model_selector.py
from enum import Enum

class ModelTier(Enum):
    FAST = "fast"      # Haiku-class: cheap, fast, good enough for simple
    STANDARD = "standard"  # Sonnet/Flash: default, balanced
    DEEP = "deep"      # Opus/Pro: expensive, thorough, for critical code

def select_model_tier(changes: list[EntityChange], holistic_context: dict | None) -> ModelTier:
    """Select model tier based on complexity signals."""
    # Fast path: all cosmetic → FAST
    if all(c.change_type in ("COSMETIC", "RENAMED") for c in changes):
        return ModelTier.FAST

    # Deep path: kernel-tier code, high blast radius, or security-sensitive
    if holistic_context:
        if holistic_context.get("kern_tier") == "Kernel":
            return ModelTier.DEEP
        if holistic_context.get("blast_radius", 0) > 10:
            return ModelTier.DEEP

    # Deep path: public API surface with logic changes
    public_logic_changes = [
        c for c in changes
        if c.is_public and c.change_type in ("LOGIC_MODIFIED", "SIGNATURE_CHANGED", "ADDED")
    ]
    if len(public_logic_changes) >= 3:
        return ModelTier.DEEP

    # Default: STANDARD
    return ModelTier.STANDARD
```

#### Provider Model Mapping

Each provider maps tiers to concrete models:

| Tier | Gemini | OpenAI | Anthropic | Ollama |
|------|--------|--------|-----------|--------|
| FAST | gemini-2.5-flash | gpt-4o-mini | claude-haiku-4-5 | Same as configured |
| STANDARD | gemini-2.5-flash | gpt-4o | claude-sonnet-4-6 | Same as configured |
| DEEP | gemini-2.5-pro | gpt-4o | claude-sonnet-4-6 | Same as configured |

**Ollama note:** Self-hosted models don't have cost tiers — the configured model is used regardless. Model tier selection is a no-op for Ollama tenants.

**Tenant override:** If a tenant has explicitly configured a specific model in Settings, that choice takes precedence. Auto-selection only applies when the tenant uses "auto" or the bundled key.

#### Per-Stage Model Selection

Different stages have different quality requirements:

| Stage | Tier Selection | Rationale |
|-------|---------------|-----------|
| Drift proposal (Stage 1) | By complexity | Summarization task — FAST model works for simple changes |
| Drift verification (Stage 2) | Always ≥ STANDARD | Auditing requires higher quality — never downgrade the verifier |
| Doc generation (Stage 1) | By complexity | Writing task — FAST for simple, DEEP for API docs |
| Doc verification (Stage 2) | Always ≥ STANDARD | Hallucination detection is safety-critical |

This means verification stages always use at least the STANDARD model, even when the generator uses FAST. Conservative default.

#### Cost Impact (500 analyses/month, bundled Gemini)

Assuming: 40% simple (FAST), 50% standard, 10% deep:

```
Current (all Flash):          500 × $0.004 = $2.00
With tiers:
  200 × $0.004 (Flash, same) = $0.80
  250 × $0.004 (Flash, same) = $1.00
   50 × $0.093 (Pro)         = $4.65
Total: $6.45 — HIGHER for Gemini because Pro is expensive
```

**Key insight:** For Gemini, auto-selection **increases** cost because Flash-to-Pro is a 23× price jump. The optimization primarily benefits **Anthropic BYOK tenants** where Haiku→Sonnet is 3× (not 23×):

```
Current (all Sonnet):         500 × $0.150 = $75.00
With tiers:
  200 × $0.050 (Haiku)  = $10.00
  250 × $0.150 (Sonnet) = $37.50
   50 × $0.150 (Sonnet) = $7.50
Total: $55.00 → 27% savings
```

**Recommendation:** Only enable auto-selection for Anthropic and OpenAI tenants where the tier spread is reasonable. For Gemini, Flash is already cheap enough that tiering adds complexity without meaningful savings.

#### Files to Change

| File | Change |
|------|--------|
| New: `src/agents/model_selector.py` | `select_model_tier()` + `resolve_model()` per provider |
| `src/agents/verifier.py` | Accept `model_tier` param; create separate generator/verifier clients per tier |
| `src/pipeline/analyzer.py` | Call `select_model_tier()` before analysis; pass tier to verifier |
| `src/agents/model_registry.py` | Add tier→model mapping per provider |

---

### LLM-OPT-05 — Streaming Responses / Progressive Check Run Updates

**Priority:** P2 | **Effort:** M | **Impact:** Perceived latency improvement (UX)

#### The Problem

DG's check run goes `"in_progress"` → (10–60 seconds of silence) → final result. During this time, the developer sees a spinning check with no progress indication. For complex PRs (5 entities, holistic scoring), the wait can feel long.

The dashboard Jobs page has the same issue: a job goes from "Processing" to "Completed" with no intermediate status.

#### Architecture: Progressive Check Run Updates

GitHub Check Runs support **in-progress output updates**. DG can update the check run's `output.summary` field multiple times during analysis without changing the `status`:

```python
# src/pipeline/handler.py — during analysis
async def _update_check_run_progress(
    github_repo, check_run_id: int, step: str, detail: str
):
    """Update check run with progress information."""
    github_repo.get_check_run(check_run_id).edit(
        status="in_progress",
        output={
            "title": f"Analyzing: {step}",
            "summary": detail,
        },
    )
```

#### Progress Steps

| Step | Message | When |
|------|---------|------|
| 1 | "Parsing code changes (N files)..." | After file fetch |
| 2 | "Searching related documentation..." | Before vector search |
| 3 | "Analyzing entity 1/5: `UserService.create()`..." | Before each entity LLM call |
| 4 | "Verifying documentation accuracy..." | Before verifier stage |
| 5 | "Computing drift score..." | Before drift analysis |
| 6 | "Generating fix PR..." | Before committer (if auto-fix) |

#### Dashboard: Job Progress via DB + Polling

For the dashboard Jobs page, add a `progress` JSON field to the job record:

```python
# In analyzer.py, at each milestone:
update_job_progress(job_id, {
    "step": "analyzing_entities",
    "current": 3,
    "total": 5,
    "current_entity": "UserService.create()",
    "elapsed_ms": 4200,
})
```

The existing 30-second poll in `InboxPageClient` (BETA-BUG-03) picks this up. No WebSocket needed — the polling interval is already fast enough for a 10–60 second pipeline.

#### Dashboard: Jobs List Real-Time Status

The Jobs list currently shows `UiStatusBadge` (from `getUiStatus()`). Add a sub-line for in-progress jobs:

```
Processing — Analyzing entity 3/5 (12s)
```

This reads from the `progress` JSON field via the existing jobs API.

#### LLM Response Streaming (Optional, P3)

For the triage detail panel (`SemanticDiffViewer`), streaming the LLM's drift analysis text as it generates could improve perceived responsiveness. However:

- The LLM output is **structured JSON** (not prose), so streaming partial JSON is risky
- The verifier stage must complete before showing results (you can't show unverified analysis)
- The benefit is marginal for a 1–2 second LLM call

**Recommendation:** Defer LLM-level streaming to P3. The progressive check run updates (P2) deliver 90% of the perceived improvement with none of the complexity.

#### Files to Change

| File | Change |
|------|--------|
| `src/pipeline/handler.py` | Add `_update_check_run_progress()` calls at each milestone |
| `src/pipeline/analyzer.py` | Emit progress events before each entity + drift analysis |
| `src/storage/sql_models.py` | Add `progress` JSON column to jobs table (nullable) |
| Prisma schema | Add `progress Json?` to Job model |
| `web/app/api/jobs/[id]/route.ts` | Include `progress` in job detail response |
| `web/components/jobs/` | Show progress sub-line for in-progress jobs |

#### UX Impact

Before: Developer sees "DocuGardener — in progress" for 30 seconds, then result.
After: Developer sees "DocuGardener — Analyzing entity 2/5: AuthController.login()..." updating every few seconds.

This transforms a "is it stuck?" experience into a "it's working on my code" experience. The actual wall-clock time doesn't change, but the perceived wait is significantly shorter.

---

## Appendix A: Managed Agents API Shape (Reference)

```python
# Create Agent
agent = client.beta.agents.create(
    name="DocuGardener Analyzer",
    model="claude-sonnet-4-6",
    system="You are a documentation drift analyzer...",
    tools=[{"type": "agent_toolset_20260401"}],
)

# Create Environment  
env = client.beta.environments.create(
    name="dg-analysis",
    config={"type": "cloud", "networking": {"type": "unrestricted"}},
)

# Start Session
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=env.id,
    title="PR #123 analysis",
)

# Send event + stream response
with client.beta.sessions.events.stream(session.id) as stream:
    client.beta.sessions.events.send(session.id, events=[{
        "type": "user.message",
        "content": [{"type": "text", "text": "Analyze drift in..."}],
    }])
    for event in stream:
        if event.type == "session.status_idle":
            break
```

**Rate limits:** 60 create/min, 600 read/min per org.

---

## Appendix B: Cost Comparison Table

| Provider | Model | Input/MTok | Output/MTok | Cost per DG Analysis (10K in / 8K out) | Monthly cost at 500 analyses |
|----------|-------|-----------|------------|---------------------------------------|------------------------------|
| Gemini | 2.5 Flash | $0.10 | $0.40 | **$0.004** | **$2.10** |
| Gemini | 2.5 Pro | $1.25 | $10.00 | $0.093 | $46.25 |
| OpenAI | GPT-4o | $2.50 | $10.00 | $0.105 | $52.50 |
| OpenAI | GPT-4o mini | $0.15 | $0.60 | $0.006 | $3.15 |
| Anthropic | Haiku 4.5 | $1.00 | $5.00 | $0.050 | $25.00 |
| Anthropic | Sonnet 4.6 | $3.00 | $15.00 | $0.150 | $75.00 |
| Anthropic | Opus 4.6 | $5.00 | $25.00 | $0.250 | $125.00 |
| Ollama | Any (self-hosted) | $0.00 | $0.00 | **$0.000** | **$0.00** |
| **Managed Agents** | Haiku 4.5 + runtime | $1.00 | $5.00 | $0.051 | $25.50 |
| **Managed Agents** | Sonnet 4.6 + runtime | $3.00 | $15.00 | $0.151 | $75.50 |

Sources:
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Managed Agents Overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Blog: Claude Managed Agents](https://claude.com/blog/claude-managed-agents)

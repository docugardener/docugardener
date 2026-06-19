<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Engineering Decisions

> The *why* behind DocuGardener — the trade-offs a solo founder actually made, not just the stack list.

DocuGardener was built by one engineer. Almost every decision below is shaped by that constraint: **minimise operational surface, prefer one well-understood component over two clever ones, and never ship a feature I can't operate at 3am.** This file is the condensed decision log; the full Architecture Decision Records (context, consequences, revisit conditions) live in [`docs/architecture/SAD-01-System-Context.md` §8](docs/architecture/SAD-01-System-Context.md) and the security rationale in [SAD-04](docs/architecture/SAD-04-Security-Compliance.md).

| # | Decision | One-line trade-off I accepted |
|---|----------|-------------------------------|
| 1 | Shared Postgres, no inter-service API | Coupled schema changes ↔ zero eventual-consistency bugs, one fewer service |
| 2 | RQ over Celery/Kafka | No native priority/DLQ ↔ trivial to operate at <1k PRs/day |
| 3 | Weaviate native multi-tenancy | Extra container ↔ physical per-tenant shard isolation, self-hostable |
| 4 | Two-stage LLM (Generator + Verifier) | 2× cost & latency ↔ hallucinated docs never auto-merge |
| 5 | Ephemeral tmpfs ingestion (zero-retention) | Re-clone every run ↔ source code never touches disk |
| 6 | Caddy over Nginx | Less tuning surface ↔ automatic TLS, ~20-line config |
| 7 | Cross-repo drift as flagged beta | Gated to TEAM+ ↔ kill-switch + injection defence before GA |
| 8 | Provider-agnostic LLM layer (Gemini/OpenAI/Anthropic/Ollama) | Maintain 4 clients ↔ BYOK + regulated-industry choice, zero pipeline coupling |
| 9 | AGPL open-source + managed SaaS | Self-host support surface ↔ trust, auditability, no vendor lock-in *(supersedes the original SaaS-only stance)* |

---

## 1 · Shared database instead of an inter-service API

The Next.js control plane and the Python analysis plane both talk to the **same PostgreSQL** directly — no internal REST boundary between them. Prisma and SQLAlchemy model the identical schema, so type safety holds in both runtimes. I traded the ability to scale the two planes' data access independently (and the discipline of coordinated `schema.prisma` ↔ `sql_models.py` migrations) for **one fewer service to deploy, monitor, and version**, and a single source of truth with no cross-service consistency window. Revisit at >10 tenants or a second engineer.

## 2 · RQ over Celery/Kafka

Analysis is CPU-bound and runs 30–120s per PR. Celery's broker + flower + beat stack is overkill for a solo operator, and Kafka is absurd for <1,000 PRs/day. **RQ on Valkey** (MIT-licensed Redis fork — avoids the SSPL trap) gives me enqueue/dequeue, status, and retries in a footprint I can fully reason about. The cost: no native priority queues (names exist but aren't enforced) and no built-in DLQ — failed jobs need manual inspection, which is acceptable at this volume.

## 3 · Weaviate native multi-tenancy for vector isolation

Cross-tenant embedding leakage is a compliance incident, not a bug. Weaviate's **native tenant sharding** (`collection.with_tenant(namespace)` on `DocuGardenerTenantV1`) makes each tenant's vectors *physically* separate, and it's self-hostable — required for air-gapped enterprise installs, which ruled out Pinecone. pgvector would have coupled vector and relational workloads on the same Postgres. The price is one more container and manual schema versioning (encoded in the collection name).

## 4 · Two-stage LLM verification (Generator + Verifier)

An LLM that hallucinates a *confident wrong* doc update is worse than one that says nothing. So the pipeline splits in two: a **Generator** drafts at normal temperature, then a **Verifier re-checks the draft against the actual code at temperature 0**, emitting an `ACCURATE`/`HALLUCINATION` verdict with a confidence score. Rejected drafts flag drift but offer no auto-fix; a confidence **grace threshold** lifts the merge block automatically so a low-confidence model never gates human code review. This doubles inference cost and adds serial latency — paid deliberately, because precision is the whole product.

## 5 · Ephemeral tmpfs ingestion — zero code retention

Repositories are cloned into a **RAM-disk (tmpfs)**, parsed with tree-sitter, embedded, and the working directory is wiped in a `finally` block — guaranteed cleanup even on error (`src/github/clone.py`). Source code never lands on persistent disk and is never stored. I re-clone on every run (no caching of source) specifically so the security story is simple enough to state in one sentence to a compliance reviewer: *we never retain your code.* That property is worth the redundant clone cost.

## 6 · Caddy over Nginx

Production needs a reverse proxy with TLS. **Caddy** gives automatic Let's Encrypt issuance/renewal with zero config beyond the domain, sane default security headers, and a ~20-line Caddyfile versus 60+ for the Nginx equivalent — no certbot cron, no lua. One less moving part to keep alive.

## 7 · Cross-repo drift as a feature-flagged beta

Microservice docs drift across repo boundaries (a `payments-api` change can invalidate `payments-docs`). The implementation fans out across Weaviate namespaces behind a **`CROSS_REPO_BETA` kill switch**, gated to TEAM+ with explicit tenant-controlled sibling lists. The flag lets me disable it without a deploy; explicit opt-in prevents surprise noise; a `valid_pairs` injection defence in the verifier blocks prompt-injection escalation across repos, with a hard stop on empty namespaces. Shipped behind the flag rather than GA precisely because cross-boundary trust needs beta soak time.

## 8 · Provider-agnostic LLM layer

A single `LLMProvider` enum (Gemini / OpenAI / Anthropic / Ollama) means adding a managed provider is a new client class in `src/agents/llm.py`, not a pipeline refactor — Anthropic landed that way for regulated customers standardising on Claude, transient-error handling (HTTP 529) already in place. The cost is maintaining four client surfaces, justified by full **BYOK** (cloud or local Ollama) and giving regulated teams a provider they can put in an MSA.

## 9 · AGPL open-source + managed SaaS

**Status: supersedes the original "SaaS-first, no open-source edition" decision (ADR-05, accepted 2026-03-12; superseded 2026-06-14).** The original call was to stay closed and SaaS-only to avoid splitting a solo founder's time between community support and product. That was reversed: DocuGardener is now **AGPL-3.0** and fully self-hostable, with a managed SaaS for teams that want zero ops. The reasoning shifted — for a tool that *audits your code and docs*, source transparency is a feature, not a cost: it removes the "what does it do with our code?" objection, makes the zero-retention claim (decision #5) auditable rather than asserted, and lets regulated teams run it air-gapped. The accepted trade-off is a real self-host support surface; AGPL's network-copyleft is what keeps the managed offering and the open core aligned.

---

*Full ADRs with consequences and revisit conditions: [SAD-01 §8](docs/architecture/SAD-01-System-Context.md). System context, data architecture, deployment, and security/compliance: [SAD-01–04](docs/architecture/).*

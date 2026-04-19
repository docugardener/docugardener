# SPDX-License-Identifier: AGPL-3.0-or-later
"""
SPIKE-03: End-to-End Cross-Repo Demo Pipeline

Wires the Weaviate fan-out search (Spike 1) and LLM cross-repo prompt
(Spike 2) into a single pipeline function, verifying the full loop
end-to-end with two demo scenarios and graceful degradation when a
namespace is absent.

Run from repo root:
    python scripts/spikes/spike_03_e2e_demo.py
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from typing import Any

# ---------------------------------------------------------------------------
# Path fix — ensure repo root is on sys.path when invoked directly
# ---------------------------------------------------------------------------
import os

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from src.agents.llm import LLMClient, LLMConfig, LLMProvider, create_llm_client
from src.analysis.embeddings import generate_batch_embeddings, generate_embedding
from src.core.config import settings
from src.storage.vectordb import DocumentRecord
from src.storage.weaviate_db import WeaviateDB

# ---------------------------------------------------------------------------
# Namespace constants for this spike (distinct from spike_01 and spike_02)
# ---------------------------------------------------------------------------
NS_API = "demo-api-spike3"
NS_SDK = "demo-sdk-spike3"
NS_DOCS = "demo-docs-spike3"

ALL_SEED_NAMESPACES = [NS_API, NS_SDK, NS_DOCS]

# ---------------------------------------------------------------------------
# Synthetic corpus — reused from Spike 1 with spike-3 doc-id prefixes
# ---------------------------------------------------------------------------

_API_DOCS: list[tuple[str, str, str, str, str, str]] = [
    (
        "s3-api-001",
        "openapi.yaml",
        "GET /users",
        "endpoint",
        "api_spec",
        (
            "GET /users — Returns a paginated list of user objects. "
            "Response 200: array of User. Each User has id, email, created_at. "
            "Supports query params: limit (default 20), offset, search."
        ),
    ),
    (
        "s3-api-002",
        "openapi.yaml",
        "GET /accounts",
        "endpoint",
        "api_spec",
        (
            "GET /accounts — Returns a list of account objects for the authenticated org. "
            "Response 200: array of Account. Requires scope: accounts:read."
        ),
    ),
    (
        "s3-api-003",
        "openapi.yaml",
        "GET /orders",
        "endpoint",
        "api_spec",
        (
            "GET /orders — Returns recent orders. Filterable by status: pending, shipped, "
            "delivered. Response 200: array of Order. Paginated."
        ),
    ),
    (
        "s3-api-004",
        "src/routes/users.py",
        "list_users",
        "function",
        "source_code",
        (
            "def list_users(limit: int = 20, offset: int = 0) -> list[User]:\n"
            "    '''Handler for GET /users endpoint. Queries the users table.'''\n"
            "    return db.query(User).offset(offset).limit(limit).all()"
        ),
    ),
    (
        "s3-api-005",
        "CHANGELOG.md",
        "v2.1.0",
        "changelog_entry",
        "changelog",
        (
            "v2.1.0 (2026-03-01): Added GET /users endpoint. "
            "GET /accounts now requires accounts:read scope. "
            "Deprecated: GET /legacy/members — use GET /users instead."
        ),
    ),
]

_SDK_DOCS: list[tuple[str, str, str, str, str, str]] = [
    (
        "s3-sdk-001",
        "README.md",
        "get_users",
        "method",
        "readme",
        (
            "Use `client.get_users()` which calls `GET /users` to retrieve all users. "
            "Returns a list of User objects. Example: `users = client.get_users(limit=50)`"
        ),
    ),
    (
        "s3-sdk-002",
        "README.md",
        "get_accounts",
        "method",
        "readme",
        (
            "Use `client.get_accounts()` which calls `GET /accounts` to list accounts. "
            "Requires the client to be initialised with an org-scoped token."
        ),
    ),
    (
        "s3-sdk-003",
        "src/client.py",
        "get_users",
        "function",
        "source_code",
        (
            "def get_users(self, limit: int = 20, offset: int = 0) -> list[dict]:\n"
            "    '''Fetch all users from the API via GET /users.'''\n"
            "    return self._get('/users', params={'limit': limit, 'offset': offset})"
        ),
    ),
    (
        "s3-sdk-004",
        "src/client.py",
        "get_orders",
        "function",
        "source_code",
        (
            "def get_orders(self, status: str | None = None) -> list[dict]:\n"
            "    '''Fetch orders via GET /orders.'''\n"
            "    params = {'status': status} if status else {}\n"
            "    return self._get('/orders', params=params)"
        ),
    ),
    (
        "s3-sdk-005",
        "MIGRATION.md",
        "v2-migration",
        "guide",
        "migration",
        (
            "Migrating from SDK v1 to v2: replace `client.list_members()` with "
            "`client.get_users()`. The underlying endpoint changed from "
            "GET /legacy/members to GET /users."
        ),
    ),
]

_PORTAL_DOCS: list[tuple[str, str, str, str, str, str]] = [
    (
        "s3-docs-001",
        "quickstart.md",
        "quickstart_users",
        "guide_section",
        "user_guide",
        (
            "quickstart.md line 18: `response = api.get('/users')` — fetches the user list. "
            "This is the primary endpoint for retrieving registered users in your workspace."
        ),
    ),
    (
        "s3-docs-002",
        "reference/endpoints.md",
        "users_reference",
        "reference_section",
        "reference",
        (
            "## GET /users\n"
            "Retrieves all users in the authenticated organization. "
            "This endpoint is consumed by the SDK method `client.get_users()` "
            "and the CLI command `dg users list`."
        ),
    ),
    (
        "s3-docs-003",
        "guides/accounts.md",
        "accounts_guide",
        "guide_section",
        "user_guide",
        (
            "To manage accounts, call GET /accounts with an org-scoped bearer token. "
            "See also the SDK convenience method `client.get_accounts()`."
        ),
    ),
    (
        "s3-docs-004",
        "guides/orders.md",
        "orders_guide",
        "guide_section",
        "user_guide",
        (
            "Order retrieval: use GET /orders?status=pending to list open orders. "
            "The SDK wraps this as `client.get_orders(status='pending')`."
        ),
    ),
    (
        "s3-docs-005",
        "changelog/api-changelog.md",
        "api_changelog_2026",
        "changelog_entry",
        "changelog",
        (
            "2026-03-01: GET /users introduced as the canonical user-listing endpoint. "
            "Documentation at /reference/endpoints#get-users updated accordingly."
        ),
    ),
]

_NAMESPACE_CORPUS: dict[str, list[tuple[str, str, str, str, str, str]]] = {
    NS_API: _API_DOCS,
    NS_SDK: _SDK_DOCS,
    NS_DOCS: _PORTAL_DOCS,
}

# ---------------------------------------------------------------------------
# System prompt — reused verbatim from Spike 2
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a cross-repository documentation drift detector.  Your job is to
analyse a code diff from a SOURCE REPO and determine which documentation
chunks from SIBLING REPOS reference constructs that the diff changes.

Rules:
- PRECISION OVER RECALL.  Only report a finding when you are genuinely
  confident (>= 50/100) that the chunk references a construct affected by
  the diff.  Private/internal changes that are not part of any public API
  or interface do NOT impact sibling documentation.
- An EMPTY findings array is a valid and expected output.  If no chunk is
  impacted, return {"findings": []}.  Do NOT hallucinate impact.
- Output ONLY valid JSON.  No markdown fences.  No preamble.  No trailing
  explanation.  The entire response must be parseable by json.loads().

Output schema (strict):
{
  "findings": [
    {
      "file":       "<filename in the sibling repo>",
      "repo":       "<sibling repo name>",
      "line_hint":  <integer line number or null>,
      "confidence": <integer 0-100>,
      "reason":     "<max 80 chars explaining the impact>"
    }
  ]
}

Omit any finding with confidence < 50.\
"""

_USER_MESSAGE_TEMPLATE = """\
<source_diff>
{diff}
</source_diff>

<sibling_chunks>
{chunks}
</sibling_chunks>

Analyse the diff and determine which sibling chunks, if any, reference
constructs changed by the diff.  Return the JSON findings array.\
"""

# ---------------------------------------------------------------------------
# Fan-out search — reused from Spike 1
# ---------------------------------------------------------------------------


async def search_multi_namespace(
    db: WeaviateDB,
    query_vector: list[float],
    namespaces: list[str],
    top_k_per_ns: int = 5,
) -> list[dict[str, Any]]:
    """
    Search across multiple Weaviate namespaces in parallel.

    Returns merged list sorted by score descending.  Each dict has keys:
    id, score, content, source_namespace, metadata.
    """
    tasks = [db.search(query_vector, namespace=ns, top_k=top_k_per_ns) for ns in namespaces]
    per_ns_results = await asyncio.gather(*tasks)

    merged: list[dict[str, Any]] = []
    for ns, results in zip(namespaces, per_ns_results):
        for r in results:
            merged.append(
                {
                    "id": r.id,
                    "score": r.score,
                    "content": r.content,
                    "source_namespace": ns,
                    "metadata": r.metadata,
                }
            )

    merged.sort(key=lambda x: x["score"], reverse=True)
    return merged


# ---------------------------------------------------------------------------
# LLM call — reused from Spike 2
# ---------------------------------------------------------------------------


def _format_chunks(chunks: list[dict[str, Any]]) -> str:
    """Format chunk list into the text block for the user message."""
    parts: list[str] = []
    for i, c in enumerate(chunks, 1):
        parts.append(
            f"[Chunk {i}] repo={c['repo']}  file={c['file']}  line={c['line']}\n"
            f"{c['content']}"
        )
    return "\n\n".join(parts)


async def call_cross_repo_llm(
    client: LLMClient,
    diff_description: str,
    sibling_chunks: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Call the LLM with a diff description and sibling document chunks.

    Args:
        client: Initialised LLMClient.
        diff_description: Human-readable description of the change.
        sibling_chunks: List of dicts with keys repo, file, line, content.

    Returns:
        Parsed dict with a "findings" key (list).  Returns {"findings": []}
        on any parse failure.
    """
    user_msg = _USER_MESSAGE_TEMPLATE.format(
        diff=diff_description,
        chunks=_format_chunks(sibling_chunks),
    )
    config = LLMConfig(temperature=0.0, max_tokens=1024)

    response = await client.generate(
        prompt=user_msg,
        system_prompt=SYSTEM_PROMPT,
        config=config,
    )

    raw = response.content.strip()

    # Strip markdown fences if the model wraps anyway
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = [ln for ln in lines if not ln.strip().startswith("```")]
        raw = "\n".join(lines).strip()

    try:
        parsed = json.loads(raw)
        if isinstance(parsed.get("findings"), list):
            return parsed
    except json.JSONDecodeError:
        pass

    return {"findings": []}


# ---------------------------------------------------------------------------
# Seeding helpers
# ---------------------------------------------------------------------------


def _build_records(
    corpus: list[tuple[str, str, str, str, str, str]],
) -> list[DocumentRecord]:
    """Build DocumentRecord list from corpus tuples using batch embeddings."""
    texts = [row[-1] for row in corpus]
    embeddings = generate_batch_embeddings(texts)

    records: list[DocumentRecord] = []
    for (doc_id, file_path, entity_name, entity_type, doc_type, content), emb in zip(
        corpus, embeddings
    ):
        records.append(
            DocumentRecord(
                id=doc_id,
                vector=emb.tolist(),
                metadata={
                    "file_path": file_path,
                    "entity_name": entity_name,
                    "entity_type": entity_type,
                    "doc_type": doc_type,
                },
                content=content,
            )
        )
    return records


async def seed_namespaces(db: WeaviateDB) -> None:
    """Seed all three demo namespaces with the synthetic corpus."""
    for ns, corpus in _NAMESPACE_CORPUS.items():
        records = _build_records(corpus)
        await db.upsert(records, namespace=ns)


# ---------------------------------------------------------------------------
# Markdown renderer
# ---------------------------------------------------------------------------


def _render_markdown(findings: list[dict[str, Any]]) -> str:
    """Render findings to the canonical markdown table format."""
    if not findings:
        return ""

    rows: list[str] = []
    for f in findings:
        repo = f.get("repo", "?")
        file_ = f.get("file", "?")
        confidence = f.get("confidence", 0)
        reason = f.get("reason", "")
        rows.append(f"| {repo} | {file_} | {confidence}% | {reason} |")

    table_body = "\n".join(rows)
    return (
        "### Cross-Repo Impact Detected\n\n"
        "| Repo | File | Confidence | Impact |\n"
        "|------|------|-----------|--------|\n"
        f"{table_body}\n\n"
        "> Detected by DocuGardener cross-repo drift analysis (EPIC-11 prototype)"
    )


# ---------------------------------------------------------------------------
# Pipeline function
# ---------------------------------------------------------------------------


async def run_cross_repo_analysis(
    db: WeaviateDB,
    client: LLMClient,
    diff_description: str,
    changed_entity_text: str,
    sibling_namespaces: list[str],
    top_k_per_ns: int = 3,
    min_confidence: int = 50,
) -> str:
    """
    Run the full cross-repo drift analysis pipeline.

    Steps:
    1. Embed changed_entity_text.
    2. Fan-out search across sibling_namespaces.
    3. Convert top results to sibling_chunks dicts for LLM.
    4. Call LLM, parse JSON.
    5. Filter findings by confidence >= min_confidence.
    6. Render markdown section.

    Returns:
        Rendered markdown string, or empty string if no findings.
    """
    # Step 1 — embed
    query_vector = generate_embedding(changed_entity_text).tolist()

    # Step 2 — fan-out search
    results = await search_multi_namespace(
        db, query_vector, sibling_namespaces, top_k_per_ns=top_k_per_ns
    )

    if not results:
        return ""

    # Step 3 — convert to sibling_chunks format
    sibling_chunks: list[dict[str, Any]] = []
    for r in results:
        metadata = r.get("metadata") or {}
        # Derive a human-readable repo name from the namespace
        # e.g. "demo-sdk-spike3" → "demo-sdk"
        ns = r["source_namespace"]
        repo_name = ns.rsplit("-spike", 1)[0] if "-spike" in ns else ns
        sibling_chunks.append(
            {
                "repo": repo_name,
                "file": metadata.get("file_path", r["id"]),
                "line": metadata.get("line", None),
                "content": r["content"],
            }
        )

    # Step 4 — LLM call
    llm_result = await call_cross_repo_llm(client, diff_description, sibling_chunks)

    # Step 5 — filter by confidence
    all_findings: list[dict[str, Any]] = llm_result.get("findings", [])
    filtered = [f for f in all_findings if f.get("confidence", 0) >= min_confidence]

    # Step 6 — render
    return _render_markdown(filtered)


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------


async def cleanup(db: WeaviateDB) -> None:
    """Delete all spike-3 demo namespaces (best-effort)."""
    for ns in ALL_SEED_NAMESPACES:
        try:
            await db.delete_namespace(ns)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Provider helpers
# ---------------------------------------------------------------------------

_PROVIDER_KEY_MAP = {
    "gemini": "gemini_api_key",
    "anthropic": "anthropic_api_key",
    "openai": "openai_api_key",
}


def _resolve_provider() -> tuple[LLMProvider, str]:
    """Resolve the configured provider and verify its API key exists."""
    provider_str = settings.llm_provider
    key_attr = _PROVIDER_KEY_MAP.get(provider_str)

    if key_attr is None and provider_str != "ollama":
        print(f"[ERROR] Unsupported provider: {provider_str}")
        sys.exit(1)

    if key_attr:
        key_val = getattr(settings, key_attr, None)
        if not key_val:
            print(
                f"[ERROR] Provider '{provider_str}' is configured but "
                f"'{key_attr.upper()}' is not set."
            )
            sys.exit(1)

    return LLMProvider(provider_str), provider_str


# ---------------------------------------------------------------------------
# Demo scenario definitions
# ---------------------------------------------------------------------------

SCENARIO_1_DIFF = """\
Rename REST endpoint /users to /accounts in demo-api service.
- src/routes/users.py: @app.get("/users") → @app.get("/accounts")
- Function renamed: get_users() → get_accounts()
This is a breaking API change affecting all consumers of /users.\
"""

SCENARIO_1_ENTITY = (
    "GET /users endpoint renamed to /accounts — breaking change for all API consumers"
)

SCENARIO_2_DIFF = """\
Rename internal private helper _validate_token_expiry() to _check_token_ttl()
in src/internal/auth_helpers.py. This is an internal refactor, not part of
any public API or interface.\
"""

SCENARIO_2_ENTITY = "private internal helper function rename, no public API impact"

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    print("=== SPIKE 3: End-to-End Cross-Repo Demo Pipeline ===")
    print()

    # Verify Weaviate is reachable
    import httpx

    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(f"{settings.weaviate_url}/v1/.well-known/ready")
            if resp.status_code != 200:
                raise RuntimeError(f"Unexpected status {resp.status_code}")
    except Exception as exc:
        print(
            f"[ERROR] Weaviate is not reachable at {settings.weaviate_url}: {exc}\n"
            "        Start it with:  make dev-up  (or docker compose up weaviate -d)"
        )
        sys.exit(1)

    provider, provider_str = _resolve_provider()
    model_attr = f"{provider_str}_model"
    model_name = getattr(settings, model_attr, "default")

    db = WeaviateDB()
    try:
        await db.initialize()

        # ----------------------------------------------------------------
        # SETUP — seed namespaces and warm up LLM client
        # ----------------------------------------------------------------
        print("[SETUP] Seeding 3 demo namespaces...", end=" ", flush=True)
        await seed_namespaces(db)
        print("OK")

        # Build LLM client once (model load is one-time startup cost)
        client = create_llm_client(provider=provider)
        print(f"[SETUP] LLM client ready ({provider_str} / {model_name})")
        print()

        # Acceptance criteria results
        ac_results: dict[str, bool] = {}

        # ----------------------------------------------------------------
        # Scenario 1 — Breaking change (/users → /accounts)
        # ----------------------------------------------------------------
        print("--- Scenario 1: Breaking change (/users → /accounts) ---")

        sibling_ns = [NS_SDK, NS_DOCS]  # API is the source; search siblings only
        run_finding_counts: list[int] = []
        scenario1_markdown = ""
        scenario1_total_elapsed = 0.0

        for run_num in range(1, 4):
            t0 = time.perf_counter()

            # Search phase
            ts = time.perf_counter()
            query_vector = generate_embedding(SCENARIO_1_ENTITY).tolist()
            search_results = await search_multi_namespace(
                db, query_vector, sibling_ns, top_k_per_ns=3
            )
            search_elapsed = time.perf_counter() - ts

            # Convert to sibling_chunks
            sibling_chunks: list[dict[str, Any]] = []
            for r in search_results:
                metadata = r.get("metadata") or {}
                ns = r["source_namespace"]
                repo_name = ns.rsplit("-spike", 1)[0] if "-spike" in ns else ns
                sibling_chunks.append(
                    {
                        "repo": repo_name,
                        "file": metadata.get("file_path", r["id"]),
                        "line": metadata.get("line", None),
                        "content": r["content"],
                    }
                )

            # LLM phase
            tl = time.perf_counter()
            llm_result = await call_cross_repo_llm(client, SCENARIO_1_DIFF, sibling_chunks)
            llm_elapsed = time.perf_counter() - tl

            # Filter findings
            all_findings = llm_result.get("findings", [])
            findings = [f for f in all_findings if f.get("confidence", 0) >= 50]
            finding_count = len(findings)
            run_finding_counts.append(finding_count)

            total_run_elapsed = time.perf_counter() - t0
            scenario1_total_elapsed += total_run_elapsed

            if run_num == 1:
                scenario1_markdown = _render_markdown(findings)
                ns_count = len({r["source_namespace"] for r in search_results})
                print(
                    f"[RUN 1]\n"
                    f"  Search: {len(search_results)} results across {ns_count} sibling "
                    f"namespaces ({search_elapsed:.2f}s)\n"
                    f"  LLM: {finding_count} findings above confidence 50 ({llm_elapsed:.1f}s)\n"
                    f"  Output:"
                )
                if scenario1_markdown:
                    for line in scenario1_markdown.splitlines():
                        print(f"  {line}")
                else:
                    print("  (empty — no section rendered)")
            else:
                consistent = "consistent ✓" if finding_count == run_finding_counts[0] else "INCONSISTENT ✗"
                print(f"[RUN {run_num}] {finding_count} findings — {consistent}")

        # AC3.1 — timing (pipeline cost only, exclude model load)
        avg_elapsed = scenario1_total_elapsed / 3
        ac31 = avg_elapsed < 15.0
        ac_results["AC3.1"] = ac31
        print(f"AC3.1: {avg_elapsed:.1f}s avg — {'PASS' if ac31 else 'FAIL'}")

        # AC3.2 — markdown section present with >= 2 findings
        ac32 = bool(scenario1_markdown) and run_finding_counts[0] >= 2
        ac_results["AC3.2"] = ac32
        print(
            f"AC3.2: markdown section {'present' if scenario1_markdown else 'absent'}, "
            f"{run_finding_counts[0]} findings — {'PASS' if ac32 else 'FAIL'}"
        )

        # AC3.3 — consistent across 3 runs
        ac33 = len(set(run_finding_counts)) == 1
        ac_results["AC3.3"] = ac33
        runs_summary = "/".join(str(c) for c in run_finding_counts)
        print(
            f"AC3.3: consistent {sum(1 for c in run_finding_counts if c == run_finding_counts[0])}/3 "
            f"runs ({runs_summary}) — {'PASS' if ac33 else 'FAIL'}"
        )
        print()

        # ----------------------------------------------------------------
        # Scenario 2 — No-impact change (private helper rename)
        # ----------------------------------------------------------------
        print("--- Scenario 2: No-impact change ---")

        markdown_s2 = await run_cross_repo_analysis(
            db=db,
            client=client,
            diff_description=SCENARIO_2_DIFF,
            changed_entity_text=SCENARIO_2_ENTITY,
            sibling_namespaces=sibling_ns,
            top_k_per_ns=3,
            min_confidence=50,
        )

        # Count raw findings for display
        query_vector_s2 = generate_embedding(SCENARIO_2_ENTITY).tolist()
        sr_s2 = await search_multi_namespace(db, query_vector_s2, sibling_ns, top_k_per_ns=3)
        sc_s2: list[dict[str, Any]] = []
        for r in sr_s2:
            metadata = r.get("metadata") or {}
            ns = r["source_namespace"]
            repo_name = ns.rsplit("-spike", 1)[0] if "-spike" in ns else ns
            sc_s2.append(
                {
                    "repo": repo_name,
                    "file": metadata.get("file_path", r["id"]),
                    "line": metadata.get("line", None),
                    "content": r["content"],
                }
            )
        raw_s2 = await call_cross_repo_llm(client, SCENARIO_2_DIFF, sc_s2)
        raw_finding_count_s2 = len(raw_s2.get("findings", []))

        print(f"  LLM: {raw_finding_count_s2} findings")
        if markdown_s2:
            print("  Output:")
            for line in markdown_s2.splitlines():
                print(f"    {line}")
        else:
            print("  Output: (empty — no section rendered)")

        ac34 = markdown_s2 == ""
        ac_results["AC3.4"] = ac34
        print(f"AC3.4: empty string returned — {'PASS' if ac34 else 'FAIL'}")
        print()

        # ----------------------------------------------------------------
        # Scenario 3 — Empty namespace (AC3.5)
        # ----------------------------------------------------------------
        print("--- Scenario 3: Empty namespace ---")

        await db.delete_namespace(NS_API)
        print(f"  Deleted {NS_API}, querying across 3 (1 empty)")

        try:
            query_vector_s3 = generate_embedding(SCENARIO_1_ENTITY).tolist()
            # Query all three namespaces — NS_API is now deleted
            results_s3 = await search_multi_namespace(
                db, query_vector_s3, ALL_SEED_NAMESPACES, top_k_per_ns=3
            )
            ns_present = {r["source_namespace"] for r in results_s3}
            result_count_s3 = len(results_s3)
            has_survivors = NS_SDK in ns_present or NS_DOCS in ns_present
            ac35 = has_survivors
            print(
                f"  Results: {result_count_s3} results from {len(ns_present)} remaining "
                f"namespace(s), no exception"
            )
            ac_results["AC3.5"] = ac35
            print(f"AC3.5: {'PASS' if ac35 else 'FAIL'}")
        except Exception as exc:
            print(f"  Exception raised: {exc}")
            ac_results["AC3.5"] = False
            print("AC3.5: FAIL")

        print()

        # ----------------------------------------------------------------
        # Summary
        # ----------------------------------------------------------------
        passed_count = sum(1 for v in ac_results.values() if v)
        total_count = len(ac_results)

        if passed_count == total_count:
            print(f"=== RESULT: {passed_count}/{total_count} PASS — FULL GO ===")
        else:
            failed = [k for k, v in ac_results.items() if not v]
            print(
                f"=== RESULT: {passed_count}/{total_count} PASS — NO-GO "
                f"(failed: {', '.join(failed)}) ==="
            )

    finally:
        await cleanup(db)
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())

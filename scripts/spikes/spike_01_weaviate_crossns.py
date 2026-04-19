# SPDX-License-Identifier: AGPL-3.0-or-later
"""
SPIKE-01: Weaviate Multi-Namespace Fan-Out

Validates that Weaviate (running in local Docker) can be queried across multiple
tenant namespaces in parallel (fan-out), with results merged by score and tagged
by source namespace.

Run from repo root:
    python scripts/spikes/spike_01_weaviate_crossns.py
"""

import asyncio
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

from src.analysis.embeddings import generate_batch_embeddings, generate_embedding
from src.core.config import settings
from src.storage.vectordb import DocumentRecord
from src.storage.weaviate_db import WeaviateDB

# ---------------------------------------------------------------------------
# Namespace constants
# ---------------------------------------------------------------------------
NS_API = "demo-api-spike1"
NS_SDK = "demo-sdk-spike1"
NS_DOCS = "demo-docs-spike1"
NS_UNSEEN = "demo-real-tenant-spike1"

ALL_SEED_NAMESPACES = [NS_API, NS_SDK, NS_DOCS]

# ---------------------------------------------------------------------------
# Synthetic corpus
# ---------------------------------------------------------------------------

# Each entry: (doc_id_suffix, file_path, entity_name, entity_type, doc_type, content)
_API_DOCS: list[tuple[str, str, str, str, str, str]] = [
    (
        "api-001",
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
        "api-002",
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
        "api-003",
        "openapi.yaml",
        "GET /orders",
        "endpoint",
        "api_spec",
        (
            "GET /orders — Returns recent orders. Filterable by status: pending, shipped, delivered. "
            "Response 200: array of Order. Paginated."
        ),
    ),
    (
        "api-004",
        "src/routes/users.py",
        "list_users",
        "function",
        "source_code",
        (
            "def list_users(limit: int = 20, offset: int = 0) -> list[User]:\n"
            "    '''Handler for GET /users endpoint. Queries the users table and returns results.'''\n"
            "    return db.query(User).offset(offset).limit(limit).all()"
        ),
    ),
    (
        "api-005",
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
        "sdk-001",
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
        "sdk-002",
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
        "sdk-003",
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
        "sdk-004",
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
        "sdk-005",
        "MIGRATION.md",
        "v2-migration",
        "guide",
        "migration",
        (
            "Migrating from SDK v1 to v2: replace `client.list_members()` with `client.get_users()`. "
            "The underlying endpoint changed from GET /legacy/members to GET /users."
        ),
    ),
]

_PORTAL_DOCS: list[tuple[str, str, str, str, str, str]] = [
    (
        "docs-001",
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
        "docs-002",
        "reference/endpoints.md",
        "users_reference",
        "reference_section",
        "reference",
        (
            "## GET /users\n"
            "Retrieves all users in the authenticated organization. "
            "This endpoint is consumed by the SDK method `client.get_users()` and the CLI command `dg users list`."
        ),
    ),
    (
        "docs-003",
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
        "docs-004",
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
        "docs-005",
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
# Fan-out search
# ---------------------------------------------------------------------------


async def search_multi_namespace(
    db: WeaviateDB,
    query_vector: list[float],
    namespaces: list[str],
    top_k_per_ns: int = 5,
) -> list[dict[str, Any]]:
    """
    Search across multiple Weaviate namespaces in parallel.

    Args:
        db: Initialized WeaviateDB instance.
        query_vector: Embedding to search with.
        namespaces: Namespaces to fan out across.
        top_k_per_ns: Number of results to fetch from each namespace.

    Returns:
        Merged list of result dicts sorted by score descending.  Each dict
        includes keys: id, score, content, source_namespace, metadata.
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
# Seeding helpers
# ---------------------------------------------------------------------------


def _build_records(
    corpus: list[tuple[str, str, str, str, str, str]],
) -> list[DocumentRecord]:
    """Embed and build DocumentRecord list from corpus tuples."""
    texts = [row[-1] for row in corpus]  # content is the last element of each tuple
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
    """Seed all three demo namespaces."""
    for ns, corpus in _NAMESPACE_CORPUS.items():
        print(f"[SEED] Seeding {ns} ({len(corpus)} docs)...", end=" ", flush=True)
        records = _build_records(corpus)
        await db.upsert(records, namespace=ns)
        print("OK")


# ---------------------------------------------------------------------------
# Acceptance criteria
# ---------------------------------------------------------------------------


async def ac1_1_latency(db: WeaviateDB) -> bool:
    """AC1.1 — Fan-out latency must be under 2 seconds."""
    query_vec = generate_embedding(
        "rename /users endpoint to /accounts — breaking change"
    ).tolist()

    t0 = time.perf_counter()
    results = await search_multi_namespace(db, query_vec, ALL_SEED_NAMESPACES, top_k_per_ns=5)
    elapsed = time.perf_counter() - t0

    passed = elapsed < 2.0
    status = "PASS" if passed else "FAIL"
    print(f"[AC1.1] Latency: {elapsed:.2f}s — {status}")
    if not passed:
        print(f"        REASON: {elapsed:.2f}s >= 2.0s threshold")
        print("=== HARD STOP ===")
    return passed


async def ac1_2_namespace_tags(db: WeaviateDB) -> bool:
    """AC1.2 — Every result must carry a non-empty source_namespace field."""
    query_vec = generate_embedding("API endpoint user list retrieval").tolist()
    results = await search_multi_namespace(db, query_vec, ALL_SEED_NAMESPACES, top_k_per_ns=5)

    tagged = sum(1 for r in results if r.get("source_namespace", "").strip())
    total = len(results)
    passed = tagged == total and total > 0
    status = "PASS" if passed else "FAIL"
    print(f"[AC1.2] Namespace tags: {tagged}/{total} tagged — {status}")
    if not passed:
        print(f"        REASON: {total - tagged} results missing source_namespace")
    return passed


async def ac1_3_semantic_relevance(db: WeaviateDB) -> bool:
    """
    AC1.3 — Query about renaming /users→/accounts (a breaking change).

    The API namespace is the *source* of the change; sibling namespaces (SDK,
    docs) should surface as the most affected — they still reference the old
    /users path.  At least 2 of the top-3 results must come from sibling
    namespaces.
    """
    query_vec = generate_embedding(
        "rename /users endpoint to /accounts — breaking change"
    ).tolist()
    results = await search_multi_namespace(db, query_vec, ALL_SEED_NAMESPACES, top_k_per_ns=5)

    top3 = results[:3]
    sibling_count = sum(
        1 for r in top3 if r["source_namespace"] in (NS_SDK, NS_DOCS)
    )
    passed = sibling_count >= 2
    status = "PASS" if passed else "FAIL"
    origin_summary = ", ".join(r["source_namespace"] for r in top3)
    print(
        f"[AC1.3] Semantic relevance: {sibling_count}/3 top results from sibling namespaces"
        f" ({origin_summary}) — {status}"
    )
    if not passed:
        print(
            f"        REASON: expected ≥2 from [{NS_SDK}, {NS_DOCS}], got {sibling_count}. "
            "Top results:\n"
            + "\n".join(
                f"          [{r['source_namespace']}] score={r['score']:.3f} id={r['id']}"
                for r in top3
            )
        )
    return passed


async def ac1_4_isolation(db: WeaviateDB) -> bool:
    """AC1.4 — Query against an unseen namespace must return empty list, no exception."""
    query_vec = generate_embedding("user list endpoint").tolist()
    try:
        results = await search_multi_namespace(
            db, query_vec, [NS_UNSEEN], top_k_per_ns=5
        )
        count = len(results)
        passed = count == 0
        status = "PASS" if passed else "FAIL"
        print(f"[AC1.4] Isolation: {count} results from unseen namespace — {status}")
        if not passed:
            print(f"        REASON: expected 0 results, got {count}")
        return passed
    except Exception as exc:
        print(f"[AC1.4] Isolation: exception raised — FAIL")
        print(f"        REASON: {exc}")
        print("=== HARD STOP ===")
        return False


async def ac1_5_cold_start(db: WeaviateDB) -> bool:
    """
    AC1.5 — After deleting demo-api-spike1, re-query including it.

    Must complete without exception and still return results from the 2
    remaining namespaces.
    """
    await db.delete_namespace(NS_API)

    query_vec = generate_embedding("users endpoint retrieval SDK docs").tolist()
    try:
        results = await search_multi_namespace(
            db, query_vec, ALL_SEED_NAMESPACES, top_k_per_ns=5
        )
        remaining_ns = {r["source_namespace"] for r in results}
        result_count = len(results)
        # We expect results from the two surviving namespaces only
        no_api_leak = NS_API not in remaining_ns
        has_survivors = NS_SDK in remaining_ns or NS_DOCS in remaining_ns
        passed = no_api_leak and has_survivors
        status = "PASS" if passed else "FAIL"
        print(
            f"[AC1.5] Cold start: query after delete completed, {result_count} results"
            f" from {len(remaining_ns)} remaining namespace(s) — {status}"
        )
        if not passed:
            if not no_api_leak:
                print(f"        REASON: deleted namespace {NS_API} still returned results")
            if not has_survivors:
                print("        REASON: no results from surviving namespaces")
        return passed
    except Exception as exc:
        print(f"[AC1.5] Cold start: exception raised — FAIL")
        print(f"        REASON: {exc}")
        return False


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------


async def cleanup(db: WeaviateDB) -> None:
    """Delete all demo namespaces (best-effort)."""
    for ns in [*ALL_SEED_NAMESPACES, NS_UNSEEN]:
        try:
            await db.delete_namespace(ns)
        except Exception:
            pass  # already gone or never existed


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def main() -> None:
    print("=== SPIKE 1: Weaviate Multi-Namespace Fan-Out ===")

    # Verify Weaviate is reachable before doing anything else
    import httpx

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.weaviate_url}/v1/.well-known/ready")
            if resp.status_code != 200:
                raise RuntimeError(f"Unexpected status {resp.status_code}")
    except Exception as exc:
        print(
            f"\n[ERROR] Weaviate is not reachable at {settings.weaviate_url}: {exc}\n"
            "        Start it with:  make dev-up  (or docker compose up weaviate -d)"
        )
        sys.exit(1)

    db = WeaviateDB()
    try:
        await db.initialize()

        # Seed phase
        print()
        await seed_namespaces(db)
        print()

        # Run acceptance criteria sequentially; collect pass/fail
        results: list[bool] = []

        r = await ac1_1_latency(db)
        results.append(r)
        if not r:
            # Hard stop — latency failure makes remaining ACs meaningless
            await cleanup(db)
            await db.close()
            sys.exit(2)

        results.append(await ac1_2_namespace_tags(db))
        results.append(await ac1_3_semantic_relevance(db))

        r = await ac1_4_isolation(db)
        results.append(r)
        if not r:
            # Hard stop on isolation failure
            await cleanup(db)
            await db.close()
            sys.exit(2)

        results.append(await ac1_5_cold_start(db))

        # Summary
        passed_count = sum(results)
        total_count = len(results)
        print()
        if passed_count == total_count:
            print(f"=== RESULT: {passed_count}/{total_count} PASS — GO ===")
        else:
            failed = [f"AC1.{i + 1}" for i, ok in enumerate(results) if not ok]
            print(
                f"=== RESULT: {passed_count}/{total_count} PASS — NO-GO "
                f"(failed: {', '.join(failed)}) ==="
            )

        # Cleanup — skip NS_API since AC1.5 already deleted it
        for ns in [NS_SDK, NS_DOCS, NS_UNSEEN]:
            try:
                await db.delete_namespace(ns)
            except Exception:
                pass

    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())

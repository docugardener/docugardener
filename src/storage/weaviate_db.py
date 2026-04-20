# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Weaviate vector database implementation.

Provides integration with Weaviate's open-source vector database,
supporting self-hosted deployment and multi-tenant collections.
"""

import asyncio
from typing import Any

import weaviate
from weaviate.classes.config import Configure, DataType, Property
from weaviate.classes.query import MetadataQuery

from src.api.middleware import get_tenant_id
from src.core.config import settings
from src.core.logging import get_logger
from src.storage.vectordb import DocumentRecord, SearchResult, VectorDB

logger = get_logger(__name__)


# Collection schema for document records - Versioned for Multi-Tenancy
COLLECTION_NAME = "DocuGardenerTenantV1"


class WeaviateDB(VectorDB):
    """
    Weaviate vector database implementation.

    Features:
    - Self-hosted or managed cloud deployment
    - Multi-tenant collections (Native Weaviate Tenancy)
    - GraphQL query support
    """

    def __init__(
        self,
        url: str | None = None,
        api_key: str | None = None,
    ):
        """
        Initialize Weaviate client.

        Args:
            url: Weaviate server URL (defaults to settings)
            api_key: API key for authentication (optional)
        """
        self.url = url or settings.weaviate_url
        self.api_key = api_key or settings.weaviate_api_key
        self._client: weaviate.WeaviateClient | None = None

    async def initialize(self) -> None:
        """Initialize Weaviate connection and ensure collection exists."""
        logger.info("Initializing Weaviate connection", url=self.url)

        # Connect to Weaviate
        if self.api_key:
            _host = self.url.replace("http://", "").replace("https://", "").split(":")[0]
            _port = int(self.url.split(":")[-1]) if ":" in self.url.split("/")[-1] else 8080
            _secure = self.url.startswith("https")
            self._client = weaviate.connect_to_custom(
                http_host=_host,
                http_port=_port,
                http_secure=_secure,
                grpc_host=_host,
                grpc_port=50051,
                grpc_secure=_secure,
                auth_credentials=weaviate.auth.AuthApiKey(self.api_key),
            )
        else:
            # Parse URL for local connection
            host = self.url.replace("http://", "").replace("https://", "").split(":")[0]
            port = 8080
            if ":" in self.url.split("/")[-1]:
                port = int(self.url.split(":")[-1])

            self._client = weaviate.connect_to_local(
                host=host,
                port=port,
            )

        # Ensure collection exists
        await self._ensure_collection()

        logger.info("Weaviate initialized")

    async def _ensure_collection(self) -> None:
        """Ensure the document collection exists with Multi-Tenancy enabled."""
        if self._client is None:
            return

        collections = self._client.collections.list_all()

        if COLLECTION_NAME not in [c.name for c in collections.values()]:
            logger.info("Creating Weaviate collection", collection=COLLECTION_NAME)

            self._client.collections.create(
                name=COLLECTION_NAME,
                properties=[
                    Property(name="content", data_type=DataType.TEXT),
                    Property(name="file_path", data_type=DataType.TEXT),
                    Property(name="entity_name", data_type=DataType.TEXT),
                    Property(name="entity_type", data_type=DataType.TEXT),
                    Property(name="doc_type", data_type=DataType.TEXT),
                    Property(name="record_id", data_type=DataType.TEXT),
                ],
                # ENABLE NATIVE MULTI-TENANCY
                multi_tenancy_config=Configure.multi_tenancy(enabled=True),
                vectorizer_config=Configure.Vectorizer.none(),
            )

    async def close(self) -> None:
        """Close Weaviate connection."""
        if self._client:
            self._client.close()
            self._client = None
        logger.info("Weaviate connection closed")

    def _ensure_initialized(self) -> None:
        """Ensure client is initialized."""
        if self._client is None:
            raise RuntimeError("Weaviate not initialized. Call initialize() first.")

    def _get_tenant_collection(self, namespace: str):
        """Helper to get the collection context for a specific tenant."""
        collection = self._client.collections.get(COLLECTION_NAME)
        tenant_collection = collection.with_tenant(namespace)
        return tenant_collection

    async def upsert(
        self,
        records: list[DocumentRecord],
        namespace: str | None = None,
    ) -> int:
        """Insert or update records in Weaviate using deterministic UUIDs."""
        self._ensure_initialized()

        # Enforce tenant context
        namespace = namespace or get_tenant_id()

        if not records:
            return 0

        # Weaviate Multi-Tenancy requires the Tenant to exist before adding data.
        # We try to create it if we catch a specific error, or strictly check.
        # For simplicity, we assume the tenant ensures existence, or we auto-create here.
        # For now, let's try to auto-create the tenant "shard" in Weaviate.
        collection = self._client.collections.get(COLLECTION_NAME)
        # Check if tenant exists in Weaviate (expensive operation?), just try-add
        try:
            collection.tenants.create(tenants=[weaviate.classes.tenants.Tenant(name=namespace)])
        except Exception:
            # Most likely already exists, ignore
            pass

        tenant_col = collection.with_tenant(namespace)

        # Use batching with deterministic UUIDs for efficient upsert
        with tenant_col.batch.dynamic() as batch:
            for record in records:
                # Generate a deterministic UUID based on record_id and namespace
                from weaviate.util import generate_uuid5

                obj_uuid = generate_uuid5({"record_id": record.id, "namespace": namespace})

                # Exclude "repo_id" from the metadata spread: schema declares it
                # as DataType.UUID but sub-namespace values are not valid UUIDs.
                # The namespace context already provides tenant isolation.
                properties = {
                    "record_id": record.id,
                    "content": record.content or "",
                    **{k: str(v) for k, v in record.metadata.items() if k != "repo_id"},
                }

                batch.add_object(
                    properties=properties,
                    vector=record.vector,
                    uuid=obj_uuid,
                )

        logger.info(
            "Upserted records to Weaviate",
            count=len(records),
            namespace=namespace,
            mode="multi-tenant",
        )

        return len(records)

    async def search(
        self,
        query_vector: list[float],
        namespace: str | None = None,
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[SearchResult]:
        """Search for similar vectors in Weaviate."""
        self._ensure_initialized()

        # Enforce tenant context
        namespace = namespace or get_tenant_id()

        tenant_col = self._get_tenant_collection(namespace)

        # Metadata filtering
        weaviate_filter = None
        if filter:
            # Start with the first filter
            filters = []
            for key, value in filter.items():
                filters.append(weaviate.classes.query.Filter.by_property(key).equal(value))

            if filters:
                weaviate_filter = filters[0]
                for f in filters[1:]:
                    weaviate_filter = weaviate_filter & f

        try:
            results = tenant_col.query.near_vector(
                near_vector=query_vector,
                limit=top_k,
                filters=weaviate_filter,
                return_metadata=MetadataQuery(distance=True),
            )
        except weaviate.exceptions.WeaviateQueryError:
            # Likely tenant does not exist yet (no data)
            logger.warning("Query failed, possibly tenant does not exist", namespace=namespace)
            return []

        search_results = []
        for obj in results.objects:
            # Convert distance to similarity score (1 - distance for cosine)
            score = 1.0 - (obj.metadata.distance or 0.0)

            search_results.append(
                SearchResult(
                    id=obj.properties.get("record_id", ""),
                    score=score,
                    metadata={
                        k: v for k, v in obj.properties.items() if k not in ["content", "record_id"]
                    },
                    content=obj.properties.get("content"),
                )
            )

        logger.debug(
            "Weaviate search completed",
            namespace=namespace,
            results=len(search_results),
        )

        return search_results

    async def search_multi_namespace(
        self,
        query_vector: list[float],
        namespaces: list[str],
        top_k_per_ns: int = 3,
    ) -> list[SearchResult]:
        """
        EPIC-11: Fan-out search across multiple Weaviate tenant sub-namespaces.

        Each namespace must be a sub-namespace owned by the calling tenant
        (format: {tenant_id}__{owner}__{repo}). Callers enforce ownership;
        this method does not re-validate it.

        Validated by Spike 1 (~10ms for 3 namespaces, latency <2s) and
        Spike 1b-v2 (HR-domain isolation: 0 false positives, 10/10 runs).
        Scale ceiling: ≤30 docs/namespace. Re-spike at >1k docs/namespace.

        Args:
            query_vector:  Embedding for the query.
            namespaces:    Sub-namespace IDs to search (empty → returns []).
            top_k_per_ns:  Results per namespace (plan-tier controlled by caller).

        Returns:
            Merged, score-sorted list with source_namespace injected into metadata.
            Per-namespace failures are logged and skipped — never propagated.
        """
        if not namespaces:
            return []

        tasks = [
            self.search(query_vector=query_vector, namespace=ns, top_k=top_k_per_ns)
            for ns in namespaces
        ]
        results_per_ns = await asyncio.gather(*tasks, return_exceptions=True)

        merged: list[SearchResult] = []
        for ns, result in zip(namespaces, results_per_ns):
            if isinstance(result, Exception):
                logger.warning(
                    "cross_repo: sibling namespace search failed",
                    namespace=ns,
                    error=str(result),
                )
                continue
            for r in result:
                r.metadata["source_namespace"] = ns
                merged.append(r)

        merged.sort(key=lambda x: x.score, reverse=True)
        return merged

    async def delete(
        self,
        ids: list[str],
        namespace: str | None = None,
    ) -> int:
        """Delete records by ID from Weaviate."""
        self._ensure_initialized()

        if not ids:
            return 0

        # Enforce tenant context
        namespace = namespace or get_tenant_id()

        try:
            tenant_col = self._get_tenant_collection(namespace)

            deleted = 0
            for record_id in ids:
                try:
                    result = tenant_col.data.delete_many(
                        where=weaviate.classes.query.Filter.by_property("record_id").equal(
                            record_id
                        )
                    )
                    deleted += result.successful
                except Exception as e:
                    logger.warning("Failed to delete record", record_id=record_id, error=str(e))
        except Exception:
            # Tenant might not exist
            return 0

        logger.info(
            "Deleted records from Weaviate",
            count=deleted,
            namespace=namespace,
        )

        return deleted

    async def delete_namespace(self, namespace: str) -> bool:
        """Delete a whole Tenant (Namespace)."""
        self._ensure_initialized()

        collection = self._client.collections.get(COLLECTION_NAME)

        try:
            collection.tenants.remove([namespace])
            logger.info("Deleted Tenant from Weaviate", namespace=namespace)
            return True
        except Exception as e:
            logger.warning("Failed to delete tenant", namespace=namespace, error=str(e))
            return False

    async def list_namespaces(self) -> list[str]:
        """List all Tenants (Namespaces)."""
        self._ensure_initialized()

        collection = self._client.collections.get(COLLECTION_NAME)

        tenants = collection.tenants.get()
        return [t.name for t in tenants.values()]

    async def get_stats(self, namespace: str = "default") -> dict[str, Any]:
        """Get statistics for a namespace."""
        self._ensure_initialized()

        try:
            tenant_col = self._get_tenant_collection(namespace)

            result = tenant_col.aggregate.over_all()

            return {
                "namespace": namespace,
                "vector_count": result.total_count,
            }
        except Exception:
            return {"namespace": namespace, "vector_count": 0}

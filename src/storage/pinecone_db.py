# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Pinecone vector database implementation.

Provides integration with Pinecone's managed vector database service,
supporting multi-tenant namespaces and serverless deployment.
"""

from typing import Any

from pinecone import Pinecone, ServerlessSpec

from src.core.config import settings
from src.core.logging import get_logger
from src.storage.vectordb import DocumentRecord, SearchResult, VectorDB

logger = get_logger(__name__)


class PineconeDB(VectorDB):
    """
    Pinecone vector database implementation.

    Features:
    - Serverless deployment (no infrastructure management)
    - Multi-tenant namespaces for client isolation
    - Free tier: 100k vectors, 1 index
    """

    def __init__(
        self,
        api_key: str | None = None,
        index_name: str | None = None,
        dimension: int = 384,  # MiniLM-L6-v2 dimension
    ):
        """
        Initialize Pinecone client.

        Args:
            api_key: Pinecone API key (defaults to settings)
            index_name: Index name (defaults to settings)
            dimension: Vector dimension
        """
        self.api_key = api_key or settings.pinecone_api_key
        self.index_name = index_name or settings.pinecone_index_name
        self.dimension = dimension
        self._client: Pinecone | None = None
        self._index = None

    async def initialize(self) -> None:
        """Initialize Pinecone connection and ensure index exists."""
        if not self.api_key:
            raise ValueError("Pinecone API key not configured")

        logger.info("Initializing Pinecone connection", index=self.index_name)

        self._client = Pinecone(api_key=self.api_key)

        # Check if index exists, create if not
        existing_indexes = [idx.name for idx in self._client.list_indexes()]

        if self.index_name not in existing_indexes:
            logger.info("Creating Pinecone index", index=self.index_name)
            self._client.create_index(
                name=self.index_name,
                dimension=self.dimension,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud="aws",
                    region=settings.pinecone_environment,
                ),
            )

        self._index = self._client.Index(self.index_name)

        logger.info("Pinecone initialized", index=self.index_name)

    async def close(self) -> None:
        """Close Pinecone connection."""
        # Pinecone client doesn't require explicit closing
        self._index = None
        self._client = None
        logger.info("Pinecone connection closed")

    def _ensure_initialized(self) -> None:
        """Ensure client is initialized."""
        if self._index is None:
            raise RuntimeError("Pinecone not initialized. Call initialize() first.")

    async def upsert(
        self,
        records: list[DocumentRecord],
        namespace: str = "default",
    ) -> int:
        """Insert or update records in Pinecone."""
        self._ensure_initialized()

        if not records:
            return 0

        # Convert to Pinecone format
        vectors = []
        for record in records:
            vector_data = {
                "id": record.id,
                "values": record.vector,
                "metadata": record.metadata,
            }
            vectors.append(vector_data)

        # Batch upsert (Pinecone limit: 100 vectors per request)
        batch_size = 100
        total_upserted = 0

        for i in range(0, len(vectors), batch_size):
            batch = vectors[i : i + batch_size]
            self._index.upsert(vectors=batch, namespace=namespace)
            total_upserted += len(batch)

        logger.info(
            "Upserted records to Pinecone",
            count=total_upserted,
            namespace=namespace,
        )

        return total_upserted

    async def search(
        self,
        query_vector: list[float],
        namespace: str = "default",
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[SearchResult]:
        """Search for similar vectors in Pinecone."""
        self._ensure_initialized()

        results = self._index.query(
            vector=query_vector,
            namespace=namespace,
            top_k=top_k,
            filter=filter,
            include_metadata=True,
        )

        search_results = []
        for match in results.matches:
            search_results.append(
                SearchResult(
                    id=match.id,
                    score=match.score,
                    metadata=match.metadata or {},
                    content=match.metadata.get("content") if match.metadata else None,
                )
            )

        logger.debug(
            "Pinecone search completed",
            namespace=namespace,
            results=len(search_results),
        )

        return search_results

    async def delete(
        self,
        ids: list[str],
        namespace: str = "default",
    ) -> int:
        """Delete records by ID from Pinecone."""
        self._ensure_initialized()

        if not ids:
            return 0

        self._index.delete(ids=ids, namespace=namespace)

        logger.info(
            "Deleted records from Pinecone",
            count=len(ids),
            namespace=namespace,
        )

        return len(ids)

    async def delete_namespace(self, namespace: str) -> bool:
        """Delete an entire namespace from Pinecone."""
        self._ensure_initialized()

        self._index.delete(delete_all=True, namespace=namespace)

        logger.info("Deleted namespace from Pinecone", namespace=namespace)

        return True

    async def list_namespaces(self) -> list[str]:
        """List all namespaces in the index."""
        self._ensure_initialized()

        stats = self._index.describe_index_stats()
        namespaces = list(stats.namespaces.keys()) if stats.namespaces else []

        return namespaces

    async def get_stats(self, namespace: str = "default") -> dict[str, Any]:
        """Get statistics for a namespace."""
        self._ensure_initialized()

        stats = self._index.describe_index_stats()

        ns_stats = {}
        if stats.namespaces and namespace in stats.namespaces:
            ns_stats = {
                "vector_count": stats.namespaces[namespace].vector_count,
            }

        return {
            "namespace": namespace,
            "total_vector_count": stats.total_vector_count,
            "dimension": stats.dimension,
            "namespace_stats": ns_stats,
        }

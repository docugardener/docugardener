# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Vector database abstraction layer.

Provides a unified interface for different vector database backends
(Pinecone, Weaviate) with multi-tenant namespace support.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

import numpy as np

from src.core.logging import get_logger

logger = get_logger(__name__)


class VectorDBProvider(Enum):
    """Supported vector database providers."""

    PINECONE = "pinecone"
    WEAVIATE = "weaviate"


@dataclass
class DocumentRecord:
    """
    A record stored in the vector database.

    Attributes:
        id: Unique identifier for the record
        vector: Embedding vector
        metadata: Additional metadata (file path, entity name, etc.)
        content: Original text content (optional, for retrieval)
        namespace: Tenant namespace for isolation
    """

    id: str
    vector: list[float]
    metadata: dict[str, Any]
    content: str | None = None
    namespace: str = "default"

    @classmethod
    def from_numpy(
        cls,
        id: str,
        vector: np.ndarray,
        metadata: dict[str, Any],
        content: str | None = None,
        namespace: str = "default",
    ) -> "DocumentRecord":
        """Create a record from a numpy array."""
        return cls(
            id=id,
            vector=vector.tolist(),
            metadata=metadata,
            content=content,
            namespace=namespace,
        )


@dataclass
class SearchResult:
    """
    Result from a vector similarity search.

    Attributes:
        id: Record identifier
        score: Similarity score (higher = more similar)
        metadata: Record metadata
        content: Original content if stored
    """

    id: str
    score: float
    metadata: dict[str, Any]
    content: str | None = None


class VectorDB(ABC):
    """
    Abstract base class for vector database operations.

    Provides a unified interface for storing and retrieving
    document embeddings across different vector DB backends.
    """

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize connection to the vector database."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close connection to the vector database."""
        pass

    @abstractmethod
    async def upsert(
        self,
        records: list[DocumentRecord],
        namespace: str = "default",
    ) -> int:
        """
        Insert or update records in the database.

        Args:
            records: List of records to upsert
            namespace: Namespace for tenant isolation

        Returns:
            Number of records upserted
        """
        pass

    @abstractmethod
    async def search(
        self,
        query_vector: list[float],
        namespace: str = "default",
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[SearchResult]:
        """
        Search for similar vectors.

        Args:
            query_vector: Query embedding vector
            namespace: Namespace to search in
            top_k: Maximum number of results
            filter: Metadata filter conditions

        Returns:
            List of search results sorted by similarity
        """
        pass

    @abstractmethod
    async def delete(
        self,
        ids: list[str],
        namespace: str = "default",
    ) -> int:
        """
        Delete records by ID.

        Args:
            ids: List of record IDs to delete
            namespace: Namespace containing the records

        Returns:
            Number of records deleted
        """
        pass

    @abstractmethod
    async def delete_namespace(self, namespace: str) -> bool:
        """
        Delete an entire namespace.

        Args:
            namespace: Namespace to delete

        Returns:
            True if successful
        """
        pass

    @abstractmethod
    async def list_namespaces(self) -> list[str]:
        """
        List all namespaces.

        Returns:
            List of namespace names
        """
        pass

    @abstractmethod
    async def get_stats(self, namespace: str = "default") -> dict[str, Any]:
        """
        Get statistics for a namespace.

        Args:
            namespace: Namespace to get stats for

        Returns:
            Statistics dictionary (record count, dimensions, etc.)
        """
        pass


def generate_record_id(
    file_path: str,
    entity_name: str,
    entity_type: str,
) -> str:
    """
    Generate a unique record ID for a code entity.

    Args:
        file_path: Path to the file
        entity_name: Name of the entity
        entity_type: Type of entity (function, class, etc.)

    Returns:
        Unique record ID
    """
    import hashlib

    key = f"{file_path}:{entity_type}:{entity_name}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]

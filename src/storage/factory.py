"""
Vector database factory for provider selection.

Creates the appropriate vector database instance based on configuration.
"""

from src.core.config import settings
from src.core.logging import get_logger
from src.storage.vectordb import VectorDB, VectorDBProvider

logger = get_logger(__name__)


async def create_vector_db() -> VectorDB:
    """
    Create a vector database instance based on configuration.
    
    Returns:
        Initialized VectorDB instance
        
    Raises:
        ValueError: If provider is not supported
    """
    provider = settings.vector_db_provider
    
    logger.info("Creating vector database", provider=provider)
    
    if provider == "pinecone":
        from src.storage.pinecone_db import PineconeDB
        db = PineconeDB()
    elif provider == "weaviate":
        from src.storage.weaviate_db import WeaviateDB
        db = WeaviateDB()
    else:
        raise ValueError(f"Unsupported vector DB provider: {provider}")
    
    await db.initialize()
    
    return db


class VectorDBManager:
    """
    Manager for vector database lifecycle.
    
    Provides context manager support for automatic cleanup.
    """
    
    def __init__(self):
        """Initialize manager."""
        self._db: VectorDB | None = None
    
    async def get_db(self) -> VectorDB:
        """Get or create the vector database instance."""
        if self._db is None:
            self._db = await create_vector_db()
        return self._db
    
    async def close(self) -> None:
        """Close the vector database connection."""
        if self._db is not None:
            await self._db.close()
            self._db = None
    
    async def __aenter__(self) -> VectorDB:
        """Enter async context."""
        return await self.get_db()
    
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Exit async context."""
        await self.close()


# Global manager instance
_manager: VectorDBManager | None = None


def get_db_manager() -> VectorDBManager:
    """Get the global vector DB manager."""
    global _manager
    if _manager is None:
        _manager = VectorDBManager()
    return _manager

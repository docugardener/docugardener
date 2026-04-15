# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Unit tests for src/storage/factory.py — VectorDBManager and create_vector_db.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import src.storage.factory as factory_mod


class TestCreateVectorDb:
    @pytest.mark.asyncio
    async def test_raises_on_unsupported_provider(self):
        """create_vector_db raises ValueError for unknown provider."""
        with patch.object(factory_mod, "settings") as mock_settings:
            mock_settings.vector_db_provider = "unsupported_db"
            with pytest.raises(ValueError, match="Unsupported vector DB provider"):
                await factory_mod.create_vector_db()

    @pytest.mark.asyncio
    async def test_creates_weaviate_db(self):
        """create_vector_db returns initialized WeaviateDB for 'weaviate' provider."""
        mock_db = AsyncMock()
        with patch.object(factory_mod, "settings") as mock_settings:
            mock_settings.vector_db_provider = "weaviate"
            # WeaviateDB is imported inside the function, so patch at its source module
            with patch("src.storage.weaviate_db.WeaviateDB", return_value=mock_db):
                result = await factory_mod.create_vector_db()
        mock_db.initialize.assert_awaited_once()
        assert result is mock_db

    @pytest.mark.asyncio
    async def test_creates_pinecone_db(self):
        """create_vector_db returns initialized PineconeDB for 'pinecone' provider."""
        mock_db = AsyncMock()
        mock_pinecone_mod = MagicMock()
        mock_pinecone_mod.PineconeDB = MagicMock(return_value=mock_db)
        with patch.object(factory_mod, "settings") as mock_settings:
            mock_settings.vector_db_provider = "pinecone"
            # Patch the import inside the function by injecting into sys.modules
            import sys

            sys.modules.setdefault("src.storage.pinecone_db", mock_pinecone_mod)
            try:
                result = await factory_mod.create_vector_db()
            finally:
                sys.modules.pop("src.storage.pinecone_db", None)
        mock_db.initialize.assert_awaited_once()
        assert result is mock_db


class TestVectorDBManager:
    @pytest.mark.asyncio
    async def test_get_db_creates_on_first_call(self):
        """get_db() creates the DB on first call."""
        mock_db = AsyncMock()
        manager = factory_mod.VectorDBManager()
        with patch("src.storage.factory.create_vector_db", new=AsyncMock(return_value=mock_db)):
            result = await manager.get_db()
        assert result is mock_db

    @pytest.mark.asyncio
    async def test_get_db_reuses_existing(self):
        """get_db() returns the same instance on subsequent calls."""
        mock_db = AsyncMock()
        manager = factory_mod.VectorDBManager()
        with patch(
            "src.storage.factory.create_vector_db", new=AsyncMock(return_value=mock_db)
        ) as mock_create:
            r1 = await manager.get_db()
            r2 = await manager.get_db()
        mock_create.assert_awaited_once()
        assert r1 is r2

    @pytest.mark.asyncio
    async def test_close_calls_db_close(self):
        """close() calls close() on the underlying DB."""
        mock_db = AsyncMock()
        manager = factory_mod.VectorDBManager()
        manager._db = mock_db
        await manager.close()
        mock_db.close.assert_awaited_once()
        assert manager._db is None

    @pytest.mark.asyncio
    async def test_close_when_no_db_is_noop(self):
        """close() does nothing when _db is None."""
        manager = factory_mod.VectorDBManager()
        await manager.close()  # should not raise

    @pytest.mark.asyncio
    async def test_context_manager(self):
        """Async context manager yields the DB and closes on exit."""
        mock_db = AsyncMock()
        manager = factory_mod.VectorDBManager()
        with patch("src.storage.factory.create_vector_db", new=AsyncMock(return_value=mock_db)):
            async with manager as db:
                assert db is mock_db
        mock_db.close.assert_awaited_once()


class TestGetDbManager:
    def test_returns_manager_instance(self):
        """get_db_manager() returns a VectorDBManager."""
        # Reset global to ensure fresh creation
        factory_mod._manager = None
        mgr = factory_mod.get_db_manager()
        assert isinstance(mgr, factory_mod.VectorDBManager)

    def test_returns_same_instance_on_repeated_calls(self):
        """get_db_manager() is idempotent — returns the same object."""
        factory_mod._manager = None
        m1 = factory_mod.get_db_manager()
        m2 = factory_mod.get_db_manager()
        assert m1 is m2
        # Cleanup
        factory_mod._manager = None

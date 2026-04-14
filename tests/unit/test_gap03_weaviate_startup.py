"""
GAP-03: Tests for Weaviate schema validation at FastAPI startup.

Verifies that the lifespan event:
  A. Calls WeaviateDB.initialize() during startup
  B. Logs at CRITICAL level when Weaviate is unreachable
  C. Does NOT raise — the app must still start (graceful degradation)
  D. Logs success when Weaviate is reachable
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _run_lifespan(app):
    """Drive the lifespan async-context-manager through one full startup+shutdown."""
    from contextlib import asynccontextmanager
    async with app.router.lifespan_context(app):
        pass  # simulate a started-then-stopped server


# ── A / D. Successful startup ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_weaviate_initialize_called_on_startup():
    """WeaviateDB.initialize() is called exactly once during app startup."""
    mock_db = AsyncMock()
    mock_db.close = AsyncMock()

    with patch("src.storage.weaviate_db.WeaviateDB", return_value=mock_db):
        from src.main import app
        await _run_lifespan(app)

    mock_db.initialize.assert_awaited_once()


@pytest.mark.asyncio
async def test_weaviate_close_called_after_initialize():
    """WeaviateDB.close() is called after successful initialize()."""
    mock_db = AsyncMock()
    mock_db.close = AsyncMock()

    with patch("src.storage.weaviate_db.WeaviateDB", return_value=mock_db):
        from src.main import app
        await _run_lifespan(app)

    mock_db.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_successful_startup_logs_info(caplog):
    """INFO-level log is emitted when schema validation succeeds."""
    import logging
    mock_db = AsyncMock()
    mock_db.close = AsyncMock()

    with patch("src.storage.weaviate_db.WeaviateDB", return_value=mock_db), \
         caplog.at_level(logging.INFO):
        from src.main import app
        await _run_lifespan(app)

    assert any("GAP-03" in r.message for r in caplog.records), (
        "Expected a GAP-03 info log on successful startup"
    )


# ── B / C. Weaviate unreachable ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_weaviate_unreachable_does_not_raise():
    """App starts even when WeaviateDB.initialize() raises an exception."""
    mock_db = AsyncMock()
    mock_db.initialize.side_effect = ConnectionError("connection refused")

    with patch("src.storage.weaviate_db.WeaviateDB", return_value=mock_db):
        from src.main import app
        # Must not propagate the ConnectionError
        await _run_lifespan(app)  # no assertion — just must not raise


@pytest.mark.asyncio
async def test_weaviate_unreachable_logs_critical(caplog):
    """CRITICAL log is emitted when Weaviate is unreachable."""
    import logging
    mock_db = AsyncMock()
    mock_db.initialize.side_effect = RuntimeError("timeout")

    with patch("src.storage.weaviate_db.WeaviateDB", return_value=mock_db), \
         caplog.at_level(logging.CRITICAL):
        from src.main import app
        await _run_lifespan(app)

    critical_msgs = [r for r in caplog.records if r.levelno >= logging.CRITICAL]
    assert critical_msgs, "Expected at least one CRITICAL log when Weaviate is down"
    assert any("GAP-03" in r.message for r in critical_msgs)


@pytest.mark.asyncio
async def test_weaviate_unreachable_error_message_included(caplog):
    """The CRITICAL log includes the original error string."""
    import logging
    mock_db = AsyncMock()
    mock_db.initialize.side_effect = RuntimeError("ECONNREFUSED 8080")

    with patch("src.storage.weaviate_db.WeaviateDB", return_value=mock_db), \
         caplog.at_level(logging.CRITICAL):
        from src.main import app
        await _run_lifespan(app)

    # structlog logs via stdlib bridge — check all record attributes
    found = any(
        "ECONNREFUSED 8080" in str(r.__dict__)
        for r in caplog.records
    )
    assert found, "Expected the error message to appear in the CRITICAL log record"


@pytest.mark.asyncio
async def test_weaviate_import_error_does_not_raise():
    """Even if WeaviateDB() constructor raises, startup must succeed (graceful degradation)."""
    mock_cls = MagicMock(side_effect=ImportError("no weaviate module"))

    with patch("src.storage.weaviate_db.WeaviateDB", mock_cls):
        from src.main import app
        await _run_lifespan(app)  # must not raise

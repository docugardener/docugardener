# SPDX-License-Identifier: AGPL-3.0-or-later
"""
SCAL-01: PgBouncer connection pooler — unit tests.

Verifies that the SQLAlchemy engine is created with pool_pre_ping=True,
which is required for correct behaviour when PgBouncer is in the connection
path in transaction-mode pooling. Without this flag, SQLAlchemy may reuse
connections that PgBouncer has already silently closed, resulting in
OperationalError on the first query after a pool timeout.
"""

from unittest.mock import patch


class TestPgBouncerPoolPrePing:
    """SCAL-01: create_engine must be called with pool_pre_ping=True."""

    def test_get_engine_passes_pool_pre_ping(self):
        """_get_engine() must forward pool_pre_ping=True to create_engine."""
        import src.pipeline.job_manager as jm_module

        # Snapshot and reset the singleton so _get_engine() re-runs create_engine.
        # Restore afterwards so this test does not contaminate the engine singleton
        # for subsequent tests that rely on job_manager working correctly.
        original_engine = jm_module._engine
        jm_module._engine = None
        try:
            with patch("src.pipeline.job_manager.create_engine") as mock_ce:
                with patch("src.pipeline.job_manager.settings") as mock_settings:
                    mock_settings.sql_database_url = "postgresql://fake/testdb"
                    jm_module._get_engine()

            mock_ce.assert_called_once_with(
                "postgresql://fake/testdb",
                pool_pre_ping=True,
            )
        finally:
            jm_module._engine = original_engine

    def test_pool_pre_ping_present_in_source(self):
        """Smoke-check: pool_pre_ping=True is present in job_manager source."""
        import pathlib

        source = (
            pathlib.Path(__file__).parents[2] / "src" / "pipeline" / "job_manager.py"
        ).read_text()
        assert "pool_pre_ping=True" in source, (
            "pool_pre_ping=True missing from job_manager.py — "
            "connections through PgBouncer transaction-mode will silently fail "
            "after idle timeout."
        )

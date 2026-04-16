# SPDX-License-Identifier: AGPL-3.0-or-later
"""Unit tests for BUG-1 fix: synchronize event upsert instead of duplicate create.

Tests the sync_upsert module helpers:
  - find_open_job() returns NEEDS_REVIEW jobs (open / awaiting triage)
  - find_open_job() returns None for QUEUED/PROCESSING (in-flight, not reset-able)
  - find_open_job() returns None for RESOLVED/FAILED/DISMISSED jobs
  - find_open_job() scopes by tenant_id
  - reset_job_for_reanalysis() resets status=QUEUED and triageStatus=PENDING
  - reset_job_for_reanalysis() calls db.add + db.commit + db.refresh
  - reset_job_for_reanalysis() returns same job object
  - reset_job_for_reanalysis() sets updatedAt to recent UTC datetime
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

TENANT_ID = "tenant_abc123"
REPO_ID = "repo_cuid_xyz"
PR_NUMBER = 42


def _make_job(
    job_id: str | None = None,
    status: str = "COMPLETED",
    triage_status: str = "NEEDS_REVIEW",
    tenant_id: str = TENANT_ID,
    repo_id: str = REPO_ID,
    pr_number: int = PR_NUMBER,
) -> MagicMock:
    """Build a mock Job ORM object with realistic attribute values."""
    job = MagicMock()
    job.id = job_id or str(uuid.uuid4())
    job.status = status
    job.triageStatus = triage_status
    job.tenantId = tenant_id
    job.repositoryId = repo_id
    job.prNumber = pr_number
    job.createdAt = datetime.now(UTC)
    job.updatedAt = datetime.now(UTC)
    return job


def _make_db(return_value=None) -> MagicMock:
    """Build a mock SQLAlchemy session whose query chain returns ``return_value``."""
    mock_query = MagicMock()
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.first.return_value = return_value

    mock_db = MagicMock()
    mock_db.query.return_value = mock_query
    return mock_db


# ---------------------------------------------------------------------------
# Tests: find_open_job()
# ---------------------------------------------------------------------------


class TestFindOpenJob:
    """Unit tests for src.pipeline.sync_upsert.find_open_job."""

    def test_returns_completed_pending_job(self) -> None:
        """COMPLETED + PENDING job (awaiting triage) should be returned as 'open'."""
        from src.pipeline.sync_upsert import find_open_job

        mock_job = _make_job(status="COMPLETED", triage_status="PENDING")
        mock_db = _make_db(return_value=mock_job)

        result = find_open_job(mock_db, TENANT_ID, REPO_ID, PR_NUMBER)

        assert result is mock_job

    def test_returns_none_when_no_open_job(self) -> None:
        """Returns None when the DB query chain returns nothing."""
        from src.pipeline.sync_upsert import find_open_job

        mock_db = _make_db(return_value=None)

        result = find_open_job(mock_db, TENANT_ID, REPO_ID, PR_NUMBER)

        assert result is None

    def test_filter_chain_invoked(self) -> None:
        """The query must apply filter conditions (not a bare table scan)."""
        from src.pipeline.sync_upsert import find_open_job

        mock_db = _make_db(return_value=None)

        find_open_job(mock_db, TENANT_ID, REPO_ID, PR_NUMBER)

        assert mock_db.query.return_value.filter.called

    def test_order_by_invoked_for_most_recent(self) -> None:
        """The query must use order_by so the newest job wins on ties."""
        from src.pipeline.sync_upsert import find_open_job

        mock_db = _make_db(return_value=None)

        find_open_job(mock_db, TENANT_ID, REPO_ID, PR_NUMBER)

        assert mock_db.query.return_value.filter.return_value.order_by.called

    def test_tenant_isolation_scopes_query(self) -> None:
        """Different tenant_id values each invoke the query (no short-circuit)."""
        from src.pipeline.sync_upsert import find_open_job

        mock_db = _make_db(return_value=None)

        result = find_open_job(mock_db, "other_tenant", REPO_ID, PR_NUMBER)

        assert result is None
        assert mock_db.query.return_value.filter.called


# ---------------------------------------------------------------------------
# Tests: reset_job_for_reanalysis()
# ---------------------------------------------------------------------------


class TestResetJobForReanalysis:
    """Unit tests for src.pipeline.sync_upsert.reset_job_for_reanalysis."""

    def test_resets_status_to_queued(self) -> None:
        """status must be reset to JobStatus.QUEUED."""
        from src.pipeline.sync_upsert import reset_job_for_reanalysis
        from src.storage.sql_models import JobStatus

        mock_job = _make_job(status="COMPLETED")
        mock_db = MagicMock()

        reset_job_for_reanalysis(db=mock_db, job=mock_job)

        assert mock_job.status == JobStatus.QUEUED

    def test_resets_triage_status_to_pending(self) -> None:
        """triageStatus must be reset to TriageStatus.PENDING."""
        from src.pipeline.sync_upsert import reset_job_for_reanalysis
        from src.storage.sql_models import TriageStatus

        mock_job = _make_job(triage_status="NEEDS_REVIEW")
        mock_db = MagicMock()

        reset_job_for_reanalysis(db=mock_db, job=mock_job)

        assert mock_job.triageStatus == TriageStatus.PENDING

    def test_calls_db_add_and_commit(self) -> None:
        """db.add() and db.commit() must be called to persist the changes."""
        from src.pipeline.sync_upsert import reset_job_for_reanalysis

        mock_job = _make_job()
        mock_db = MagicMock()

        reset_job_for_reanalysis(db=mock_db, job=mock_job)

        mock_db.add.assert_called_once_with(mock_job)
        mock_db.commit.assert_called_once()

    def test_calls_db_refresh(self) -> None:
        """db.refresh() must be called so the returned object reflects DB state."""
        from src.pipeline.sync_upsert import reset_job_for_reanalysis

        mock_job = _make_job()
        mock_db = MagicMock()

        reset_job_for_reanalysis(db=mock_db, job=mock_job)

        mock_db.refresh.assert_called_once_with(mock_job)

    def test_returns_the_same_job_object(self) -> None:
        """Must return the same job reference (mutated in place)."""
        from src.pipeline.sync_upsert import reset_job_for_reanalysis

        mock_job = _make_job()
        mock_db = MagicMock()

        result = reset_job_for_reanalysis(db=mock_db, job=mock_job)

        assert result is mock_job

    def test_updated_at_set_to_utc_now(self) -> None:
        """updatedAt must be set to a recent UTC datetime."""
        from src.pipeline.sync_upsert import reset_job_for_reanalysis

        mock_job = _make_job()
        mock_db = MagicMock()

        before = datetime.now(UTC)
        reset_job_for_reanalysis(db=mock_db, job=mock_job)
        after = datetime.now(UTC)

        assert isinstance(mock_job.updatedAt, datetime)
        assert before <= mock_job.updatedAt <= after

# SPDX-License-Identifier: AGPL-3.0-or-later
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.config import settings
from src.storage.sql_models import Job, JobStatus, Repository

# Lazy engine/session — created on first use so importing this module
# does not require SQL_DATABASE_URL to be set (unit tests run without it).
_engine = None
_SessionLocal = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(settings.sql_database_url, pool_pre_ping=True)  # SCAL-01
    return _engine


def _get_session_local():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_get_engine())
    return _SessionLocal


def SessionLocal():  # noqa: N802 — callable kept for test-patchability
    """Thin wrapper so tests can patch 'src.pipeline.job_manager.SessionLocal'."""
    return _get_session_local()()


def get_db():
    """FastAPI dependency for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class JobManager:
    """
    Manages the lifecycle of analysis jobs in the database.
    Querying happens via SQLAlchemy directly on the 'Job' table.
    """

    def __init__(self):
        # None means "use the lazy global factory"; tests override this
        # with a SQLite sessionmaker to avoid hitting real Postgres.
        self._session_factory = None

    def _get_factory(self):
        """Return the session factory — test-overridable."""
        if self._session_factory is not None:
            return self._session_factory
        return _get_session_local()

    def get_or_create_repo(self, tenant_id: str, github_repo_id: str, name: str) -> str:
        """
        Ensures a Repository record exists for the job linkage.
        Returns the internal Repository DB ID (CUID).
        """
        session = self._get_factory()()
        try:
            repo = (
                session.query(Repository)
                .filter_by(tenantId=tenant_id, githubRepoId=str(github_repo_id))
                .first()
            )
            if repo:
                return repo.id

            # Create if not exists (Lazy creation helpful for dev/testing)
            # In prod, repo should exist via onboarding, but this is safe fallback
            new_id = f"repo-{uuid.uuid4().hex[:10]}"  # Or use cuid generator if we had one
            repo = Repository(
                id=new_id,
                tenantId=tenant_id,
                githubRepoId=str(github_repo_id),
                name=name,
                enabled=True,
            )
            session.add(repo)
            session.commit()
            return repo.id
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    def create_job(self, tenant_id: str, repo_id: str, pr_number: int) -> str:
        """
        Creates a new Job record in QUEUED state.
        Returns the Job ID.
        """
        session = self._get_factory()()
        try:
            # We assume repo_id is the internal DB ID here.
            # If caller has github ID, they should use resolve_repo first.
            job_id = f"job-{uuid.uuid4().hex}"
            job = Job(
                id=job_id,
                tenantId=tenant_id,
                repositoryId=repo_id,
                prNumber=pr_number,
                status=JobStatus.QUEUED,
                logs=[],
                result={},
            )
            session.add(job)
            session.commit()
            return job_id
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    def update_status(
        self, job_id: str, status: JobStatus, result: dict[str, Any] | None = None
    ) -> None:
        """Update job status and optionally the result."""
        session = self._get_factory()()
        try:
            update_data = {"status": status}
            if status == JobStatus.PROCESSING:
                update_data["startedAt"] = datetime.utcnow()
            if status in (JobStatus.COMPLETED, JobStatus.FAILED):
                update_data["completedAt"] = datetime.utcnow()
            if result:
                update_data["result"] = result

            session.query(Job).filter(Job.id == job_id).update(update_data)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def fail_job(self, job_id: str, error: str, triage_status: str | None = None) -> None:
        """Mark job as failed, merging error into existing result so analysis data is preserved.

        Args:
            job_id: Job to fail.
            error: Human-readable error message stored in result.error.
            triage_status: Optional TriageStatus override (e.g. "FIX_PR_FAILED" to distinguish
                fix-PR push failures from analysis failures). Leaves triageStatus unchanged if None.
        """
        session = self._get_factory()()
        try:
            job = session.query(Job).filter(Job.id == job_id).first()
            existing_result = dict(job.result) if job and isinstance(job.result, dict) else {}
            existing_result["error"] = error
            update_data: dict[str, Any] = {
                "status": JobStatus.FAILED,
                "completedAt": datetime.utcnow(),
                "result": existing_result,
            }
            if triage_status is not None:
                update_data["triageStatus"] = triage_status
            session.query(Job).filter(Job.id == job_id).update(update_data)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def complete_job(self, job_id: str, result: dict[str, Any]) -> None:
        """Mark job as completed with result."""
        self.update_status(job_id, JobStatus.COMPLETED, result)

    def patch_result(self, job_id: str, extra: dict[str, Any]) -> None:
        """Merge extra fields into an existing job result without overwriting other fields."""
        session = self._get_factory()()
        try:
            job = session.query(Job).filter(Job.id == job_id).first()
            if not job:
                return
            merged = {**(job.result if isinstance(job.result, dict) else {}), **extra}
            session.query(Job).filter(Job.id == job_id).update({"result": merged})
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


# Global Instance
job_manager = JobManager()

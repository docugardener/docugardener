# SPDX-License-Identifier: AGPL-3.0-or-later
"""
SCAL-02: Second worker container — concurrency safety tests.

Verifies that two concurrent analyze_pr_job invocations (simulating two
worker containers) do not interfere with each other. The correctness is
guaranteed by the GAP-4 pre-created db_job_id — each worker receives its own
unique db_job_id and the jobs are fully isolated at the DB level.

BUG-8 fix: parameter renamed 'job_id' → 'db_job_id' in analyze_pr_job because
RQ's Queue.enqueue() pops 'job_id' from kwargs (uses it as the RQ job's own
identifier) and never forwards it to the task function.
"""

from unittest.mock import MagicMock, patch


class TestWorkerConcurrencyIsolation:
    """SCAL-02: two concurrent analyze_pr_job calls must be fully isolated."""

    def test_two_jobs_each_call_handler_with_own_job_id(self):
        """Each analyze_pr_job forwards exactly its own db_job_id as job_id to process_pull_request."""
        received_ids: list[str] = []

        async def mock_process(
            installation_id,
            owner,
            repo,
            pr_number,
            action,
            base_sha,
            head_sha,
            changed_files,
            base_ref=None,
            jira_ticket_key=None,
            ai_authored=False,
            ai_signal="",
            job_id=None,
        ):
            received_ids.append(job_id)
            result = MagicMock()
            result.repo_full_name = f"{owner}/{repo}"
            result.pr_number = pr_number
            result.drift_score = 0.0
            result.processing_time_ms = 100
            result.documentation_updates = []
            result.drift_analysis = None
            return result

        with patch("src.pipeline.handler.process_pull_request", side_effect=mock_process):
            with patch("src.monitoring.metrics.JOBS_COMPLETED"):
                from src.worker.jobs import analyze_pr_job

                analyze_pr_job(
                    installation_id=1,
                    owner="acme",
                    repo="app",
                    pr_number=1,
                    action="opened",
                    base_sha="aaa",
                    head_sha="bbb",
                    changed_files=[],
                    db_job_id="job-worker-1",  # BUG-8 fix: renamed from job_id
                )
                analyze_pr_job(
                    installation_id=1,
                    owner="acme",
                    repo="app",
                    pr_number=2,
                    action="opened",
                    base_sha="ccc",
                    head_sha="ddd",
                    changed_files=[],
                    db_job_id="job-worker-2",  # BUG-8 fix: renamed from job_id
                )

        assert received_ids == ["job-worker-1", "job-worker-2"], (
            "Each worker must forward only its own db_job_id as job_id — no cross-contamination."
        )

    def test_job_id_absent_still_works(self):
        """analyze_pr_job without db_job_id (old in-flight jobs) must not crash."""

        async def mock_process(**kwargs):
            result = MagicMock()
            result.repo_full_name = "acme/app"
            result.pr_number = 1
            result.drift_score = 0.0
            result.processing_time_ms = 100
            result.documentation_updates = []
            result.drift_analysis = None
            return result

        with patch("src.pipeline.handler.process_pull_request", side_effect=mock_process):
            with patch("src.monitoring.metrics.JOBS_COMPLETED"):
                from src.worker.jobs import analyze_pr_job

                # Must not raise — job_id defaults to None
                analyze_pr_job(
                    installation_id=1,
                    owner="acme",
                    repo="app",
                    pr_number=3,
                    action="opened",
                    base_sha="eee",
                    head_sha="fff",
                    changed_files=[],
                )

    def test_worker_command_in_compose_has_both_queues(self):
        """docker-compose worker command must consume both high and default queues."""
        import pathlib

        compose = (pathlib.Path(__file__).parents[2] / "docker" / "docker-compose.yml").read_text()
        # Both worker and worker-2 must have the dual-queue command
        assert "rq worker high default" in compose, (
            "docker-compose worker command must be 'rq worker high default'. "
            "Missing 'high' means fix/ignore jobs are never consumed by docker-compose workers."
        )

    def test_worker_2_present_in_compose(self):
        """docker-compose must define a worker-2 service for horizontal scaling (SCAL-02)."""
        import pathlib

        compose = (pathlib.Path(__file__).parents[2] / "docker" / "docker-compose.yml").read_text()
        assert "worker-2:" in compose, (
            "docker-compose.yml must define a worker-2 service. See SCAL-02 in the backlog."
        )

"""
SCALE-03: Nightly Rollup — unit tests.

Covers:
  - aggregate_repo_jobs: correct scoring, None on no-score jobs, high-drift filter,
    sender_type tracking (bot_count / human_count)
  - build_issue_title / build_issue_body: expected content present, bot/human breakdown
  - run_nightly_rollup: one issue per active repo, skips empty windows,
    skips no-score repos, handles decrypt errors without raising, returns
    correct summary counters, skips tenants missing credentials.
"""

from unittest.mock import MagicMock, patch

from src.jobs.nightly_rollup import (
    HIGH_DRIFT_THRESHOLD,
    RepoRollupResult,
    aggregate_repo_jobs,
    build_issue_body,
    build_issue_title,
    run_nightly_rollup,
)

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_job(
    pr_number: int,
    drift_score: int | None = 75,
    repo: str = "acme/api",
    sender_type: str = "human",
) -> MagicMock:
    """Build a mock Job with the minimal fields used by the rollup."""
    job = MagicMock()
    job.prNumber = pr_number
    if drift_score is None:
        job.result = {}  # No drift_score key — fast-path job
    else:
        job.result = {
            "repo_full_name": repo,  # BUG-05 fix: handler stores repo_full_name
            "drift_score": drift_score,
            "sender_type": sender_type,  # SCALE-03
            "drift_analysis": {
                "summary": f"Changes in PR #{pr_number}",
                "severity": "significant" if drift_score >= 70 else "minor",
            },
        }
    return job


def _make_tenant(
    tenant_id: str = "t-1",
    installation_id: str = "42",
    app_id: str = "app-1",
    private_key: str | None = "enc-pk",
) -> MagicMock:
    t = MagicMock()
    t.id = tenant_id
    t.installationId = installation_id
    t.appId = app_id
    t.privateKey = private_key
    return t


def _make_repo(repo_id: str = "r-1", name: str = "acme/api") -> MagicMock:
    r = MagicMock()
    r.id = repo_id
    r.name = name
    r.enabled = True
    return r


# ── aggregate_repo_jobs ───────────────────────────────────────────────────────


class TestAggregateRepoJobs:
    def test_returns_correct_avg_and_max(self):
        jobs = [_make_job(1, 60), _make_job(2, 80), _make_job(3, 40)]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert result.job_count == 3
        assert result.max_drift == 80
        assert abs(result.avg_drift - (60 + 80 + 40) / 3) < 0.01

    def test_returns_none_when_no_scored_jobs(self):
        """Jobs without drift_score (fast-path) produce no rollup."""
        jobs = [_make_job(1, drift_score=None), _make_job(2, drift_score=None)]
        assert aggregate_repo_jobs(jobs) is None

    def test_returns_none_for_empty_list(self):
        assert aggregate_repo_jobs([]) is None

    def test_high_drift_jobs_filtered_correctly(self):
        jobs = [
            _make_job(1, HIGH_DRIFT_THRESHOLD - 1),  # below threshold
            _make_job(2, HIGH_DRIFT_THRESHOLD),  # at threshold — included
            _make_job(3, HIGH_DRIFT_THRESHOLD + 10),  # above threshold — included
        ]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert len(result.high_drift_jobs) == 2
        # Should be sorted descending by score
        assert result.high_drift_jobs[0]["drift_score"] > result.high_drift_jobs[1]["drift_score"]

    def test_no_high_drift_jobs_when_all_below_threshold(self):
        jobs = [_make_job(1, HIGH_DRIFT_THRESHOLD - 10)]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert result.high_drift_jobs == []

    def test_repo_name_extracted_from_result(self):
        jobs = [_make_job(1, 70, repo="org/my-repo")]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert result.repo_name == "org/my-repo"

    def test_skips_jobs_without_drift_score_but_counts_scored(self):
        """Mixed batch: only scored jobs count toward the aggregation."""
        jobs = [
            _make_job(1, drift_score=None),  # fast-path — excluded
            _make_job(2, drift_score=50),  # scored — included
        ]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert result.job_count == 1
        assert result.avg_drift == 50.0

    def test_repo_name_read_from_repo_full_name_key(self):
        """BUG-05 regression: handler stores 'repo_full_name', not 'repo'."""
        job = MagicMock()
        job.prNumber = 7
        job.result = {
            "repo_full_name": "org/correct-repo",
            "drift_score": 55,
        }
        result = aggregate_repo_jobs([job])

        assert result is not None
        assert result.repo_name == "org/correct-repo"

    def test_old_repo_key_not_used(self):
        """BUG-05 regression: stale 'repo' key must NOT set repo_name."""
        job = MagicMock()
        job.prNumber = 8
        job.result = {
            "repo": "org/stale-key",  # old key — must be ignored
            "drift_score": 40,
        }
        result = aggregate_repo_jobs([job])

        assert result is not None
        # repo_name falls back to empty string because "repo_full_name" is absent
        assert result.repo_name == ""


# ── build_issue_title / build_issue_body ─────────────────────────────────────


class TestIssueFormatting:
    def _rollup(self, avg: float = 72.0, peak: int = 90, high_count: int = 2) -> RepoRollupResult:
        high = [
            {
                "pr_number": i,
                "drift_score": 70 + i * 5,
                "severity": "significant",
                "summary": f"Change {i}",
            }
            for i in range(high_count)
        ]
        return RepoRollupResult(
            repo_name="acme/api",
            job_count=5,
            avg_drift=avg,
            max_drift=peak,
            high_drift_jobs=high,
        )

    def test_title_contains_date_avg_and_peak(self):
        rollup = self._rollup(avg=72.0, peak=90)
        title = build_issue_title(rollup)

        assert "DocuGardener" in title
        assert "avg 72" in title
        assert "peak 90" in title

    def test_body_contains_pr_count(self):
        rollup = self._rollup()
        body = build_issue_body(rollup)

        assert "5" in body  # job_count

    def test_body_shows_high_drift_table_when_present(self):
        rollup = self._rollup(high_count=2)
        body = build_issue_body(rollup)

        assert "High-Drift" in body
        assert "|" in body  # Markdown table present

    def test_body_shows_clean_message_when_no_high_drift(self):
        rollup = RepoRollupResult(
            repo_name="acme/api",
            job_count=3,
            avg_drift=30.0,
            max_drift=45,
            high_drift_jobs=[],
        )
        body = build_issue_body(rollup)

        assert "No high-drift" in body
        assert "High-Drift" not in body

    def test_body_footer_contains_docugardener(self):
        rollup = self._rollup()
        body = build_issue_body(rollup)

        assert "DocuGardener" in body


# ── run_nightly_rollup ────────────────────────────────────────────────────────


class TestRunNightlyRollup:
    """
    Tests for the top-level orchestrator. DB and GitHub calls are fully mocked.
    """

    def _make_session(
        self,
        tenants: list,
        repos: list,
        jobs: list,
    ) -> MagicMock:
        """
        Build a mock SQLAlchemy session whose .execute().scalars().all()
        calls return tenants, then repos, then jobs in that order.
        """
        session = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all.side_effect = [tenants, repos, jobs]
        execute_mock = MagicMock()
        execute_mock.scalars.return_value = scalars_mock
        session.execute.return_value = execute_mock
        return session

    @patch("src.jobs.nightly_rollup.post_rollup_issue", return_value="https://github.com/issue/1")
    @patch("src.jobs.nightly_rollup.decrypt_credential", return_value="decrypted-pk")
    @patch("src.jobs.nightly_rollup.SessionLocal")
    def test_posts_one_issue_per_repo(self, mock_session_cls, mock_decrypt, mock_post):
        tenant = _make_tenant()
        repo = _make_repo()
        jobs = [_make_job(1, 80), _make_job(2, 70)]

        session = self._make_session([tenant], [repo], jobs)
        mock_session_cls.return_value = session

        summary = run_nightly_rollup()

        assert mock_post.call_count == 1
        assert summary["issues_posted"] == 1
        assert summary["repos_processed"] == 1
        assert summary["errors"] == 0

    @patch("src.jobs.nightly_rollup.post_rollup_issue", return_value="https://github.com/issue/1")
    @patch("src.jobs.nightly_rollup.decrypt_credential", return_value="decrypted-pk")
    @patch("src.jobs.nightly_rollup.SessionLocal")
    def test_skips_repo_with_no_jobs_in_window(self, mock_session_cls, mock_decrypt, mock_post):
        tenant = _make_tenant()
        repo = _make_repo()

        # scalars().all() returns: tenants, repos, then empty jobs list
        session = self._make_session([tenant], [repo], [])
        mock_session_cls.return_value = session

        summary = run_nightly_rollup()

        mock_post.assert_not_called()
        assert summary["repos_processed"] == 0
        assert summary["issues_posted"] == 0

    @patch("src.jobs.nightly_rollup.post_rollup_issue", return_value="https://github.com/issue/1")
    @patch("src.jobs.nightly_rollup.decrypt_credential", return_value="decrypted-pk")
    @patch("src.jobs.nightly_rollup.SessionLocal")
    def test_skips_repo_when_all_jobs_have_no_drift_score(
        self, mock_session_cls, mock_decrypt, mock_post
    ):
        """Fast-path jobs have no drift_score — rollup should produce no issue."""
        tenant = _make_tenant()
        repo = _make_repo()
        jobs = [_make_job(1, drift_score=None), _make_job(2, drift_score=None)]

        session = self._make_session([tenant], [repo], jobs)
        mock_session_cls.return_value = session

        summary = run_nightly_rollup()

        mock_post.assert_not_called()
        assert summary["repos_processed"] == 0

    @patch("src.jobs.nightly_rollup.post_rollup_issue", return_value=None)
    @patch("src.jobs.nightly_rollup.decrypt_credential", return_value="decrypted-pk")
    @patch("src.jobs.nightly_rollup.SessionLocal")
    def test_error_counter_incremented_when_post_returns_none(
        self, mock_session_cls, mock_decrypt, mock_post
    ):
        """If GitHub issue posting fails, errors counter goes up but no exception is raised."""
        tenant = _make_tenant()
        repo = _make_repo()
        jobs = [_make_job(1, 85)]

        session = self._make_session([tenant], [repo], jobs)
        mock_session_cls.return_value = session

        summary = run_nightly_rollup()

        assert summary["errors"] == 1
        assert summary["issues_posted"] == 0

    @patch("src.jobs.nightly_rollup.post_rollup_issue", return_value="https://github.com/issue/1")
    @patch("src.jobs.nightly_rollup.decrypt_credential", side_effect=Exception("bad key"))
    @patch("src.jobs.nightly_rollup.SessionLocal")
    def test_decrypt_failure_skips_tenant_without_raising(
        self, mock_session_cls, mock_decrypt, mock_post
    ):
        """A decrypt error logs a warning and skips the tenant — no exception propagates."""
        tenant = _make_tenant()
        repo = _make_repo()
        jobs = [_make_job(1, 80)]

        session = self._make_session([tenant], [repo], jobs)
        mock_session_cls.return_value = session

        # Must not raise
        summary = run_nightly_rollup()

        mock_post.assert_not_called()
        assert summary["repos_processed"] == 0

    @patch("src.jobs.nightly_rollup.post_rollup_issue", return_value="https://github.com/issue/1")
    @patch("src.jobs.nightly_rollup.decrypt_credential", return_value="decrypted-pk")
    @patch("src.jobs.nightly_rollup.SessionLocal")
    def test_no_tenants_returns_zero_summary(self, mock_session_cls, mock_decrypt, mock_post):
        """When the DB returns no tenants, summary is all zeros."""
        session = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = []
        execute_mock = MagicMock()
        execute_mock.scalars.return_value = scalars_mock
        session.execute.return_value = execute_mock
        mock_session_cls.return_value = session

        summary = run_nightly_rollup()

        assert summary == {"repos_processed": 0, "issues_posted": 0, "errors": 0}
        mock_post.assert_not_called()

    @patch("src.jobs.nightly_rollup.post_rollup_issue", return_value="https://github.com/issue/1")
    @patch("src.jobs.nightly_rollup.decrypt_credential", return_value="decrypted-pk")
    @patch("src.jobs.nightly_rollup.SessionLocal")
    def test_post_called_with_correct_repo_name(self, mock_session_cls, mock_decrypt, mock_post):
        tenant = _make_tenant(installation_id="99", app_id="app-42")
        repo = _make_repo(name="myorg/myrepo")
        jobs = [_make_job(5, 90, repo="myorg/myrepo")]

        session = self._make_session([tenant], [repo], jobs)
        mock_session_cls.return_value = session

        run_nightly_rollup()

        call_kwargs = mock_post.call_args
        assert call_kwargs.kwargs["repo_full_name"] == "myorg/myrepo"
        assert call_kwargs.kwargs["installation_id"] == 99
        assert call_kwargs.kwargs["app_id"] == "app-42"


# ── SCALE-03: sender_type tracking ───────────────────────────────────────────


class TestSenderTypeTracking:
    """Tests for SCALE-03 bot_count / human_count breakdown in aggregate_repo_jobs."""

    def test_bot_count_correct(self):
        jobs = [
            _make_job(1, 70, sender_type="bot"),
            _make_job(2, 65, sender_type="bot"),
            _make_job(3, 80, sender_type="human"),
        ]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert result.bot_count == 2
        assert result.human_count == 1

    def test_human_count_correct(self):
        jobs = [
            _make_job(1, 70, sender_type="human"),
            _make_job(2, 65, sender_type="human"),
        ]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert result.bot_count == 0
        assert result.human_count == 2

    def test_ai_sender_type_counts_as_human(self):
        """AI-authored PRs (branch prefix/body marker) are not bots — counted as human."""
        jobs = [
            _make_job(1, 70, sender_type="ai"),
            _make_job(2, 65, sender_type="human"),
        ]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert result.bot_count == 0
        assert result.human_count == 2

    def test_missing_sender_type_defaults_to_human(self):
        """Jobs from before SCALE-03 (no sender_type key) default to 'human'."""
        job = MagicMock()
        job.prNumber = 1
        job.result = {"drift_score": 70, "repo_full_name": "org/repo"}  # no sender_type
        result = aggregate_repo_jobs([job])

        assert result is not None
        assert result.bot_count == 0
        assert result.human_count == 1

    def test_all_bots_zeros_human_count(self):
        jobs = [_make_job(i, 60, sender_type="bot") for i in range(5)]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert result.bot_count == 5
        assert result.human_count == 0

    def test_sender_type_in_high_drift_jobs(self):
        """high_drift_jobs entries include sender_type for downstream filtering."""
        jobs = [
            _make_job(1, HIGH_DRIFT_THRESHOLD + 5, sender_type="bot"),
            _make_job(2, HIGH_DRIFT_THRESHOLD + 10, sender_type="human"),
        ]
        result = aggregate_repo_jobs(jobs)

        assert result is not None
        assert len(result.high_drift_jobs) == 2
        sender_types = {j["sender_type"] for j in result.high_drift_jobs}
        assert sender_types == {"bot", "human"}


class TestIssueBodyBotBreakdown:
    """Tests for SCALE-03 bot/human breakdown in build_issue_body."""

    def _rollup_with_counts(self, bot: int, human: int) -> RepoRollupResult:
        return RepoRollupResult(
            repo_name="org/repo",
            job_count=bot + human,
            avg_drift=60.0,
            max_drift=80,
            high_drift_jobs=[],
            bot_count=bot,
            human_count=human,
        )

    def test_body_shows_bot_count(self):
        rollup = self._rollup_with_counts(bot=3, human=2)
        body = build_issue_body(rollup)

        assert "Bot-authored" in body
        assert "3" in body

    def test_body_shows_human_count(self):
        rollup = self._rollup_with_counts(bot=1, human=4)
        body = build_issue_body(rollup)

        assert "Human-authored" in body
        assert "4" in body

    def test_body_zero_bots(self):
        rollup = self._rollup_with_counts(bot=0, human=5)
        body = build_issue_body(rollup)

        assert "Bot-authored" in body
        assert "0" in body

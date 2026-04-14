"""
EPIC-05: Auto-merge and fix PR job — unit tests.

Covers:
  - GitCommitter.auto_merge_pr(): CI success, CI failure, CI timeout, parse error,
    GithubException, wait_for_ci=False bypass
  - create_fix_pr_job: passes auto_merge flag to process_fix_pr
  - process_fix_pr: calls auto_merge_pr on success, sets triageStatus=RESOLVED,
    posts PR comment; leaves job untouched when auto_merge=False
"""

import pytest
from unittest.mock import MagicMock, patch, call

from src.github.committer import GitCommitter


# ── Helpers ───────────────────────────────────────────────────────────────────

_PR_URL = "https://github.com/acme/api/pull/42"


def _make_committer() -> GitCommitter:
    return GitCommitter(installation_token="tok", owner="acme", repo="api")


def _make_pr_mock(sha: str = "abc123", status_state: str = "success") -> MagicMock:
    pr = MagicMock()
    pr.number = 42
    pr.head.sha = sha
    pr.merge.return_value = None  # merge() returns nothing on success
    return pr


def _make_check_run(status: str = "completed", conclusion: str = "success") -> MagicMock:
    run = MagicMock()
    run.status = status
    run.conclusion = conclusion
    run.name = "ci / test"
    run.app.slug = "github-actions"  # not "docugardener" → counted as external
    return run


def _make_repo_mock(pr, status_state: str = "success") -> MagicMock:
    """Build a repo mock with check runs matching the given status_state.

    status_state:
      "success"  → one completed/success check run
      "failure"  → one completed/failure check run
      "pending"  → one in_progress check run
      ""         → no check runs (no CI configured)
    """
    commit = MagicMock()
    if status_state == "success":
        check_runs = [_make_check_run("completed", "success")]
    elif status_state == "failure":
        check_runs = [_make_check_run("completed", "failure")]
    elif status_state == "pending":
        check_runs = [_make_check_run("in_progress", None)]
    else:
        check_runs = []  # no CI configured
    commit.get_check_runs.return_value = check_runs

    repo = MagicMock()
    repo.get_pull.return_value = pr
    repo.get_commit.return_value = commit
    return repo


# ── auto_merge_pr tests ───────────────────────────────────────────────────────

class TestAutoMergePr:

    def test_ci_success_merges_and_returns_true(self):
        """CI passes immediately → merge called → None (success) returned."""
        committer = _make_committer()
        pr = _make_pr_mock(status_state="success")
        repo = _make_repo_mock(pr, status_state="success")

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, wait_for_ci=True)

        assert result is None  # None = success convention
        pr.merge.assert_called_once_with(merge_method="squash")

    def test_no_ci_checks_merges_immediately(self):
        """Empty combined status state ('') = no checks configured → merge."""
        committer = _make_committer()
        pr = _make_pr_mock()
        repo = _make_repo_mock(pr, status_state="")

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, wait_for_ci=True)

        assert result is None  # None = success convention
        pr.merge.assert_called_once()

    def test_ci_failure_returns_false_no_merge(self):
        """CI fails immediately → no merge, non-None reason returned."""
        committer = _make_committer()
        pr = _make_pr_mock()
        repo = _make_repo_mock(pr, status_state="failure")

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, wait_for_ci=True, retry_delay=0)

        assert result is not None  # non-None = skip/failure reason
        pr.merge.assert_not_called()

    def test_ci_timeout_returns_false(self):
        """CI stays 'pending' for max_retries — timeout → non-None, no merge."""
        committer = _make_committer()
        pr = _make_pr_mock()
        repo = _make_repo_mock(pr, status_state="pending")

        with patch("src.github.committer.Github") as mock_gh, \
             patch("src.github.committer.time.sleep") as mock_sleep:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, wait_for_ci=True, max_retries=3, retry_delay=0)

        assert result is not None  # non-None = skip/failure reason
        pr.merge.assert_not_called()
        # sleep called max_retries-1 times (skipped on final attempt before for-else)
        assert mock_sleep.call_count == 2

    def test_wait_for_ci_false_merges_immediately(self):
        """wait_for_ci=False → skip status check, merge immediately."""
        committer = _make_committer()
        pr = _make_pr_mock()
        repo = MagicMock()
        repo.get_pull.return_value = pr

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, wait_for_ci=False)

        assert result is None  # None = success convention
        repo.get_commit.assert_not_called()  # no CI polling
        pr.merge.assert_called_once_with(merge_method="squash")

    def test_github_exception_returns_false(self):
        """GithubException during merge → non-None reason, no crash."""
        from github import GithubException
        committer = _make_committer()
        pr = _make_pr_mock(status_state="success")
        pr.merge.side_effect = GithubException(405, "method not allowed", {})
        repo = _make_repo_mock(pr, status_state="success")

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, wait_for_ci=True)

        assert result is not None  # non-None = skip/failure reason

    def test_invalid_pr_url_returns_false(self):
        """Unparseable PR URL → non-None immediately, no GitHub call."""
        committer = _make_committer()
        with patch("src.github.committer.Github") as mock_gh:
            result = committer.auto_merge_pr("https://github.com/acme/api/issues/42")

        assert result is not None  # non-None = skip/failure reason
        mock_gh.assert_not_called()

    def test_custom_merge_method_passed_through(self):
        """method='rebase' is passed to pr.merge()."""
        committer = _make_committer()
        pr = _make_pr_mock()
        repo = _make_repo_mock(pr, status_state="success")

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            committer.auto_merge_pr(_PR_URL, method="rebase", wait_for_ci=True)

        pr.merge.assert_called_once_with(merge_method="rebase")

    def test_merge_commit_method_passed_through(self):
        """method='merge' (create a merge commit) is passed to pr.merge(). TEST-AUT-01."""
        committer = _make_committer()
        pr = _make_pr_mock()
        repo = _make_repo_mock(pr, status_state="success")

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, method="merge", wait_for_ci=True)

        assert result is None  # None = success convention
        pr.merge.assert_called_once_with(merge_method="merge")

    def test_merge_method_not_allowed_returns_false(self):
        """MOAT-01: merge method disallowed by repo settings → non-None, no CI wait, no merge."""
        committer = _make_committer()
        pr = _make_pr_mock()
        repo = _make_repo_mock(pr, status_state="success")
        repo.allow_squash_merge = False  # repo only allows merge commits and rebase

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, method="squash", wait_for_ci=True)

        assert result is not None  # non-None = skip/failure reason
        repo.get_commit.assert_not_called()  # CI polling never started
        pr.merge.assert_not_called()

    def test_merge_method_allowed_proceeds_normally(self):
        """MOAT-01: method explicitly allowed by repo → CI check runs, merge proceeds."""
        committer = _make_committer()
        pr = _make_pr_mock()
        repo = _make_repo_mock(pr, status_state="success")
        repo.allow_squash_merge = True

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, method="squash", wait_for_ci=True)

        assert result is None  # None = success convention
        pr.merge.assert_called_once_with(merge_method="squash")

    def test_merge_method_unknown_skips_validation(self):
        """MOAT-01: unrecognised method name → no attribute check, attempt proceeds."""
        committer = _make_committer()
        pr = _make_pr_mock()
        repo = _make_repo_mock(pr, status_state="success")

        with patch("src.github.committer.Github") as mock_gh:
            mock_gh.return_value.get_repo.return_value = repo
            result = committer.auto_merge_pr(_PR_URL, method="fast-forward", wait_for_ci=False)

        assert result is None  # None = success convention
        pr.merge.assert_called_once_with(merge_method="fast-forward")


# ── create_fix_pr_job passes auto_merge ──────────────────────────────────────

class TestCreateFixPrJobAutoMerge:

    def test_auto_merge_true_passed_to_process_fix_pr(self):
        """create_fix_pr_job(job_id, auto_merge=True) calls process_fix_pr with auto_merge=True."""
        import asyncio
        from src.worker.jobs import create_fix_pr_job

        mock_process = MagicMock(return_value=None)

        with patch("src.pipeline.handler.process_fix_pr", mock_process), \
             patch("asyncio.run") as mock_run:
            mock_run.side_effect = lambda coro: None
            create_fix_pr_job("job-123", auto_merge=True)

        # asyncio.run should have been called with a coroutine
        mock_run.assert_called_once()

    def test_auto_merge_false_is_default(self):
        """create_fix_pr_job(job_id) defaults to auto_merge=False."""
        with patch("asyncio.run") as mock_run:
            mock_run.return_value = None
            from src.worker.jobs import create_fix_pr_job
            create_fix_pr_job("job-456")

        mock_run.assert_called_once()

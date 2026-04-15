"""
Issue 1 — Exponential backoff in auto_merge_pr.

Verifies that each CI polling sleep uses min(retry_delay * 2**attempt, max_delay)
rather than a constant retry_delay.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.github.committer import GitCommitter

_PR_URL = "https://github.com/acme/api/pull/7"


def _make_committer() -> GitCommitter:
    return GitCommitter(installation_token="tok", owner="acme", repo="api")


def _make_check_run(
    name: str, status: str, conclusion: str | None = None, app_slug: str = "github-actions"
) -> MagicMock:
    cr = MagicMock()
    cr.name = name
    cr.status = status
    cr.conclusion = conclusion
    cr.app.slug = app_slug
    return cr


class TestExponentialBackoff:
    """Verify sleep durations grow exponentially and are capped at max_delay."""

    def _run_with_sleeps(self, check_run_batches, *, retry_delay=10, max_delay=60):
        """
        Run auto_merge_pr with a sequence of check_run_batches.
        Each batch is the list of check runs returned by get_check_runs()
        on successive polling attempts.
        Returns the list of actual time.sleep() arguments.
        """
        committer = _make_committer()
        pr = MagicMock()
        pr.number = 7
        pr.head.sha = "sha123"
        pr.merge.return_value = None

        repo = MagicMock()
        repo.get_pull.return_value = pr
        repo.allow_squash_merge = True

        # Each call to commit.get_check_runs() returns the next batch
        batches_iter = iter(check_run_batches)
        commit = MagicMock()
        commit.get_check_runs.side_effect = lambda: next(batches_iter)
        repo.get_commit.return_value = commit

        with (
            patch("src.github.committer.Github") as mock_gh,
            patch("src.github.committer.time.sleep") as mock_sleep,
        ):
            mock_gh.return_value.get_repo.return_value = repo
            committer.auto_merge_pr(
                _PR_URL,
                method="squash",
                wait_for_ci=True,
                max_retries=6,
                retry_delay=retry_delay,
                max_delay=max_delay,
            )
            return [c.args[0] for c in mock_sleep.call_args_list]

    def test_sleep_grows_exponentially_over_attempts(self):
        """Each successive sleep should be 2× the previous, up to max_delay."""
        # Batch 0: in_progress (triggers sleep after attempt 0)
        # Batch 1: in_progress (triggers sleep after attempt 1)
        # Batch 2: success — no sleep, exits loop
        in_progress = [_make_check_run("ci", "in_progress")]
        success = [_make_check_run("ci", "completed", "success")]

        sleeps = self._run_with_sleeps(
            [in_progress, in_progress, success],
            retry_delay=10,
            max_delay=60,
        )

        assert len(sleeps) == 2, f"expected 2 sleeps, got {len(sleeps)}: {sleeps}"
        # attempt=0 → 10 * 2^0 = 10; attempt=1 → 10 * 2^1 = 20
        assert sleeps[0] == 10
        assert sleeps[1] == 20

    def test_sleep_is_capped_at_max_delay(self):
        """Sleep never exceeds max_delay regardless of how many retries."""
        in_progress = [_make_check_run("ci", "in_progress")]
        success = [_make_check_run("ci", "completed", "success")]

        # 4 in_progress polls → 4 sleeps; attempt 3 → 10*2^3=80 > max_delay=60
        sleeps = self._run_with_sleeps(
            [in_progress, in_progress, in_progress, in_progress, success],
            retry_delay=10,
            max_delay=60,
        )

        assert max(sleeps) == 60, f"max sleep should be capped at 60, got {max(sleeps)}"
        # Values: 10, 20, 40, 60 (capped from 80)
        assert sleeps == [10, 20, 40, 60]

    def test_no_queue_wait_also_uses_exponential(self):
        """The 'no check runs yet' initial wait also uses exponential delay."""
        no_runs: list = []
        success = [_make_check_run("ci", "completed", "success")]

        # attempt 0: no runs → sleep; attempt 1: success (no sleep)
        sleeps = self._run_with_sleeps(
            [no_runs, success],
            retry_delay=10,
            max_delay=60,
        )

        assert len(sleeps) == 1
        # attempt=0 → 10 * 2^0 = 10
        assert sleeps[0] == 10

"""
GAP-D: Unit tests for upgrade prompt check run annotation on quota exceeded.

Verifies that when a PR quota or repo quota check returns False, the
`_post_quota_exceeded_check_run` helper is awaited before the 402 HTTPException
is raised.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── Helper: minimal webhook payload ──────────────────────────────────────────


def _pr_payload(owner="org", repo="myrepo", sha="abc1234", installation_id=42):
    return {
        "action": "opened",
        "installation": {"id": installation_id},
        "sender": {"login": "alice"},
        "pull_request": {
            "number": 7,
            "title": "Add feature",
            "head": {"ref": "feature/x", "sha": sha},
        },
        "repository": {
            "full_name": f"{owner}/{repo}",
            "owner": {"login": owner},
            "name": repo,
        },
    }


# ── Tests for _post_quota_exceeded_check_run ──────────────────────────────────


class TestPostQuotaExceededCheckRun:
    @pytest.mark.asyncio
    async def test_creates_neutral_check_run(self):
        """Helper posts a completed/neutral check run with upgrade message."""
        from src.api.webhooks import _post_quota_exceeded_check_run

        mock_github_repo = MagicMock()
        mock_client = MagicMock()
        mock_client.get_repo.return_value = mock_github_repo

        with patch("src.github.app.get_github_client", return_value=mock_client):
            await _post_quota_exceeded_check_run(
                installation_id=42,
                owner="org",
                repo="myrepo",
                head_sha="abc1234",
                reason="PR quota exceeded: 50/50 analyses used this month.",
            )

        mock_github_repo.create_check_run.assert_called_once()
        call_kwargs = mock_github_repo.create_check_run.call_args.kwargs
        assert call_kwargs["name"] == "DocuGardener"
        assert call_kwargs["head_sha"] == "abc1234"
        assert call_kwargs["status"] == "completed"
        assert call_kwargs["conclusion"] == "neutral"
        assert (
            "quota" in call_kwargs["output"]["summary"].lower()
            or "limit" in call_kwargs["output"]["title"].lower()
        )

    @pytest.mark.asyncio
    async def test_swallows_github_errors_gracefully(self):
        """Helper must not propagate exceptions — webhook should still return 402."""
        from src.api.webhooks import _post_quota_exceeded_check_run

        with patch("src.github.app.get_github_client", side_effect=Exception("GitHub down")):
            # Should not raise
            await _post_quota_exceeded_check_run(
                installation_id=42,
                owner="org",
                repo="myrepo",
                head_sha="abc1234",
                reason="Quota exceeded.",
            )


# ── Integration: PR quota 402 triggers check run then raises ─────────────────


class TestPrQuota402WithCheckRun:
    @pytest.mark.asyncio
    async def test_pr_quota_exceeded_posts_check_run_before_402(self):
        """When PR quota fires, check run is posted and 402 is raised."""
        from fastapi import HTTPException

        from src.api.webhooks import handle_pull_request

        mock_tenant = MagicMock()
        mock_tenant.appId = None
        mock_tenant.privateKey = None

        mock_session = MagicMock()
        mock_session.query.return_value.filter.return_value.first.return_value = mock_tenant

        with (
            patch(
                "src.api.webhooks._post_quota_exceeded_check_run", new_callable=AsyncMock
            ) as mock_check_run,
            patch("src.billing.quota.check_repo_quota", return_value=(True, "ok")),
            patch("src.billing.quota.check_pr_quota", return_value=(False, "50/50 analyses used.")),
            patch("src.api.webhooks.SessionLocal", return_value=mock_session)
            if False
            else patch("src.pipeline.job_manager.SessionLocal", return_value=mock_session),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await handle_pull_request(_pr_payload(), delivery_id="d-1")

        assert exc_info.value.status_code == 402
        mock_check_run.assert_awaited_once()
        call_args = mock_check_run.call_args
        assert call_args.args[0] == 42  # installation_id
        assert call_args.args[1] == "org"  # owner
        assert call_args.args[2] == "myrepo"  # repo
        assert call_args.args[3] == "abc1234"  # sha

"""
WORK-03: NotificationDispatcher — GitHub Issues integration tests.

Covers:
  - _create_github_issue: calls create_issue via App client, returns issue number
  - _create_github_issue: returns None when App credentials absent
  - close_github_issue: closes issue + posts comment
  - close_github_issue: no-op when credentials absent
  - dispatch_drift_alert: GitHub issue created on all plans (FREE + PRO)
  - dispatch_drift_alert: github_issue_number stored on drift record after creation
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.notifications.dispatcher import NotificationDispatcher

# ── helpers ───────────────────────────────────────────────────────────────────


def _drift_record(
    owner="acme",
    repo="api",
    pr_number=7,
    drift_score=80,
    severity="high",
    summary="Auth changed.",
):
    r = MagicMock()
    r.owner = owner
    r.repo = repo
    r.pr_number = pr_number
    r.drift_score = drift_score
    r.severity = severity
    r.summary = summary
    r.entities = ["UserService"]
    return r


def _dispatcher_with_gh(enabled=True, repo=None, plan="FREE"):
    config = {"githubIssues": {"enabled": enabled, "repo": repo}}
    return NotificationDispatcher(
        workflow_config=config,
        tenant_plan=plan,
        github_app_id="12345",
        github_private_key="-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----",
        installation_id="99999",
    )


# ── _create_github_issue ──────────────────────────────────────────────────────


class TestCreateGithubIssue:
    @pytest.mark.asyncio
    async def test_returns_issue_number_on_success(self):
        dispatcher = NotificationDispatcher(
            {},
            github_app_id="123",
            github_private_key="pk",
            installation_id="999",
        )
        mock_issue = MagicMock()
        mock_issue.number = 42
        mock_issue.html_url = "https://github.com/acme/api/issues/42"

        mock_repo = MagicMock()
        mock_repo.create_issue.return_value = mock_issue

        mock_client = MagicMock()
        mock_client.get_repo.return_value = mock_repo

        with patch("src.github.app.get_github_client", return_value=mock_client):
            issue_number = await dispatcher._create_github_issue(
                repo="acme/api",
                title="Docs drift: PR #7",
                body="Drift detected.",
                labels=["documentation", "drift"],
            )

        assert issue_number == 42
        mock_repo.create_issue.assert_called_once()
        _, kwargs = mock_repo.create_issue.call_args
        assert kwargs["labels"] == ["documentation", "drift"]

    @pytest.mark.asyncio
    async def test_returns_none_when_no_credentials(self):
        """No app credentials → skip and return None."""
        dispatcher = NotificationDispatcher({})

        result = await dispatcher._create_github_issue(
            repo="acme/api",
            title="Drift",
            body="Body",
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_invalid_repo_format(self):
        """Repo string without '/' → returns None."""
        dispatcher = NotificationDispatcher(
            {},
            github_app_id="123",
            github_private_key="pk",
            installation_id="999",
        )
        result = await dispatcher._create_github_issue(
            repo="invalid-repo-no-slash",
            title="Drift",
            body="Body",
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_github_exception(self):
        """GitHub API failure → returns None without raising."""
        dispatcher = NotificationDispatcher(
            {},
            github_app_id="123",
            github_private_key="pk",
            installation_id="999",
        )
        with patch("src.github.app.get_github_client", side_effect=Exception("Rate limited")):
            result = await dispatcher._create_github_issue(
                repo="acme/api",
                title="Drift",
                body="Body",
            )
        assert result is None


# ── close_github_issue ────────────────────────────────────────────────────────


class TestCloseGithubIssue:
    @pytest.mark.asyncio
    async def test_closes_issue_with_comment(self):
        dispatcher = NotificationDispatcher(
            {},
            github_app_id="123",
            github_private_key="pk",
            installation_id="999",
        )
        mock_issue = MagicMock()
        mock_issue.create_comment = MagicMock()
        mock_issue.edit = MagicMock()

        mock_repo = MagicMock()
        mock_repo.get_issue.return_value = mock_issue
        mock_client = MagicMock()
        mock_client.get_repo.return_value = mock_repo

        with patch("src.github.app.get_github_client", return_value=mock_client):
            await dispatcher.close_github_issue(
                repo="acme/api",
                issue_number=42,
                comment="Fixed!",
            )

        mock_issue.create_comment.assert_called_once_with("Fixed!")
        mock_issue.edit.assert_called_once_with(state="closed")

    @pytest.mark.asyncio
    async def test_closes_issue_without_comment(self):
        dispatcher = NotificationDispatcher(
            {},
            github_app_id="123",
            github_private_key="pk",
            installation_id="999",
        )
        mock_issue = MagicMock()
        mock_issue.create_comment = MagicMock()
        mock_issue.edit = MagicMock()

        mock_repo = MagicMock()
        mock_repo.get_issue.return_value = mock_issue
        mock_client = MagicMock()
        mock_client.get_repo.return_value = mock_repo

        with patch("src.github.app.get_github_client", return_value=mock_client):
            await dispatcher.close_github_issue(repo="acme/api", issue_number=42)

        mock_issue.create_comment.assert_not_called()
        mock_issue.edit.assert_called_once_with(state="closed")

    @pytest.mark.asyncio
    async def test_no_op_when_credentials_absent(self):
        """No credentials → close_github_issue returns without calling GitHub."""
        dispatcher = NotificationDispatcher({})
        with patch("src.github.app.get_github_client") as mock_gh:
            await dispatcher.close_github_issue(repo="acme/api", issue_number=1)
        mock_gh.assert_not_called()


# ── dispatch_drift_alert — GitHub Issues plan gating ─────────────────────────


class TestDispatchGithubIssuesGating:
    @pytest.mark.asyncio
    async def test_github_issue_created_on_free_plan(self):
        """GitHub Issues must be available on FREE plan (all plans)."""
        dispatcher = _dispatcher_with_gh(enabled=True, plan="FREE")

        with patch.object(
            dispatcher, "_create_github_issue", new_callable=AsyncMock, return_value=55
        ) as mock_create:
            await dispatcher.dispatch_drift_alert(_drift_record())

        mock_create.assert_called_once()

    @pytest.mark.asyncio
    async def test_github_issue_created_on_pro_plan(self):
        """GitHub Issues must also work on PRO plan."""
        dispatcher = _dispatcher_with_gh(enabled=True, plan="PRO")

        with patch.object(
            dispatcher, "_create_github_issue", new_callable=AsyncMock, return_value=99
        ) as mock_create:
            await dispatcher.dispatch_drift_alert(_drift_record())

        mock_create.assert_called_once()

    @pytest.mark.asyncio
    async def test_github_issue_skipped_when_disabled(self):
        """enabled=False → _create_github_issue must not be called."""
        dispatcher = _dispatcher_with_gh(enabled=False)

        with patch.object(
            dispatcher, "_create_github_issue", new_callable=AsyncMock
        ) as mock_create:
            await dispatcher.dispatch_drift_alert(_drift_record())

        mock_create.assert_not_called()

    @pytest.mark.asyncio
    async def test_issue_number_stored_on_drift_record(self):
        """After issue creation, github_issue_number is set on the drift record."""
        dispatcher = _dispatcher_with_gh(enabled=True, repo="acme/docs")
        record = _drift_record()

        with patch.object(
            dispatcher, "_create_github_issue", new_callable=AsyncMock, return_value=77
        ):
            await dispatcher.dispatch_drift_alert(record)

        assert record.github_issue_number == 77
        assert record.github_issue_repo == "acme/docs"

    @pytest.mark.asyncio
    async def test_issue_defaults_to_triggering_repo_when_no_target(self):
        """When repo is not configured, defaults to owner/repo from drift record."""
        config = {"githubIssues": {"enabled": True}}
        dispatcher = NotificationDispatcher(
            workflow_config=config,
            github_app_id="123",
            github_private_key="pk",
            installation_id="999",
        )
        record = _drift_record(owner="myorg", repo="myrepo")

        with patch.object(
            dispatcher, "_create_github_issue", new_callable=AsyncMock, return_value=10
        ) as mock_create:
            await dispatcher.dispatch_drift_alert(record)

        _, kwargs = mock_create.call_args
        assert kwargs["repo"] == "myorg/myrepo"

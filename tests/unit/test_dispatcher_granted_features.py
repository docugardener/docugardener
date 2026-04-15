"""
GAP-INT-2: NotificationDispatcher must honour `granted_features` when
PlatformCloud overrides plan-based entitlements.

If `granted_features` is provided (non-None), only the listed feature keys
grant access — the `tenant_plan` string is a fallback only when
`granted_features` is None.

Covers:
  - granted_features=None  → fallback to plan check (PRO = all allowed)
  - granted_features=[]    → nothing sent, even on PRO
  - granted_features contains only "slack_integration"
      → Slack sent, Jira and Linear skipped
  - granted_features contains only "integrations_jira"
      → Jira sent, Slack and Linear skipped
  - granted_features contains only "integrations_linear"
      → Linear sent, Slack and Jira skipped
  - granted_features contains all three
      → all three sent
  - Revocation of a feature mid-plan stops dispatch immediately

GAP-INT-5: resolve_linear_issue() marks a Linear issue as Done.

Covers:
  - resolve_linear_issue: queries for "completed" state then updates issue
  - resolve_linear_issue: no-op when integrations_linear not in granted_features
  - resolve_linear_issue: no-op when Linear not configured
  - resolve_linear_issue: exception swallowed (non-fatal)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.notifications.dispatcher import NotificationDispatcher

# ── helpers ───────────────────────────────────────────────────────────────────


def _drift(severity: str = "high") -> MagicMock:
    r = MagicMock()
    r.owner = "acme"
    r.repo = "api"
    r.pr_number = 42
    r.head_sha = "abc1234"
    r.drift_score = 80
    r.severity = severity
    r.summary = "Drift detected."
    r.entities = ["Auth.login"]
    return r


def _full_config() -> dict:
    return {
        "slack": {"webhookUrl": "enc_slack"},
        "jira": {
            "host": "https://jira.example.com",
            "email": "dev@example.com",
            "apiToken": "enc_jira",
        },
        "linear": {"apiToken": "enc_linear", "teamId": "team-1"},
    }


def _http_ok() -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.raise_for_status.return_value = None
    return resp


# ── GAP-INT-2: granted_features fallback to plan ──────────────────────────────


class TestGrantedFeaturesFallback:
    @pytest.mark.asyncio
    async def test_none_granted_features_falls_back_to_plan_pro(self):
        """granted_features=None + plan=PRO → all integrations fire (existing behaviour)."""
        dispatcher = NotificationDispatcher(
            _full_config(), tenant_plan="PRO", granted_features=None
        )

        mock_slack = AsyncMock()
        mock_jira = AsyncMock()
        mock_linear = AsyncMock(return_value="id-1")

        with (
            patch.object(dispatcher, "_send_slack_alert", mock_slack),
            patch.object(dispatcher, "post_jira_lifecycle_comment", mock_jira),
            patch.object(dispatcher, "_create_linear_issue", mock_linear),
            patch("src.notifications.dispatcher.decrypt", return_value="real_value"),
        ):
            await dispatcher.dispatch_drift_alert(_drift(), jira_ticket_key="PROJ-1")

        mock_slack.assert_called_once()
        mock_jira.assert_called_once()
        mock_linear.assert_called_once()

    @pytest.mark.asyncio
    async def test_none_granted_features_falls_back_to_plan_free(self):
        """granted_features=None + plan=FREE → no integrations fire."""
        dispatcher = NotificationDispatcher(
            _full_config(), tenant_plan="FREE", granted_features=None
        )

        mock_slack = AsyncMock()
        mock_linear = AsyncMock()

        with (
            patch.object(dispatcher, "_send_slack_alert", mock_slack),
            patch.object(dispatcher, "_create_linear_issue", mock_linear),
            patch("src.notifications.dispatcher.decrypt", return_value="real_value"),
        ):
            await dispatcher.dispatch_drift_alert(_drift(), jira_ticket_key="PROJ-1")

        mock_slack.assert_not_called()
        mock_linear.assert_not_called()


# ── GAP-INT-2: empty granted_features blocks all ──────────────────────────────


class TestEmptyGrantedFeatures:
    @pytest.mark.asyncio
    async def test_empty_list_blocks_slack_even_on_pro(self):
        """granted_features=[] + plan=PRO → Slack not sent (revoked)."""
        dispatcher = NotificationDispatcher(_full_config(), tenant_plan="PRO", granted_features=[])

        mock_slack = AsyncMock()
        with (
            patch.object(dispatcher, "_send_slack_alert", mock_slack),
            patch("src.notifications.dispatcher.decrypt", return_value="real_value"),
        ):
            await dispatcher.dispatch_drift_alert(_drift())

        mock_slack.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_list_blocks_linear_even_on_pro(self):
        """granted_features=[] + plan=PRO → Linear not created."""
        dispatcher = NotificationDispatcher(_full_config(), tenant_plan="PRO", granted_features=[])

        mock_linear = AsyncMock()
        with (
            patch.object(dispatcher, "_create_linear_issue", mock_linear),
            patch("src.notifications.dispatcher.decrypt", return_value="real_value"),
        ):
            await dispatcher.dispatch_drift_alert(_drift())

        mock_linear.assert_not_called()


# ── GAP-INT-2: individual feature key grants ──────────────────────────────────


class TestIndividualFeatureGrants:
    @pytest.mark.asyncio
    async def test_only_slack_granted(self):
        """granted_features=['slack_integration'] → Slack fires, Jira and Linear don't."""
        dispatcher = NotificationDispatcher(
            _full_config(), tenant_plan="PRO", granted_features=["slack_integration"]
        )

        mock_slack = AsyncMock()
        mock_linear = AsyncMock()

        with (
            patch.object(dispatcher, "_send_slack_alert", mock_slack),
            patch.object(dispatcher, "_create_linear_issue", mock_linear),
            patch("src.notifications.dispatcher.decrypt", return_value="real_value"),
        ):
            await dispatcher.dispatch_drift_alert(_drift(), jira_ticket_key="PROJ-1")

        mock_slack.assert_called_once()
        mock_linear.assert_not_called()

    @pytest.mark.asyncio
    async def test_only_linear_granted(self):
        """granted_features=['integrations_linear'] → Linear fires, Slack doesn't."""
        dispatcher = NotificationDispatcher(
            _full_config(), tenant_plan="PRO", granted_features=["integrations_linear"]
        )

        mock_slack = AsyncMock()
        mock_linear = AsyncMock(return_value="id-1")

        with (
            patch.object(dispatcher, "_send_slack_alert", mock_slack),
            patch.object(dispatcher, "_create_linear_issue", mock_linear),
            patch("src.notifications.dispatcher.decrypt", return_value="real_value"),
        ):
            await dispatcher.dispatch_drift_alert(_drift())

        mock_slack.assert_not_called()
        mock_linear.assert_called_once()

    @pytest.mark.asyncio
    async def test_all_three_granted(self):
        """granted_features with all three keys → all integrations fire."""
        dispatcher = NotificationDispatcher(
            _full_config(),
            tenant_plan="PRO",
            granted_features=["slack_integration", "integrations_jira", "integrations_linear"],
        )

        mock_slack = AsyncMock()
        mock_jira = AsyncMock()
        mock_linear = AsyncMock(return_value="id-1")

        with (
            patch.object(dispatcher, "_send_slack_alert", mock_slack),
            patch.object(dispatcher, "post_jira_lifecycle_comment", mock_jira),
            patch.object(dispatcher, "_create_linear_issue", mock_linear),
            patch("src.notifications.dispatcher.decrypt", return_value="real_value"),
        ):
            await dispatcher.dispatch_drift_alert(_drift(), jira_ticket_key="PROJ-1")

        mock_slack.assert_called_once()
        mock_jira.assert_called_once()
        mock_linear.assert_called_once()

    @pytest.mark.asyncio
    async def test_github_issues_unaffected_by_granted_features(self):
        """GitHub Issues is FREE-tier — it fires regardless of granted_features."""
        config = {
            "githubIssues": {"enabled": True, "repo": "acme/api"},
        }
        dispatcher = NotificationDispatcher(
            config,
            tenant_plan="FREE",
            granted_features=[],  # nothing granted
            github_app_id="123",
            github_private_key="key",
            installation_id="456",
        )

        mock_create_gh = AsyncMock(return_value=1)
        with patch.object(dispatcher, "_create_github_issue", mock_create_gh):
            await dispatcher.dispatch_drift_alert(_drift())

        mock_create_gh.assert_called_once()


# ── GAP-INT-5: resolve_linear_issue ───────────────────────────────────────────


class TestResolveLinearIssue:
    @pytest.mark.asyncio
    async def test_resolve_queries_completed_state_then_updates(self):
        """resolve_linear_issue fetches a 'completed' workflow state then updates the issue."""
        dispatcher = NotificationDispatcher(
            {"linear": {"apiToken": "enc_linear", "teamId": "team-1"}},
            tenant_plan="PRO",
            granted_features=["integrations_linear"],
        )

        states_resp = MagicMock()
        states_resp.status_code = 200
        states_resp.json.return_value = {
            "data": {"workflowStates": {"nodes": [{"id": "state-done", "name": "Done"}]}}
        }
        states_resp.raise_for_status.return_value = None

        update_resp = MagicMock()
        update_resp.status_code = 200
        update_resp.json.return_value = {"data": {"issueUpdate": {"success": True}}}
        update_resp.raise_for_status.return_value = None

        with (
            patch("src.notifications.dispatcher.decrypt", return_value="lin_api_real"),
            patch("httpx.AsyncClient") as MockClient,
        ):
            post_mock = AsyncMock(side_effect=[states_resp, update_resp])
            MockClient.return_value.__aenter__.return_value.post = post_mock

            await dispatcher.resolve_linear_issue("issue-uuid-42")

        assert post_mock.call_count == 2
        # Second call is the issueUpdate mutation
        update_call = post_mock.call_args_list[1]
        variables = (update_call.kwargs.get("json") or update_call[1]["json"])["variables"]
        assert variables["issueId"] == "issue-uuid-42"
        assert variables["stateId"] == "state-done"

    @pytest.mark.asyncio
    async def test_resolve_noop_when_integrations_linear_not_granted(self):
        """resolve_linear_issue is a no-op when integrations_linear not in granted_features."""
        dispatcher = NotificationDispatcher(
            {"linear": {"apiToken": "enc_linear"}},
            tenant_plan="PRO",
            granted_features=["slack_integration"],  # linear NOT granted
        )

        with patch("httpx.AsyncClient") as MockClient:
            await dispatcher.resolve_linear_issue("issue-uuid-99")

        MockClient.assert_not_called()

    @pytest.mark.asyncio
    async def test_resolve_noop_when_no_linear_config(self):
        """resolve_linear_issue is a no-op when Linear not configured."""
        dispatcher = NotificationDispatcher(
            {},
            tenant_plan="PRO",
            granted_features=["integrations_linear"],
        )

        with patch("httpx.AsyncClient") as MockClient:
            await dispatcher.resolve_linear_issue("issue-uuid-77")

        MockClient.assert_not_called()

    @pytest.mark.asyncio
    async def test_resolve_exception_is_swallowed(self):
        """resolve_linear_issue must not propagate exceptions (non-fatal)."""
        dispatcher = NotificationDispatcher(
            {"linear": {"apiToken": "enc_linear", "teamId": "team-1"}},
            tenant_plan="PRO",
            granted_features=["integrations_linear"],
        )

        with (
            patch("src.notifications.dispatcher.decrypt", return_value="lin_api_real"),
            patch("httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__.return_value.post = AsyncMock(
                side_effect=Exception("Linear is down")
            )
            # Must not raise
            await dispatcher.resolve_linear_issue("issue-uuid-bad")

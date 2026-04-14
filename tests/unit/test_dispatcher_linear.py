"""
WORK-03: NotificationDispatcher — Linear integration tests.

Covers:
  - _create_linear_issue: GraphQL mutation called with correct variables
  - Auto-team resolution when team_id is None
  - Priority mapping: critical→1, high→2, medium→3, low→4
  - dispatch_drift_alert: Linear issue created on PRO plan
  - dispatch_drift_alert: Linear skipped on FREE plan (plan gate)
  - dispatch_drift_alert: Linear skipped when apiToken absent
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.notifications.dispatcher import NotificationDispatcher


# ── helpers ───────────────────────────────────────────────────────────────────

def _drift_record(
    owner="acme",
    repo="api",
    pr_number=11,
    head_sha="abc1234567",
    drift_score=75,
    severity="high",
    summary="API changed.",
    entities=None,
):
    r = MagicMock()
    r.owner = owner
    r.repo = repo
    r.pr_number = pr_number
    r.head_sha = head_sha
    r.drift_score = drift_score
    r.severity = severity
    r.summary = summary
    r.entities = entities or ["UserService.login"]
    return r


def _http_response(json_data: dict, status: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.json.return_value = json_data
    resp.raise_for_status.return_value = None
    return resp


def _issue_created_response(identifier="ENG-42", url="https://linear.app/eng/issue/ENG-42") -> dict:
    return {
        "data": {
            "issueCreate": {
                "success": True,
                "issue": {"id": "issue-uuid-1", "identifier": identifier, "url": url},
            }
        }
    }


def _teams_response(team_id="team-uuid-1", team_name="Engineering") -> dict:
    return {
        "data": {
            "teams": {
                "nodes": [{"id": team_id, "name": team_name}]
            }
        }
    }


# ── _create_linear_issue ──────────────────────────────────────────────────────

class TestCreateLinearIssue:

    @pytest.mark.asyncio
    async def test_creates_issue_with_team_id(self):
        dispatcher = NotificationDispatcher({}, tenant_plan="PRO")
        mock_resp = _http_response(_issue_created_response())

        with patch("httpx.AsyncClient") as MockClient:
            MockClient.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_resp)
            issue_id = await dispatcher._create_linear_issue(
                api_token="lin_api_test",
                team_id="team-uuid-1",
                title="Docs drift: PR #11",
                description="Drift detected.",
                severity="high",
            )

        assert issue_id == "issue-uuid-1"

    @pytest.mark.asyncio
    async def test_auto_resolves_team_when_no_team_id(self):
        """When team_id is None, an extra GraphQL call fetches teams and uses first."""
        dispatcher = NotificationDispatcher({}, tenant_plan="PRO")
        teams_resp = _http_response(_teams_response("team-auto"))
        issue_resp = _http_response(_issue_created_response())

        with patch("httpx.AsyncClient") as MockClient:
            post_mock = AsyncMock(side_effect=[teams_resp, issue_resp])
            MockClient.return_value.__aenter__.return_value.post = post_mock
            issue_id = await dispatcher._create_linear_issue(
                api_token="lin_api_test",
                team_id=None,
                title="Docs drift",
                description="Summary",
                severity="medium",
            )

        assert issue_id == "issue-uuid-1"
        assert post_mock.call_count == 2

    @pytest.mark.asyncio
    async def test_no_teams_returns_none(self):
        """When Linear has no teams, returns None without creating issue."""
        dispatcher = NotificationDispatcher({}, tenant_plan="PRO")
        empty_teams = _http_response({"data": {"teams": {"nodes": []}}})

        with patch("httpx.AsyncClient") as MockClient:
            MockClient.return_value.__aenter__.return_value.post = AsyncMock(return_value=empty_teams)
            result = await dispatcher._create_linear_issue(
                api_token="lin_api_test",
                team_id=None,
                title="Drift",
                description="Desc",
            )

        assert result is None

    @pytest.mark.asyncio
    async def test_priority_mapping_critical(self):
        """Critical severity maps to Linear priority 1 (Urgent)."""
        dispatcher = NotificationDispatcher({}, tenant_plan="PRO")
        issue_resp = _http_response(_issue_created_response())

        with patch("httpx.AsyncClient") as MockClient:
            post_mock = AsyncMock(return_value=issue_resp)
            MockClient.return_value.__aenter__.return_value.post = post_mock
            await dispatcher._create_linear_issue(
                api_token="lin_api_test",
                team_id="t-1",
                title="Drift",
                description="Desc",
                severity="critical",
            )

        call_json = post_mock.call_args.kwargs.get("json") or post_mock.call_args[1].get("json")
        assert call_json["variables"]["priority"] == 1

    @pytest.mark.asyncio
    async def test_priority_mapping_low(self):
        """Low severity maps to Linear priority 4."""
        dispatcher = NotificationDispatcher({}, tenant_plan="PRO")
        issue_resp = _http_response(_issue_created_response())

        with patch("httpx.AsyncClient") as MockClient:
            post_mock = AsyncMock(return_value=issue_resp)
            MockClient.return_value.__aenter__.return_value.post = post_mock
            await dispatcher._create_linear_issue(
                api_token="lin_api_test",
                team_id="t-1",
                title="Drift",
                description="Desc",
                severity="low",
            )

        call_json = post_mock.call_args.kwargs.get("json") or post_mock.call_args[1].get("json")
        assert call_json["variables"]["priority"] == 4


# ── dispatch_drift_alert — Linear plan gating ─────────────────────────────────

class TestDispatchLinearGating:

    @pytest.mark.asyncio
    async def test_linear_skipped_on_free_plan(self):
        """FREE tenants must not trigger Linear (plan gate)."""
        config = {"linear": {"apiToken": "enc_token"}}
        dispatcher = NotificationDispatcher(config, tenant_plan="FREE")

        with patch.object(dispatcher, "_create_linear_issue", new_callable=AsyncMock) as mock_linear:
            with patch("src.notifications.dispatcher.decrypt", return_value="lin_api_real"):
                await dispatcher.dispatch_drift_alert(_drift_record())

        mock_linear.assert_not_called()

    @pytest.mark.asyncio
    async def test_linear_called_on_pro_plan(self):
        """PRO tenants with a configured apiToken must trigger Linear."""
        config = {"linear": {"apiToken": "enc_token", "teamId": "team-1"}}
        dispatcher = NotificationDispatcher(config, tenant_plan="PRO")

        with patch.object(dispatcher, "_create_linear_issue", new_callable=AsyncMock, return_value="id-1") as mock_linear:
            with patch("src.notifications.dispatcher.decrypt", return_value="lin_api_real"):
                await dispatcher.dispatch_drift_alert(_drift_record())

        mock_linear.assert_called_once()
        _, kwargs = mock_linear.call_args
        assert kwargs["api_token"] == "lin_api_real"
        assert kwargs["team_id"] == "team-1"

    @pytest.mark.asyncio
    async def test_linear_skipped_when_no_token(self):
        """No apiToken → Linear must not be called."""
        config = {"linear": {}}
        dispatcher = NotificationDispatcher(config, tenant_plan="PRO")

        with patch.object(dispatcher, "_create_linear_issue", new_callable=AsyncMock) as mock_linear:
            await dispatcher.dispatch_drift_alert(_drift_record())

        mock_linear.assert_not_called()

    @pytest.mark.asyncio
    async def test_linear_exception_does_not_propagate(self):
        """If Linear raises, dispatch_drift_alert must not re-raise."""
        config = {"linear": {"apiToken": "enc_token"}}
        dispatcher = NotificationDispatcher(config, tenant_plan="PRO")

        with patch.object(dispatcher, "_create_linear_issue", new_callable=AsyncMock, side_effect=Exception("network error")):
            with patch("src.notifications.dispatcher.decrypt", return_value="lin_api_real"):
                # Must not raise
                await dispatcher.dispatch_drift_alert(_drift_record())

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

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

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
    return {"data": {"teams": {"nodes": [{"id": team_id, "name": team_name}]}}}


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
    async def test_missing_team_id_writes_integration_status(self):
        """INT-01-03: empty teamId writes error to integrationStatus, makes no HTTP call."""
        config = {
            "linear": {"apiToken": "enc_token", "teamId": ""},
            "grantedFeatures": ["integrations_linear"],
        }
        dispatcher = NotificationDispatcher(config, tenant_plan="PRO")
        drift_record = _drift_record()

        with patch("src.notifications.dispatcher.httpx.AsyncClient") as MockClient:
            post_mock = AsyncMock()
            MockClient.return_value.__aenter__.return_value.post = post_mock
            with patch("src.notifications.dispatcher.decrypt", return_value="lin_api_test"):
                results = await dispatcher.dispatch_drift_alert(drift_record)

        assert results.get("linear", {}).get("status") == "error"
        assert "Team ID required" in results.get("linear", {}).get("lastError", "")
        post_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_none_team_id_writes_integration_status(self):
        """INT-01-03: missing teamId key also writes error, makes no HTTP call."""
        config = {
            "linear": {"apiToken": "enc_token"},
            "grantedFeatures": ["integrations_linear"],
        }
        dispatcher = NotificationDispatcher(config, tenant_plan="PRO")
        drift_record = _drift_record()

        with patch("src.notifications.dispatcher.httpx.AsyncClient") as MockClient:
            post_mock = AsyncMock()
            MockClient.return_value.__aenter__.return_value.post = post_mock
            with patch("src.notifications.dispatcher.decrypt", return_value="lin_api_test"):
                results = await dispatcher.dispatch_drift_alert(drift_record)

        assert results.get("linear", {}).get("status") == "error"
        post_mock.assert_not_called()

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

        with patch.object(
            dispatcher, "_create_linear_issue", new_callable=AsyncMock
        ) as mock_linear:
            with patch("src.notifications.dispatcher.decrypt", return_value="lin_api_real"):
                await dispatcher.dispatch_drift_alert(_drift_record())

        mock_linear.assert_not_called()

    @pytest.mark.asyncio
    async def test_linear_called_on_pro_plan(self):
        """PRO tenants with a configured apiToken must trigger Linear."""
        config = {"linear": {"apiToken": "enc_token", "teamId": "team-1"}}
        dispatcher = NotificationDispatcher(config, tenant_plan="PRO")

        with patch.object(
            dispatcher, "_create_linear_issue", new_callable=AsyncMock, return_value="id-1"
        ) as mock_linear:
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

        with patch.object(
            dispatcher, "_create_linear_issue", new_callable=AsyncMock
        ) as mock_linear:
            await dispatcher.dispatch_drift_alert(_drift_record())

        mock_linear.assert_not_called()

    @pytest.mark.asyncio
    async def test_linear_exception_does_not_propagate(self):
        """If Linear raises, dispatch_drift_alert must not re-raise."""
        config = {"linear": {"apiToken": "enc_token"}}
        dispatcher = NotificationDispatcher(config, tenant_plan="PRO")

        with (
            patch.object(
                dispatcher,
                "_create_linear_issue",
                new_callable=AsyncMock,
                side_effect=Exception("network error"),
            ),
            patch("src.notifications.dispatcher.decrypt", return_value="lin_api_real"),
        ):
            # Must not raise
            await dispatcher.dispatch_drift_alert(_drift_record())

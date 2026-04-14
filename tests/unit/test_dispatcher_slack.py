"""
TEST-01 / A7: NotificationDispatcher — Slack payload shape and dispatch entry point.

Covers:
  - _send_slack_alert: Block Kit payload has correct structure (attachments, blocks)
  - Severity "critical" maps to color #ef4444
  - Severity "minor"    maps to color #3b82f6
  - No HTTP call when Slack webhookUrl is absent
  - dispatch_drift_alert: Slack + Jira both configured → both called
  - dispatch_drift_alert: Jira raises → Slack still sent (exception swallowed)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from src.notifications.dispatcher import NotificationDispatcher


# ── helpers ───────────────────────────────────────────────────────────────────

def _drift_record(
    owner: str = "acme",
    repo: str = "api",
    pr_number: int = 7,
    head_sha: str = "abc1234567",
    drift_score: int = 80,
    severity: str = "critical",
    summary: str = "Core API changed.",
    entities: list[str] | None = None,
) -> MagicMock:
    r = MagicMock()
    r.owner = owner
    r.repo = repo
    r.pr_number = pr_number
    r.head_sha = head_sha
    r.drift_score = drift_score
    r.severity = severity
    r.summary = summary
    r.entities = entities or ["MyClass.process"]
    return r


def _dispatcher_with_slack(webhook_url: str = "https://hooks.slack.com/test") -> NotificationDispatcher:
    """Dispatcher pre-configured with an encrypted Slack webhookUrl."""
    # GTM-02: pass tenant_plan="PRO" so plan gate is transparent for dispatch tests
    return NotificationDispatcher({"slack": {"webhookUrl": "enc_url"}}, tenant_plan="PRO")


def _mock_http_ok() -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.raise_for_status.return_value = None
    return resp


# ── tests ─────────────────────────────────────────────────────────────────────

class TestDispatcherSlack:

    @pytest.mark.asyncio
    async def test_slack_block_kit_structure(self):
        """_send_slack_alert POSTs a payload with 'attachments' containing 'blocks'."""
        dispatcher = _dispatcher_with_slack()
        record = _drift_record()

        captured: list[dict] = []

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        async def fake_post(url, *, json=None, timeout=None):
            captured.append(json)
            return _mock_http_ok()

        mock_client.post = fake_post

        with patch("src.notifications.dispatcher.httpx.AsyncClient", return_value=mock_client):
            await dispatcher._send_slack_alert(record, "https://hooks.slack.com/test")

        assert len(captured) == 1
        payload = captured[0]
        assert "attachments" in payload
        assert len(payload["attachments"]) == 1
        attachment = payload["attachments"][0]
        assert "blocks" in attachment
        assert "color" in attachment

    @pytest.mark.asyncio
    async def test_slack_severity_color_critical(self):
        """severity='critical' → attachment color is #ef4444."""
        dispatcher = _dispatcher_with_slack()
        record = _drift_record(severity="critical")
        captured: list[dict] = []

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        async def fake_post(url, *, json=None, timeout=None):
            captured.append(json)
            return _mock_http_ok()

        mock_client.post = fake_post

        with patch("src.notifications.dispatcher.httpx.AsyncClient", return_value=mock_client):
            await dispatcher._send_slack_alert(record, "https://hooks.slack.com/test")

        color = captured[0]["attachments"][0]["color"]
        assert color == "#ef4444", f"Expected #ef4444 for critical, got {color}"

    @pytest.mark.asyncio
    async def test_slack_severity_color_minor(self):
        """severity='minor' → attachment color is #3b82f6."""
        dispatcher = _dispatcher_with_slack()
        record = _drift_record(severity="minor", drift_score=10)
        captured: list[dict] = []

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        async def fake_post(url, *, json=None, timeout=None):
            captured.append(json)
            return _mock_http_ok()

        mock_client.post = fake_post

        with patch("src.notifications.dispatcher.httpx.AsyncClient", return_value=mock_client):
            await dispatcher._send_slack_alert(record, "https://hooks.slack.com/test")

        color = captured[0]["attachments"][0]["color"]
        assert color == "#3b82f6", f"Expected #3b82f6 for minor, got {color}"

    @pytest.mark.asyncio
    async def test_slack_noop_when_no_webhook_url(self):
        """workflowConfig has slack but no webhookUrl → no HTTP call."""
        dispatcher = NotificationDispatcher({"slack": {}})
        record = _drift_record()

        with patch("src.notifications.dispatcher.httpx.AsyncClient") as mock_cls:
            await dispatcher.dispatch_drift_alert(record)

        mock_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_dispatch_drift_alert_calls_slack_and_jira(self):
        """Both Slack and Jira configured → both _send_slack_alert and post_jira_lifecycle_comment called."""
        dispatcher = NotificationDispatcher({
            "slack": {"webhookUrl": "enc_slack"},
            "jira": {"host": "https://j.example.com", "email": "a@b.com", "apiToken": "enc_jira"},
        }, tenant_plan="PRO")
        record = _drift_record()

        mock_send_slack = AsyncMock()
        mock_post_jira = AsyncMock()

        with patch.object(dispatcher, "_send_slack_alert", mock_send_slack), \
             patch.object(dispatcher, "post_jira_lifecycle_comment", mock_post_jira), \
             patch("src.notifications.dispatcher.decrypt", return_value="https://hooks.slack.com/real"):
            await dispatcher.dispatch_drift_alert(record, jira_ticket_key="PROJ-1")

        mock_send_slack.assert_called_once()
        mock_post_jira.assert_called_once()
        assert mock_post_jira.call_args[0][0] == "PROJ-1"

    @pytest.mark.asyncio
    async def test_jira_exception_does_not_crash_slack(self):
        """Jira post raises → exception is caught, Slack alert still sent, no unhandled exception."""
        dispatcher = NotificationDispatcher({
            "slack": {"webhookUrl": "enc_slack"},
            "jira": {"host": "https://j.example.com", "email": "a@b.com", "apiToken": "enc_jira"},
        }, tenant_plan="PRO")
        record = _drift_record()

        mock_send_slack = AsyncMock()
        mock_post_jira = AsyncMock(side_effect=Exception("Jira is down"))

        with patch.object(dispatcher, "_send_slack_alert", mock_send_slack), \
             patch.object(dispatcher, "post_jira_lifecycle_comment", mock_post_jira), \
             patch("src.notifications.dispatcher.decrypt", return_value="https://hooks.slack.com/real"):
            # Must not raise
            await dispatcher.dispatch_drift_alert(record, jira_ticket_key="PROJ-9")

        mock_send_slack.assert_called_once()  # Slack still sent

    @pytest.mark.asyncio
    async def test_dispatch_skips_jira_when_no_ticket_key(self):
        """No jira_ticket_key → post_jira_lifecycle_comment never called."""
        dispatcher = NotificationDispatcher({
            "slack": {"webhookUrl": "enc_slack"},
            "jira": {"host": "https://j.example.com", "email": "a@b.com", "apiToken": "enc_jira"},
        }, tenant_plan="PRO")
        record = _drift_record()

        mock_post_jira = AsyncMock()

        with patch.object(dispatcher, "_send_slack_alert", AsyncMock()), \
             patch.object(dispatcher, "post_jira_lifecycle_comment", mock_post_jira), \
             patch("src.notifications.dispatcher.decrypt", return_value="https://hooks.slack.com/real"):
            await dispatcher.dispatch_drift_alert(record, jira_ticket_key=None)

        mock_post_jira.assert_not_called()

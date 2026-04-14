"""
GAP-INT-5 (part 2): Linear issue ID lifecycle — dispatch side.

After dispatch_drift_alert creates a Linear issue, the issue ID must be
stamped onto the drift_record so handler.py can persist it into the job
result for later resolution.

Covers:
  - dispatch_drift_alert stamps linear_issue_id on drift_record when Linear fires
  - linear_issue_id is NOT stamped when feature not granted
  - linear_issue_id is NOT stamped when _create_linear_issue returns None (API error)
  - linear_issue_id is NOT stamped when Linear not configured
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.notifications.dispatcher import NotificationDispatcher


# ── helpers ───────────────────────────────────────────────────────────────────

def _drift() -> MagicMock:
    r = MagicMock()
    r.owner = "acme"
    r.repo = "api"
    r.pr_number = 42
    r.head_sha = "abc1234"
    r.drift_score = 80
    r.severity = "high"
    r.summary = "Drift detected."
    r.entities = ["Auth.login"]
    # Pre-initialise so "not stamped" tests can assert `is None`
    # (MagicMock auto-creates attributes; setattr overwrites with the real value)
    r.linear_issue_id = None
    return r


def _linear_config() -> dict:
    return {"linear": {"apiToken": "enc_lin", "teamId": "team-1"}}


# ── tests ─────────────────────────────────────────────────────────────────────

class TestLinearIssueIdStamping:

    @pytest.mark.asyncio
    async def test_linear_issue_id_stamped_on_drift_record(self):
        """dispatch_drift_alert stamps linear_issue_id on the record when Linear fires."""
        dispatcher = NotificationDispatcher(
            _linear_config(),
            tenant_plan="PRO",
            granted_features=["integrations_linear"],
        )

        mock_create = AsyncMock(return_value="linear-issue-uuid-42")

        with patch.object(dispatcher, "_create_linear_issue", mock_create), \
             patch("src.notifications.dispatcher.decrypt", return_value="lin_api_real"):
            record = _drift()
            await dispatcher.dispatch_drift_alert(record)

        assert record.linear_issue_id == "linear-issue-uuid-42"

    @pytest.mark.asyncio
    async def test_linear_issue_id_not_stamped_when_feature_not_granted(self):
        """No stamp when integrations_linear not in granted_features."""
        dispatcher = NotificationDispatcher(
            _linear_config(),
            tenant_plan="PRO",
            granted_features=["slack_integration"],  # linear not granted
        )

        mock_create = AsyncMock(return_value="linear-issue-uuid-99")

        with patch.object(dispatcher, "_create_linear_issue", mock_create):
            record = _drift()
            await dispatcher.dispatch_drift_alert(record)

        mock_create.assert_not_called()
        assert record.linear_issue_id is None

    @pytest.mark.asyncio
    async def test_linear_issue_id_not_stamped_when_api_returns_none(self):
        """No stamp when _create_linear_issue returns None (API failure)."""
        dispatcher = NotificationDispatcher(
            _linear_config(),
            tenant_plan="PRO",
            granted_features=["integrations_linear"],
        )

        mock_create = AsyncMock(return_value=None)  # API error path

        with patch.object(dispatcher, "_create_linear_issue", mock_create), \
             patch("src.notifications.dispatcher.decrypt", return_value="lin_api_real"):
            record = _drift()
            await dispatcher.dispatch_drift_alert(record)

        assert record.linear_issue_id is None

    @pytest.mark.asyncio
    async def test_linear_issue_id_not_stamped_when_not_configured(self):
        """No stamp when Linear not in workflow config."""
        dispatcher = NotificationDispatcher(
            {},  # no linear config
            tenant_plan="PRO",
            granted_features=["integrations_linear"],
        )

        record = _drift()
        await dispatcher.dispatch_drift_alert(record)

        assert record.linear_issue_id is None

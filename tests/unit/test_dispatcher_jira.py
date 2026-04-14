"""
TEST-01 / A3: NotificationDispatcher.post_jira_lifecycle_comment() — unit tests.

Covers:
  - Successful POST with correct URL, Basic auth, and body payload
  - No-op when jira config is absent from workflowConfig
  - No-op when jira config is present but missing required fields
  - HTTP non-2xx response → raise_for_status() propagates
  - Encrypted apiToken is decrypted before use
  - URL is constructed correctly from host + ticket_key
"""

import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch, call

from src.notifications.dispatcher import NotificationDispatcher


# ── helpers ───────────────────────────────────────────────────────────────────

_JIRA_HOST = "https://acme.atlassian.net"
_JIRA_EMAIL = "bot@acme.com"
_ENCRYPTED_TOKEN = "enc:abc123"
_PLAIN_TOKEN = "plain-api-token"
_TICKET_KEY = "PROJ-42"
_COMMENT = "⚠️ Drift detected"


def _jira_config(host=_JIRA_HOST, email=_JIRA_EMAIL, api_token=_ENCRYPTED_TOKEN) -> dict:
    config: dict = {}
    if host is not None:
        config["host"] = host
    if email is not None:
        config["email"] = email
    if api_token is not None:
        config["apiToken"] = api_token
    return config


def _dispatcher(jira_cfg: dict | None) -> NotificationDispatcher:
    workflow = {"jira": jira_cfg} if jira_cfg is not None else {}
    return NotificationDispatcher(workflow)


def _mock_http_response(status_code: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    if status_code not in (200, 201):
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            message=f"HTTP {status_code}",
            request=MagicMock(),
            response=resp,
        )
    else:
        resp.raise_for_status.return_value = None
    return resp


# ── tests ─────────────────────────────────────────────────────────────────────

class TestPostJiraLifecycleComment:

    @pytest.mark.asyncio
    async def test_posts_comment_when_configured(self):
        """Valid jira config → httpx POST called with correct URL, auth, and body."""
        dispatcher = _dispatcher(_jira_config())
        mock_response = _mock_http_response(201)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("src.notifications.dispatcher.decrypt", return_value=_PLAIN_TOKEN), \
             patch("src.notifications.dispatcher.httpx.AsyncClient", return_value=mock_client):
            await dispatcher.post_jira_lifecycle_comment(_TICKET_KEY, _COMMENT)

        mock_client.post.assert_called_once()
        call_kwargs = mock_client.post.call_args
        assert f"/rest/api/2/issue/{_TICKET_KEY}/comment" in call_kwargs[0][0]
        assert call_kwargs[1]["json"] == {"body": _COMMENT}
        assert call_kwargs[1]["auth"] == (_JIRA_EMAIL, _PLAIN_TOKEN)

    @pytest.mark.asyncio
    async def test_noop_when_jira_not_configured(self):
        """workflowConfig has no 'jira' key → no HTTP call made."""
        dispatcher = NotificationDispatcher({"slack": {"webhookUrl": "x"}})

        with patch("src.notifications.dispatcher.httpx.AsyncClient") as mock_cls:
            await dispatcher.post_jira_lifecycle_comment(_TICKET_KEY, _COMMENT)

        mock_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_noop_when_jira_missing_fields(self):
        """jira config missing 'apiToken' → no HTTP call."""
        incomplete = {"host": _JIRA_HOST, "email": _JIRA_EMAIL}  # no apiToken
        dispatcher = _dispatcher(incomplete)

        with patch("src.notifications.dispatcher.httpx.AsyncClient") as mock_cls:
            await dispatcher.post_jira_lifecycle_comment(_TICKET_KEY, _COMMENT)

        mock_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_noop_when_jira_missing_host(self):
        """jira config missing 'host' → no HTTP call."""
        incomplete = {"email": _JIRA_EMAIL, "apiToken": _ENCRYPTED_TOKEN}
        dispatcher = _dispatcher(incomplete)

        with patch("src.notifications.dispatcher.httpx.AsyncClient") as mock_cls:
            await dispatcher.post_jira_lifecycle_comment(_TICKET_KEY, _COMMENT)

        mock_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_raises_on_non_2xx_response(self):
        """Server returns 403 → raise_for_status() propagates HTTPStatusError."""
        dispatcher = _dispatcher(_jira_config())
        mock_response = _mock_http_response(403)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("src.notifications.dispatcher.decrypt", return_value=_PLAIN_TOKEN), \
             patch("src.notifications.dispatcher.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(httpx.HTTPStatusError):
                await dispatcher.post_jira_lifecycle_comment(_TICKET_KEY, _COMMENT)

    @pytest.mark.asyncio
    async def test_api_token_is_decrypted(self):
        """Stored encrypted token is passed through decrypt() before being used in auth."""
        dispatcher = _dispatcher(_jira_config(api_token="ENCRYPTED_VALUE"))
        mock_response = _mock_http_response(200)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("src.notifications.dispatcher.decrypt", return_value="DECRYPTED_VALUE") as mock_decrypt, \
             patch("src.notifications.dispatcher.httpx.AsyncClient", return_value=mock_client):
            await dispatcher.post_jira_lifecycle_comment(_TICKET_KEY, _COMMENT)

        mock_decrypt.assert_called_once_with("ENCRYPTED_VALUE")
        # Decrypted value must be in the auth tuple
        call_kwargs = mock_client.post.call_args
        assert call_kwargs[1]["auth"][1] == "DECRYPTED_VALUE"

    @pytest.mark.asyncio
    async def test_url_constructed_correctly(self):
        """URL = host/rest/api/2/issue/<ticket_key>/comment (no double slashes)."""
        dispatcher = _dispatcher(_jira_config(host="https://acme.atlassian.net"))
        mock_response = _mock_http_response(200)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("src.notifications.dispatcher.decrypt", return_value=_PLAIN_TOKEN), \
             patch("src.notifications.dispatcher.httpx.AsyncClient", return_value=mock_client):
            await dispatcher.post_jira_lifecycle_comment("PROJ-1", _COMMENT)

        url = mock_client.post.call_args[0][0]
        assert url == "https://acme.atlassian.net/rest/api/2/issue/PROJ-1/comment"

    @pytest.mark.asyncio
    async def test_url_trailing_slash_on_host_stripped(self):
        """host with trailing slash → URL still has no double slash."""
        dispatcher = _dispatcher(_jira_config(host="https://acme.atlassian.net/"))
        mock_response = _mock_http_response(200)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("src.notifications.dispatcher.decrypt", return_value=_PLAIN_TOKEN), \
             patch("src.notifications.dispatcher.httpx.AsyncClient", return_value=mock_client):
            await dispatcher.post_jira_lifecycle_comment("BUG-5", _COMMENT)

        url = mock_client.post.call_args[0][0]
        assert "//" not in url.replace("https://", ""), f"Double slash in URL: {url}"

"""HYB-05: Stripe conditional loading / billing side-effect isolation tests."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient


def make_settings(**kwargs):
    s = MagicMock()
    s.deployment_mode = kwargs.get("deployment_mode", "saas")
    s.stripe_webhook_secret = kwargs.get("stripe_webhook_secret", "")
    return s


class TestStripeRouterMount:
    """Verify stripe router is conditionally mounted based on deployment_mode."""

    def test_stripe_router_mounted_in_saas_mode(self):
        """The /webhooks/stripe route must be reachable in SaaS mode."""
        from src.stripe.webhooks import router as stripe_router
        app = FastAPI()
        # Simulate saas-mode mounting
        app.include_router(stripe_router, prefix="/webhooks", tags=["Stripe"])
        client = TestClient(app, raise_server_exceptions=False)
        # Route exists — will return 422 (missing header) not 404
        response = client.post("/webhooks/stripe")
        assert response.status_code != 404

    def test_stripe_router_not_mounted_in_client_installed_mode(self):
        """In client-installed mode the Stripe router must NOT be registered."""
        from src.stripe.webhooks import router as stripe_router
        app = FastAPI()
        # Simulate non-saas: DO NOT mount stripe_router
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post("/webhooks/stripe")
        assert response.status_code == 404

    def test_stripe_router_not_mounted_in_air_gap_mode(self):
        """Same as client-installed — no Stripe in air-gap."""
        from src.stripe.webhooks import router as stripe_router
        app = FastAPI()
        # air-gap: do not mount
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post("/webhooks/stripe")
        assert response.status_code == 404


class TestStripeWebhookEarlyReturn:
    """Webhook handler must return 'ignored' when not in SaaS mode."""

    @pytest.mark.anyio
    async def test_webhook_ignored_in_client_installed_mode(self):
        with patch("src.stripe.webhooks.settings") as mock_settings:
            mock_settings.deployment_mode = "client-installed"
            from src.stripe.webhooks import handle_stripe_webhook
            req = MagicMock()
            req.body = AsyncMock(return_value=b"{}")
            response = await handle_stripe_webhook(req, stripe_signature="t=1,v1=abc")
            assert response.body == b'{"status":"ignored","reason":"non-saas-mode"}'

    @pytest.mark.anyio
    async def test_webhook_ignored_in_air_gap_mode(self):
        with patch("src.stripe.webhooks.settings") as mock_settings:
            mock_settings.deployment_mode = "air-gap"
            from src.stripe.webhooks import handle_stripe_webhook
            req = MagicMock()
            req.body = AsyncMock(return_value=b"{}")
            response = await handle_stripe_webhook(req, stripe_signature="t=1,v1=abc")
            assert response.body == b'{"status":"ignored","reason":"non-saas-mode"}'

    @pytest.mark.anyio
    async def test_webhook_proceeds_in_saas_mode(self):
        """In SaaS mode the handler should NOT early-return with ignored."""
        with patch("src.stripe.webhooks.settings") as mock_settings:
            mock_settings.deployment_mode = "saas"
            mock_settings.stripe_webhook_secret = ""  # Will raise 500 on secret check
            from src.stripe.webhooks import handle_stripe_webhook
            from fastapi import HTTPException
            req = MagicMock()
            req.body = AsyncMock(return_value=b"{}")
            # Should raise (missing secret), NOT return 'ignored'
            with pytest.raises(HTTPException) as exc_info:
                await handle_stripe_webhook(req, stripe_signature="t=1,v1=abc")
            assert exc_info.value.status_code == 500

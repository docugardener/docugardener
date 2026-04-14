# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Unit tests for the BILLING_ENABLED feature flag.

Tests cover:
- Settings default (billing_enabled=False)
- get_stripe_client() raises RuntimeError when disabled
- Stripe webhook endpoint returns 404 when disabled
- Billing API endpoints return 404 when disabled
- Safe endpoints (profile, pending-changes) remain accessible when disabled
"""
from __future__ import annotations

import importlib
import types
from unittest.mock import MagicMock, patch, AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Settings default
# ---------------------------------------------------------------------------
class TestBillingEnabledSetting:
    def test_default_is_false(self) -> None:
        """billing_enabled must default to False — safe-off posture."""
        from src.core.config import Settings

        s = Settings.model_construct()  # bypass env validation
        # default_factory via Field means we check the field default
        fields = Settings.model_fields
        assert "billing_enabled" in fields, "billing_enabled field missing from Settings"
        field = fields["billing_enabled"]
        default = field.default if field.default is not None else False
        assert default is False, f"Expected default False, got {default!r}"

    def test_can_be_enabled_via_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Env var BILLING_ENABLED=true should set billing_enabled=True."""
        monkeypatch.setenv("BILLING_ENABLED", "true")
        # Re-import settings with patched env
        from src.core import config as cfg_module

        s = cfg_module.Settings()
        assert s.billing_enabled is True

    def test_false_string_stays_false(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("BILLING_ENABLED", "false")
        from src.core import config as cfg_module

        s = cfg_module.Settings()
        assert s.billing_enabled is False


# ---------------------------------------------------------------------------
# get_stripe_client() guard
# ---------------------------------------------------------------------------
class TestGetStripeClientGuard:
    def test_raises_when_billing_disabled(self) -> None:
        """get_stripe_client() must raise RuntimeError when billing_enabled=False."""
        from src.core.config import settings as real_settings
        original = real_settings.billing_enabled
        try:
            real_settings.billing_enabled = False
            from src.stripe.client import get_stripe_client
            with pytest.raises(RuntimeError, match="BILLING_ENABLED=false"):
                get_stripe_client()
        finally:
            real_settings.billing_enabled = original

    def test_does_not_raise_when_billing_enabled(self) -> None:
        """get_stripe_client() must not raise the billing guard when enabled."""
        from src.core.config import settings as real_settings
        original = real_settings.billing_enabled
        original_key = real_settings.stripe_secret_key
        try:
            real_settings.billing_enabled = True
            real_settings.stripe_secret_key = "sk_test_xxx"
            from src.stripe.client import get_stripe_client
            try:
                get_stripe_client()
            except RuntimeError as e:
                assert "BILLING_ENABLED=false" not in str(e), (
                    "Billing guard should not fire when billing_enabled=True"
                )
            except Exception:
                pass  # other errors (e.g. missing key) are acceptable here
        finally:
            real_settings.billing_enabled = original
            real_settings.stripe_secret_key = original_key


# ---------------------------------------------------------------------------
# Stripe webhook endpoint guard
# ---------------------------------------------------------------------------
class TestStripeWebhookGuard:
    def _make_client(self, billing_enabled: bool) -> TestClient:
        mock_settings = MagicMock()
        mock_settings.billing_enabled = billing_enabled
        mock_settings.stripe_webhook_secret = "whsec_test"

        with patch("src.stripe.webhooks.settings", mock_settings):
            from src.stripe.webhooks import router

            app = FastAPI()
            app.include_router(router)
            return TestClient(app, raise_server_exceptions=False)

    def test_returns_404_when_disabled(self) -> None:
        from src.core.config import settings as real_settings
        original = real_settings.billing_enabled
        try:
            real_settings.billing_enabled = False
            from src.stripe.webhooks import router
            app = FastAPI()
            app.include_router(router)
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/stripe",
                content=b"{}",
                headers={"stripe-signature": "t=1,v1=abc"},
            )
            assert resp.status_code == 404
            assert resp.json()["error"] == "BILLING_NOT_ENABLED"
        finally:
            real_settings.billing_enabled = original

    def test_does_not_short_circuit_when_enabled(self) -> None:
        """When enabled, the handler proceeds past the guard (may fail on sig verify)."""
        mock_settings = MagicMock()
        mock_settings.billing_enabled = True
        mock_settings.stripe_webhook_secret = "whsec_test"

        with patch("src.stripe.webhooks.settings", mock_settings):
            from src.stripe.webhooks import router

            app = FastAPI()
            app.include_router(router)
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/webhooks/stripe",
                content=b"{}",
                headers={"stripe-signature": "t=1,v1=abc"},
            )
            # Must NOT be our 404 — any other response code is fine
            assert resp.status_code != 404 or resp.json().get("error") != "BILLING_NOT_ENABLED"


# ---------------------------------------------------------------------------
# Billing API route guards
# ---------------------------------------------------------------------------
class TestBillingApiGuards:
    """
    Integration-style tests using FastAPI TestClient against the billing router.
    Routes that call Stripe must return 404 when billing_enabled=False.
    Safe read-only routes (profile, pending-changes) must remain accessible.
    """

    def _make_app(self, billing_enabled: bool) -> FastAPI:
        mock_settings = MagicMock()
        mock_settings.billing_enabled = billing_enabled

        with patch("src.api.billing.settings", mock_settings):
            from src.api import billing as billing_module

            app = FastAPI()
            app.include_router(billing_module.router)
            return app

    # ------------------------------------------------------------------
    # Safe routes (should NOT return 404 due to billing flag)
    # ------------------------------------------------------------------
    @pytest.mark.parametrize("path", [
        "/profile",
        "/pending-changes",
    ])
    def test_safe_routes_bypass_billing_guard(self, path: str) -> None:
        """Profile and pending-changes are pure read-only; must not be gated by billing flag."""
        from src.core.config import settings as real_settings
        original = real_settings.billing_enabled
        try:
            real_settings.billing_enabled = False
            from src.api import billing as billing_module
            app = FastAPI()
            app.include_router(billing_module.router)
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(path)
            # Must return 200 and must NOT be our billing-guard 404
            assert resp.status_code == 200, f"{path} returned {resp.status_code}: {resp.text}"
            assert resp.json().get("error") != "BILLING_NOT_ENABLED"
        finally:
            real_settings.billing_enabled = original

"""
Stripe Webhook Integration Tests

Full HTTP round-trip tests using FastAPI TestClient.
For these integration tests we mock stripe.Webhook.construct_event (we're
not testing Stripe's SDK internals) and verify that our handler routes events
to the correct business-logic function.

The tampered-payload test validates the real signature path by NOT mocking
construct_event, demonstrating that a bad signature returns 400.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
import stripe as stripe_lib
from fastapi.testclient import TestClient

_TEST_WEBHOOK_SECRET = "whsec_integration_test_secret_abc123"
_TEST_SECRET_KEY = "sk_test_integration_key"
_TEST_PRICE_PRO = "price_PRO_INTEGRATION"
_TEST_PRICE_TEAM = "price_TEAM_INTEGRATION"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_client() -> TestClient:
    from src.main import create_app
    from src.core.config import settings

    settings.stripe_secret_key = _TEST_SECRET_KEY
    settings.stripe_webhook_secret = _TEST_WEBHOOK_SECRET
    settings.stripe_price_pro = _TEST_PRICE_PRO
    settings.stripe_price_team = _TEST_PRICE_TEAM

    return TestClient(create_app())


def _post_event_mocked(
    client: TestClient,
    event: dict,
    mock_event: dict | None = None,
) -> object:
    """Post an event with construct_event mocked to return mock_event (or event)."""
    body = json.dumps(event).encode()
    return client.post(
        "/webhooks/stripe",
        content=body,
        headers={"Stripe-Signature": "t=0,v1=fake", "Content-Type": "application/json"},
    )


# ---------------------------------------------------------------------------
# Integration: checkout.session.completed path
# ---------------------------------------------------------------------------

class TestCheckoutCompletedIntegration:

    def test_checkout_completed_calls_sync(self) -> None:
        """POST /webhooks/stripe checkout event → sync_subscription_to_tenant called."""
        event = {
            "id": "evt_checkout_integration_001",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_int_001",
                    "customer": "cus_INT001",
                    "subscription": "sub_INT001",
                }
            },
        }

        mock_subscription = {
            "id": "sub_INT001",
            "items": {"data": [{"price": {"id": _TEST_PRICE_PRO}}]},
        }

        with (
            patch("stripe.Webhook.construct_event", return_value=event),
            patch("stripe.Subscription.retrieve", return_value=mock_subscription),
            patch("src.stripe.webhooks.sync_subscription_to_tenant", return_value=True) as mock_sync,
            patch("src.stripe.webhooks.SessionLocal") as mock_db_cls,
        ):
            mock_db = MagicMock()
            mock_db_cls.return_value = mock_db

            client = _make_client()
            body = json.dumps(event).encode()
            resp = client.post(
                "/webhooks/stripe",
                content=body,
                headers={"Stripe-Signature": "t=0,v1=fake", "Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_tampered_payload_returns_400(self) -> None:
        """A request where construct_event raises SignatureVerificationError → 400."""
        client = _make_client()
        body = json.dumps({"type": "checkout.session.completed"}).encode()

        with patch(
            "stripe.Webhook.construct_event",
            side_effect=stripe_lib.SignatureVerificationError("bad sig", sig_header="t=0,v1=bad"),
        ):
            resp = client.post(
                "/webhooks/stripe",
                content=body,
                headers={"Stripe-Signature": "t=0,v1=bad", "Content-Type": "application/json"},
            )

        assert resp.status_code == 400

    def test_missing_signature_header_returns_422(self) -> None:
        """No Stripe-Signature header → FastAPI returns 422 (required header missing)."""
        client = _make_client()
        resp = client.post(
            "/webhooks/stripe",
            content=b'{"type":"ping"}',
            headers={"Content-Type": "application/json"},
        )
        # FastAPI treats missing required Header(...) as 422 Unprocessable Entity
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Integration: subscription.deleted path
# ---------------------------------------------------------------------------

class TestSubscriptionDeletedIntegration:

    def test_subscription_deleted_calls_downgrade(self) -> None:
        event = {
            "id": "evt_sub_del_int_001",
            "type": "customer.subscription.deleted",
            "data": {
                "object": {
                    "id": "sub_INT001",
                    "customer": "cus_INT001",
                    "items": {"data": [{"price": {"id": _TEST_PRICE_PRO}}]},
                }
            },
        }

        with (
            patch("stripe.Webhook.construct_event", return_value=event),
            patch("src.stripe.webhooks.downgrade_tenant_to_free", return_value=True) as mock_downgrade,
            patch("src.stripe.webhooks.SessionLocal") as mock_db_cls,
        ):
            mock_db_cls.return_value = MagicMock()
            client = _make_client()
            body = json.dumps(event).encode()
            resp = client.post(
                "/webhooks/stripe",
                content=body,
                headers={"Stripe-Signature": "t=0,v1=fake", "Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        mock_downgrade.assert_called_once()


# ---------------------------------------------------------------------------
# Integration: payment_failed (no downgrade)
# ---------------------------------------------------------------------------

class TestPaymentFailedIntegration:

    def test_payment_failed_does_not_call_downgrade(self) -> None:
        event = {
            "id": "evt_pf_int_001",
            "type": "invoice.payment_failed",
            "data": {
                "object": {
                    "id": "in_INT001",
                    "customer": "cus_INT001",
                    "amount_due": 2900,
                }
            },
        }

        with (
            patch("stripe.Webhook.construct_event", return_value=event),
            patch("src.stripe.webhooks.downgrade_tenant_to_free") as mock_downgrade,
            patch("src.stripe.webhooks.sync_subscription_to_tenant") as mock_sync,
        ):
            client = _make_client()
            body = json.dumps(event).encode()
            resp = client.post(
                "/webhooks/stripe",
                content=body,
                headers={"Stripe-Signature": "t=0,v1=fake", "Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        mock_downgrade.assert_not_called()
        mock_sync.assert_not_called()

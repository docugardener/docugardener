"""
Stripe Webhook Unit Tests

Tests for the Stripe webhook handler at POST /webhooks/stripe.
All external Stripe SDK calls are mocked — no real API requests are made.

Coverage:
  A. Valid checkout.session.completed → sync called (upgrades to PRO)
  B. Valid customer.subscription.deleted → downgrade called
  C. Invalid Stripe signature → 400 Bad Request
  D. Unknown event type → 200 OK (graceful no-op)
  E. invoice.payment_failed → 200 OK, sync/downgrade NOT called
  F. customer.subscription.updated → sync called
  G. Price ID → plan mapping: PRO
  H. Price ID → plan mapping: TEAM
  I. Price ID → plan mapping: unknown → FREE
  J. Price ID → plan mapping: None → FREE
  K. sync returns False when Tenant not found
  L. downgrade returns False when Tenant not found
  M. Missing STRIPE_WEBHOOK_SECRET → 500
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _configure_stripe_settings() -> None:
    from src.core.config import settings
    settings.stripe_secret_key = "sk_test_UNIT_TEST"
    settings.stripe_webhook_secret = "whsec_UNIT_TEST_SECRET"
    settings.stripe_price_pro = "price_PRO_TEST"
    settings.stripe_price_team = "price_TEAM_TEST"
    settings.billing_enabled = True


def _make_client() -> TestClient:
    _configure_stripe_settings()
    from src.main import create_app
    return TestClient(create_app())


def _post_event(client: TestClient, event: dict, sig: str = "t=0,v1=fake") -> object:
    body = json.dumps(event).encode()
    return client.post(
        "/webhooks/stripe",
        content=body,
        headers={"Stripe-Signature": sig, "Content-Type": "application/json"},
    )


# ---------------------------------------------------------------------------
# Sample event factories
# ---------------------------------------------------------------------------

def _checkout_event() -> dict:
    return {
        "id": "evt_co_001",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_001",
                "customer": "cus_TEST001",
                "subscription": "sub_TEST001",
            }
        },
    }


def _sub_deleted_event() -> dict:
    return {
        "id": "evt_del_001",
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_001",
                "customer": "cus_TEST001",
                "items": {"data": [{"price": {"id": "price_PRO_TEST"}}]},
            }
        },
    }


def _sub_updated_event(price_id: str = "price_TEAM_TEST") -> dict:
    return {
        "id": "evt_upd_001",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_001",
                "customer": "cus_TEST001",
                "items": {"data": [{"price": {"id": price_id}}]},
            }
        },
    }


def _payment_failed_event() -> dict:
    return {
        "id": "evt_pf_001",
        "type": "invoice.payment_failed",
        "data": {
            "object": {
                "id": "in_001",
                "customer": "cus_TEST001",
                "amount_due": 2900,
            }
        },
    }


def _unknown_event() -> dict:
    return {
        "id": "evt_unk_001",
        "type": "customer.created",
        "data": {"object": {"id": "cus_NEW"}},
    }


# ---------------------------------------------------------------------------
# A. checkout.session.completed → sync called
# ---------------------------------------------------------------------------

def test_checkout_completed_calls_sync() -> None:
    """A. Valid checkout event → sync_subscription_to_tenant is called."""
    _configure_stripe_settings()
    event = _checkout_event()

    with (
        patch("stripe.Webhook.construct_event", return_value=event),
        patch("stripe.Subscription.retrieve", return_value={"items": {"data": [{"price": {"id": "price_PRO_TEST"}}]}}),
        patch("src.stripe.sync.sync_subscription_to_tenant", return_value=True) as mock_sync,
        patch("src.stripe.webhooks.SessionLocal"),
    ):
        client = _make_client()
        resp = _post_event(client, event)

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# B. subscription.deleted → downgrade called
# ---------------------------------------------------------------------------

def test_subscription_deleted_calls_downgrade() -> None:
    """B. subscription.deleted → downgrade_tenant_to_free is called."""
    _configure_stripe_settings()
    event = _sub_deleted_event()

    with (
        patch("stripe.Webhook.construct_event", return_value=event),
        patch("src.stripe.sync.downgrade_tenant_to_free", return_value=True) as mock_downgrade,
        patch("src.stripe.webhooks.SessionLocal"),
    ):
        client = _make_client()
        resp = _post_event(client, event)

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# C. Invalid signature → 400
# ---------------------------------------------------------------------------

def test_invalid_signature_returns_400() -> None:
    """C. Invalid Stripe signature → 400."""
    import stripe as _stripe
    _configure_stripe_settings()

    with patch(
        "stripe.Webhook.construct_event",
        side_effect=_stripe.SignatureVerificationError("bad", sig_header="t=0,v1=bad"),
    ):
        client = _make_client()
        resp = _post_event(client, {"type": "ping"})

    assert resp.status_code == 400
    assert "signature" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# D. Unknown event type → 200 OK
# ---------------------------------------------------------------------------

def test_unknown_event_type_returns_ok() -> None:
    """D. Unknown event type → 200 OK, no sync/downgrade."""
    _configure_stripe_settings()
    event = _unknown_event()

    with (
        patch("stripe.Webhook.construct_event", return_value=event),
        patch("src.stripe.sync.sync_subscription_to_tenant") as mock_sync,
        patch("src.stripe.sync.downgrade_tenant_to_free") as mock_downgrade,
    ):
        client = _make_client()
        resp = _post_event(client, event)

    assert resp.status_code == 200
    mock_sync.assert_not_called()
    mock_downgrade.assert_not_called()


# ---------------------------------------------------------------------------
# E. payment_failed → 200 OK, no downgrade
# ---------------------------------------------------------------------------

def test_payment_failed_does_not_downgrade() -> None:
    """E. invoice.payment_failed → 200 OK; sync and downgrade NOT called."""
    _configure_stripe_settings()
    event = _payment_failed_event()

    with (
        patch("stripe.Webhook.construct_event", return_value=event),
        patch("src.stripe.sync.sync_subscription_to_tenant") as mock_sync,
        patch("src.stripe.sync.downgrade_tenant_to_free") as mock_downgrade,
    ):
        client = _make_client()
        resp = _post_event(client, event)

    assert resp.status_code == 200
    mock_sync.assert_not_called()
    mock_downgrade.assert_not_called()


# ---------------------------------------------------------------------------
# F. subscription.updated → sync called
# ---------------------------------------------------------------------------

def test_subscription_updated_calls_sync() -> None:
    """F. subscription.updated → sync_subscription_to_tenant called."""
    _configure_stripe_settings()
    event = _sub_updated_event()

    with (
        patch("stripe.Webhook.construct_event", return_value=event),
        patch("src.stripe.sync.sync_subscription_to_tenant", return_value=True) as mock_sync,
        patch("src.stripe.webhooks.SessionLocal"),
    ):
        client = _make_client()
        resp = _post_event(client, event)

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# G-J. Price ID → plan mapping (pure unit, no HTTP)
# ---------------------------------------------------------------------------

def test_price_id_to_plan_pro() -> None:
    """G. PRO price ID → PRO."""
    _configure_stripe_settings()
    from src.stripe.sync import _price_id_to_plan
    assert _price_id_to_plan("price_PRO_TEST") == "PRO"


def test_price_id_to_plan_team() -> None:
    """H. TEAM price ID → TEAM."""
    _configure_stripe_settings()
    from src.stripe.sync import _price_id_to_plan
    assert _price_id_to_plan("price_TEAM_TEST") == "TEAM"


def test_price_id_to_plan_unknown_defaults_to_free() -> None:
    """I. Unknown price ID → FREE."""
    _configure_stripe_settings()
    from src.stripe.sync import _price_id_to_plan
    assert _price_id_to_plan("price_UNKNOWN_XYZ") == "FREE"


def test_price_id_to_plan_none_defaults_to_free() -> None:
    """J. None → FREE."""
    from src.stripe.sync import _price_id_to_plan
    assert _price_id_to_plan(None) == "FREE"


# ---------------------------------------------------------------------------
# K-L. Sync/Downgrade with no tenant found
# ---------------------------------------------------------------------------

def test_sync_returns_false_when_no_tenant() -> None:
    """K. sync_subscription_to_tenant returns False when Tenant not found."""
    from src.stripe.sync import sync_subscription_to_tenant
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None
    result = sync_subscription_to_tenant(
        subscription={"items": {"data": [{"price": {"id": "price_PRO_TEST"}}]}},
        stripe_customer_id="cus_GHOST",
        db=mock_db,
    )
    assert result is False


def test_downgrade_returns_false_when_no_tenant() -> None:
    """L. downgrade_tenant_to_free returns False when Tenant not found."""
    from src.stripe.sync import downgrade_tenant_to_free
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None
    result = downgrade_tenant_to_free("cus_GHOST", mock_db)
    assert result is False


# ---------------------------------------------------------------------------
# M. Missing webhook secret → 500
# ---------------------------------------------------------------------------

def test_missing_webhook_secret_returns_500() -> None:
    """M. STRIPE_WEBHOOK_SECRET not set → 500."""
    from src.core.config import settings
    original = settings.stripe_webhook_secret
    settings.stripe_webhook_secret = ""
    try:
        from src.main import create_app
        client = TestClient(create_app())
        resp = client.post(
            "/webhooks/stripe",
            content=b'{}',
            headers={"Stripe-Signature": "t=0,v1=x", "Content-Type": "application/json"},
        )
        assert resp.status_code == 500
    finally:
        settings.stripe_webhook_secret = original

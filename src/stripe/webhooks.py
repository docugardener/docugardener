# SPDX-License-Identifier: AGPL-3.0-or-later
"""Stripe webhook router.

Handles incoming Stripe events at POST /webhooks/stripe.

Security: every request is verified against the Stripe-Signature header using
the configured STRIPE_WEBHOOK_SECRET.  Invalid or missing signatures return 400
immediately, before any DB mutations occur.

Supported events:
  checkout.session.completed    → upgrade tenant plan
  customer.subscription.updated → sync plan change
  customer.subscription.deleted → downgrade to FREE
  invoice.payment_failed        → log warning only (no immediate downgrade;
                                   Stripe retries for several days — we let
                                   the subscription.deleted event drive the
                                   actual downgrade)
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

import stripe
from src.core.config import settings
from src.core.logging import get_logger
from src.pipeline.job_manager import SessionLocal
from src.stripe.sync import downgrade_tenant_to_free, sync_subscription_to_tenant

router = APIRouter()
logger = get_logger(__name__)


def _construct_stripe_event(payload: bytes, sig_header: str) -> stripe.Event:
    """Verify the Stripe webhook signature and return the parsed Event.

    Raises HTTPException(400) on invalid signature or payload.
    """
    wh_secret = settings.stripe_webhook_secret
    if not wh_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="STRIPE_WEBHOOK_SECRET is not configured.",
        )
    try:
        return stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=wh_secret,
        )
    except stripe.SignatureVerificationError as exc:
        logger.warning("stripe.webhook: invalid signature", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Stripe signature.",
        ) from exc
    except Exception as exc:
        logger.error("stripe.webhook: failed to construct event", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook payload.",
        ) from exc


@router.post("/stripe")
async def handle_stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="Stripe-Signature"),
) -> JSONResponse:
    if not settings.billing_enabled:
        return JSONResponse(status_code=200, content={"received": True})
    """Process an incoming Stripe webhook event.

    Always returns 200 for recognised events (even if we chose not to act on
    them) so Stripe does not retry unnecessarily.  Returns 400 only for
    signature failures.
    """
    # HYB-05: Defense-in-depth guard — router should not be mounted in non-SaaS
    # modes, but this catches any edge case where it is reached anyway.
    if settings.deployment_mode != "saas":
        logger.warning(
            "stripe.webhook: received in non-SaaS mode — ignoring",
            deployment_mode=settings.deployment_mode,
        )
        return JSONResponse({"status": "ignored", "reason": "non-saas-mode"})

    payload = await request.body()
    event = _construct_stripe_event(payload, stripe_signature)

    event_type: str = event["type"]
    event_data: dict = event["data"]["object"]

    logger.info("stripe.webhook: received event", event_type=event_type, event_id=event["id"])

    try:
        if event_type == "checkout.session.completed":
            await _handle_checkout_completed(event_data)

        elif event_type == "customer.subscription.updated":
            await _handle_subscription_updated(event_data)

        elif event_type == "customer.subscription.deleted":
            await _handle_subscription_deleted(event_data)

        elif event_type == "invoice.payment_failed":
            _handle_payment_failed(event_data)

        else:
            logger.debug("stripe.webhook: unhandled event type — ignoring", event_type=event_type)

    except Exception as exc:
        # Never let DB/business-logic errors propagate as 5xx — Stripe would
        # retry aggressively.  Log and return 200 so Stripe marks it delivered.
        logger.error(
            "stripe.webhook: error processing event",
            event_type=event_type,
            event_id=event["id"],
            error=str(exc),
        )

    return JSONResponse(content={"status": "ok"})


# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------


async def _handle_checkout_completed(session: dict) -> None:
    """checkout.session.completed — onboard a new paying customer.

    Stripe creates/associates a Subscription at checkout completion.
    We retrieve the subscription to get the Price ID and set the plan.
    """
    customer_id: str | None = session.get("customer")
    subscription_id: str | None = session.get("subscription")

    if not customer_id or not subscription_id:
        logger.warning(
            "stripe._handle_checkout_completed: missing customer or subscription",
            session_id=session.get("id"),
        )
        return

    # Retrieve the full subscription object to get the price
    stripe.api_key = settings.stripe_secret_key
    subscription = stripe.Subscription.retrieve(subscription_id)

    db = SessionLocal()
    try:
        updated = sync_subscription_to_tenant(
            subscription=dict(subscription),
            stripe_customer_id=customer_id,
            db=db,
        )
        if updated:
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _handle_subscription_updated(subscription: dict) -> None:
    """customer.subscription.updated — plan upgrade or downgrade."""
    customer_id: str | None = subscription.get("customer")
    if not customer_id:
        return

    db = SessionLocal()
    try:
        updated = sync_subscription_to_tenant(
            subscription=subscription,
            stripe_customer_id=customer_id,
            db=db,
        )
        if updated:
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _handle_subscription_deleted(subscription: dict) -> None:
    """customer.subscription.deleted — downgrade to FREE tier."""
    customer_id: str | None = subscription.get("customer")
    if not customer_id:
        return

    db = SessionLocal()
    try:
        updated = downgrade_tenant_to_free(
            stripe_customer_id=customer_id,
            db=db,
        )
        if updated:
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _handle_payment_failed(invoice: dict) -> None:
    """invoice.payment_failed — log only.

    Stripe retries for several days.  We do NOT downgrade immediately because
    that would punish users for transient card failures.
    The `customer.subscription.deleted` event fires only after all retries fail,
    which is when we actually downgrade.
    """
    customer_id = invoice.get("customer")
    amount_due = invoice.get("amount_due", 0)
    logger.warning(
        "stripe.webhook: payment failed — Stripe will retry; no immediate action",
        customer_id=customer_id,
        amount_due_cents=amount_due,
        invoice_id=invoice.get("id"),
    )

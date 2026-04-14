# SPDX-License-Identifier: AGPL-3.0-or-later
"""Subscription → Tenant plan synchronisation logic.

Maps Stripe Subscription objects and Price IDs to the DocuGardener plan enum
stored in Tenant.plan.  All DB mutations are done here; the webhook router
only calls this module.

Plan mapping:
  STRIPE_PRICE_PRO  → "PRO"
  STRIPE_PRICE_TEAM → "TEAM"
  (anything else)   → "FREE"  (safe default / unknown price ID)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.core.config import settings
from src.core.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = get_logger(__name__)


def _price_id_to_plan(price_id: str | None) -> str:
    """Resolve a Stripe Price ID to an internal plan name.

    Returns one of: "FREE", "PRO", "TEAM".
    Falls back to "FREE" for unknown / empty price IDs.
    """
    if not price_id:
        return "FREE"
    if settings.stripe_price_pro and price_id == settings.stripe_price_pro:
        return "PRO"
    if settings.stripe_price_team and price_id == settings.stripe_price_team:
        return "TEAM"
    logger.warning(
        "stripe.sync: unknown Stripe price ID — defaulting to FREE",
        price_id=price_id,
    )
    return "FREE"


def _get_price_id_from_subscription(subscription: dict) -> str | None:
    """Extract the first Price ID from a Stripe Subscription dict."""
    items = subscription.get("items", {}).get("data", [])
    if items:
        return items[0].get("price", {}).get("id")
    return None


def sync_subscription_to_tenant(
    subscription: dict,
    stripe_customer_id: str,
    db: "Session",
) -> bool:
    """Update Tenant.plan based on the active Stripe subscription.

    Args:
        subscription: Stripe Subscription object (as dict).
        stripe_customer_id: Stripe customer ID (`cus_xxx`).
        db: SQLAlchemy session — MUST be committed by caller.

    Returns:
        True if a Tenant was found and updated, False otherwise.
    """
    from src.storage.sql_models import Tenant

    tenant: Tenant | None = db.query(Tenant).filter(
        Tenant.stripeCustomerId == stripe_customer_id
    ).first()

    if not tenant:
        logger.warning(
            "stripe.sync: no Tenant found for Stripe customer — cannot sync plan",
            stripe_customer_id=stripe_customer_id,
        )
        return False

    price_id = _get_price_id_from_subscription(subscription)
    new_plan = _price_id_to_plan(price_id)
    old_plan = tenant.plan

    if old_plan == new_plan:
        logger.debug(
            "stripe.sync: plan unchanged — skipping DB write",
            tenant_id=tenant.id,
            plan=new_plan,
        )
        return True

    tenant.plan = new_plan  # type: ignore[assignment]
    logger.info(
        "stripe.sync: plan updated",
        tenant_id=tenant.id,
        old_plan=old_plan,
        new_plan=new_plan,
        price_id=price_id,
        stripe_customer_id=stripe_customer_id,
    )
    return True


def downgrade_tenant_to_free(stripe_customer_id: str, db: "Session") -> bool:
    """Set Tenant.plan = FREE when a subscription is cancelled/deleted.

    Args:
        stripe_customer_id: Stripe customer ID.
        db: SQLAlchemy session — MUST be committed by caller.

    Returns:
        True if found and updated, False otherwise.
    """
    from src.storage.sql_models import Tenant

    tenant: Tenant | None = db.query(Tenant).filter(
        Tenant.stripeCustomerId == stripe_customer_id
    ).first()

    if not tenant:
        logger.warning(
            "stripe.sync: downgrade — no Tenant found",
            stripe_customer_id=stripe_customer_id,
        )
        return False

    if tenant.plan != "FREE":
        logger.info(
            "stripe.sync: subscription deleted — downgrading to FREE",
            tenant_id=tenant.id,
            old_plan=tenant.plan,
            stripe_customer_id=stripe_customer_id,
        )
        tenant.plan = "FREE"  # type: ignore[assignment]

    return True

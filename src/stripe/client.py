# SPDX-License-Identifier: AGPL-3.0-or-later
"""Stripe SDK client factory."""

import stripe as _stripe

from src.core.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)


def get_stripe_client() -> "_stripe.StripeClient":
    if not settings.billing_enabled:
        raise RuntimeError("Billing is disabled (BILLING_ENABLED=false).")
    """Return a configured Stripe client using the secret key from settings.

    The Stripe SDK is configured lazily so that the app starts even when
    STRIPE_SECRET_KEY is not set (e.g. in test environments that mock the DNS).
    """
    if not settings.stripe_secret_key:
        raise RuntimeError(
            "STRIPE_SECRET_KEY is not configured. "
            "Set it in your .env file or environment variables."
        )
    return _stripe.StripeClient(api_key=settings.stripe_secret_key)

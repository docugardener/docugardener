// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * HYB-05: Stripe lazy initialization.
 *
 * The eager throw at module import time was replaced with a getStripe() factory
 * that throws only when called. This prevents the Next.js process from crashing
 * in client-installed and air-gap modes where STRIPE_SECRET_KEY is intentionally
 * absent.
 *
 * SaaS billing routes call getStripe() and will still get a clear error if the
 * key is missing — behaviour is identical to before for SaaS deployments.
 */
import Stripe from "stripe"

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error(
            "STRIPE_SECRET_KEY is not set. " +
            "This endpoint is only available in SaaS mode (DEPLOYMENT_MODE=saas)."
        )
    }
    if (!_stripe) {
        _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: "2026-02-25.clover",
            typescript: true,
        })
    }
    return _stripe
}

// No top-level `stripe` export — callers must use getStripe() to get the instance.
// This is intentional: it ensures the lazy init path is always taken.

export const STRIPE_PRICE_IDS = {
    pro: process.env.STRIPE_PRICE_PRO ?? "",
    team: process.env.STRIPE_PRICE_TEAM ?? "",
} as const

export type StripePlan = keyof typeof STRIPE_PRICE_IDS

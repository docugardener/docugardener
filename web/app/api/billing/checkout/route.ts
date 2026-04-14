// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * I-02: Stripe Checkout Session
 *
 * POST /api/billing/checkout
 * Body: { plan: "pro" | "team" }
 *
 * First purchase (no existing subscription):
 *   Returns { url } → client redirects to Stripe Checkout
 *
 * Upgrade/downgrade (existing active subscription):
 *   Updates the subscription price in-place via stripe.subscriptions.update()
 *   Returns { upgraded: true } → client refreshes without leaving the app
 *   Stripe fires customer.subscription.updated → webhook syncs plan to DB
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { getStripe, STRIPE_PRICE_IDS, type StripePlan } from "@/lib/stripe"

export const dynamic = "force-dynamic"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"

export async function POST(req: Request) {
  if (!process.env.BILLING_ENABLED || process.env.BILLING_ENABLED === "false") {
    return NextResponse.json({ error: "BILLING_NOT_ENABLED" }, { status: 404 })
  }

    // DG-BIL-01: client-installed mode proxies billing to PlatformCloud
    // FROZEN: client-installed mode is not actively maintained (PlatformCloud frozen 2026-03-30)
    if (process.env.DEPLOYMENT_MODE === "client-installed") {
        const session = await getServerSession(authOptions)
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        if ((session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden — ADMIN role required" }, { status: 403 })
        }

        let body: { plan?: string; interval?: string }
        try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

        const platformUrl = process.env.PLATFORM_CLOUD_URL
        const platformToken = process.env.PLATFORM_CLOUD_TOKEN
        const licenseKey = process.env.LICENSE_KEY

        // DG-ALIGN-05: pass interval through so callers can request annual billing
        const interval = body.interval ?? "monthly"
        // PC expects uppercase plan names and requires redirect URLs
        const resp = await fetch(`${platformUrl}/api/v1/billing/checkout`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${platformToken}` },
            body: JSON.stringify({
                product: "docugardener",
                license_key: licenseKey,
                plan: (body.plan as string).toUpperCase(),
                interval,
                success_url: `${APP_URL}/dashboard/billing?upgraded=1`,
                cancel_url: `${APP_URL}/dashboard/billing`,
            }),
        })
        const data = await resp.json()
        if (!resp.ok) {
            const errMsg = typeof data?.error === "string"
                ? data.error
                : data?.error?.fieldErrors
                    ? `Validation: ${JSON.stringify(data.error.fieldErrors)}`
                    : JSON.stringify(data)
            console.error("[DG-BIL-01] PC checkout error", resp.status, errMsg)
            return NextResponse.json({ error: errMsg }, { status: resp.status })
        }
        return NextResponse.json({ url: data.checkout_url }, { status: 200 })
    }

    // HYB-05: Stripe billing is only available in SaaS mode.
    if (process.env.DEPLOYMENT_MODE && process.env.DEPLOYMENT_MODE !== "saas") {
        return NextResponse.json(
            { error: "billing_not_available", redirect: "/dashboard/billing/license" },
            { status: 200 },
        )
    }

    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const tenantId = (session.user as any).tenantId
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 403 })

    if ((session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden — ADMIN role required" }, { status: 403 })
    }

    let body: { plan?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const plan = body.plan as StripePlan
    if (!plan || !(plan in STRIPE_PRICE_IDS)) {
        return NextResponse.json(
            { error: "Invalid plan. Must be 'pro' or 'team'." },
            { status: 400 },
        )
    }

    const priceId = STRIPE_PRICE_IDS[plan]
    if (!priceId) {
        return NextResponse.json(
            { error: `STRIPE_PRICE_${plan.toUpperCase()} is not configured.` },
            { status: 500 },
        )
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, stripeCustomerId: true },
    })
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

    // Upsert Stripe Customer — reuse existing or create new
    let customerId = tenant.stripeCustomerId
    if (!customerId) {
        const customer = await getStripe().customers.create({
            name: tenant.name,
            email: session.user.email ?? undefined,
            metadata: { tenantId },
        })
        customerId = customer.id
        await prisma.tenant.update({
            where: { id: tenantId },
            data: { stripeCustomerId: customerId },
        })
    }

    // Check for a genuinely active subscription (not scheduled to cancel).
    // cancel_at_period_end=true means the customer effectively has no ongoing
    // commitment — treat them as new and start a fresh checkout session.
    const existing = await getStripe().subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 10,
    })
    const activeSub = existing.data.find(s => !s.cancel_at_period_end)

    if (activeSub) {
        // Upgrade/downgrade in-place — no second subscription created
        await getStripe().subscriptions.update(activeSub.id, {
            items: [{ id: activeSub.items.data[0].id, price: priceId }],
            proration_behavior: "always_invoice",
            metadata: { tenantId },
        })
        // Stripe fires customer.subscription.updated → webhook syncs plan to DB
        return NextResponse.json({ upgraded: true })
    }

    // No existing subscription — start fresh with Stripe Checkout
    const checkoutSession = await getStripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/pricing?cancelled=true`,
        metadata: { tenantId },
        subscription_data: { metadata: { tenantId } },
    })

    return NextResponse.json({ url: checkoutSession.url })
}

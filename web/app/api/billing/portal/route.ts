// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * I-02: Stripe Customer Portal
 *
 * POST /api/billing/portal
 * Returns: { url: "https://billing.stripe.com/..." }
 *
 * Opens the Stripe Billing Portal so the customer can manage their
 * subscription, update payment method, view invoices, or cancel.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe"

export const dynamic = "force-dynamic"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"

export async function POST(req: Request) {
    // DG-BIL-01: client-installed mode proxies billing portal to PlatformCloud
    // FROZEN: client-installed mode is not actively maintained (PlatformCloud frozen 2026-03-30)
    if (process.env.DEPLOYMENT_MODE === "client-installed") {
        const session = await getServerSession(authOptions)
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        if ((session.user as any).role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden — ADMIN role required" }, { status: 403 })
        }

        const platformUrl = process.env.PLATFORM_CLOUD_URL
        const platformToken = process.env.PLATFORM_CLOUD_TOKEN
        const licenseKey = process.env.LICENSE_KEY

        const resp = await fetch(`${platformUrl}/api/v1/billing/portal`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${platformToken}` },
            body: JSON.stringify({
                product: "docugardener",
                license_key: licenseKey,
                return_url: `${APP_URL}/dashboard/billing`,
            }),
        })
        const data = await resp.json()
        if (!resp.ok) {
            const errMsg = typeof data?.error === "string"
                ? data.error
                : data?.error?.fieldErrors
                    ? `Validation: ${JSON.stringify(data.error.fieldErrors)}`
                    : JSON.stringify(data)
            console.error("[DG-BIL-01] PC portal error", resp.status, errMsg)
            return NextResponse.json({ error: errMsg }, { status: resp.status })
        }
        return NextResponse.json({ url: data.portal_url }, { status: 200 })
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

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { stripeCustomerId: true },
    })
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

    if (!tenant.stripeCustomerId) {
        return NextResponse.json(
            { error: "No Stripe subscription found. Purchase a plan first." },
            { status: 400 },
        )
    }

    // Verify the customer has at least one active subscription before opening the portal.
    // If stripeCustomerId was set manually or the subscription was deleted, the portal
    // would open but show nothing — redirect to pricing instead.
    const subs = await getStripe().subscriptions.list({
        customer: tenant.stripeCustomerId!,
        status: "active",
        limit: 1,
    })
    if (subs.data.length === 0) {
        return NextResponse.json(
            { error: "No Stripe subscription found. Purchase a plan first." },
            { status: 400 },
        )
    }

    const portalSession = await getStripe().billingPortal.sessions.create({
        customer: tenant.stripeCustomerId!,
        return_url: `${APP_URL}/dashboard/billing`,
    })

    return NextResponse.json({ url: portalSession.url })
}

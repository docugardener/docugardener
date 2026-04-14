// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * POST /api/billing/cancel
 *
 * Cancels the current plan and downgrades to FREE.
 *
 * If an active Stripe subscription exists:
 *   - Cancels it immediately via stripe.subscriptions.cancel()
 *   - Sets plan=FREE + clears stripeCustomerId in DB
 *
 * If no Stripe subscription (plan set manually / dev env):
 *   - Sets plan=FREE directly in DB
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe"

export const dynamic = "force-dynamic"

export async function POST() {
    if (process.env.DEPLOYMENT_MODE && process.env.DEPLOYMENT_MODE !== "saas") {
        return NextResponse.json({ error: "billing_not_available" }, { status: 400 })
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
        select: { id: true, plan: true, stripeCustomerId: true },
    })
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

    if (tenant.plan === "FREE") {
        return NextResponse.json({ error: "Already on Free plan." }, { status: 400 })
    }

    // Cancel active Stripe subscription if one exists
    if (tenant.stripeCustomerId) {
        try {
            const subs = await getStripe().subscriptions.list({
                customer: tenant.stripeCustomerId,
                status: "active",
                limit: 1,
            })
            if (subs.data.length > 0) {
                await getStripe().subscriptions.cancel(subs.data[0].id)
            }
        } catch (err) {
            console.error("[billing/cancel] Stripe cancellation error", err)
            // Continue — still reset plan in DB
        }
    }

    // Downgrade in DB immediately (no webhook handler in this app)
    await prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: "FREE", stripeCustomerId: null },
    })

    return NextResponse.json({ cancelled: true })
}

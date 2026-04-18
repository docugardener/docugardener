export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * POST /api/stripe/webhooks
 * DG-OWN-04: Receive Stripe webhook events, verify signature, persist to DB.
 *
 * Idempotent: duplicate event IDs are silently skipped.
 * Only WATCHED_TYPES are stored; others are acknowledged and ignored.
 */
import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

// Event types persisted to the StripeEvent table
const WATCHED_TYPES = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "customer.subscription.trial_will_end",
])

export async function POST(req: Request) {
    const sig = req.headers.get("stripe-signature")
    if (!sig) {
        return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
    }

    const body = await req.text()

    let event: any
    try {
        const stripe = getStripe()
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ""
        event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    } catch (err: any) {
        return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 })
    }

    // Acknowledge unrecognized event types without storing
    if (!WATCHED_TYPES.has(event.type)) {
        return NextResponse.json({ received: true, stored: false })
    }

    // Idempotency check
    const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } })
    if (existing) {
        return NextResponse.json({ received: true, stored: false, reason: "duplicate" })
    }

    // Extract common fields from the event object
    const obj = event.data.object as any
    const customerId: string | null = obj.customer ?? null

    let amountCents: number | null = null
    if (event.type.startsWith("invoice.")) {
        amountCents = obj.amount_paid ?? obj.amount_due ?? null
    } else if (event.type === "checkout.session.completed") {
        amountCents = obj.amount_total ?? null
    }

    const stripeUrl = event.livemode
        ? `https://dashboard.stripe.com/events/${event.id}`
        : `https://dashboard.stripe.com/test/events/${event.id}`

    await prisma.stripeEvent.create({
        data: {
            id: event.id,
            type: event.type,
            customerId,
            amountCents,
            metadata: event.data.object as any,
            stripeUrl,
            livemode: Boolean(event.livemode),
            createdAt: new Date(event.created * 1000),
        },
    })

    return NextResponse.json({ received: true, stored: true })
}

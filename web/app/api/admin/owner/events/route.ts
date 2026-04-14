// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server"
import { getOwnerSession } from "@/lib/owner-auth"
import { getStripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Event types we surface in the feed
const WATCHED_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.trial_will_end",
])

const EVENT_LABELS: Record<string, { label: string; sentiment: "positive" | "negative" | "neutral" | "warning" }> = {
  "checkout.session.completed":         { label: "Checkout completed",        sentiment: "positive" },
  "customer.subscription.created":      { label: "Subscription created",      sentiment: "positive" },
  "customer.subscription.updated":      { label: "Subscription updated",      sentiment: "neutral"  },
  "customer.subscription.deleted":      { label: "Subscription cancelled",    sentiment: "negative" },
  "invoice.payment_succeeded":          { label: "Payment succeeded",         sentiment: "positive" },
  "invoice.payment_failed":             { label: "Payment failed",            sentiment: "negative" },
  "customer.subscription.trial_will_end":{ label: "Trial ending soon",        sentiment: "warning"  },
}

export async function GET(req: NextRequest) {
  const owner = await getOwnerSession()
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const stripe = getStripe()

  // Fetch last 100 events from Stripe (test or live depending on key)
  const events = await stripe.events.list({ limit: 100 })

  // Build a customer → tenant map for enrichment
  const tenants = await prisma.tenant.findMany({
    where: { stripeCustomerId: { not: null } },
    select: { id: true, name: true, plan: true, stripeCustomerId: true },
  })
  const customerMap = Object.fromEntries(tenants.map((t) => [t.stripeCustomerId!, t]))

  const rows = events.data
    .filter((e) => WATCHED_TYPES.has(e.type))
    .map((e) => {
      const obj = e.data.object as any
      const customerId: string | null = obj.customer ?? null
      const tenant = customerId ? customerMap[customerId] : null

      // Extract amount from invoice events
      let amountCents: number | null = null
      if (e.type.startsWith("invoice.")) {
        amountCents = obj.amount_paid ?? obj.amount_due ?? null
      } else if (e.type === "checkout.session.completed") {
        amountCents = obj.amount_total ?? null
      }

      // Detect upgrade vs downgrade from subscription.updated
      let upgradeDirection: "upgrade" | "downgrade" | null = null
      if (e.type === "customer.subscription.updated" && e.data.previous_attributes) {
        const prev = (e.data.previous_attributes as any).items
        // Simple heuristic: if status changed to active from trialing it's a conversion
        if ((e.data.previous_attributes as any).status === "trialing") {
          upgradeDirection = "upgrade"
        }
      }

      return {
        id: e.id,
        type: e.type,
        label: EVENT_LABELS[e.type]?.label ?? e.type,
        sentiment: EVENT_LABELS[e.type]?.sentiment ?? "neutral",
        createdAt: new Date(e.created * 1000).toISOString(),
        customerId,
        tenantName: tenant?.name ?? null,
        tenantPlan: tenant?.plan ?? null,
        amountCents,
        upgradeDirection,
        stripeUrl: `https://dashboard.stripe.com/test/events/${e.id}`,
      }
    })

  return NextResponse.json({ events: rows, mode: "test" })
}

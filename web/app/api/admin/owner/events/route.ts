// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server"
import { getOwnerSession } from "@/lib/owner-auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const EVENT_LABELS: Record<string, { label: string; sentiment: "positive" | "negative" | "neutral" | "warning" }> = {
  "checkout.session.completed":          { label: "Checkout completed",        sentiment: "positive" },
  "customer.subscription.created":       { label: "Subscription created",      sentiment: "positive" },
  "customer.subscription.updated":       { label: "Subscription updated",      sentiment: "neutral"  },
  "customer.subscription.deleted":       { label: "Subscription cancelled",    sentiment: "negative" },
  "invoice.payment_succeeded":           { label: "Payment succeeded",         sentiment: "positive" },
  "invoice.payment_failed":              { label: "Payment failed",            sentiment: "negative" },
  "customer.subscription.trial_will_end":{ label: "Trial ending soon",        sentiment: "warning"  },
}

export async function GET(req: NextRequest) {
  const owner = await getOwnerSession()
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // DG-OWN-04: read from DB (no live Stripe API call)
  const dbEvents = await prisma.stripeEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  // Build a customer → tenant map for enrichment
  const tenants = await prisma.tenant.findMany({
    where: { stripeCustomerId: { not: null } },
    select: { id: true, name: true, plan: true, stripeCustomerId: true },
  })
  const customerMap = Object.fromEntries(tenants.map((t) => [t.stripeCustomerId!, t]))

  const rows = dbEvents.map((e) => {
    const tenant = e.customerId ? customerMap[e.customerId] : null
    const meta = (e.metadata as any) ?? {}

    // Detect upgrade vs downgrade from subscription.updated metadata
    let upgradeDirection: "upgrade" | "downgrade" | null = null
    if (e.type === "customer.subscription.updated" && meta.previous_attributes) {
      if ((meta.previous_attributes as any).status === "trialing") {
        upgradeDirection = "upgrade"
      }
    }

    return {
      id: e.id,
      type: e.type,
      label: EVENT_LABELS[e.type]?.label ?? e.type,
      sentiment: EVENT_LABELS[e.type]?.sentiment ?? "neutral",
      createdAt: e.createdAt.toISOString(),
      customerId: e.customerId,
      tenantName: tenant?.name ?? null,
      tenantPlan: tenant?.plan ?? null,
      amountCents: e.amountCents,
      upgradeDirection,
      stripeUrl: e.stripeUrl,
    }
  })

  return NextResponse.json({ events: rows, mode: dbEvents.some((e) => e.livemode) ? "live" : "test" })
}

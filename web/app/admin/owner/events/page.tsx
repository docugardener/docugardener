// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useEffect, useState } from "react"
import { ExternalLink, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EventRow {
  id: string
  type: string
  label: string
  sentiment: "positive" | "negative" | "neutral" | "warning"
  createdAt: string
  customerId: string | null
  tenantName: string | null
  tenantPlan: string | null
  amountCents: number | null
  upgradeDirection: "upgrade" | "downgrade" | null
  stripeUrl: string
}

const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-green-50 text-green-700 border-green-100",
  negative: "bg-red-50 text-red-700 border-red-100",
  warning:  "bg-amber-50 text-amber-700 border-amber-100",
  neutral:  "bg-gray-100 text-gray-600 border-gray-200",
}

const PLAN_COLORS: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-500",
  PRO:  "bg-blue-50 text-blue-700",
  TEAM: "bg-purple-50 text-purple-700",
}

function formatAmount(cents: number | null): string {
  if (cents == null) return "—"
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch("/api/admin/owner/events")
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Stripe Event Feed</h1>
          <p className="text-sm text-gray-500">
            Live from Stripe test mode · last 100 events ·{" "}
            <a
              href="https://dashboard.stripe.com/test/events"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 hover:underline"
            >
              Open Stripe Dashboard ↗
            </a>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && <div className="text-sm text-gray-400 py-8 text-center">Loading events…</div>}

      {!loading && events.length === 0 && (
        <div className="text-sm text-gray-400 py-12 text-center">
          No matching events yet. Try completing a test checkout.
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Event", "Tenant", "Amount", "Time", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${SENTIMENT_STYLES[e.sentiment]}`}>
                      {e.label}
                    </span>
                    <p className="text-[11px] text-gray-400 mt-0.5 font-mono">{e.type}</p>
                  </td>
                  <td className="px-4 py-3">
                    {e.tenantName ? (
                      <div>
                        <span className="font-medium text-gray-900">{e.tenantName}</span>
                        {e.tenantPlan && (
                          <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${PLAN_COLORS[e.tenantPlan]}`}>
                            {e.tenantPlan}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">{e.customerId ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-700">
                    {formatAmount(e.amountCents)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(e.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={e.stripeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title="Open in Stripe Dashboard"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

interface TenantRow {
  id: string
  name: string
  plan: string
  createdAt: string
  lastJobAt: string | null
  jobCount30d: number
  jobCountTotal: number
  quotaUsed: number
  quotaLimit: number
  quotaUnlimited: boolean
  grantedFeatures: string[] | null
}

interface Distribution { FREE: number; PRO: number; TEAM: number }

const PLAN_COLORS: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-600",
  PRO: "bg-blue-50 text-blue-700",
  TEAM: "bg-purple-50 text-purple-700",
}

function QuotaBar({ used, limit, unlimited }: { used: number; limit: number; unlimited: boolean }) {
  if (unlimited) return <span className="text-xs text-gray-400">{used} / ∞</span>
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const color = pct > 95 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500"
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{used}/{limit}</span>
    </div>
  )
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [dist, setDist] = useState<Distribution | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/owner/tenants")
      .then((r) => r.json())
      .then((d) => { setTenants(d.tenants); setDist(d.distribution) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-400">Loading…</div>

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Tenants</h1>
      <p className="text-sm text-gray-500 mb-6">{tenants.length} total tenants</p>

      {/* Plan distribution */}
      {dist && (
        <div className="flex gap-4 mb-6">
          {(["FREE", "PRO", "TEAM"] as const).map((plan) => (
            <div key={plan} className={`px-4 py-2 rounded-lg text-sm font-semibold ${PLAN_COLORS[plan]}`}>
              {dist[plan]} {plan}
            </div>
          ))}
        </div>
      )}

      {tenants.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">No tenants yet.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Tenant", "Plan", "Quota (30d)", "Jobs 30d", "Last active", "Overrides", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PLAN_COLORS[t.plan]}`}>
                      {t.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <QuotaBar used={t.quotaUsed} limit={t.quotaLimit} unlimited={t.quotaUnlimited} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.jobCount30d}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {t.lastJobAt ? new Date(t.lastJobAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {t.grantedFeatures ? (
                      <span className="text-xs text-green-600 font-medium">{t.grantedFeatures.length} features</span>
                    ) : (
                      <span className="text-xs text-gray-400">plan default</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/owner/overrides?tenant=${t.id}`}
                      className="text-xs font-semibold text-green-600 hover:text-green-700"
                    >
                      Override →
                    </Link>
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

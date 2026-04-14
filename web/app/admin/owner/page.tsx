"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Users, TrendingUp, TrendingDown, Minus,
  Activity, GitPullRequest, DollarSign,
  RefreshCw, AlertCircle, Database,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface KPIs {
  tenants: {
    total: number
    newThisMonth: number
    newLastMonth: number
    byPlan: Record<string, number>
    conversionRate: number
  }
  usage: {
    jobsThisMonth: number
    jobsLastMonth: number
    activeTenantsThisMonth: number
    activeTenantsLastMonth: number
    activationRate: number
    totalRepos: number
    totalUsers: number
  }
  revenue: {
    mrr: number
    mrrByPlan: Record<string, number>
    revenueThisMonth: number
    revenueLastMonth: number
    activeSubsCount: number
    failedPaymentsCount: number
  }
}

const PLAN_COLORS: Record<string, string> = {
  FREE: "bg-gray-200",
  PRO:  "bg-blue-400",
  TEAM: "bg-purple-500",
}
const PLAN_TEXT: Record<string, string> = {
  FREE: "text-gray-500",
  PRO:  "text-blue-600",
  TEAM: "text-purple-700",
}

function fmt$(cents: number) {
  if (cents === 0) return "$0"
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function Trend({ now, prev, suffix = "" }: { now: number; prev: number; suffix?: string }) {
  if (prev === 0 && now === 0) return <span className="text-xs text-gray-400">no data</span>
  const delta = now - prev
  const pct = prev > 0 ? Math.round((delta / prev) * 100) : null
  if (delta === 0) return <span className="flex items-center gap-0.5 text-xs text-gray-400"><Minus className="w-3 h-3" /> same as last mo</span>
  const up = delta > 0
  const Icon = up ? TrendingUp : TrendingDown
  const color = up ? "text-green-600" : "text-red-500"
  return (
    <span className={`flex items-center gap-0.5 text-xs ${color}`}>
      <Icon className="w-3 h-3" />
      {pct !== null ? `${up ? "+" : ""}${pct}%` : `${up ? "+" : ""}${delta}${suffix}`} vs last mo
    </span>
  )
}

function KpiCard({
  label, value, sub, trend, icon: Icon, accent, href,
}: {
  label: string; value: string; sub?: string
  trend?: React.ReactNode; icon: React.ElementType; accent: string; href?: string
}) {
  const inner = (
    <div className={`bg-white border border-gray-200 border-l-4 ${accent} rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <p className="text-3xl font-extrabold text-gray-900 mb-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mb-1">{sub}</p>}
      {trend}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>
}

export default function OwnerOverviewPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch("/api/admin/owner/kpis")
      .then((r) => r.json())
      .then(setKpis)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="text-sm text-gray-400 py-8">Loading KPIs…</div>
  if (!kpis) return <div className="text-sm text-red-500 py-8">Failed to load KPIs.</div>

  const { tenants, usage, revenue } = kpis
  const totalPlanned = tenants.total || 1

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-0.5">Owner Dashboard</h1>
          <p className="text-sm text-gray-500">Operator-only console · Stripe test mode</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Revenue row ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Revenue</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="MRR"
            value={fmt$(revenue.mrr)}
            sub={`${revenue.activeSubsCount} active subscription${revenue.activeSubsCount !== 1 ? "s" : ""}`}
            icon={DollarSign}
            accent="border-l-green-500"
          />
          <KpiCard
            label="Revenue this month"
            value={fmt$(revenue.revenueThisMonth)}
            trend={<Trend now={revenue.revenueThisMonth} prev={revenue.revenueLastMonth} />}
            icon={TrendingUp}
            accent="border-l-emerald-400"
          />
          <KpiCard
            label="PRO MRR"
            value={fmt$(revenue.mrrByPlan.PRO ?? 0)}
            sub="$29/mo per seat"
            icon={DollarSign}
            accent="border-l-blue-400"
          />
          <KpiCard
            label="TEAM MRR"
            value={fmt$(revenue.mrrByPlan.TEAM ?? 0)}
            sub="$79/mo per seat"
            icon={DollarSign}
            accent="border-l-purple-500"
          />
        </div>
      </div>

      {/* ── Tenants row ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Tenants</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total tenants"
            value={String(tenants.total)}
            trend={<Trend now={tenants.newThisMonth} prev={tenants.newLastMonth} suffix=" new" />}
            icon={Users}
            accent="border-l-gray-400"
            href="/admin/owner/tenants"
          />
          <KpiCard
            label="Conversion rate"
            value={`${tenants.conversionRate}%`}
            sub={`${tenants.byPlan.PRO + tenants.byPlan.TEAM} paid of ${tenants.total}`}
            icon={TrendingUp}
            accent="border-l-blue-500"
          />
          <KpiCard
            label="New this month"
            value={String(tenants.newThisMonth)}
            trend={<Trend now={tenants.newThisMonth} prev={tenants.newLastMonth} />}
            icon={Users}
            accent="border-l-teal-400"
          />
          <KpiCard
            label="Active (30d)"
            value={`${usage.activationRate}%`}
            sub={`${usage.activeTenantsThisMonth} of ${tenants.total} tenants`}
            trend={<Trend now={usage.activeTenantsThisMonth} prev={usage.activeTenantsLastMonth} />}
            icon={Activity}
            accent="border-l-orange-400"
          />
        </div>
      </div>

      {/* ── Plan distribution bar ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Plan Distribution</p>
        <div className="flex h-4 rounded-full overflow-hidden mb-3 gap-px">
          {(["FREE", "PRO", "TEAM"] as const).map((plan) => {
            const pct = Math.round(((tenants.byPlan[plan] ?? 0) / totalPlanned) * 100)
            if (pct === 0) return null
            return (
              <div
                key={plan}
                className={`${PLAN_COLORS[plan]} transition-all`}
                style={{ width: `${pct}%` }}
                title={`${plan}: ${tenants.byPlan[plan]} (${pct}%)`}
              />
            )
          })}
        </div>
        <div className="flex gap-6">
          {(["FREE", "PRO", "TEAM"] as const).map((plan) => {
            const count = tenants.byPlan[plan] ?? 0
            const pct = Math.round((count / totalPlanned) * 100)
            return (
              <div key={plan} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-sm ${PLAN_COLORS[plan]}`} />
                <span className={`text-sm font-bold ${PLAN_TEXT[plan]}`}>{count}</span>
                <span className="text-xs text-gray-400">{plan} · {pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Usage row ────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Usage</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="PR analyses this month"
            value={String(usage.jobsThisMonth)}
            trend={<Trend now={usage.jobsThisMonth} prev={usage.jobsLastMonth} />}
            icon={GitPullRequest}
            accent="border-l-indigo-400"
          />
          <KpiCard
            label="Repos monitored"
            value={String(usage.totalRepos)}
            icon={Database}
            accent="border-l-cyan-400"
          />
          <KpiCard
            label="Total users"
            value={String(usage.totalUsers)}
            icon={Users}
            accent="border-l-pink-400"
          />
          {revenue.failedPaymentsCount > 0 ? (
            <KpiCard
              label="Failed payments"
              value={String(revenue.failedPaymentsCount)}
              sub="open invoices"
              icon={AlertCircle}
              accent="border-l-red-500"
              href="/admin/owner/events"
            />
          ) : (
            <KpiCard
              label="Failed payments"
              value="0"
              sub="all invoices paid"
              icon={AlertCircle}
              accent="border-l-gray-200"
            />
          )}
        </div>
      </div>

      {/* ── Quick links ──────────────────────────────────────────────────── */}
      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Link href="/admin/owner/tenants" className="text-xs font-semibold text-green-600 hover:text-green-700">Tenant list →</Link>
        <Link href="/admin/owner/overrides" className="text-xs font-semibold text-green-600 hover:text-green-700">Feature overrides →</Link>
        <Link href="/admin/owner/events" className="text-xs font-semibold text-green-600 hover:text-green-700">Stripe event feed →</Link>
      </div>
    </div>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { CreditCard, Zap, BarChart3, TrendingUp, AlertTriangle, Rocket, Crown } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"
import { LicenseStatusCard } from "@/components/billing/LicenseStatusCard"

interface TrialStatus {
  isActive: boolean
  isExpired: boolean
  alreadyUsed: boolean
  daysRemaining: number
  plan: string
  trialExpiresAt: string | null
}

interface BillingData {
  currentMonthCost: number
  currentMonthTokens: number
  currentMonthScans: number
  monthlyBudgetUsd: number | null
  budgetUsagePercent: number | null
  prQuota: { used: number; limit: number | null }
  providerBreakdown: Array<{
    provider: string
    model: string
    scans: number
    tokens: number
    cost: number
  }>
  dailyBreakdown: Array<{
    date: string
    scans: number
    tokens: number
    cost: number
  }>
}

function BudgetStatusBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <Badge variant="outline" className="text-muted-foreground">No limit set</Badge>
  }
  if (pct >= 100) {
    return <Badge variant="destructive">Limit reached — analysis blocked</Badge>
  }
  if (pct >= 80) {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Warning: {pct.toFixed(1)}% used</Badge>
  }
  return <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">{pct.toFixed(1)}% used</Badge>
}

function progressColor(pct: number | null): string {
  if (pct === null) return ""
  if (pct >= 100) return "[&>div]:bg-red-500"
  if (pct >= 80) return "[&>div]:bg-amber-500"
  return "[&>div]:bg-emerald-500"
}

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  PRO: "Pro",
  TEAM: "Team",
}

export default function BillingPage() {
  const { data: session } = useSession()
  const currentPlan = ((session?.user as any)?.plan as string | undefined) ?? "FREE"
  // HYB-06: Determine deployment mode from env (baked in at build time)
  const deploymentMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? "saas"
  const isSaas = deploymentMode === "saas"

  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [budgetInput, setBudgetInput] = useState("")
  const [savedBudget, setSavedBudget] = useState("")   // tracks what's persisted in DB
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [trial, setTrial] = useState<TrialStatus | null>(null)
  const [trialActivating, setTrialActivating] = useState(false)
  const [trialMsg, setTrialMsg] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [stripeError, setStripeError] = useState<string | null>(null)
  const [stripeSuccess, setStripeSuccess] = useState<string | null>(null)
  const [licenseData, setLicenseData] = useState<{
    plan: string; expiresAt: string | null; keyFingerprint: string | null; portalUrl: string | null
  } | null>(null)

  useEffect(() => {
    fetch("/api/billing")
      .then(r => r.json())
      .then(d => {
        setData(d)
        const initial = d.monthlyBudgetUsd !== null ? String(d.monthlyBudgetUsd) : ""
        setBudgetInput(initial)
        setSavedBudget(initial)
        setLoading(false)
      })
      .catch(() => setLoading(false))
    fetch("/api/billing/trial")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTrial(d) })
      .catch(() => null)
    // HYB-06: Fetch license metadata in non-SaaS modes
    if (!isSaas) {
      fetch("/api/billing/license")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setLicenseData(d) })
        .catch(() => null)
    }
  }, [])

  const handleStartTrial = async () => {
    setTrialActivating(true)
    setTrialMsg(null)
    const res = await fetch("/api/billing/trial", { method: "POST" })
    const body = await res.json()
    if (res.ok) {
      setTrial(body)
      setTrialMsg("Pro Trial activated! You now have 14 days of Pro access.")
    } else {
      setTrialMsg(body.reason ?? body.error ?? "Failed to activate trial.")
    }
    setTrialActivating(false)
  }

  const handleUpgrade = async (plan: "pro" | "team") => {
    setCheckoutLoading(true)
    setStripeError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const body = await res.json()
      if (!res.ok) {
        const msg = typeof body.error === "string" ? body.error : JSON.stringify(body.error)
        setStripeError(msg || "Failed to start checkout.")
        return
      }
      if (body.upgraded) {
        // In-place subscription upgrade — no redirect needed, reload page to
        // reflect the new plan once the webhook has updated it
        setStripeSuccess("Plan updated! Refreshing in a moment...")
        setTimeout(() => window.location.reload(), 2500)
        return
      }
      if (body.url) window.location.href = body.url
    } catch {
      setStripeError("Network error. Please try again.")
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleManageSubscription = async () => {
    setPortalLoading(true)
    setStripeError(null)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const body = await res.json()
      if (!res.ok) {
        // No Stripe subscription exists — send them through checkout to create one
        if (res.status === 400 && typeof body.error === "string" && body.error.includes("No Stripe subscription")) {
          window.location.href = "/pricing"
          return
        }
        const msg = typeof body.error === "string" ? body.error : JSON.stringify(body.error)
        setStripeError(msg || "Failed to open billing portal.")
        return
      }
      // Open in a new tab so the user can return to the app after managing
      if (body.url) window.open(body.url, "_blank", "noopener,noreferrer")
    } catch {
      setStripeError("Network error. Please try again.")
    } finally {
      setPortalLoading(false)
    }
  }

  const handleCancelPlan = async () => {
    setCancelLoading(true)
    setStripeError(null)
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" })
      const body = await res.json()
      if (!res.ok) {
        setStripeError(typeof body.error === "string" ? body.error : "Failed to cancel plan.")
        return
      }
      setStripeSuccess("Plan cancelled. Downgraded to Free.")
      setTimeout(() => window.location.reload(), 2000)
    } catch {
      setStripeError("Network error. Please try again.")
    } finally {
      setCancelLoading(false)
      setConfirmCancel(false)
    }
  }

  const handleSaveBudget = async () => {
    setSaving(true)
    setSaveMsg(null)
    const val = budgetInput.trim() === "" ? null : Number(budgetInput)
    const res = await fetch("/api/billing/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyBudgetUsd: val }),
    })
    if (res.ok) {
      const updated = await res.json()
      setData(prev => prev ? {
        ...prev,
        monthlyBudgetUsd: updated.monthlyBudgetUsd,
        budgetUsagePercent: updated.monthlyBudgetUsd
          ? Math.min(100, Math.round((prev.currentMonthCost / updated.monthlyBudgetUsd) * 100 * 100) / 100)
          : null,
      } : prev)
      const newSaved = updated.monthlyBudgetUsd !== null ? String(updated.monthlyBudgetUsd) : ""
      setSavedBudget(newSaved)
      setSaveMsg("Saved")
    } else {
      const err = await res.json()
      setSaveMsg(err.error || "Failed to save")
    }
    setSaving(false)
  }

  const pct = data?.budgetUsagePercent ?? null

  return (
    <div className="w-full min-h-screen bg-background pb-20 font-sans text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-primary mb-2 font-black text-[11px] uppercase tracking-[0.3em]">
            <CreditCard className="h-4 w-4" />
            Usage &amp; Billing
          </div>
          <h1 className="text-3xl font-black tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-1 text-sm">Monitor LLM token consumption and manage your monthly budget.</p>
        </div>

        {/* HYB-06 / DG-BIL-01: License card (client-installed / air-gap) or Stripe card (SaaS) */}
        {!isSaas && licenseData && (
          <LicenseStatusCard
            plan={licenseData.plan}
            expiresAt={licenseData.expiresAt}
            keyFingerprint={licenseData.keyFingerprint}
            portalUrl={licenseData.portalUrl}
            deploymentMode={deploymentMode}
            onUpgrade={handleUpgrade}
            onManageSubscription={handleManageSubscription}
            checkoutLoading={checkoutLoading}
            portalLoading={portalLoading}
            stripeError={stripeError}
            stripeSuccess={stripeSuccess}
          />
        )}

        {/* Subscription Card — SaaS only */}
        {isSaas && <Card>
          <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-black text-foreground">
                  Current Plan:{" "}
                  <span className="text-primary">{PLAN_LABELS[currentPlan] ?? currentPlan}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentPlan === "FREE" && "Upgrade to unlock private repos and more analyses."}
                  {currentPlan === "PRO" && "500 PR analyses/month, 5 repos, 10 seats."}
                  {currentPlan === "TEAM" && "Unlimited analyses and repos. Full enterprise features."}
                </p>
                {stripeError && (
                  <p className="text-xs text-destructive mt-1">{stripeError}</p>
                )}
                {stripeSuccess && (
                  <p className="text-xs text-emerald-500 font-semibold mt-1">{stripeSuccess}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {currentPlan === "FREE" && (
                <>
                  <Button
                    size="sm"
                    disabled={checkoutLoading}
                    onClick={() => handleUpgrade("pro")}
                    className="text-[10px] font-black uppercase tracking-widest h-9 px-4"
                  >
                    {checkoutLoading ? "Redirecting..." : "Upgrade to Pro — $29/mo"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={checkoutLoading}
                    onClick={() => handleUpgrade("team")}
                    className="text-[10px] font-black uppercase tracking-widest h-9 px-4"
                  >
                    {checkoutLoading ? "Redirecting..." : "Upgrade to Team — $79/mo"}
                  </Button>
                  <a href="/pricing" className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">
                    Compare plans
                  </a>
                </>
              )}
              {(currentPlan === "PRO" || currentPlan === "TEAM") && (
                <>
                  {currentPlan === "PRO" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={checkoutLoading}
                      onClick={() => handleUpgrade("team")}
                      className="text-[10px] font-black uppercase tracking-widest h-9 px-4"
                    >
                      {checkoutLoading ? "Redirecting..." : "Upgrade to Team — $79/mo"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={portalLoading}
                    onClick={handleManageSubscription}
                    className="text-[10px] font-black uppercase tracking-widest h-9 px-4"
                  >
                    {portalLoading ? "Opening..." : "Manage Billing"}
                  </Button>
                  {confirmCancel ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Downgrade to Free?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={cancelLoading}
                        onClick={handleCancelPlan}
                        className="text-[10px] font-black uppercase tracking-widest h-9 px-3"
                      >
                        {cancelLoading ? "Cancelling..." : "Yes, cancel"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cancelLoading}
                        onClick={() => setConfirmCancel(false)}
                        className="text-[10px] font-black uppercase tracking-widest h-9 px-3"
                      >
                        Keep plan
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmCancel(true)}
                      className="text-[10px] font-black uppercase tracking-widest h-9 px-4 text-destructive hover:text-destructive"
                    >
                      Cancel Plan
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>}

        {/* Trial CTA — SaaS only, for FREE tenants who haven't used their trial */}
        {isSaas && trial && trial.plan === "FREE" && !trial.alreadyUsed && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Rocket className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-black text-foreground">Start Your Free 14-Day Pro Trial</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Unlock private repos, 500 PR analyses/month, and all Pro features. No credit card required.
                  </p>
                  {trialMsg && (
                    <p className="text-xs mt-1 text-primary font-semibold">{trialMsg}</p>
                  )}
                </div>
              </div>
              <Button
                onClick={handleStartTrial}
                disabled={trialActivating}
                className="shrink-0 btn-premium bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-black uppercase tracking-widest h-9 px-5"
              >
                {trialActivating ? "Activating..." : "Start 14-Day Pro Trial"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Trial active/expired status — SaaS only */}
        {isSaas && trial?.isActive && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary flex items-center gap-2">
            <Zap className="h-4 w-4 shrink-0" />
            Pro Trial active — {trial.daysRemaining} day{trial.daysRemaining !== 1 ? "s" : ""} remaining.
            {trial.trialExpiresAt && (
              <span className="text-muted-foreground font-normal ml-1">
                Expires {new Date(trial.trialExpiresAt).toLocaleDateString()}.
              </span>
            )}
          </div>
        )}
        {isSaas && trial?.isExpired && trial.plan === "FREE" && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Your Pro Trial has expired. Upgrade to restore private repo access and Pro features.
          </div>
        )}
        {isSaas && trialMsg && trial?.isActive && (
          <p className="text-xs text-emerald-500 font-semibold">{trialMsg}</p>
        )}

        {/* Usage data — guarded independently so the subscription card above always shows */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Loading usage data…
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-16 text-destructive text-sm">
            Unable to load usage data.
          </div>
        ) : <>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-bold uppercase tracking-widest">Month Cost</CardDescription>
              <CardTitle className="text-2xl font-black">${data.currentMonthCost.toFixed(4)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">USD this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-bold uppercase tracking-widest">Tokens Used</CardDescription>
              <CardTitle className="text-2xl font-black">{data.currentMonthTokens.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">total tokens</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-bold uppercase tracking-widest">PR Analyses</CardDescription>
              <CardTitle className="text-2xl font-black">
                {data.prQuota.used}
                {data.prQuota.limit !== null && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">/ {data.prQuota.limit}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.prQuota.limit !== null ? (
                <>
                  <Progress
                    value={Math.min(100, (data.prQuota.used / data.prQuota.limit) * 100)}
                    className={`h-1.5 mt-1 ${data.prQuota.used >= data.prQuota.limit ? "[&>div]:bg-red-500" : data.prQuota.used >= data.prQuota.limit * 0.8 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">this month</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">unlimited</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-bold uppercase tracking-widest">Budget Used</CardDescription>
              <CardTitle className="text-2xl font-black">
                {pct !== null ? `${pct.toFixed(1)}%` : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BudgetStatusBadge pct={pct} />
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Daily Cost Chart */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Daily Cost (USD)
                </CardTitle>
                <CardDescription>LLM spend per day this month</CardDescription>
              </CardHeader>
              <CardContent>
                {data.dailyBreakdown.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    No data yet for this month.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data.dailyBreakdown} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v.slice(5)}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${v.toFixed(4)}`}
                        width={70}
                      />
                      <Tooltip
                        formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(6)}`, "Cost"] as [string, string]}
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="cost"
                        stroke="#818cf8"
                        strokeWidth={2.5}
                        fill="url(#costGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Budget Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                Monthly Budget
              </CardTitle>
              <CardDescription>Hard-block analysis when exceeded</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.monthlyBudgetUsd !== null && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>${data.currentMonthCost.toFixed(4)} spent</span>
                    <span>${data.monthlyBudgetUsd} limit</span>
                  </div>
                  <Progress
                    value={pct ?? 0}
                    className={`h-2 ${progressColor(pct)}`}
                  />
                </div>
              )}

              {pct !== null && pct >= 100 && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive font-semibold">
                  Budget limit reached. New PR analyses are blocked until next month or the limit is raised.
                </div>
              )}
              {pct !== null && pct >= 80 && pct < 100 && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-600 font-semibold">
                  Approaching budget limit ({pct.toFixed(1)}% used).
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Label htmlFor="budget-input" className="text-xs font-bold uppercase tracking-widest">
                  Budget (USD/month)
                </Label>
                <Input
                  id="budget-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 50.00 (leave blank for no limit)"
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleSaveBudget}
                  disabled={saving || budgetInput === savedBudget}
                >
                  {saving ? "Saving..." : "Save Budget"}
                </Button>
                {saveMsg && (
                  <p className={`text-xs text-center ${saveMsg === "Saved" ? "text-emerald-500" : "text-destructive"}`}>
                    {saveMsg}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Provider / Model Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Provider &amp; Model Breakdown
            </CardTitle>
            <CardDescription>Token usage and cost by provider this month</CardDescription>
          </CardHeader>
          <CardContent>
            {data.providerBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No usage data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Provider</th>
                      <th className="text-left py-2 px-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Model</th>
                      <th className="text-right py-2 px-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Scans</th>
                      <th className="text-right py-2 px-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Tokens</th>
                      <th className="text-right py-2 px-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Cost (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.providerBreakdown.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3 font-semibold capitalize">{row.provider}</td>
                        <td className="py-2.5 px-3 text-muted-foreground font-mono text-xs">{row.model}</td>
                        <td className="py-2.5 px-3 text-right">{row.scans}</td>
                        <td className="py-2.5 px-3 text-right">{row.tokens.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono">${row.cost.toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        </> /* end usage data guard */}

        {/* MODE-01 AC-2: hosted vs self-hosted boundary note */}
        <Card className="border-border bg-muted/20">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Execution Mode &amp; Service Boundaries</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              LLM usage costs above apply only to <span className="font-semibold text-foreground">Platform Mode</span> and{" "}
              <span className="font-semibold text-foreground">BYOK Cloud</span> (Gemini / OpenAI). In{" "}
              <span className="font-semibold text-foreground">BYOK Local</span> (Ollama) or{" "}
              <span className="font-semibold text-foreground">Sovereign</span> mode, LLM calls run entirely within
              your own infrastructure and are not billed here. Configure your execution mode in{" "}
              <a href="/dashboard/settings" className="underline text-foreground hover:text-primary transition-colors">
                Settings → Intelligence
              </a>.
            </p>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

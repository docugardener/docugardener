// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Check, X, Zap, Building2, Sparkles, ChevronDown, Shield, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"

// ── Pricing data ───────────────────────────────────────────────────────────────

const PLANS = [
    {
        id: "free" as const,
        name: "Free",
        monthlyPrice: 0,
        period: "forever",
        description: "For solo developers exploring DocuGardener.",
        icon: Sparkles,
        badge: null,
        highlight: false,
        features: [
            "1 repository",
            "50 PR analyses / month",
            "1 team seat",
            "Public repos only",
            "3 agent rule sets",
            "Community support",
        ],
        cta: "Get Started",
        ctaVariant: "outline" as const,
    },
    {
        id: "pro" as const,
        name: "Pro",
        monthlyPrice: 29,
        annualMonthlyPrice: 24, // $290/yr = $24.17/mo
        annualPrice: 290,
        period: "/ month",
        description: "For growing teams that ship documentation quality at scale.",
        icon: Zap,
        badge: "Most Popular",
        highlight: true,
        features: [
            "5 repositories",
            "500 PR analyses / month",
            "10 team seats",
            "Private repos",
            "Unlimited agent rule sets",
            "Slack, Jira & Linear integrations",
            "Drift analytics dashboard",
            "Holistic scoring model",
            "Custom prompt tone",
            "VS Code extension",
            "Email support",
        ],
        cta: "Upgrade to Pro",
        ctaVariant: "default" as const,
    },
    {
        id: "team" as const,
        name: "Team",
        monthlyPrice: 79,
        annualMonthlyPrice: 66, // $790/yr = $65.83/mo
        annualPrice: 790,
        period: "/ month",
        description: "For engineering orgs with compliance and governance requirements.",
        icon: Building2,
        badge: null,
        highlight: false,
        features: [
            "Unlimited repositories",
            "Unlimited PR analyses",
            "100 team seats",
            "Everything in Pro",
            "SSO / SAML 2.0",
            "SCIM user provisioning",
            "Compliance templates",
            "Audit log & export (SOC 2 ready)",
            "Priority support",
        ],
        cta: "Upgrade to Team",
        ctaVariant: "default" as const,
    },
    {
        id: "enterprise" as const,
        name: "Enterprise",
        monthlyPrice: null,
        period: "",
        description: "For organisations where data isolation, compliance, and SLAs are non-negotiable.",
        icon: Shield,
        badge: null,
        highlight: false,
        features: [
            "Everything in Team",
            "Dedicated instance — data never leaves your circuit",
            "Air-gapped / self-hosted deployment option",
            "Unlimited seats",
            "Unlimited repositories",
            "Audit log retention — 7 years",
            "Custom policy engine rules",
            "99.9% uptime SLA",
            "Quarterly Business Review",
            "Custom contract, MSA & DPA",
            "Dedicated onboarding & support",
        ],
        cta: "Contact sales",
        ctaVariant: "outline" as const,
    },
]

// ── Feature matrix ─────────────────────────────────────────────────────────────

type CellValue = boolean | string | "locked"

const FEATURE_MATRIX: { group: string; rows: { label: string; free: CellValue; pro: CellValue; team: CellValue; enterprise: CellValue }[] }[] = [
    {
        group: "Core",
        rows: [
            { label: "PR analyses / month",  free: "50",        pro: "500",       team: "Unlimited",  enterprise: "Unlimited" },
            { label: "Repositories",          free: "1",         pro: "5",         team: "Unlimited",  enterprise: "Unlimited" },
            { label: "Team seats",            free: "1",         pro: "10",        team: "100",        enterprise: "Unlimited" },
            { label: "Private repos",         free: false,       pro: true,        team: true,         enterprise: true },
            { label: "Agent rule sets",       free: "3",         pro: "Unlimited", team: "Unlimited",  enterprise: "Unlimited" },
        ],
    },
    {
        group: "AI & Automation",
        rows: [
            { label: "AI Author Mode",        free: true,        pro: true,        team: true,         enterprise: true },
            { label: "Drift analysis",        free: true,        pro: true,        team: true,         enterprise: true },
            { label: "Auto-fix PR generation",free: true,        pro: true,        team: true,         enterprise: true },
            { label: "Holistic scoring",      free: false,       pro: true,        team: true,         enterprise: true },
            { label: "Custom prompt tone",    free: false,       pro: true,        team: true,         enterprise: true },
            { label: "Custom policy rules",   free: false,       pro: false,       team: false,        enterprise: true },
            { label: "Cross-repo siblings",   free: "locked" as CellValue, pro: "locked" as CellValue, team: "Up to 3",  enterprise: "Up to 10" },
        ],
    },
    {
        group: "Integrations",
        rows: [
            { label: "GitHub Issues",         free: true,        pro: true,        team: true,         enterprise: true },
            { label: "Slack",                 free: false,       pro: true,        team: true,         enterprise: true },
            { label: "Jira",                  free: false,       pro: true,        team: true,         enterprise: true },
            { label: "Linear",                free: false,       pro: true,        team: true,         enterprise: true },
            { label: "VS Code extension",     free: false,       pro: true,        team: true,         enterprise: true },
        ],
    },
    {
        group: "Security & Compliance",
        rows: [
            { label: "Audit log",                    free: false, pro: true,  team: true,  enterprise: true },
            { label: "Audit log export",             free: false, pro: false, team: true,  enterprise: true },
            { label: "Audit log retention",          free: false, pro: false, team: "90 days", enterprise: "7 years" },
            { label: "SSO / SAML 2.0",               free: false, pro: false, team: true,  enterprise: true },
            { label: "SCIM provisioning",            free: false, pro: false, team: true,  enterprise: true },
            { label: "Compliance templates",         free: false, pro: false, team: true,  enterprise: true },
            { label: "Dedicated instance",           free: false, pro: false, team: false, enterprise: true },
            { label: "Air-gapped / self-hosted",     free: false, pro: false, team: false, enterprise: true },
        ],
    },
    {
        group: "Support & SLA",
        rows: [
            { label: "Uptime SLA",           free: false,       pro: false,       team: false,        enterprise: "99.9%" },
            { label: "Quarterly Business Review", free: false,  pro: false,       team: false,        enterprise: true },
            { label: "Dedicated onboarding", free: false,       pro: false,       team: false,        enterprise: true },
            { label: "Custom contract & DPA",free: false,       pro: false,       team: false,        enterprise: true },
        ],
    },
]

// ── FAQ data ───────────────────────────────────────────────────────────────────

const FAQS = [
    {
        q: "Do I need a credit card to start?",
        a: "No. The Free plan requires no credit card. You can upgrade to Pro or Team at any time.",
    },
    {
        q: "What counts as a PR analysis?",
        a: "Each pull request that DocuGardener reviews (triggered by a GitHub webhook event) counts as one analysis. Re-checks of the same PR count separately.",
    },
    {
        q: "What happens when I hit my monthly limit?",
        a: "Analysis pauses for the remainder of the billing cycle. You'll see a quota warning in your dashboard and can upgrade any time to resume immediately.",
    },
    {
        q: "Can I upgrade, downgrade, or cancel at any time?",
        a: "Yes. Plan changes take effect immediately. Upgrades are prorated; downgrades apply at the next renewal. You can cancel with one click — no lock-in.",
    },
    {
        q: "Is there an annual discount?",
        a: "Yes — 20% off when billed annually. Pro drops to $24/mo ($290/yr) and Team to $66/mo ($790/yr).",
    },
    {
        q: "Can I self-host instead of using SaaS?",
        a: "DocuGardener is open-source (AGPL-3.0) and fully self-hostable. The SaaS tier pays for hosted infrastructure, automatic upgrades, and support — but self-hosting is always free.",
    },
]

// ── Cell renderer ──────────────────────────────────────────────────────────────

function MatrixCell({ value }: { value: CellValue }) {
    if (value === "locked") return (
        <HoverCard>
            <HoverCardTrigger asChild>
                <span className="flex justify-center cursor-pointer">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
            </HoverCardTrigger>
            <HoverCardContent className="text-xs w-40">Upgrade to TEAM</HoverCardContent>
        </HoverCard>
    )
    if (typeof value === "string") {
        return <span className="text-sm font-semibold text-gray-900">{value}</span>
    }
    return value
        ? <Check className="h-4 w-4 text-green-600 mx-auto" />
        : <X className="h-4 w-4 text-gray-300 mx-auto" />
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PricingPage() {
    const router = useRouter()
    const { data: session } = useSession()
    const currentPlan = (session?.user as any)?.plan as string | undefined
    const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true"
    const [loading, setLoading] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isAnnual, setIsAnnual] = useState(false)
    const [openFaq, setOpenFaq] = useState<number | null>(null)

    const handleUpgrade = async (plan: "pro" | "team") => {
        if (!session) {
            router.push("/api/auth/signin?callbackUrl=/pricing")
            return
        }
        setLoading(plan)
        setError(null)
        try {
            const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan, interval: isAnnual ? "yearly" : "monthly" }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error || "Failed to start checkout. Please try again.")
                return
            }
            if (data.url) window.location.href = data.url
        } catch {
            setError("Network error. Please try again.")
        } finally {
            setLoading(null)
        }
    }

    const handleWaitlist = () => {
        router.push(session ? "/dashboard/billing" : "/api/auth/signin?callbackUrl=/dashboard/billing")
    }

    return (
        <div className="min-h-screen bg-white font-sans text-gray-900">
            <MarketingHeader activePage="pricing" />

            <main className="max-w-5xl mx-auto px-6 py-20">

                {/* ── Hero ─────────────────────────────────────────────────── */}
                <div className="text-center mb-12">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-green-600 mb-3">Pricing</p>
                    <h1 className="text-4xl font-black tracking-tight mb-4 text-gray-900">
                        Keep your docs in sync,<br />at any scale.
                    </h1>
                    <p className="text-gray-500 max-w-xl mx-auto text-sm leading-relaxed mb-8">
                        Start free. Upgrade when your team grows. No credit card required.
                    </p>

                    {/* Annual toggle */}
                    <div className="inline-flex items-center gap-3 bg-gray-100 rounded-full p-1">
                        <button
                            onClick={() => setIsAnnual(false)}
                            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                                !isAnnual ? "bg-white shadow text-gray-900" : "text-gray-500"
                            }`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setIsAnnual(true)}
                            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                                isAnnual ? "bg-white shadow text-gray-900" : "text-gray-500"
                            }`}
                        >
                            Annual
                            <span className="bg-green-100 text-green-700 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full">
                                Save 20%
                            </span>
                        </button>
                    </div>
                </div>

                {!billingEnabled && (
                    <div className="mb-8 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 text-center">
                        <span className="font-semibold">Paid plans are launching soon.</span>{" "}
                        Reserve your spot for early access — no credit card required.
                    </div>
                )}

                {error && (
                    <div className="mb-8 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 text-center">
                        {error}
                    </div>
                )}

                {/* ── Plan cards ───────────────────────────────────────────── */}
                <div className="grid md:grid-cols-4 gap-5 mb-20">
                    {PLANS.map((plan) => {
                        const Icon = plan.icon
                        const isCurrentPlan = currentPlan?.toUpperCase() === plan.id.toUpperCase()
                        const isEnterprise = plan.id === "enterprise"
                        const displayPrice = plan.monthlyPrice === null
                            ? "Custom"
                            : plan.monthlyPrice === 0
                                ? "$0"
                                : isAnnual && (plan as any).annualMonthlyPrice
                                    ? `$${(plan as any).annualMonthlyPrice}`
                                    : `$${plan.monthlyPrice}`
                        const periodLabel = plan.monthlyPrice === null
                            ? "pricing"
                            : plan.monthlyPrice === 0
                                ? "forever"
                                : isAnnual
                                    ? "/ mo, billed annually"
                                    : "/ month"

                        return (
                            <Card
                                key={plan.id}
                                className={`relative flex flex-col ${plan.highlight ? "border-green-500 shadow-lg shadow-green-500/10" : isEnterprise ? "border-gray-800 bg-gray-950 text-white" : "border-gray-200"}`}
                            >
                                {plan.badge && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-green-600 text-white text-[10px] font-black uppercase tracking-widest px-3">
                                            {plan.badge}
                                        </Badge>
                                    </div>
                                )}
                                <CardHeader className="pb-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Icon className={`h-5 w-5 ${isEnterprise ? "text-gray-300" : "text-green-600"}`} />
                                        <span className={`text-sm font-black uppercase tracking-widest ${isEnterprise ? "text-white" : "text-gray-900"}`}>{plan.name}</span>
                                        {!billingEnabled && plan.monthlyPrice !== null && plan.monthlyPrice > 0 && (
                                            <span className="ml-auto text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                Coming soon
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                        <span className={`text-4xl font-black ${isEnterprise ? "text-white" : "text-gray-900"} ${!billingEnabled && plan.monthlyPrice !== null && plan.monthlyPrice > 0 ? "blur-sm select-none" : ""}`}>
                                            {displayPrice}
                                        </span>
                                        <span className={`text-sm ${isEnterprise ? "text-gray-400" : "text-gray-500"}`}>{periodLabel}</span>
                                    </div>
                                    <p className={`text-xs mt-2 leading-relaxed ${isEnterprise ? "text-gray-400" : "text-gray-500"}`}>{plan.description}</p>
                                </CardHeader>
                                <CardContent className="flex flex-col flex-1 gap-6">
                                    <ul className="space-y-2.5 flex-1">
                                        {plan.features.map((f) => (
                                            <li key={f} className={`flex items-start gap-2 text-sm ${isEnterprise ? "text-gray-300" : "text-gray-700"}`}>
                                                <Check className={`h-4 w-4 mt-0.5 shrink-0 ${isEnterprise ? "text-gray-400" : "text-green-500"}`} />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    {isCurrentPlan ? (
                                        <Button variant="outline" disabled className="w-full text-[10px] font-black uppercase tracking-widest">
                                            Current Plan
                                        </Button>
                                    ) : isEnterprise ? (
                                        <a
                                            href="mailto:sales@docugardener.dev"
                                            className="w-full inline-flex items-center justify-center rounded-md border border-gray-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-gray-800 transition-colors"
                                        >
                                            Contact sales →
                                        </a>
                                    ) : plan.id === "free" ? (
                                        <Button
                                            variant={plan.ctaVariant}
                                            className="w-full text-[10px] font-black uppercase tracking-widest"
                                            onClick={() => router.push(session ? "/dashboard" : "/api/auth/signin")}
                                        >
                                            {session ? "Go to Dashboard" : plan.cta}
                                        </Button>
                                    ) : billingEnabled ? (
                                        <Button
                                            variant={plan.ctaVariant}
                                            className="w-full text-[10px] font-black uppercase tracking-widest bg-green-600 hover:bg-green-700"
                                            disabled={loading === plan.id}
                                            onClick={() => handleUpgrade(plan.id as "pro" | "team")}
                                        >
                                            {loading === plan.id ? "Redirecting..." : plan.cta}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant={plan.ctaVariant}
                                            className="w-full text-[10px] font-black uppercase tracking-widest bg-green-600 hover:bg-green-700"
                                            onClick={handleWaitlist}
                                        >
                                            Reserve your spot →
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>

                {/* ── Feature matrix ───────────────────────────────────────── */}
                <section className="mb-20">
                    <h2 className="text-2xl font-black text-center mb-10 text-gray-900">Full feature comparison</h2>
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                    <th className="text-left px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-500 w-2/5">Feature</th>
                                    {["Free", "Pro", "Team"].map((h) => (
                                        <th key={h} className="px-4 py-4 text-center text-xs font-black uppercase tracking-widest text-gray-500">{h}</th>
                                    ))}
                                    <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-widest text-gray-900 bg-gray-100">Enterprise</th>
                                </tr>
                            </thead>
                            <tbody>
                                {FEATURE_MATRIX.map((group, gi) => (
                                    <>
                                        <tr key={`g-${gi}`} className="bg-gray-50/60">
                                            <td colSpan={5} className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                {group.group}
                                            </td>
                                        </tr>
                                        {group.rows.map((row, ri) => (
                                            <tr key={`r-${gi}-${ri}`} className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-3 text-gray-700">{row.label}</td>
                                                <td className="px-4 py-3 text-center"><MatrixCell value={row.free} /></td>
                                                <td className="px-4 py-3 text-center"><MatrixCell value={row.pro} /></td>
                                                <td className="px-4 py-3 text-center"><MatrixCell value={row.team} /></td>
                                                <td className="px-4 py-3 text-center bg-gray-50/80"><MatrixCell value={row.enterprise} /></td>
                                            </tr>
                                        ))}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ── FAQ ──────────────────────────────────────────────────── */}
                <section className="mb-20 max-w-2xl mx-auto">
                    <h2 className="text-2xl font-black text-center mb-10 text-gray-900">Common questions</h2>
                    <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden">
                        {FAQS.map((faq, i) => (
                            <div key={i}>
                                <button
                                    className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                >
                                    <span className="text-sm font-semibold text-gray-900">{faq.q}</span>
                                    <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                                </button>
                                {openFaq === i && (
                                    <div className="px-6 pb-4">
                                        <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Footer note ──────────────────────────────────────────── */}
                <p className="text-center text-xs text-gray-400">
                    All prices in USD. Monthly subscriptions renew monthly; annual subscriptions renew yearly. Cancel anytime.{" "}
                    Payments processed securely by{" "}
                    <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 transition-colors">
                        Stripe
                    </a>.
                </p>
            </main>

            <MarketingFooter />
        </div>
    )
}

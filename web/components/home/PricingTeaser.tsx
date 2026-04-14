"use client"

import { useState } from "react"
import Link from "next/link"

type BillingPeriod = "monthly" | "annual"

interface PlanCard {
  id: string
  name: string
  monthlyPrice: number
  annualPrice: number
  annualTotal: number
  description: string
  highlights: string[]
  cta: string
  ctaHref: string
  featured: boolean
}

export const PLANS: PlanCard[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    annualTotal: 0,
    description: "For individuals and open-source projects.",
    highlights: [
      "1 public repo, 50 PR analyses / month",
      "Core drift detection + triage inbox",
      "AI Author Mode (zero-touch fix for AI PRs)",
      "BYOK — bring your own LLM key",
    ],
    cta: "Get Started",
    ctaHref: "/api/auth/signin",
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 29,
    annualPrice: 24,
    annualTotal: 290,
    description: "For developers and small teams shipping fast.",
    highlights: [
      "5 repos (public + private), 500 analyses / month",
      "Bundled LLM — no API key needed",
      "Slack, Jira & Linear integrations",
      "Agent Governance + analytics + audit log",
    ],
    cta: "Start Pro",
    ctaHref: "/api/auth/signin?plan=pro",
    featured: true,
  },
  {
    id: "team",
    name: "Team",
    monthlyPrice: 79,
    annualPrice: 66,
    annualTotal: 790,
    description: "For teams with compliance and governance requirements.",
    highlights: [
      "Unlimited repos & analyses, 100 seats",
      "SSO / SAML + SCIM provisioning",
      "Audit evidence export + compliance templates",
      "Priority support + DPA on request",
    ],
    cta: "Start Team",
    ctaHref: "/api/auth/signin?plan=team",
    featured: false,
  },
]

export function PricingTeaser() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly")

  return (
    <section
      role="region"
      aria-label="Pricing plans"
      className="py-20 bg-gray-50"
    >
      <div className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
            Pricing
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-4">
            Simple, honest pricing
          </h2>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-200 mt-2">
            <button
              aria-pressed={period === "monthly"}
              onClick={() => setPeriod("monthly")}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                period === "monthly"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Monthly
            </button>
            <button
              aria-pressed={period === "annual"}
              onClick={() => setPeriod("annual")}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                period === "annual"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Annual
              <span className="ml-1.5 text-xs font-bold text-green-600">
                −20%
              </span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {PLANS.map((plan) => {
            const price =
              period === "monthly" ? plan.monthlyPrice : plan.annualPrice
            return (
              <div
                key={plan.id}
                className={`flex flex-col p-6 rounded-xl border bg-white ${
                  plan.featured
                    ? "border-green-500 ring-1 ring-green-500"
                    : "border-gray-200"
                }`}
              >
                {plan.featured && (
                  <span className="self-start text-[10px] font-bold uppercase tracking-widest text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full mb-3">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  {plan.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4">{plan.description}</p>

                {/* Price */}
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-sm text-gray-500">$</span>
                  <span
                    data-testid={`price-${plan.id}-${period}`}
                    className="text-4xl font-extrabold text-gray-900"
                  >
                    {price}
                  </span>
                  {price > 0 && (
                    <span className="text-sm text-gray-500 mb-1">/mo</span>
                  )}
                </div>
                {period === "annual" && plan.annualTotal > 0 && (
                  <p className="text-xs text-gray-400 mb-4">
                    billed ${plan.annualTotal}/year
                  </p>
                )}
                {period === "monthly" && plan.monthlyPrice === 0 && (
                  <p className="text-xs text-gray-400 mb-4">free forever</p>
                )}

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-start gap-2 text-sm text-gray-700"
                    >
                      <span className="text-green-500 font-bold shrink-0 mt-0.5">
                        ✓
                      </span>
                      {h}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.ctaHref}
                  className={`block text-center py-2.5 rounded-lg text-sm font-semibold transition ${
                    plan.featured
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "border border-gray-300 text-gray-700 hover:border-gray-400 bg-white"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            )
          })}
        </div>

        {/* Self-hosted note */}
        <p className="text-center text-sm text-gray-500">
          Self-hosted?{" "}
          <a
            href="https://github.com/docugardener/docugardener"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-gray-700 hover:text-gray-900 underline underline-offset-2"
          >
            Full source on GitHub
          </a>{" "}
          — free forever under the{" "}
          <span className="font-semibold">AGPL</span> license.
        </p>

        {/* Full comparison link */}
        <div className="text-center mt-4">
          <Link
            href="/pricing"
            className="text-sm font-semibold text-green-600 hover:text-green-700 transition"
          >
            See full comparison &rarr;
          </Link>
        </div>
      </div>
    </section>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * PricingTeaser — FEAT-021 Pass 1
 *
 * Compact 3-card pricing teaser. No monthly/annual toggle (lives on /pricing).
 * Reduced from 220 lines to < 100.
 *
 * Prices shown are indicative monthly rates and are blurred pending final
 * price confirmation. Full pricing page retains the toggle, annual discount,
 * and plan comparison table.
 */

import Link from "next/link"
import { Check } from "lucide-react"

interface Plan {
  id: string
  name: string
  price: string
  period: string
  description: string
  highlights: string[]
  cta: string
  ctaHref: string
  featured: boolean
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For individuals and open-source projects.",
    highlights: [
      "1 public repo · 50 PR analyses/mo",
      "Core drift detection + triage inbox",
      "AI Author Mode for AI-authored PRs",
    ],
    cta: "Get started",
    ctaHref: "/auth/signin?signup=1",
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For developers and small teams shipping fast.",
    highlights: [
      "5 repos · 500 analyses/mo",
      "Bundled LLM — no key needed",
      "Slack, Jira & Linear integrations",
      "Agent Governance + audit log",
    ],
    cta: "Start Pro",
    ctaHref: "/auth/signin?plan=pro",
    featured: true,
  },
  {
    id: "team",
    name: "Team",
    price: "$79",
    period: "/month",
    description: "For teams with compliance requirements.",
    highlights: [
      "Unlimited repos · 100 seats",
      "SSO / SAML + SCIM provisioning",
      "Evidence export + compliance templates",
      "Priority support + DPA on request",
    ],
    cta: "Start Team",
    ctaHref: "/auth/signin?plan=team",
    featured: false,
  },
]

export function PricingTeaser() {
  return (
    <section
      aria-label="Pricing"
      className="py-20 bg-gray-50 border-y border-gray-100"
    >
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Pricing</p>
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Start free. Upgrade when you&apos;re ready.
          </h2>
          {/* Prices blurred — final amounts announced at launch */}
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Pricing is being finalised — final amounts announced at launch
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`flex flex-col gap-4 p-6 rounded-xl border bg-white transition ${
                plan.featured
                  ? "border-green-500 shadow-md shadow-green-100/60 ring-1 ring-green-500/20"
                  : "border-gray-200"
              }`}
            >
              <div>
                <div className="flex items-baseline gap-1 mb-1">
                  <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
                  {plan.featured && (
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                      Popular
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-1 min-h-[2.5rem]">
                  <span
                    className="text-3xl font-extrabold text-gray-900 select-none"
                    style={{ filter: "blur(6px)" }}
                    aria-label="Price — to be announced"
                  >
                    {plan.price}
                  </span>
                  <span
                    className="text-xs text-gray-500 select-none"
                    style={{ filter: "blur(3px)" }}
                    aria-hidden
                  >
                    {plan.period}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    TBA
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{plan.description}</p>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                    <Check className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`block text-center text-sm font-semibold px-4 py-2.5 rounded-lg transition ${
                  plan.featured
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-white border border-gray-200 text-gray-900 hover:border-gray-300"
                }`}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/pricing"
            className="text-sm font-semibold text-gray-700 hover:text-gray-900 underline underline-offset-4 transition"
          >
            See full pricing &amp; annual discounts →
          </Link>
        </div>
      </div>
    </section>
  )
}

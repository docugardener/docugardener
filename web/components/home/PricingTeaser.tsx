// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * PricingTeaser — FEAT-021 Pass 1 (de-commercialised 2026-06)
 *
 * Compact 3-card pricing teaser. DocuGardener is pre-revenue and open source:
 * billing is off, so paid tiers show NO price amount and route to self-hosting
 * rather than a waitlist/checkout. The Free tier remains "$0 / forever" and
 * routes to free signup. The standalone /pricing page is intentionally NOT
 * linked from the landing while billing is disabled.
 */

import Link from "next/link"
import { Check } from "lucide-react"

interface Plan {
  id: string
  name: string
  /** Neutral price line. Free shows a real "$0"; paid tiers show no currency figure. */
  priceLabel: string
  /** Period suffix — only rendered for the Free tier. */
  period?: string
  description: string
  highlights: string[]
  cta: string
  ctaHref: string
  /** External (GitHub / docs) link opens in a new tab. */
  ctaExternal?: boolean
  featured: boolean
}

const SELF_HOST_HREF = "/docs/self-hosting"

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "$0",
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
    priceLabel: "Self-host free today",
    description: "For developers and small teams shipping fast.",
    highlights: [
      "5 repos · 500 analyses/mo",
      "Bundled LLM — no key needed",
      "Slack, Jira & Linear integrations",
      "Agent Governance + audit log",
    ],
    cta: "Self-host free →",
    ctaHref: SELF_HOST_HREF,
    featured: true,
  },
  {
    id: "team",
    name: "Team",
    priceLabel: "Self-host free today",
    description: "For teams with compliance requirements.",
    highlights: [
      "Unlimited repos · 100 seats",
      "SSO / SAML + SCIM provisioning",
      "Evidence export + compliance templates",
      "Priority support + DPA on request",
    ],
    cta: "Self-host free →",
    ctaHref: SELF_HOST_HREF,
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
            Free to start. Open source to run yourself.
          </h2>
          <p className="mt-3 text-sm text-gray-500 max-w-md mx-auto">
            DocuGardener is AGPL — self-host the full feature set for free, forever.
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
                  {plan.period ? (
                    <>
                      <span className="text-3xl font-extrabold text-gray-900">
                        {plan.priceLabel}
                      </span>
                      <span className="text-xs text-gray-500">{plan.period}</span>
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-gray-600">
                      {plan.priceLabel}
                    </span>
                  )}
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
                {...(plan.ctaExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
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
            href={SELF_HOST_HREF}
            className="text-sm font-semibold text-gray-700 hover:text-gray-900 underline underline-offset-4 transition"
          >
            Self-host for free →
          </Link>
        </div>
      </div>
    </section>
  )
}

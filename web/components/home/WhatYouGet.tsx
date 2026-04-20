// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * WhatYouGet — FEAT-021 Pass 2
 *
 * Consolidates WhySaaS + FeaturesTeaser into a single section with 4 cards.
 * Card 1 (Zero Ops) covers the hosted-vs-self-hosted positioning that
 * previously lived in a dedicated WhySaaS section. SelfHostedCallout is
 * collapsed into the ClosingSection, not duplicated here.
 *
 * Layout: 2×2 grid on desktop, stacked on mobile.
 */

import Link from "next/link"
import { Zap, GitPullRequest, ShieldCheck, Plug } from "lucide-react"

interface Card {
  icon: typeof Zap
  iconBg: string
  iconColor: string
  title: string
  body: string
  inline?: { text: string; href: string }
}

const CARDS: Card[] = [
  {
    icon: Zap,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    title: "Zero ops, bundled LLM",
    body: "Install from GitHub Marketplace in 60 seconds. No server to provision, no API key to bring — drift analysis works out of the box.",
    inline: {
      text: "Prefer self-hosted? AGPL, free forever →",
      href: "https://github.com/docugardener/docugardener",
    },
  },
  {
    icon: GitPullRequest,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    title: "Drift detection & auto-fix",
    body: "Every PR triggers a full doc analysis. For AI-authored PRs (Copilot, Cursor, Devin), DocuGardener opens and merges the fix automatically. You just approve.",
  },
  {
    icon: ShieldCheck,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    title: "Governance & audit",
    body: "Tamper-evident audit log, RBAC with 4 roles, SSO/SCIM, and evidence export for compliance packages. Policy enforcement from a single source of truth.",
  },
  {
    icon: Plug,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    title: "Integrations where you work",
    body: "Slack drift alerts, Jira ticket creation, agent instruction export for Copilot, Cursor, Claude Code, and Gemini CLI.",
  },
]

export function WhatYouGet() {
  return (
    <section
      role="region"
      aria-label="What you get"
      className="py-20 bg-white"
    >
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
            What you get
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Everything you need to keep docs honest
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto text-sm">
            Hosted on our infra, self-hosted on yours, or a mix of both.
            Same engine, same guarantees.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {CARDS.map((c) => {
            const Icon = c.icon
            return (
              <article
                key={c.title}
                className="flex items-start gap-4 p-5 rounded-xl border border-gray-100 bg-gray-50/60"
              >
                <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${c.iconBg}`}>
                  <Icon className={`w-5 h-5 ${c.iconColor}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1.5">{c.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{c.body}</p>
                  {c.inline && (
                    <a
                      href={c.inline.href}
                      target={c.inline.href.startsWith("http") ? "_blank" : undefined}
                      rel={c.inline.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="mt-2 inline-block text-xs font-semibold text-green-700 hover:text-green-800 transition"
                    >
                      {c.inline.text}
                    </a>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        <div className="text-center">
          <Link
            href="/features"
            className="text-sm font-semibold text-gray-700 hover:text-gray-900 underline underline-offset-4 transition"
          >
            Explore all features →
          </Link>
        </div>
      </div>
    </section>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * HeroSection — FEAT-021 Pass 2
 *
 * Asymmetric hero: left column text + 2 CTAs + 3-item trust strip,
 * right column <HeroVisual /> placeholder.
 *
 * Changes from v1:
 *  - Centered → left-aligned on desktop, mobile stacks
 *  - 3 CTAs (primary + secondary + link) → 2 CTAs (primary + secondary)
 *  - 5-item trust strip → 3-item (most essential)
 *  - Trust-strip checkmarks neutralized to gray (Story 8 prep)
 *  - PostHog landing_cta_clicked events wired (FEAT-011 contract)
 */
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { HeroVisual } from "./HeroVisual"
import { captureEvent } from "@/lib/posthog"

const TRUST_ITEMS = [
  "Drift detection in every PR",
  "Bundled LLM — no key needed",
  "Open source — self-host free",
]

export function HeroSection() {
  return (
    <section
      role="region"
      aria-label="Hero"
      className="py-16 lg:py-20 px-6"
    >
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_auto] lg:gap-12 items-center">
        {/* LEFT — text column */}
        <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 bg-green-50 border border-green-100 text-green-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-6">
            <span>Live</span>
            <span className="text-green-400">&middot;</span>
            <span>GitHub Marketplace</span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 mb-4 leading-[1.1]">
            Keep your docs <span className="text-green-600">in sync</span>
            <br />
            with every pull request.
          </h1>

          <p className="text-base lg:text-lg text-gray-600 mb-8 leading-relaxed">
            DocuGardener detects documentation drift in every PR — and for
            AI-authored PRs, drafts and merges the fix automatically.
            Zero ops. Bundled LLM. GitHub Marketplace install.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-8">
            <Link href="/auth/signin?signup=1">
              <Button
                size="lg"
                className="h-12 px-8 text-base w-full sm:w-auto"
                onClick={() => captureEvent("landing_cta_clicked", { cta: "primary" })}
              >
                Get started free
              </Button>
            </Link>
            <Link href="#demo">
              <Button
                variant="outline"
                size="lg"
                className="h-12 px-8 text-base w-full sm:w-auto"
                onClick={() => captureEvent("landing_cta_clicked", { cta: "secondary" })}
              >
                See How It Works
              </Button>
            </Link>
          </div>

          {/* Trust strip — 3 items, neutral gray (Story 8: not green-accented) */}
          <div
            role="region"
            aria-label="Trust signals"
            className="flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-xs text-gray-500"
          >
            {TRUST_ITEMS.map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <span className="text-gray-400 font-bold">&#10003;</span>
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* RIGHT — visual column */}
        <div className="mt-12 lg:mt-0 lg:w-[480px]">
          <HeroVisual />
        </div>
      </div>
    </section>
  )
}

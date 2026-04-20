// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * ClosingSection — FEAT-021 Pass 2
 *
 * Single closing block replacing:
 *  - FAQTeaser (4 questions)
 *  - SelfHostedCallout (now a one-line band inside this section)
 *  - Previously implicit final CTA (now explicit and primary)
 *
 * Hierarchy: big CTA → 4 FAQs → OSS one-liner → footer.
 */
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Github, ArrowRight } from "lucide-react"
import { faqGroups } from "@/components/home/faqData"
import { captureEvent } from "@/lib/posthog"

const TEASER_IDS = ["q1", "q2", "q3", "q4b"]

export function ClosingSection() {
  const whatWhyGroup = faqGroups.find((g) => g.label === "WHAT & WHY")
  const items = whatWhyGroup?.items.filter((i) => TEASER_IDS.includes(i.id)) ?? []
  const totalQuestions = faqGroups.reduce((n, g) => n + g.items.length, 0)

  return (
    <section
      id="closing"
      aria-label="Get started"
      className="py-20 bg-white"
    >
      <div className="max-w-4xl mx-auto px-6">
        {/* FINAL CTA */}
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-gray-900 mb-4">
            Start keeping your docs honest.
          </h2>
          <p className="text-gray-600 mb-8 max-w-lg mx-auto">
            Connect one repo in 3 minutes. Free plan · 50 PR analyses a month · No credit card.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link href="/auth/signin?signup=1">
              <Button
                size="lg"
                className="h-12 px-8 text-base w-full sm:w-auto"
                onClick={() => captureEvent("landing_cta_clicked", { cta: "primary", location: "closing" })}
              >
                Get started free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/features" className="text-sm font-semibold text-gray-700 hover:text-gray-900 underline underline-offset-4 transition">
              See all features
            </Link>
          </div>
        </div>

        {/* FAQ TEASER */}
        <div id="faq" className="border-t border-gray-100 pt-14">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 text-center mb-2">
            Common questions
          </p>
          <h3 className="text-xl font-bold text-gray-900 text-center mb-8">
            Answers to the things people ask most
          </h3>

          <div className="space-y-6 max-w-2xl mx-auto">
            {items.map((item) => (
              <div key={item.id} className="border-b border-gray-100 pb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">{item.question}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{item.answer}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link
              href="/faq"
              className="text-sm font-semibold text-gray-700 hover:text-gray-900 underline underline-offset-4 transition"
            >
              View all {totalQuestions} questions →
            </Link>
          </div>
        </div>

        {/* OSS ONE-LINER (replaces SelfHostedCallout section entirely) */}
        <div className="mt-16 pt-10 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
          <Github className="w-4 h-4 text-gray-500" />
          <p className="text-sm text-gray-600">
            Prefer to run it yourself? DocuGardener is AGPL — self-host free forever.
          </p>
          <a
            href="https://github.com/docugardener/docugardener"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-green-700 hover:text-green-800 transition"
          >
            View on GitHub →
          </a>
        </div>
      </div>
    </section>
  )
}

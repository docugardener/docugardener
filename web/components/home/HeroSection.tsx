// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { Button } from "@/components/ui/button"

const trustItems = [
  "Drift detection in every PR",
  "Zero-touch fix for AI-authored PRs",
  "Bundled LLM — no API key needed",
  "No code ever stored",
  "Open source — self-host free (AGPL)",
]

export function HeroSection() {
  return (
    <section
      role="region"
      aria-label="Hero"
      className="py-24 text-center px-6"
    >
      <div className="inline-flex items-center gap-2 bg-green-50 border border-green-100 text-green-700 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-8">
        <span>New</span>
        <span className="text-green-400">&middot;</span>
        <span>Managed SaaS + Self-hosted AGPL</span>
      </div>

      <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl mb-4">
        No server. No API key.
        <br />
        <span className="text-green-600">Connect in 3 minutes.</span>
      </h1>

      <p className="max-w-2xl mx-auto text-lg text-gray-600 mb-8">
        DocuGardener detects documentation drift in every PR — and for
        AI-authored PRs, drafts and merges the fix automatically. Zero ops.
        Bundled LLM. GitHub Marketplace install.
      </p>

      <div className="flex justify-center gap-4 mb-10">
        <Link href="/auth/signin?signup=1">
          <Button size="lg" className="h-12 px-8 text-base">
            Get started free
          </Button>
        </Link>
        <Link href="#demo">
          <Button variant="outline" size="lg" className="h-12 px-8 text-base">
            See How It Works
          </Button>
        </Link>
      </div>

      {/* Trust strip */}
      <div
        role="region"
        aria-label="Trust signals"
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-400 max-w-2xl mx-auto"
      >
        {trustItems.map((item) => (
          <span key={item} className="flex items-center gap-1.5">
            <span className="text-green-500 font-bold">&#10003;</span>
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}

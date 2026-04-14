// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { Github } from "lucide-react"

export function SelfHostedCallout() {
  return (
    <section
      aria-label="Self-hosted open source option"
      role="region"
      className="py-16 bg-gray-50 border-y border-gray-100"
    >
      <div className="max-w-3xl mx-auto px-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
          Open Source
        </p>
        <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 mb-4">
          Prefer to run it yourself?
        </h2>
        <p className="text-gray-600 leading-relaxed mb-8 max-w-xl mx-auto">
          DocuGardener is fully open source under the AGPL license. Clone the
          repo, deploy on your own infrastructure, and self-host for free —
          forever. No feature gates, no license checks. Everything in the code
          is yours to use.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/docugardener/docugardener"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:border-gray-400 transition"
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
          <Link
            href="/docs/self-hosting"
            className="text-sm font-semibold text-green-600 hover:text-green-700 transition"
          >
            Self-hosting guide &rarr;
          </Link>
        </div>
      </div>
    </section>
  )
}

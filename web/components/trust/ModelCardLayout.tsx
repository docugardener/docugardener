// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"

export interface ModelCardLayoutProps {
  provider: string
  providerUrl: string
  intendedUse: string
  limitations: string[]
  biasNotes: string
  trainingTransparency: string
  byokNote: string
  lastUpdated: string
  children?: React.ReactNode
}

function CardSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-600 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

export function ModelCardLayout({
  provider,
  providerUrl,
  intendedUse,
  limitations,
  biasNotes,
  trainingTransparency,
  byokNote,
  lastUpdated,
  children,
}: ModelCardLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <MarketingHeader activePage={null} />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <Link
          href="/trust#model-cards"
          className="text-xs text-green-600 hover:underline mb-6 inline-block"
        >
          ← Back to Trust &amp; Compliance
        </Link>

        <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
          Model Card
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
          {provider}
        </h1>
        <p className="text-sm text-gray-400 mb-2">
          Vendor documentation:{" "}
          <a
            href={providerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:underline"
          >
            {providerUrl}
          </a>
        </p>
        <p className="text-sm text-gray-400 mb-12">Last updated: {lastUpdated}</p>

        <CardSection title="Intended Use in DocuGardener">
          <p>{intendedUse}</p>
        </CardSection>

        <CardSection title="Known Limitations">
          <ul className="list-disc pl-5 space-y-1">
            {limitations.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </CardSection>

        <CardSection title="Bias Notes">
          <p>{biasNotes}</p>
        </CardSection>

        <CardSection title="Training Data Transparency">
          <p>{trainingTransparency}</p>
        </CardSection>

        <CardSection title="BYOK Deployment Disclaimer">
          <p>{byokNote}</p>
          <p className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-green-800 text-xs mt-3">
            Regardless of the LLM provider configured, DocuGardener never uses
            customer code or documentation to train AI models, and analysis is
            always ephemeral.
          </p>
        </CardSection>

        {children}

        <div className="mt-12 pt-8 border-t border-gray-100 text-xs text-gray-400 space-y-1">
          <p>
            Questions about this model card?{" "}
            <a
              href="mailto:compliance@docugardener.dev"
              className="text-green-600 hover:underline"
            >
              compliance@docugardener.dev
            </a>
          </p>
          <p>
            See also:{" "}
            <Link href="/trust" className="text-green-600 hover:underline">
              Trust &amp; Compliance Hub
            </Link>{" "}
            ·{" "}
            <Link href="/trust/human-oversight" className="text-green-600 hover:underline">
              Human Oversight Attestation
            </Link>
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}

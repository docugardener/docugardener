// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"

export const metadata = {
  title: "Trust & Compliance — DocuGardener",
  description:
    "DocuGardener's EU AI Act compliance documentation, model cards, sub-processor register, and human-oversight attestation.",
}

const LAST_UPDATED = "2026-04-18"

function Section({
  id,
  title,
  badge,
  children,
}: {
  id: string
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-14 scroll-mt-20">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {badge && (
          <span className="text-xs font-semibold uppercase tracking-widest bg-green-50 text-green-700 border border-green-100 rounded-full px-2 py-0.5">
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-3 text-gray-600 text-sm leading-relaxed">{children}</div>
      <p className="mt-4 text-xs text-gray-400">Last updated: {LAST_UPDATED}</p>
    </section>
  )
}

function TableRow({ cells }: { cells: React.ReactNode[] }) {
  return (
    <tr className="border-t border-gray-100">
      {cells.map((cell, i) => (
        <td key={i} className="py-3 px-4 text-sm text-gray-600 align-top">
          {cell}
        </td>
      ))}
    </tr>
  )
}

export default function TrustPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <MarketingHeader activePage="trust" />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
          Compliance
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
          Trust &amp; AI Act Compliance
        </h1>
        <p className="text-sm text-gray-400 mb-4">
          DocuGardener's transparency documentation for the EU AI Act (Regulation 2024/1689).
        </p>

        {/* Page-level nav */}
        <nav
          aria-label="Section navigation"
          className="mb-12 flex flex-wrap gap-2"
        >
          {[
            ["#overview", "Overview"],
            ["#model-cards", "Model Cards"],
            ["#human-oversight", "Human Oversight"],
            ["#data-processing", "Data Processing"],
            ["#sub-processors", "Sub-processors"],
            ["#incident-response", "Incident Response"],
            ["#download", "Download"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-100 rounded-full px-3 py-1 transition"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* 1. Overview */}
        <Section id="overview" title="1. DocuGardener &amp; the EU AI Act" badge="GPAI">
          <p>
            DocuGardener is classified as a{" "}
            <strong className="text-gray-800">
              General Purpose AI (GPAI) system
            </strong>{" "}
            under Regulation (EU) 2024/1689 (the EU AI Act). It does{" "}
            <em>not</em> fall into any high-risk category listed in Annex III,
            because:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              It operates exclusively in software development workflows, not in
              safety-critical domains (healthcare, law enforcement, critical
              infrastructure, biometrics, education, employment).
            </li>
            <li>
              All AI-generated suggestions are delivered as GitHub Pull Requests
              requiring explicit human review and merge — DocuGardener never
              autonomously modifies production systems.
            </li>
            <li>
              No individual persons are scored, ranked, profiled, or subject to
              automated decisions with legal or similarly significant effect.
            </li>
          </ul>
          <p>
            As a GPAI system, DocuGardener complies with the obligations in
            Chapter V of the EU AI Act, including:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-gray-800">Article 12 — Transparency:</strong>{" "}
              We publish model cards for each supported LLM provider (see
              Section 2 below), disclose intended use and known limitations, and
              maintain this public trust page.
            </li>
            <li>
              <strong className="text-gray-800">
                Article 14 — Human Oversight:
              </strong>{" "}
              All AI outputs require an explicit human decision before taking
              effect. See our{" "}
              <Link href="/trust/human-oversight" className="text-green-600 hover:underline">
                Human Oversight Attestation
              </Link>.
            </li>
            <li>
              <strong className="text-gray-800">
                Article 53 — GPAI obligations:
              </strong>{" "}
              We maintain technical documentation, cooperate with competent
              authorities on request, and provide a public summary of training
              data sourcing for models we operate (hosted mode).
            </li>
          </ul>
          <p className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-green-800 text-xs">
            DocuGardener is a documentation workflow tool, not an autonomous
            decision-making system. It surfaces suggestions; humans decide.
          </p>
        </Section>

        {/* 2. Model Cards */}
        <Section id="model-cards" title="2. Model Cards (Article 12)">
          <p>
            DocuGardener supports four LLM providers. Each provider has a
            dedicated model card describing intended use, known limitations,
            bias considerations, and training data transparency.
          </p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full border border-gray-100 rounded-lg overflow-hidden text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">
                    Provider
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">
                    Deployment Mode
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">
                    Model Card
                  </th>
                </tr>
              </thead>
              <tbody>
                <TableRow
                  cells={[
                    "Google Gemini",
                    "Hosted / BYOK Cloud",
                    <Link
                      key="gemini"
                      href="/trust/model-cards/gemini"
                      className="text-green-600 hover:underline"
                    >
                      View →
                    </Link>,
                  ]}
                />
                <TableRow
                  cells={[
                    "OpenAI (GPT-4 family)",
                    "Hosted / BYOK Cloud",
                    <Link
                      key="openai"
                      href="/trust/model-cards/openai"
                      className="text-green-600 hover:underline"
                    >
                      View →
                    </Link>,
                  ]}
                />
                <TableRow
                  cells={[
                    "Anthropic (Claude family)",
                    "Hosted / BYOK Cloud",
                    <Link
                      key="anthropic"
                      href="/trust/model-cards/anthropic"
                      className="text-green-600 hover:underline"
                    >
                      View →
                    </Link>,
                  ]}
                />
                <TableRow
                  cells={[
                    "Ollama (self-hosted)",
                    "BYOK Local only",
                    <Link
                      key="ollama"
                      href="/trust/model-cards/ollama"
                      className="text-green-600 hover:underline"
                    >
                      View →
                    </Link>,
                  ]}
                />
              </tbody>
            </table>
          </div>
        </Section>

        {/* 3. Human Oversight */}
        <Section id="human-oversight" title="3. Human Oversight (Article 14)">
          <p>
            DocuGardener is designed so that no AI-generated change can reach
            production without an explicit human decision. Every documentation
            suggestion is delivered as a GitHub Pull Request. A human must
            review, approve, and merge the PR before any change takes effect.
          </p>
          <p>
            An optional auto-merge feature exists for teams using AI coding
            agents (Copilot, Cursor, Devin). It is{" "}
            <strong className="text-gray-800">disabled by default</strong>, is
            admin-only, and applies only to AI-authored branches — never to
            human-authored documentation. All auto-merges are audit-logged.
          </p>
          <p>
            <Link
              href="/trust/human-oversight"
              className="text-green-600 hover:underline font-medium"
            >
              Read the full Article 14 Attestation →
            </Link>
          </p>
        </Section>

        {/* 4. Data Processing */}
        <Section id="data-processing" title="4. Data Processing &amp; Retention">
          <p>
            <strong className="text-gray-800">Ephemeral analysis:</strong> Code
            and PR content submitted for analysis is processed in RAM and wiped
            immediately after each analysis job completes. We do not store
            customer source code as long-term application data.
          </p>
          <p>
            <strong className="text-gray-800">No training use:</strong> Customer
            code, documentation, and PR content are never used to train any AI
            model — including DocuGardener's hosted models and any BYOK provider
            you configure. See Section 3 of our{" "}
            <Link href="/privacy" className="text-green-600 hover:underline">
              Privacy Policy
            </Link>.
          </p>
          <p>
            <strong className="text-gray-800">Audit log retention:</strong>{" "}
            Security-relevant actions (triage decisions, role changes, settings
            modifications) are recorded in a tamper-evident audit log retained
            for 90 days (standard plans) or per your plan's retention setting.
            Logs use SHA-256 hash chaining and are exportable.
          </p>
          <p>
            <strong className="text-gray-800">Vector DB (Weaviate):</strong>{" "}
            Used only for ephemeral RAG during analysis. The Weaviate instance
            operates in-memory only with zero-retention policy — no embeddings
            or content are persisted beyond the analysis job.
          </p>
        </Section>

        {/* 5. Sub-processors */}
        <Section id="sub-processors" title="5. Sub-processors">
          <p>
            The following sub-processors are used to operate DocuGardener.
            Enterprise customers may request the full Data Processing Agreement
            by contacting{" "}
            <a
              href="mailto:security@docugardener.dev"
              className="text-green-600 hover:underline"
            >
              security@docugardener.dev
            </a>
            .
          </p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full border border-gray-100 rounded-lg overflow-hidden text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Sub-processor", "Purpose", "Location", "Transfer mechanism"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 font-semibold text-gray-700"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                <TableRow
                  cells={[
                    "Hetzner Online GmbH",
                    "Cloud hosting, VPS, storage",
                    "EU (Germany)",
                    "EU — no transfer",
                  ]}
                />
                <TableRow
                  cells={[
                    "Stripe, Inc.",
                    "Payment processing, billing",
                    "US / EU",
                    "EU SCCs",
                  ]}
                />
                <TableRow
                  cells={[
                    "GitHub, Inc. (Microsoft)",
                    "Source control, OAuth authentication, webhook delivery",
                    "US / EU",
                    "EU SCCs",
                  ]}
                />
                <TableRow
                  cells={[
                    "Weaviate B.V.",
                    "Ephemeral vector DB (in-memory only, zero-retention)",
                    "EU (Netherlands)",
                    "EU — no transfer",
                  ]}
                />
              </tbody>
            </table>
          </div>
        </Section>

        {/* 6. Incident Response */}
        <Section id="incident-response" title="6. Incident Response">
          <p>
            If you discover a security vulnerability, a data breach, or
            AI-related harm attributable to DocuGardener, please contact us
            immediately:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-gray-800">Security incidents:</strong>{" "}
              <a
                href="mailto:security@docugardener.dev"
                className="text-green-600 hover:underline"
              >
                security@docugardener.dev
              </a>
            </li>
            <li>
              <strong className="text-gray-800">AI Act / compliance queries:</strong>{" "}
              <a
                href="mailto:compliance@docugardener.dev"
                className="text-green-600 hover:underline"
              >
                compliance@docugardener.dev
              </a>
            </li>
          </ul>
          <p>
            We will acknowledge reports within 24 hours and aim to provide an
            initial assessment within 72 hours. In the event of a personal data
            breach, we will notify the relevant supervisory authority within 72
            hours of becoming aware, in accordance with{" "}
            <strong className="text-gray-800">GDPR Article 33</strong>.
          </p>
          <p>
            Responsible disclosure reports that follow coordinated disclosure
            practices will not be subject to legal action.
          </p>
        </Section>

        {/* 7. Download */}
        <Section id="download" title="7. Download Compliance Summary">
          <p>
            A one-page PDF summary of DocuGardener's EU AI Act compliance
            position is available for download. This document is suitable for
            sharing with your legal, compliance, or procurement team.
          </p>
          <a
            href="/docs/docugardener-ai-act-summary.pdf"
            download
            className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            AI Act Summary (PDF)
          </a>
          <p className="text-xs text-gray-400 mt-3">
            Document version: {LAST_UPDATED}. Built from{" "}
            <code className="bg-gray-100 px-1 rounded">
              docs/specs/FEAT-014-AI-Act-Compliance-Pack.md
            </code>
            .
          </p>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  )
}

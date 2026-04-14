import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Documentation — DocuGardener",
  description:
    "DocuGardener documentation — automated documentation drift detection for AI-native teams.",
}

const NAV_CARDS = [
  {
    title: "Quick Start",
    description: "Get up and running in 5 minutes with the hosted SaaS. No credit card required.",
    href: "/docs/quickstart",
  },
  {
    title: "Self-Hosting",
    description: "Run DocuGardener on your own infrastructure. AGPL-3.0 licensed, free forever.",
    href: "/docs/self-hosting",
  },
  {
    title: "User Guide",
    description: "Learn how to use the Triage Inbox, configure policies, manage your team, and more.",
    href: "/docs/user-guide",
  },
  {
    title: "Developer Guide",
    description: "Architecture deep-dive, API reference, contributing guide, and extension points.",
    href: "/docs/developer",
  },
]

export default function DocsOverview() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        DocuGardener Documentation
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Everything you need to know about keeping your docs in sync with your code.
      </p>

      {/* ── What is DocuGardener ──────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">What is DocuGardener?</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        DocuGardener is an automated documentation drift detection platform built for AI-native
        development teams. It watches every pull request, compares code changes against your
        existing documentation, and tells you exactly what needs updating — before the PR merges.
      </p>

      {/* ── The Problem ──────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">The Problem</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        AI coding agents like GitHub Copilot, Cursor, and Claude write code faster than any human
        ever could. But they rarely update the docs. The result: your README drifts out of date
        within days, API docs describe endpoints that no longer exist, and onboarding guides
        reference deprecated workflows. DocuGardener bridges that gap by detecting documentation
        drift the moment it happens — at PR time, not weeks later.
      </p>

      {/* ── Key Capabilities ────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Key Capabilities</h2>
      <div className="space-y-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-base font-bold text-gray-800 mb-1">Drift Detection in Every PR</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            DocuGardener analyses every pull request against your documentation and assigns a drift
            score from 0 (perfectly in sync) to 100 (severely outdated). Findings appear as a
            GitHub check run directly in your PR.
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-base font-bold text-gray-800 mb-1">AI Author Mode</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            When a PR is authored by an AI coding agent, DocuGardener can automatically generate
            and merge a documentation fix PR — zero human intervention required. Your AI writes
            code, DocuGardener writes the docs.
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-base font-bold text-gray-800 mb-1">Documentation Policies</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Define rules such as &ldquo;every public API endpoint must have a corresponding docs
            page&rdquo; or &ldquo;README must be updated when dependencies change.&rdquo;
            Violations surface in the Triage Inbox alongside drift findings.
          </p>
        </div>
      </div>

      {/* ── Two Ways to Use ──────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Two Ways to Use DocuGardener</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              &nbsp;
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              SaaS (docugardener.io)
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Self-Hosted (AGPL-3.0)
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Setup</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Sign up, install GitHub App — done in 2 minutes
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Clone repo, run Docker Compose, create GitHub App
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Infrastructure
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Fully managed</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">You manage</td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Cost</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Free / $29 / $79 per month
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Free forever (your infra costs only)
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Data residency
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">EU (Hetzner)</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Wherever you deploy
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Quick navigation ────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">Where to Go Next</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {NAV_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group block border border-gray-200 rounded-lg p-5 hover:border-green-300 hover:shadow-sm transition-all"
          >
            <h3 className="text-base font-bold text-gray-900 group-hover:text-green-600 transition-colors mb-1">
              {card.title}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">{card.description}</p>
          </Link>
        ))}
      </div>
    </>
  )
}

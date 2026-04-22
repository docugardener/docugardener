// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Self-Hosting Overview — DocuGardener Docs",
  description:
    "Run DocuGardener on your own infrastructure. AGPL-3.0 licensed, free forever.",
}

export default function SelfHostingPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Self-Hosting Guide
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Run DocuGardener on your own infrastructure — completely free under the AGPL-3.0 license.
      </p>

      {/* ── Intro ────────────────────────────────────────── */}
      <p className="text-gray-600 leading-relaxed mb-4">
        DocuGardener is released under the{" "}
        <strong>GNU Affero General Public License v3.0 (AGPL-3.0)</strong>. You can clone the
        repository, deploy it on your own servers, and use every feature without paying a license
        fee. The SaaS at{" "}
        <a
          href="https://docugardener.dev"
          className="text-green-600 underline underline-offset-2 hover:text-green-700"
        >
          docugardener.dev
        </a>{" "}
        exists for teams who prefer a managed, zero-ops experience.
      </p>

      {/* ── When to self-host ────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">
        When to Self-Host vs. Use SaaS
      </h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Consideration
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Self-Hosted
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              SaaS
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Data residency</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Full control — deploy anywhere
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">EU (Hetzner)</td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Air-gapped networks</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Supported (use Ollama for LLM)
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Not possible</td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Operational burden</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              You manage infra, backups, upgrades
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Zero-ops</td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Cost</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Free (your infra costs only)
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Free / $29 / $79 per month
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">LLM choice</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Any provider including local Ollama
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              BYOK — bring your own key
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Plan limits</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              None (set <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">QUOTA_OVERRIDE=unlimited</code>)
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Per plan tier</td>
          </tr>
        </tbody>
      </table>

      {/* ── Architecture ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Architecture Overview</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        DocuGardener is composed of two planes that communicate over a shared PostgreSQL database
        and Redis message queue:
      </p>
      <div className="space-y-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-base font-bold text-gray-800 mb-1">Control Plane</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Next.js App Router application with Prisma ORM. Handles authentication (NextAuth),
            the dashboard UI, GitHub App management, team/RBAC, and billing. Connects to
            PostgreSQL.
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-base font-bold text-gray-800 mb-1">Analysis Plane</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Python FastAPI service with RQ (Redis Queue) workers. Receives GitHub webhooks, clones
            repositories, performs AST parsing, generates vector embeddings (Weaviate), and runs
            LLM-powered drift analysis. Connects to PostgreSQL, Redis, and Weaviate.
          </p>
        </div>
      </div>

      {/* ── Deployment Modes ─────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Deployment Modes</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Mode
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Best For
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Guide
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Development (Docker Compose)
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Local development, evaluation, small teams
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              <Link href="/docs/self-hosting/docker" className="text-green-600 underline underline-offset-2 hover:text-green-700">
                Docker Compose guide
              </Link>
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Production (VPS + Caddy)
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Single-server production, small to medium teams
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Coming soon
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Enterprise (Kubernetes / Helm)
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              High availability, horizontal scaling, enterprise compliance
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Coming soon
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Quota override ───────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Removing Plan Limits</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Self-hosted installations can remove all plan-based quotas by setting a single environment
        variable:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
        QUOTA_OVERRIDE=unlimited
      </pre>
      <p className="text-gray-600 leading-relaxed mb-4">
        With this set, there are no limits on the number of PR analyses, repositories, or team
        seats regardless of the plan tier shown in the dashboard.
      </p>

      {/* ── Next steps ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">Next Steps</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/docs/self-hosting/prerequisites"
          className="group block border border-gray-200 rounded-lg p-4 hover:border-green-300 hover:shadow-sm transition-all"
        >
          <h3 className="text-base font-bold text-gray-900 group-hover:text-green-600 transition-colors mb-1">
            Prerequisites
          </h3>
          <p className="text-sm text-gray-500">Software, hardware, and accounts you need.</p>
        </Link>
        <Link
          href="/docs/self-hosting/environment"
          className="group block border border-gray-200 rounded-lg p-4 hover:border-green-300 hover:shadow-sm transition-all"
        >
          <h3 className="text-base font-bold text-gray-900 group-hover:text-green-600 transition-colors mb-1">
            Environment Variables
          </h3>
          <p className="text-sm text-gray-500">Full reference of every configuration option.</p>
        </Link>
        <Link
          href="/docs/self-hosting/docker"
          className="group block border border-gray-200 rounded-lg p-4 hover:border-green-300 hover:shadow-sm transition-all"
        >
          <h3 className="text-base font-bold text-gray-900 group-hover:text-green-600 transition-colors mb-1">
            Docker Compose
          </h3>
          <p className="text-sm text-gray-500">Step-by-step local deployment guide.</p>
        </Link>
        <Link
          href="/docs/self-hosting/observability"
          className="group block border border-gray-200 rounded-lg p-4 hover:border-green-300 hover:shadow-sm transition-all"
        >
          <h3 className="text-base font-bold text-gray-900 group-hover:text-green-600 transition-colors mb-1">
            Observability
          </h3>
          <p className="text-sm text-gray-500">Prometheus metrics, Grafana dashboards, and alert rules.</p>
        </Link>
      </div>
    </>
  )
}

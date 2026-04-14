// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Developer Guide — DocuGardener Docs",
  description:
    "Architecture deep-dive, API reference, contributing guide, and extension points for DocuGardener.",
}

const SECTIONS = [
  {
    title: "Architecture",
    description:
      "Two-plane architecture, data flow from webhook to check run, queue design, and vector database usage.",
    href: "/docs/developer/architecture",
  },
  {
    title: "API Reference",
    description:
      "REST API endpoints exposed by the FastAPI analysis plane and the Next.js control plane.",
    href: "/docs/developer/api-reference",
  },
  {
    title: "Webhooks",
    description:
      "GitHub webhook events DocuGardener listens to, payload handling, and security verification.",
    href: "/docs/developer/webhooks",
  },
  {
    title: "Contributing",
    description:
      "How to set up a development environment, run tests, and submit pull requests.",
    href: "/docs/developer/contributing",
  },
  {
    title: "Running Tests",
    description:
      "Python pytest suite, Vitest frontend tests, and Playwright end-to-end tests.",
    href: "/docs/developer/testing",
  },
]

export default function DeveloperGuidePage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Developer Guide
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        For contributors, self-hosters extending DocuGardener, and teams building integrations.
      </p>

      <p className="text-gray-600 leading-relaxed mb-6">
        DocuGardener is an open-source project licensed under AGPL-3.0. This guide is for
        developers who want to understand the internal architecture, contribute code, build
        integrations, or customise a self-hosted deployment beyond the standard configuration.
      </p>

      {/* ── Tech stack overview ──────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Tech Stack</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Layer
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Technology
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Frontend / Control Plane
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Next.js 14 (App Router), React 18, Tailwind CSS, Prisma ORM
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Authentication
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              NextAuth (GitHub OAuth, email magic link, SAML SSO)
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Backend / Analysis Plane
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Python 3.13, FastAPI, RQ (Redis Queue) workers
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Databases
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              PostgreSQL (shared), Redis (queues), Weaviate (vector embeddings)
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              LLM Providers
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Google Gemini, OpenAI, Anthropic, Ollama (BYOK)
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Monitoring
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Grafana dashboards, structured logging
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Section cards ────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">Sections</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group block border border-gray-200 rounded-lg p-5 hover:border-green-300 hover:shadow-sm transition-all"
          >
            <h3 className="text-base font-bold text-gray-900 group-hover:text-green-600 transition-colors mb-1">
              {section.title}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">{section.description}</p>
          </Link>
        ))}
      </div>

      {/* ── Quick links ──────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Quick Links</h2>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
        <li>
          <strong>Repository:</strong>{" "}
          <a
            href="https://github.com/docugardener/docugardener"
            className="text-green-600 underline underline-offset-2 hover:text-green-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/docugardener/docugardener
          </a>
        </li>
        <li>
          <strong>License:</strong> AGPL-3.0
        </li>
        <li>
          <strong>Issues:</strong>{" "}
          <a
            href="https://github.com/docugardener/docugardener/issues"
            className="text-green-600 underline underline-offset-2 hover:text-green-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Issues
          </a>
        </li>
        <li>
          <strong>Discussions:</strong>{" "}
          <a
            href="https://github.com/docugardener/docugardener/discussions"
            className="text-green-600 underline underline-offset-2 hover:text-green-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Discussions
          </a>
        </li>
      </ul>
    </>
  )
}

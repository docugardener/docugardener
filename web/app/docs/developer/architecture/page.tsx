// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Architecture — DocuGardener Docs",
  description: "System architecture overview for DocuGardener contributors and operators.",
}

export default function ArchitecturePage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Architecture
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        DocuGardener is a two-plane system: a Python analysis engine and a Next.js control plane,
        backed by PostgreSQL and Redis.
      </p>

      {/* ── Service map ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Service Map</h2>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Service</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Tech</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Port</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Role</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["web", "Next.js 14 App Router", "3003", "Dashboard, auth (NextAuth), settings, billing, docs site"],
            ["api", "Python FastAPI", "8000", "Webhook handler, analysis API, health checks"],
            ["worker", "Python RQ", "—", "Async job processor for PR analysis and fix-PR creation"],
            ["scheduler", "APScheduler", "—", "Periodic jobs: stale sweeper (60s), nightly rollup"],
            ["postgres", "PostgreSQL 15", "5433", "Primary database for both planes (shared schema)"],
            ["redis", "Redis 7", "6379", "RQ job queue and caching"],
            ["weaviate", "Weaviate", "8080", "Vector DB for document embeddings (optional)"],
          ].map(([svc, tech, port, role]) => (
            <tr key={svc}>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs text-gray-700 font-medium">{svc}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{tech}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 font-mono text-xs">{port}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{role}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Analysis pipeline ─────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Analysis Pipeline</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        When a pull request is opened or updated in a monitored repository:
      </p>
      <ol className="list-decimal list-inside text-gray-600 space-y-3 mb-6">
        <li>
          <strong>Webhook received</strong> — GitHub sends a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">pull_request</code> event
          to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">POST /webhooks/github</code>. FastAPI validates the HMAC-SHA256 signature and returns 200 immediately.
        </li>
        <li>
          <strong>Job enqueued</strong> — A <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">analyze_pr</code> job is pushed to the
          RQ <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">default</code> queue. Quota is checked before enqueue; exceeded quota
          creates a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">QUOTA_EXCEEDED</code> job and stops.
        </li>
        <li>
          <strong>Worker picks up job</strong> — <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">process_pull_request()</code> in
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs"> src/pipeline/handler.py</code> runs. It clones the PR branch (shallow fallback on
          network error), parses changed files, embeds documents into Weaviate, and calls the LLM for drift analysis.
        </li>
        <li>
          <strong>LLM analysis</strong> — <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">src/agents/verifier.py</code> constructs
          the prompt from code diff + semantic search results and calls the configured LLM provider (Gemini, OpenAI, Anthropic, or Ollama).
          Response is parsed into a structured <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">DriftAnalysis</code> object with per-file scores.
        </li>
        <li>
          <strong>Results stored</strong> — Job record updated in PostgreSQL with <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">status=COMPLETED</code>,
          drift score, reasons, and suggested fixes. The <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">result</code> JSON field stores the full
          analysis payload.
        </li>
        <li>
          <strong>GitHub check run posted</strong> — <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">src/pipeline/reporter.py</code> posts
          a check run on the PR with the drift score, per-file breakdown, and suggested fixes. Always runs in a
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs"> finally</code> block — the check run resolves even if analysis fails.
        </li>
        <li>
          <strong>AI Author Mode (optional)</strong> — If enabled and drift is above threshold, a fix-PR job is enqueued
          to the <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">high</code> priority queue.
        </li>
      </ol>

      {/* ── Database schema ───────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Database Schema (key models)</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Model</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Purpose</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Tenant", "An organisation account. Holds plan, Stripe IDs, workflowConfig (feature grants, quota ceiling), llmConfig (BYOK keys)."],
            ["User", "A member of a tenant. Has role (OWNER/ADMIN/MEMBER/AUDITOR/BILLING_ADMIN)."],
            ["Repository", "A GitHub repository registered for monitoring. enabled flag controls whether events are processed."],
            ["Job", "One PR analysis run. status: PENDING → PROCESSING → COMPLETED / FAILED / QUOTA_EXCEEDED. result JSON holds full analysis payload."],
            ["AuditLog", "Tamper-evident audit chain. SHA-256 hash chains each entry to the previous one."],
          ].map(([model, purpose]) => (
            <tr key={model}>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs text-gray-700 font-medium align-top">{model}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-600 text-sm">
        Full schema: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">web/prisma/schema.prisma</code>
      </p>

      {/* ── Multi-tenancy ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Multi-Tenancy</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Each authenticated GitHub user is provisioned into exactly one <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Tenant</code>.
        All database reads and writes in the Next.js API routes are scoped to the authenticated tenant via NextAuth session.
        The FastAPI backend identifies the tenant from the GitHub App installation ID on the webhook event.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4">
        In <strong>self-hosted single-tenant mode</strong>, <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">SINGLE_TENANT_ID</code> pins
        all backend writes to one tenant, bypassing multi-tenant lookups.
      </p>

      {/* ── LLM routing ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">LLM Routing</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        The LLM provider is configurable per-tenant via <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">tenant.llmConfig</code>.
        The <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">src/agents/llm.py</code> factory resolves the provider at job runtime:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-1 mb-4">
        <li><strong>Hosted</strong> — uses the bundled Gemini key from <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">BUNDLED_GEMINI_KEY</code></li>
        <li><strong>BYOK Cloud</strong> — uses tenant-supplied key for Gemini, OpenAI, Anthropic, or Azure OpenAI</li>
        <li><strong>BYOK Local</strong> — routes to Ollama at the tenant-configured base URL</li>
      </ul>
      <p className="text-gray-600 leading-relaxed text-sm">
        All LLM calls go through <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">_llm_call_with_retry()</code> — exponential backoff
        (max 3 attempts) on transient HTTP errors (429, 502, 503, 504, 529). Per-tenant token-bucket rate limiting (60 req/min) applies on top.
      </p>
    </>
  )
}

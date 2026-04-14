import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "API Reference — DocuGardener Docs",
  description: "REST API reference for the DocuGardener analysis engine.",
}

function Method({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-blue-100 text-blue-700",
    POST: "bg-green-100 text-green-700",
    PATCH: "bg-amber-100 text-amber-700",
    DELETE: "bg-red-100 text-red-700",
  }
  return (
    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded font-mono mr-2 ${colors[method] ?? "bg-gray-100 text-gray-700"}`}>
      {method}
    </span>
  )
}

export default function ApiReferencePage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        API Reference
      </h1>
      <p className="text-lg text-gray-500 mb-4">
        The DocuGardener analysis engine exposes a REST API on port <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">8000</code>.
        All endpoints return JSON. Interactive docs are available at{" "}
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">/docs</code> (Swagger UI) and{" "}
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">/redoc</code> when running in development mode.
      </p>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-8">
        <strong>Authentication:</strong> Most endpoints authenticate via tenant context derived from the GitHub App installation.
        Plugin endpoints require a <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">X-Plugin-Key</code> header.
        Webhook endpoints use HMAC-SHA256 signature verification.
      </div>

      {/* ── Health ────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Health</h2>

      <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="GET" />/health</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">
          Returns service health including database connectivity and component status. Used by Docker health checks.
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 mt-2 text-xs overflow-x-auto">{`{ "status": "healthy", "database": "ok", "redis": "ok" }`}</pre>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg mb-8 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="GET" />/ready</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">
          Readiness probe. Returns 200 when the service is ready to handle requests, 503 during startup.
        </div>
      </div>

      {/* ── Webhooks ──────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Webhooks</h2>

      <div className="border border-gray-200 rounded-lg mb-8 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="POST" />/webhooks/github</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600 space-y-2">
          <p>Receives GitHub App webhook events. Validates <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">X-Hub-Signature-256</code> header using HMAC-SHA256 against <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">GITHUB_WEBHOOK_SECRET</code>. Returns 200 immediately and enqueues analysis asynchronously.</p>
          <p><strong>Handled events:</strong> <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">pull_request</code> (actions: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">opened</code>, <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">synchronize</code>)</p>
          <p><strong>Returns 429</strong> if per-installation rate limit exceeded (20 req/min).</p>
        </div>
      </div>

      {/* ── Triage Inbox ──────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Triage Inbox</h2>

      <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="GET" />/</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">
          Returns all open drift alerts for the tenant. Excludes <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">QUOTA_EXCEEDED</code> jobs.
          Sorted by <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">createdAt DESC</code>.
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="GET" />/{"{job_id}"}</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">
          Returns the full analysis result for a single job including drift reasons, suggested fixes, policy violations,
          and auto-fix status.
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg mb-8 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="PATCH" />/{"{job_id}"}</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600 space-y-2">
          <p>Update the triage status of a job. Used to dismiss, resolve, or mark as reviewed.</p>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs overflow-x-auto">{`{
  "triageStatus": "DISMISSED",  // DISMISSED | RESOLVED | REVIEW_REQUIRED
  "dismissReason": "Not applicable to this PR"
}`}</pre>
        </div>
      </div>

      {/* ── Rules ─────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Agent Rules</h2>

      <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="GET" />/{"{repo_id}"}/rules</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">
          Returns the compiled agent rules for a repository.
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="POST" />/{"{repo_id}"}/rules/generate</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">
          Generates suggested agent rules for a repository by analysing its existing documentation structure using the LLM.
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg mb-8 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="POST" />/{"{repo_id}"}/rules/preview</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">
          Dry-runs a set of agent rules against a sample prompt and returns the rendered output without saving.
        </div>
      </div>

      {/* ── Prompts ───────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Prompts</h2>

      <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="GET" />/prompts/</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">Returns the tenant's active prompt customisations. <strong>Requires PRO+.</strong></div>
      </div>

      <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="POST" />/prompts/</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">Saves a prompt customisation for the tenant. <strong>Requires PRO+.</strong></div>
      </div>

      <div className="border border-gray-200 rounded-lg mb-8 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="POST" />/prompts/reset</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">Resets all prompt customisations to defaults for the tenant. <strong>Requires PRO+.</strong></div>
      </div>

      {/* ── Billing ───────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Billing (internal)</h2>
      <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <code className="text-sm font-mono text-gray-800"><Method method="GET" />/billing/profile</code>
        </div>
        <div className="px-4 py-3 text-sm text-gray-600">Returns the tenant's current plan, granted features, and deployment identity. Proxied by the Next.js API.</div>
      </div>
    </>
  )
}

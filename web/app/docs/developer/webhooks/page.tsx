import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Webhooks — DocuGardener Docs",
  description: "GitHub webhook events handled by DocuGardener and how to configure them.",
}

export default function WebhooksPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Webhooks
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        DocuGardener receives GitHub webhook events at{" "}
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-base font-mono">POST /webhooks/github</code>.
        This page explains event handling, security, and how to test locally.
      </p>

      {/* ── Handled events ───────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Handled Events</h2>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Event</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Action</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">What happens</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["pull_request", "opened", "Enqueues a new PR analysis job. Quota checked first."],
            ["pull_request", "synchronize", "New commits pushed to an existing PR. Re-enqueues analysis."],
            ["pull_request", "reopened", "Treated the same as opened."],
            ["pull_request", "closed / merged", "Ignored — no analysis runs on close."],
          ].map(([event, action, what]) => (
            <tr key={`${event}-${action}`}>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs text-gray-700">{event}</td>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs text-gray-600">{action}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-600 text-sm leading-relaxed mb-6">
        All other event types (push, issues, etc.) are accepted with a 200 OK response and silently ignored.
        This is intentional — GitHub retries non-2xx responses, so always returning 200 prevents noise in the
        GitHub App delivery log.
      </p>

      {/* ── Payload structure ─────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Payload Structure</h2>
      <p className="text-gray-600 leading-relaxed mb-3">
        DocuGardener reads the following fields from the GitHub webhook payload:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-xs font-mono mb-6">
{`{
  "action": "opened",
  "number": 42,
  "pull_request": {
    "number": 42,
    "title": "feat: rename API endpoint",
    "head": {
      "sha": "abc123",           // used for cloning + check run
      "ref": "feat/rename-api"
    },
    "base": {
      "ref": "main",
      "repo": {
        "full_name": "acme/backend",
        "private": false
      }
    }
  },
  "installation": {
    "id": 12345678               // maps to tenant via GitHub App installation
  },
  "repository": {
    "full_name": "acme/backend"
  }
}`}
      </pre>

      {/* ── Security: HMAC ───────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Signature Verification</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Every request from GitHub includes an <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">X-Hub-Signature-256</code> header
        containing an HMAC-SHA256 digest of the raw request body, keyed with your{" "}
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">GITHUB_WEBHOOK_SECRET</code>.
        DocuGardener verifies this before processing. Requests with missing or invalid signatures return 403.
      </p>
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-sm text-amber-800 mb-6">
        <strong>Never skip signature verification in production.</strong> Without it, anyone who knows your webhook URL can
        trigger arbitrary analysis jobs against your quota.
      </div>

      {/* ── Rate limiting ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Rate Limiting</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        A per-installation token-bucket rate limiter allows <strong>20 webhook requests per minute</strong> (burst: 20).
        Requests over the limit return HTTP 429 with a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">Retry-After</code> header.
        GitHub will retry the delivery automatically.
      </p>

      {/* ── Check run lifecycle ───────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">GitHub Check Run Lifecycle</h2>
      <p className="text-gray-600 leading-relaxed mb-3">
        After receiving a webhook, DocuGardener immediately creates a check run in <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">queued</code> state.
        As the analysis progresses, the check run transitions:
      </p>
      <ol className="list-decimal list-inside text-gray-600 space-y-2 mb-6">
        <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">queued</code> → job accepted, waiting for worker</li>
        <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">in_progress</code> → worker started analysis</li>
        <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">completed / success</code> — drift score below threshold</li>
        <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">completed / failure</code> — drift score at or above threshold</li>
        <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">completed / neutral</code> — analysis error or quota exceeded</li>
      </ol>
      <p className="text-gray-600 leading-relaxed text-sm">
        The check run update always runs in a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">finally</code> block, so it resolves even if the analysis fails mid-way.
      </p>

      {/* ── Local testing ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Local Testing</h2>
      <p className="text-gray-600 leading-relaxed mb-3">
        GitHub cannot reach <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">localhost</code>. For local development, use
        a proxy to forward webhooks:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`# Install smee client globally
npm install -g smee-client

# Create a new channel at https://smee.io/new then run:
smee --url https://smee.io/YOUR_CHANNEL --target http://localhost:8000/webhooks/github`}
      </pre>
      <p className="text-gray-600 leading-relaxed text-sm mb-4">
        Set your GitHub App's webhook URL to the smee.io channel URL. In production, set it directly to
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs"> https://your-domain.com/webhooks/github</code>.
      </p>
      <p className="text-gray-600 leading-relaxed text-sm">
        You can replay past deliveries from the <strong>Recent Deliveries</strong> tab in your GitHub App settings
        without needing to open a real pull request.
      </p>
    </>
  )
}

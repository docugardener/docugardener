// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Environment Variables — DocuGardener Docs",
  description:
    "Complete reference of all DocuGardener environment variables for self-hosted deployments.",
}

/* ── Helper for consistent table sections ─────────────────── */
function EnvTable({
  rows,
}: {
  rows: { name: string; required: string; defaultVal: string; description: string }[]
}) {
  return (
    <table className="w-full text-sm border-collapse mb-6">
      <thead>
        <tr>
          <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
            Variable
          </th>
          <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
            Required
          </th>
          <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
            Default
          </th>
          <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
            Description
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td className="px-3 py-2 border border-gray-200">
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono whitespace-nowrap">
                {r.name}
              </code>
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">{r.required}</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              {r.defaultVal === "—" ? (
                <span className="text-gray-400">—</span>
              ) : (
                <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">
                  {r.defaultVal}
                </code>
              )}
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">{r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function EnvironmentPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Environment Variables
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Complete reference of every configuration option available in DocuGardener.
      </p>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-6">
        <strong>Tip:</strong> Copy{" "}
        <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded text-sm font-mono">
          .env.example
        </code>{" "}
        to{" "}
        <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded text-sm font-mono">
          .env
        </code>{" "}
        and fill in the values. Variables marked &ldquo;Yes (prod)&rdquo; are only required in
        production deployments — development mode uses safe fallback defaults.
      </div>

      {/* ── Application ──────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Application</h2>
      <EnvTable
        rows={[
          {
            name: "ENVIRONMENT",
            required: "No",
            defaultVal: "development",
            description:
              "Set to \"production\" for production deployments. Affects logging level and error detail.",
          },
          {
            name: "DEBUG",
            required: "No",
            defaultVal: "false",
            description: "Enable debug-level logging across all services.",
          },
          {
            name: "SECRET_KEY",
            required: "Yes (prod)",
            defaultVal: "dev-fallback",
            description:
              "Encryption key for stored secrets (e.g. GitHub tokens). Minimum 32 characters in production.",
          },
          {
            name: "SINGLE_TENANT_ID",
            required: "Yes (self-hosted)",
            defaultVal: "—",
            description:
              "Tenant UUID for single-tenant mode. All data is scoped to this tenant.",
          },
          {
            name: "DEPLOYMENT_MODE",
            required: "No",
            defaultVal: "client-installed",
            description:
              "\"saas\" or \"client-installed\". Controls billing UI visibility and feature gating source.",
          },
          {
            name: "QUOTA_OVERRIDE",
            required: "No",
            defaultVal: "—",
            description:
              "Set to \"unlimited\" to disable all plan-based quotas. Recommended for self-hosted installs.",
          },
        ]}
      />

      {/* ── GitHub App ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">GitHub App</h2>
      <EnvTable
        rows={[
          {
            name: "GITHUB_APP_ID",
            required: "Yes",
            defaultVal: "—",
            description: "Numeric App ID from your GitHub App's developer settings page.",
          },
          {
            name: "GITHUB_WEBHOOK_SECRET",
            required: "Yes",
            defaultVal: "—",
            description:
              "Webhook secret configured in your GitHub App. Used to verify webhook payloads.",
          },
          {
            name: "GITHUB_PRIVATE_KEY_PATH",
            required: "Yes",
            defaultVal: "./secrets/github-app.pem",
            description: "Path to the .pem private key file generated when creating the GitHub App.",
          },
          {
            name: "GITHUB_ID",
            required: "Yes",
            defaultVal: "—",
            description: "GitHub OAuth App client ID, used by NextAuth for user authentication.",
          },
          {
            name: "GITHUB_SECRET",
            required: "Yes",
            defaultVal: "—",
            description: "GitHub OAuth App client secret, used by NextAuth for user authentication.",
          },
        ]}
      />

      {/* ── LLM Providers ────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">LLM Providers</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Set{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          LLM_PROVIDER
        </code>{" "}
        to choose your default provider. Each tenant can override this via the BYOK settings in the
        dashboard.
      </p>
      <EnvTable
        rows={[
          {
            name: "LLM_PROVIDER",
            required: "Yes",
            defaultVal: "gemini",
            description:
              "Default LLM provider: \"gemini\", \"openai\", \"anthropic\", or \"ollama\".",
          },
          {
            name: "GEMINI_API_KEY",
            required: "If gemini",
            defaultVal: "—",
            description: "Google AI Studio API key for the Gemini provider.",
          },
          {
            name: "GEMINI_MODEL",
            required: "No",
            defaultVal: "gemini-2.0-flash",
            description: "Gemini model name to use for analysis.",
          },
          {
            name: "OPENAI_API_KEY",
            required: "If openai",
            defaultVal: "—",
            description: "OpenAI API key.",
          },
          {
            name: "OPENAI_MODEL",
            required: "No",
            defaultVal: "gpt-4o",
            description: "OpenAI model name to use for analysis.",
          },
          {
            name: "ANTHROPIC_API_KEY",
            required: "If anthropic",
            defaultVal: "—",
            description: "Anthropic API key.",
          },
          {
            name: "ANTHROPIC_MODEL",
            required: "No",
            defaultVal: "claude-sonnet-4-6",
            description: "Claude model name to use for analysis.",
          },
          {
            name: "OLLAMA_BASE_URL",
            required: "If ollama",
            defaultVal: "http://localhost:11434",
            description:
              "Ollama API endpoint. Use http://host.docker.internal:11434 when running the worker in Docker.",
          },
          {
            name: "OLLAMA_MODEL",
            required: "No",
            defaultVal: "llama3.2",
            description: "Ollama model to use for analysis.",
          },
        ]}
      />
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-sm text-amber-800 mb-4">
        <strong>Docker + Ollama:</strong> If the analysis worker runs inside Docker but Ollama runs
        on the host, use{" "}
        <code className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded text-sm font-mono">
          http://host.docker.internal:11434
        </code>{" "}
        as the Ollama base URL. The worker cannot reach{" "}
        <code className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded text-sm font-mono">
          localhost
        </code>{" "}
        from inside a container.
      </div>

      {/* ── Database ─────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Database</h2>
      <EnvTable
        rows={[
          {
            name: "DATABASE_URL",
            required: "Yes",
            defaultVal: "—",
            description:
              "PostgreSQL connection string for the analysis plane (FastAPI). Example: postgresql://user:pass@localhost:5433/docugardener",
          },
          {
            name: "POSTGRES_PASSWORD",
            required: "Yes",
            defaultVal: "—",
            description:
              "Password for the PostgreSQL superuser. Shared between the postgres container and PgBouncer. Must match the password in SQL_DATABASE_URL. New in SCAL-01 — add this to your .env if upgrading from an earlier release.",
          },
          {
            name: "SQL_DATABASE_URL",
            required: "Yes",
            defaultVal: "—",
            description:
              "PostgreSQL connection string used by the Python backend. Must route through PgBouncer (pgbouncer:5432) in Docker Compose, not directly to postgres:5432. PgBouncer runs as a sidecar in the same Docker network and enforces transaction-mode connection pooling.",
          },
          {
            name: "REDIS_URL",
            required: "No",
            defaultVal: "redis://localhost:6379",
            description: "Redis connection string used by RQ for job queuing.",
          },
          {
            name: "WEAVIATE_URL",
            required: "No",
            defaultVal: "http://weaviate:8080",
            description: "Weaviate vector database endpoint for document embeddings.",
          },
        ]}
      />

      {/* ── Web / NextAuth ───────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Web / NextAuth</h2>
      <EnvTable
        rows={[
          {
            name: "NEXTAUTH_URL",
            required: "Yes",
            defaultVal: "—",
            description:
              "Full URL of the web application (e.g. https://your-domain.com). Used for OAuth callback URLs.",
          },
          {
            name: "NEXTAUTH_SECRET",
            required: "Yes",
            defaultVal: "—",
            description:
              "Random string (32+ characters) used for JWT signing. Generate with: openssl rand -base64 32",
          },
          {
            name: "NEXT_PUBLIC_APP_URL",
            required: "No",
            defaultVal: "NEXTAUTH_URL",
            description:
              "Public-facing app URL used for OAuth callbacks. Defaults to NEXTAUTH_URL if not set.",
          },
          {
            name: "NEXT_PUBLIC_DEPLOYMENT_MODE",
            required: "No",
            defaultVal: "client-installed",
            description:
              "\"saas\" or \"client-installed\". Baked into the frontend at build time — controls client-side UI branching.",
          },
        ]}
      />

      {/* ── Analysis ─────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Analysis</h2>
      <EnvTable
        rows={[
          {
            name: "DRIFT_SCORE_THRESHOLD",
            required: "No",
            defaultVal: "30",
            description:
              "Drift score (0-100) above which a finding is flagged. Lower values mean stricter enforcement.",
          },
          {
            name: "MAX_PROCESSING_TIME",
            required: "No",
            defaultVal: "120",
            description:
              "Maximum seconds a worker job can run before being considered timed out.",
          },
          {
            name: "MAX_CHANGED_FILES",
            required: "No",
            defaultVal: "50",
            description:
              "Maximum number of changed files per PR to analyse. PRs exceeding this are partially analysed.",
          },
        ]}
      />

      {/* ── Stripe (SaaS only) ───────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Stripe (SaaS Only)</h2>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-4">
        These variables are only needed if you are running DocuGardener in SaaS mode (
        <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded text-sm font-mono">
          DEPLOYMENT_MODE=saas
        </code>
        ). Self-hosted installations can ignore this section entirely.
      </div>
      <EnvTable
        rows={[
          {
            name: "STRIPE_SECRET_KEY",
            required: "SaaS only",
            defaultVal: "—",
            description: "Stripe secret key for server-side billing operations.",
          },
          {
            name: "STRIPE_PUBLISHABLE_KEY",
            required: "SaaS only",
            defaultVal: "—",
            description: "Stripe publishable key for client-side Checkout embeds.",
          },
          {
            name: "STRIPE_WEBHOOK_SECRET",
            required: "SaaS only",
            defaultVal: "—",
            description: "Stripe webhook signing secret for verifying webhook payloads.",
          },
          {
            name: "STRIPE_PRICE_PRO",
            required: "SaaS only",
            defaultVal: "—",
            description: "Stripe Price ID for the PRO monthly plan.",
          },
          {
            name: "STRIPE_PRICE_TEAM",
            required: "SaaS only",
            defaultVal: "—",
            description: "Stripe Price ID for the TEAM monthly plan.",
          },
        ]}
      />
    </>
  )
}

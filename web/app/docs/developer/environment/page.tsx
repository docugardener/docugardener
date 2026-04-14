// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Environment Variables — DocuGardener Docs",
  description: "Complete reference for all DocuGardener environment variables.",
}

function EnvVar({
  name, required, description, example,
}: {
  name: string; required?: boolean; description: string; example?: string
}) {
  return (
    <tr>
      <td className="px-3 py-2.5 border border-gray-200 align-top">
        <code className="text-xs font-mono text-gray-800 font-semibold">{name}</code>
        {required && (
          <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 align-middle">required</span>
        )}
      </td>
      <td className="px-3 py-2.5 border border-gray-200 text-gray-600 text-sm">
        {description}
        {example && (
          <div className="mt-1 font-mono text-xs text-gray-400">{example}</div>
        )}
      </td>
    </tr>
  )
}

export default function EnvironmentPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Environment Variables
      </h1>
      <p className="text-lg text-gray-500 mb-4">
        DocuGardener has two sets of environment variables: one for the Python analysis engine
        (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-base font-mono">.env</code> at project root) and one for the Next.js web app
        (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-base font-mono">web/.env</code>).
      </p>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-8">
        Copy <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">.env.example</code> → <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">.env</code> and
        <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs"> web/.env.example</code> → <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">web/.env</code> before first run.
        Never commit <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">.env</code> files — they contain secrets.
      </div>

      {/* ── Analysis engine ───────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Analysis Engine (<code className="font-mono text-lg">.env</code>)</h2>

      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Application</h3>
      <table className="w-full text-sm border-collapse mb-6">
        <tbody>
          <EnvVar name="DEPLOYMENT_MODE" description='Deployment mode. Use "saas" for managed SaaS. "air-gap" disables cloud connectivity entirely.' example='DEPLOYMENT_MODE=saas' />
          <EnvVar name="APP_ENV" description='Environment name. Use "production" in prod — enables security checks and disables debug output.' example='APP_ENV=production' />
          <EnvVar name="PORT" description="FastAPI listen port. Default: 8000." example="PORT=8000" />
          <EnvVar name="LOG_LEVEL" description="Python log level: DEBUG, INFO, WARNING, ERROR." example="LOG_LEVEL=INFO" />
        </tbody>
      </table>

      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">GitHub App</h3>
      <table className="w-full text-sm border-collapse mb-6">
        <tbody>
          <EnvVar name="GITHUB_APP_ID" required description="Numeric ID of your GitHub App. Found on the app's settings page." example="GITHUB_APP_ID=123456" />
          <EnvVar name="GITHUB_PRIVATE_KEY_PATH" required description="Path to the GitHub App private key PEM file." example="GITHUB_PRIVATE_KEY_PATH=./secrets/github-app.pem" />
          <EnvVar name="GITHUB_WEBHOOK_SECRET" required description="HMAC secret shared with GitHub for webhook signature verification. Must match the secret configured in the GitHub App settings." />
        </tbody>
      </table>

      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Database &amp; Queue</h3>
      <table className="w-full text-sm border-collapse mb-6">
        <tbody>
          <EnvVar name="SQL_DATABASE_URL" required description="PostgreSQL connection URL used by the Python backend." example="SQL_DATABASE_URL=postgresql://postgres:password@postgres:5432/docugardener-web" />
          <EnvVar name="REDIS_URL" required description="Redis connection URL for the RQ job queue." example="REDIS_URL=redis://localhost:6379/0" />
        </tbody>
      </table>

      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">LLM Provider</h3>
      <table className="w-full text-sm border-collapse mb-6">
        <tbody>
          <EnvVar name="LLM_PROVIDER" required description='Default LLM provider for tenants without BYOK configured. Options: "gemini", "openai", "anthropic", "ollama".' example='LLM_PROVIDER=gemini' />
          <EnvVar name="GEMINI_API_KEY" description="Google Gemini API key. Required when LLM_PROVIDER=gemini." />
          <EnvVar name="GEMINI_MODEL" description='Gemini model name. Default: "gemini-2.0-flash".' />
          <EnvVar name="BUNDLED_GEMINI_KEY" description="Operator-supplied Gemini key used for FREE-tier tenants without BYOK. Separate from your own GEMINI_API_KEY." />
          <EnvVar name="BUNDLED_GEMINI_MODEL" description='Model for bundled (non-BYOK) analysis. Default: "gemini-2.0-flash".' />
          <EnvVar name="OLLAMA_URL" description="Ollama server URL for local LLM inference." example="OLLAMA_URL=http://localhost:11434" />
          <EnvVar name="OLLAMA_MODEL" description='Ollama model name. Default: "llama3".' />
        </tbody>
      </table>

      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Vector Database</h3>
      <table className="w-full text-sm border-collapse mb-6">
        <tbody>
          <EnvVar name="VECTOR_DB_PROVIDER" description='"pinecone" or "weaviate". Default: "pinecone".' />
          <EnvVar name="PINECONE_API_KEY" description="Pinecone API key. Required when VECTOR_DB_PROVIDER=pinecone." />
          <EnvVar name="PINECONE_ENVIRONMENT" description='Pinecone environment. Default: "us-east-1".' />
          <EnvVar name="PINECONE_INDEX_NAME" description='Pinecone index name. Default: "docugardener".' />
          <EnvVar name="WEAVIATE_URL" description="Weaviate server URL. Required when VECTOR_DB_PROVIDER=weaviate." example="WEAVIATE_URL=http://localhost:8080" />
        </tbody>
      </table>

      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Analysis Settings</h3>
      <table className="w-full text-sm border-collapse mb-6">
        <tbody>
          <EnvVar name="DRIFT_SCORE_THRESHOLD" description="Minimum drift score (0–100) that causes the check run to fail. Default: 70." example="DRIFT_SCORE_THRESHOLD=30" />
          <EnvVar name="MAX_PROCESSING_TIME" description="Maximum seconds a job may run before being marked stale by the sweeper. Default: 120." />
          <EnvVar name="TMPFS_PATH" description="Directory for temporary repository clones during analysis. Should be a tmpfs mount in production." example="TMPFS_PATH=/tmp/docugardener" />
        </tbody>
      </table>

      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Security &amp; Billing</h3>
      <table className="w-full text-sm border-collapse mb-8">
        <tbody>
          <EnvVar name="ENCRYPTION_KEY" required description="32-byte hex key for encrypting BYOK API keys at rest. Generate with: openssl rand -hex 32" />
          <EnvVar name="FEEDBACK_HMAC_SECRET" description="HMAC secret for the drift score feedback endpoint." />
          <EnvVar name="STRIPE_SECRET_KEY" description="Stripe secret key for subscription management. Use sk_test_ in development." />
          <EnvVar name="STRIPE_WEBHOOK_SECRET" description="Stripe webhook signing secret (whsec_…) for verifying Stripe events." />
          <EnvVar name="STRIPE_PRICE_PRO" description="Stripe Price ID for the PRO plan (price_…)." />
          <EnvVar name="STRIPE_PRICE_TEAM" description="Stripe Price ID for the TEAM plan (price_…)." />
        </tbody>
      </table>

      {/* ── Web app ───────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Web App (<code className="font-mono text-lg">web/.env</code>)</h2>

      <table className="w-full text-sm border-collapse mb-8">
        <tbody>
          <EnvVar name="DATABASE_URL" required description="PostgreSQL connection URL for Prisma (Next.js side). Same database as the backend but uses a different connection string format." example="DATABASE_URL=postgresql://postgres:password@localhost:5433/docugardener-web?schema=public" />
          <EnvVar name="NEXTAUTH_URL" required description="Canonical URL of the Next.js app. Must match the app's public URL exactly." example="NEXTAUTH_URL=https://app.docugardener.dev" />
          <EnvVar name="NEXTAUTH_SECRET" required description="Random secret for NextAuth session encryption. Generate with: openssl rand -base64 32" />
          <EnvVar name="GITHUB_ID" required description="GitHub OAuth App client ID (for GitHub sign-in, separate from the GitHub App)." />
          <EnvVar name="GITHUB_SECRET" required description="GitHub OAuth App client secret." />
          <EnvVar name="DEPLOYMENT_MODE" description='"saas" or "air-gap". Must match the backend DEPLOYMENT_MODE.' example="DEPLOYMENT_MODE=saas" />
          <EnvVar name="NEXT_PUBLIC_DEPLOYMENT_MODE" description="Public version of DEPLOYMENT_MODE — exposed to the browser for conditional UI rendering." />
          <EnvVar name="GEMINI_API_KEY" description="Gemini key for the web app's own LLM calls (model listing, key validation)." />
          <EnvVar name="BUNDLED_GEMINI_KEY" description="Operator bundled Gemini key — used by the web app for hosted-mode analysis routing." />
          <EnvVar name="STRIPE_SECRET_KEY" description="Stripe secret key for checkout and subscription management from the web layer." />
          <EnvVar name="STRIPE_PRICE_PRO" description="Stripe Price ID for PRO plan checkout." />
          <EnvVar name="STRIPE_PRICE_TEAM" description="Stripe Price ID for TEAM plan checkout." />
          <EnvVar name="OWNER_EMAIL" description="Email address of the operator. When set, enables the /admin/owner console for that user only. Leave unset for self-hosted deployments." example="OWNER_EMAIL=ops@example.com" />
        </tbody>
      </table>
    </>
  )
}

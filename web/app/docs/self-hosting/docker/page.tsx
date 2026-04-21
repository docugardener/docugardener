// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Docker Compose — DocuGardener Docs",
  description:
    "Step-by-step guide to deploying DocuGardener with Docker Compose.",
}

export default function DockerPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Docker Compose Deployment
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Get DocuGardener running locally in under 10 minutes with Docker Compose.
      </p>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-6">
        <strong>Before you start:</strong> Make sure you have met all{" "}
        <Link
          href="/docs/self-hosting/prerequisites"
          className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
        >
          prerequisites
        </Link>
        , including Docker 24+, Node.js 20+, and an LLM API key (or Ollama installed).
      </div>

      {/* ── Step 1 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          1
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Clone the repository</h2>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`git clone https://github.com/docugardener/docugardener.git
cd docugardener`}
          </pre>
        </div>
      </div>

      {/* ── Step 2 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          2
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Configure environment variables</h2>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
            cp .env.example .env
          </pre>
          <p className="text-gray-600 leading-relaxed mt-2">
            Open{" "}
            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
              .env
            </code>{" "}
            in your editor and fill in the required values. At minimum you need:{" "}
            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
              GITHUB_APP_ID
            </code>
            ,{" "}
            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
              GITHUB_WEBHOOK_SECRET
            </code>
            ,{" "}
            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
              LLM_PROVIDER
            </code>{" "}
            plus the corresponding API key, and{" "}
            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
              NEXTAUTH_SECRET
            </code>
            . See the{" "}
            <Link
              href="/docs/self-hosting/environment"
              className="text-green-600 underline underline-offset-2 hover:text-green-700"
            >
              full environment variable reference
            </Link>{" "}
            for details.
          </p>
        </div>
      </div>

      {/* ── Step 3 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          3
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Add the GitHub App private key</h2>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`mkdir -p secrets
chmod 600 secrets/github-app.pem`}
          </pre>
          <p className="text-gray-600 leading-relaxed mt-2">
            Place the PEM file downloaded from your GitHub App settings at{" "}
            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
              secrets/github-app.pem
            </code>
            , then lock down its permissions with the command above.
          </p>
        </div>
      </div>

      {/* ── Step 4 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          4
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Start infrastructure services</h2>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
            docker compose --env-file .env -f docker/docker-compose.yml up -d
          </pre>
          <p className="text-gray-600 leading-relaxed mt-2">
            This starts PostgreSQL, Redis, Weaviate, the FastAPI analysis server, and the RQ
            worker. First run may take a few minutes to pull images.
          </p>
        </div>
      </div>

      {/* ── Step 5 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          5
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Set up the web control plane</h2>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`cd web
npm install
npx prisma migrate dev --name init`}
          </pre>
          <p className="text-gray-600 leading-relaxed mt-2">
            This installs Node.js dependencies and runs database migrations for the Prisma schema.
          </p>
        </div>
      </div>

      {/* ── Step 6 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          6
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Start the web server</h2>
          <p className="text-gray-600 leading-relaxed mb-2">For development:</p>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-2">
            npm run dev
          </pre>
          <p className="text-gray-600 leading-relaxed mb-2">For production:</p>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`npm run build
npm start`}
          </pre>
        </div>
      </div>

      {/* ── Step 7 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          7
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Verify the analysis plane</h2>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
            curl http://localhost:8000/health
          </pre>
          <p className="text-gray-600 leading-relaxed mt-2">
            You should see:{" "}
            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
              {`{"status":"healthy"}`}
            </code>
          </p>
        </div>
      </div>

      {/* ── Step 8 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          8
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Open DocuGardener</h2>
          <p className="text-gray-600 leading-relaxed">
            Navigate to{" "}
            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
              http://localhost:3000
            </code>{" "}
            in your browser and complete the onboarding wizard.
          </p>
        </div>
      </div>

      {/* ── Service map ──────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Service Map</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Service
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Port
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Purpose
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Next.js (web)
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">3000</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Dashboard, auth, settings, billing
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              FastAPI (api)
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">8000</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Webhook handler, analysis API, health checks
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              PostgreSQL
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">5433</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Primary database for both planes
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Redis</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">6379</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Job queue (RQ) and caching
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Weaviate
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">8080</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Vector database for document embeddings
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Grafana
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">3004</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Monitoring dashboards (optional)
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Webhook proxy ────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">
        Local Development: Webhook Proxy
      </h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        GitHub cannot send webhooks to{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          localhost
        </code>
        . For local development, use{" "}
        <a
          href="https://smee.io"
          className="text-green-600 underline underline-offset-2 hover:text-green-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          smee.io
        </a>{" "}
        as a webhook proxy:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`# Install the smee client
npm install -g smee-client

# Create a channel at https://smee.io/new, then run:
smee --url https://smee.io/YOUR_CHANNEL --target http://localhost:8000/api/webhooks/github`}
      </pre>
      <p className="text-gray-600 leading-relaxed mb-4">
        Set your GitHub App&rsquo;s webhook URL to the smee.io channel URL. In production, point
        it directly at your server&rsquo;s{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          /api/webhooks/github
        </code>{" "}
        endpoint.
      </p>

      {/* ── Troubleshooting ──────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Troubleshooting</h2>
      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">
        Container fails to start
      </h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        Check logs with{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          docker compose --env-file .env -f docker/docker-compose.yml logs -f
        </code>
        . Common issues: port conflicts (another service on 5433 or 6379), missing{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          .env
        </code>{" "}
        file, or insufficient disk space for Weaviate.
      </p>
      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">
        Health check returns unhealthy
      </h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        Ensure the database is reachable and migrations have been applied. Check that{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          DATABASE_URL
        </code>{" "}
        in your{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          .env
        </code>{" "}
        matches the PostgreSQL container&rsquo;s credentials.
      </p>
      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">
        Webhooks not arriving
      </h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        Verify the smee proxy is running and the channel URL matches what you configured in your
        GitHub App settings. Check the &ldquo;Recent Deliveries&rdquo; tab in your GitHub App to
        see if GitHub is sending the webhooks successfully.
      </p>
    </>
  )
}

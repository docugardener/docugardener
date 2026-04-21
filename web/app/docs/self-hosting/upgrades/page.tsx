// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Upgrading — DocuGardener Docs",
  description:
    "How to upgrade your self-hosted DocuGardener instance to a new version.",
}

export default function UpgradesPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Upgrading
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        DocuGardener follows semantic versioning. Minor and patch releases are safe to apply with a
        simple pull + restart. Major releases may require a database migration step.
      </p>

      {/* ── Release-specific migration notes ─────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Release-Specific Notes</h2>

      <div className="border border-blue-100 rounded-lg p-5 mb-8 bg-blue-50">
        <h3 className="text-base font-bold text-blue-900 mb-2">SCAL-01 — PgBouncer connection pooler (docker-compose)</h3>
        <p className="text-sm text-blue-800 leading-relaxed mb-3">
          A PgBouncer sidecar was added to the Docker Compose stack. All application services now
          connect to Postgres through PgBouncer on port 5432 (transaction-pool mode) instead of
          directly to the postgres container. This prevents connection exhaustion as worker count
          grows.
        </p>
        <p className="text-sm font-semibold text-blue-900 mb-1">Required .env change:</p>
        <pre className="bg-blue-900 text-blue-100 rounded p-3 text-sm font-mono mb-3">
{`# Add this line — used by both the postgres container and PgBouncer
POSTGRES_PASSWORD=<your_existing_postgres_password>`}
        </pre>
        <p className="text-sm text-blue-800 leading-relaxed">
          If you previously had a hardcoded password in{" "}
          <code className="bg-blue-100 px-1 rounded text-xs">SQL_DATABASE_URL</code> (e.g.{" "}
          <code className="bg-blue-100 px-1 rounded text-xs">@postgres:password@postgres:5432</code>
          ), extract that password value and set it as{" "}
          <code className="bg-blue-100 px-1 rounded text-xs">POSTGRES_PASSWORD</code>. The
          connection URL in the new docker-compose.yml is already template-driven and points to
          pgbouncer — no manual URL change needed once the variable is set.
        </p>
      </div>

      {/* ── Upgrade checklist ────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Standard Upgrade (minor / patch)</h2>

      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          1
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-900 mb-1">Pull the latest code</h3>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`git fetch origin
git checkout main
git pull`}
          </pre>
        </div>
      </div>

      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          2
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-900 mb-1">Update Python dependencies</h3>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`source .venv/bin/activate
pip install -e ".[dev]"`}
          </pre>
        </div>
      </div>

      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          3
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-900 mb-1">Update Node.js dependencies and run migrations</h3>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`cd web
npm install
npx prisma migrate deploy`}
          </pre>
          <p className="text-gray-600 leading-relaxed mt-2 text-sm">
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">prisma migrate deploy</code> applies
            any pending SQL migrations. It is safe to run on every upgrade — it is a no-op if the
            schema is already up to date.
          </p>
        </div>
      </div>

      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          4
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-900 mb-1">Rebuild and restart services</h3>
          <p className="text-gray-600 leading-relaxed mb-2">With Docker Compose:</p>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d`}
          </pre>
          <p className="text-gray-600 leading-relaxed mt-2 mb-2">For the Next.js web server:</p>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`cd web
npm run build
npm start      # or restart your process manager (PM2, systemd, etc.)`}
          </pre>
        </div>
      </div>

      {/* ── Major version upgrades ────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Major Version Upgrades</h2>
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-sm text-amber-800 mb-6">
        <strong>Always read the release notes</strong> before upgrading across a major version.
        Major releases may rename environment variables, change the database schema significantly,
        or require a data migration script.
      </div>
      <p className="text-gray-600 leading-relaxed mb-4">
        The release notes for each major version are published in the GitHub repository under
        <strong> Releases</strong>. They include:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
        <li>Breaking changes and removed environment variables</li>
        <li>Required data migration steps (if any)</li>
        <li>New required environment variables</li>
        <li>Rollback instructions</li>
      </ul>

      {/* ── Rollback ─────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Rolling Back</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        To roll back to a previous version:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`git checkout v1.2.3        # the version you want to roll back to
npx prisma migrate deploy  # ensure schema matches the old version
# then rebuild and restart`}
      </pre>
      <div className="bg-red-50 border border-red-100 rounded-lg p-4 text-sm text-red-800">
        <strong>Database rollback.</strong> If the upgrade ran a migration that added columns or
        tables, rolling back the code without rolling back the migration is usually safe (Prisma
        ignores unknown columns). However if the migration <em>removed</em> columns, rolling back
        may require manual SQL. Check the migration files in{" "}
        <code className="bg-red-100 px-1.5 py-0.5 rounded text-xs">web/prisma/migrations/</code>.
      </div>

      {/* ── Keeping up to date ───────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Keeping Up To Date</h2>
      <p className="text-gray-600 leading-relaxed mb-2">
        Watch the GitHub repository for new releases. You can enable GitHub release notifications
        by clicking <strong>Watch → Custom → Releases</strong> on the repository page.
      </p>
      <p className="text-gray-600 leading-relaxed">
        Alternatively, add a Dependabot or Renovate configuration to your infrastructure repo to
        receive automated pull requests when a new Docker image tag is published.
      </p>
    </>
  )
}

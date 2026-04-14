// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contributing — DocuGardener Docs",
  description:
    "How to contribute to DocuGardener — development setup, testing, code style, and PR guidelines.",
}

export default function ContributingPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Contributing Guide
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Thank you for considering a contribution to DocuGardener. Here is everything you need to
        get started.
      </p>

      {/* ── License ──────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">License</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        DocuGardener is licensed under the{" "}
        <strong>GNU Affero General Public License v3.0 (AGPL-3.0)</strong>. By submitting a pull
        request, you agree that your contributions will be licensed under the same terms. If your
        employer has a CLA requirement, please check with them before contributing.
      </p>

      {/* ── How to contribute ────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">How to Contribute</h2>
      <ol className="list-decimal list-inside text-gray-600 space-y-2 mb-4">
        <li>
          <strong>Fork</strong> the repository on GitHub.
        </li>
        <li>
          <strong>Create a branch</strong> from{" "}
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            main
          </code>{" "}
          with a descriptive name (e.g.{" "}
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            fix/inbox-filter-bug
          </code>{" "}
          or{" "}
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            feat/slack-notifications
          </code>
          ).
        </li>
        <li>
          <strong>Make your changes</strong> — keep commits focused and well-described.
        </li>
        <li>
          <strong>Open a pull request</strong> against{" "}
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            main
          </code>
          . Describe what you changed and why.
        </li>
        <li>
          <strong>Wait for review.</strong> A maintainer will review your PR, suggest changes if
          needed, and merge when ready.
        </li>
      </ol>

      {/* ── Development setup ────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Development Setup</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        The development setup is the same as the{" "}
        <Link
          href="/docs/self-hosting/docker"
          className="text-green-600 underline underline-offset-2 hover:text-green-700"
        >
          Docker Compose deployment
        </Link>
        , with the addition of test tooling.
      </p>

      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">
        1. Start infrastructure
      </h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`git clone https://github.com/docugardener/docugardener.git
cd docugardener
cp .env.example .env
# Edit .env with your values
docker-compose -f docker/docker-compose.yml up -d`}
      </pre>

      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">
        2. Set up the Python backend
      </h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`python3.13 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"`}
      </pre>

      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">
        3. Set up the Next.js frontend
      </h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`cd web
npm install
npx prisma migrate dev --name init
npm run dev`}
      </pre>

      {/* ── Running tests ────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Running Tests</h2>

      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">Python tests (pytest)</h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`source .venv/bin/activate
pytest`}
      </pre>
      <p className="text-gray-600 leading-relaxed mb-4">
        To run a specific test file or test function:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`pytest tests/unit/test_drift_analysis.py
pytest tests/unit/test_drift_analysis.py::test_score_calculation -v`}
      </pre>

      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">Frontend tests (Vitest)</h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`cd web
npx vitest run`}
      </pre>
      <p className="text-gray-600 leading-relaxed mb-4">
        For watch mode during development:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
        npx vitest
      </pre>

      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">
        End-to-end tests (Playwright)
      </h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`cd web
E2E_ENABLED=1 npx playwright test`}
      </pre>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-4">
        <strong>Note:</strong> E2E tests require all services to be running (Docker Compose + web
        dev server). Set{" "}
        <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded text-sm font-mono">
          E2E_ENABLED=1
        </code>{" "}
        to enable them — they are skipped by default to avoid accidental runs against production.
      </div>

      {/* ── Code style ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Code Style</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Language
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Formatter / Linter
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Command
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Python</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Ruff (format + lint)
            </td>
            <td className="px-3 py-2 border border-gray-200">
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                ruff check . &amp;&amp; ruff format .
              </code>
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              TypeScript
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              ESLint + Prettier
            </td>
            <td className="px-3 py-2 border border-gray-200">
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                cd web &amp;&amp; npx eslint . &amp;&amp; npx prettier --check .
              </code>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── PR checklist ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Pull Request Checklist</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Before requesting a review, make sure your PR meets the following criteria:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
        <li>
          All existing tests pass (
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            pytest
          </code>{" "}
          +{" "}
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            npx vitest run
          </code>
          ).
        </li>
        <li>New features include tests.</li>
        <li>No regressions — existing functionality still works as expected.</li>
        <li>
          Documentation is updated if you added a new feature, changed behaviour, or modified
          environment variables.
        </li>
        <li>Code style checks pass (Ruff for Python, ESLint + Prettier for TypeScript).</li>
        <li>
          Commit messages are clear and describe the &ldquo;why&rdquo;, not just the
          &ldquo;what.&rdquo;
        </li>
      </ul>

      {/* ── Community ────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Community</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        We use GitHub for all project communication:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
        <li>
          <strong>Bugs:</strong>{" "}
          <a
            href="https://github.com/docugardener/docugardener/issues"
            className="text-green-600 underline underline-offset-2 hover:text-green-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Issues
          </a>{" "}
          — search existing issues before opening a new one.
        </li>
        <li>
          <strong>Feature requests &amp; questions:</strong>{" "}
          <a
            href="https://github.com/docugardener/docugardener/discussions"
            className="text-green-600 underline underline-offset-2 hover:text-green-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Discussions
          </a>{" "}
          — great for open-ended conversations and RFCs.
        </li>
      </ul>

      {/* ── Good first issues ────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Good First Issues</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        New to the project? Look for issues tagged{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          good first issue
        </code>{" "}
        on GitHub. These are smaller, well-scoped tasks that are ideal for first-time contributors.
      </p>
    </>
  )
}

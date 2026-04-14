import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Running Tests — DocuGardener Docs",
  description: "How to run the DocuGardener test suite: Python, Vitest, and Playwright.",
}

export default function TestingPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Running Tests
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        DocuGardener has three test suites: Python unit + integration tests (pytest), frontend
        component tests (Vitest), and end-to-end browser tests (Playwright).
      </p>

      {/* ── Python tests ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Python Tests (pytest)</h2>
      <p className="text-gray-600 leading-relaxed mb-3">
        The Python test suite covers the analysis pipeline, LLM provider integrations, quota
        enforcement, RQ job handling, and API routes.
      </p>

      <h3 className="text-base font-bold text-gray-900 mb-2">Setup</h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`# From the project root
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"`}
      </pre>

      <h3 className="text-base font-bold text-gray-900 mb-2">Running</h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`# All tests
source .venv/bin/activate && pytest

# Specific test file
pytest tests/unit/test_anthropic_provider.py

# Specific test
pytest tests/unit/test_rq_stability.py::TestRQStability::test_priority_queues

# With output
pytest -s -v`}
      </pre>

      <h3 className="text-base font-bold text-gray-900 mb-2">Test structure</h3>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Path</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">What it covers</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["tests/unit/", "Pure logic: LLM clients, quota, rate limiter, pipeline stages, HMAC, rules compiler"],
            ["tests/integration/", "API routes hitting a real test DB (PostgreSQL must be running)"],
            ["tests/e2e/", "Full end-to-end flows (requires E2E_ENABLED=1 and a running stack)"],
            ["tests/conftest.py", "Root fixtures — stubs gitpython on macOS where Xcode licence is absent"],
          ].map(([path, desc]) => (
            <tr key={path}>
              <td className="px-3 py-2 border border-gray-200 font-mono text-xs text-gray-700 align-top">{path}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-8">
        <strong>Known pre-existing failures:</strong> ~42 tests require a running PostgreSQL or Redis instance, or use deprecated
        Google GenAI SDK methods. These are infrastructure-only failures and do not indicate code regressions.
        Run <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">pytest -m "not integration"</code> to skip DB-dependent tests.
      </div>

      {/* ── Vitest ────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Frontend Tests (Vitest)</h2>
      <p className="text-gray-600 leading-relaxed mb-3">
        Component tests for Next.js UI. Covers feature gating, settings forms, LLM config chip UX,
        audit log, billing banners, and API route handlers.
      </p>

      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`cd web

# Run all tests once
npx vitest run

# Watch mode (dev)
npx vitest

# Single file
npx vitest run __tests__/llm-provider-chips.test.tsx

# Coverage report
npx vitest run --coverage`}
      </pre>

      <h3 className="text-base font-bold text-gray-900 mb-2">Test files location</h3>
      <p className="text-gray-600 leading-relaxed mb-3">
        Tests live alongside their source files as <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">*.test.tsx</code> /
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs"> *.test.ts</code>, or in <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">web/__tests__/</code>.
      </p>

      <h3 className="text-base font-bold text-gray-900 mb-2">Mocking gotchas</h3>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-8">
        <li>Use <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">vi.clearAllMocks()</code> in <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">beforeEach</code>,
          not <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">vi.resetAllMocks()</code> — reset removes spy implementations.</li>
        <li>When mocking <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">lucide-react</code>, include <strong>every</strong> icon the component imports — a missing icon mock throws at render time.</li>
        <li>Prisma client must be mocked with <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">vi.mock("@/lib/prisma")</code> in route handler tests.</li>
      </ul>

      {/* ── Playwright ────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">End-to-End Tests (Playwright)</h2>
      <p className="text-gray-600 leading-relaxed mb-3">
        Browser-level tests covering full user flows: login, repo setup, triage inbox, plan gating,
        and settings.
      </p>

      <h3 className="text-base font-bold text-gray-900 mb-2">Prerequisites</h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`cd web
npx playwright install --with-deps chromium`}
      </pre>

      <h3 className="text-base font-bold text-gray-900 mb-2">Running</h3>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`# The full stack must be running first (make dev-up from project root)

# Run all E2E tests
npx playwright test

# Run with UI (headed)
npx playwright test --headed

# Single spec
npx playwright test e2e/specs/01-auth.spec.ts

# View test report
npx playwright show-report`}
      </pre>

      <h3 className="text-base font-bold text-gray-900 mb-2">Dev login</h3>
      <p className="text-gray-600 leading-relaxed mb-6">
        E2E tests use the <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">dev-login</code> NextAuth provider
        (not <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">credentials</code>). The login email placeholder is
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono"> user@test.local</code>.
      </p>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        <strong>Known pre-existing E2E failures:</strong> SPEC-RBAC-03, SPEC-SSO-01/02, SPEC-TEAM-02,
        SPEC-GAPE-01/02 fail due to missing infrastructure (Okta, multi-seat setup). 37/51 pass in a
        standard local environment.
      </div>
    </>
  )
}

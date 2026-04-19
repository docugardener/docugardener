// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Documentation Policies — DocuGardener Docs",
  description:
    "Define and enforce documentation policies that every pull request must satisfy.",
}

export default function PoliciesPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Documentation Policies
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Policies are rules that every pull request must satisfy before it can be considered
        documentation-healthy. They go beyond drift detection to encode your team&rsquo;s
        standards.
      </p>

      {/* ── What is a policy ──────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">What Is a Policy?</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        A drift score captures <em>how out-of-date</em> your docs are. Policies capture
        <em> what must always be true</em> regardless of score. Examples:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
        <li>Every public API endpoint must have a corresponding Markdown page in <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">docs/api/</code>.</li>
        <li>Every function exported from <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">src/lib/</code> must have a docstring.</li>
        <li>The <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">CHANGELOG.md</code> must be updated in every PR that touches <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">src/</code>.</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-6">
        When a policy is violated, DocuGardener adds a <strong>Policy Violation</strong> section to
        the GitHub check run and Triage Inbox entry, listing each rule that was broken and the
        specific files involved.
      </p>

      {/* ── Policy types ──────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">Policy Types</h2>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Type</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Plan</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Coverage rule", "Every file matching a source glob must have a corresponding docs file.", "FREE+"],
            ["Docstring rule", "Every exported symbol in a source file must have a docstring.", "PRO+"],
            ["CHANGELOG rule", "The CHANGELOG must be updated when specified paths are modified.", "FREE+"],
            ["Custom LLM rule", "A free-text prompt evaluated by the LLM against each PR. Flexible but slower.", "TEAM+"],
          ].map(([type, desc, plan]) => (
            <tr key={type}>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium align-top">{type}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{desc}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{plan}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Creating a policy ─────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">Creating a Policy</h2>
      <ol className="list-decimal list-inside text-gray-600 space-y-3 mb-6">
        <li>Open <strong>Settings → Policies</strong> and click <strong>New policy</strong>.</li>
        <li>Select a policy type from the dropdown.</li>
        <li>Fill in the required fields (source glob, docs glob, severity, name).</li>
        <li>
          Choose the <strong>Severity</strong>:
          <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
            <li><strong>Warning</strong> — violation is noted in the check run but does not cause it to fail.</li>
            <li><strong>Error</strong> — violation causes the check run to fail.</li>
          </ul>
        </li>
        <li>Select which repositories the policy applies to (all or a specific subset).</li>
        <li>Click <strong>Save</strong>. The policy takes effect on the next PR.</li>
      </ol>

      {/* ── Policy file (advanced) ───────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Policy File (Advanced)</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        You can also define policies in a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">.docugardener.yml</code> file
        checked into the repository root. This is useful for keeping policy definitions in version
        control alongside the code they govern.
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`# .docugardener.yml
policies:
  - name: API docs coverage
    type: coverage
    source: src/api/**/*.py
    docs: docs/api/**/*.md
    severity: error

  - name: CHANGELOG required
    type: changelog
    source: src/**
    changelog: CHANGELOG.md
    severity: warning`}
      </pre>
      <p className="text-gray-600 leading-relaxed text-sm">
        Policies defined in <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.docugardener.yml</code> override
        any policies configured in the dashboard for that repository.
      </p>

      {/* ── Exemptions ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Exemptions</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        To exempt a specific file or directory from a policy, add it to the policy&rsquo;s
        <strong> Ignore paths</strong> list in the dashboard or under the <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">ignore</code> key
        in the YAML file:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-4">
{`policies:
  - name: API docs coverage
    type: coverage
    source: src/api/**/*.py
    docs: docs/api/**/*.md
    severity: error
    ignore:
      - src/api/internal/**   # internal endpoints, no public docs needed
      - src/api/_health.py`}
      </pre>
    </>
  )
}

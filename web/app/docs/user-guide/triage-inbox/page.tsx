// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Triage Inbox — DocuGardener Docs",
  description:
    "Review, fix, or dismiss drift findings in the DocuGardener Triage Inbox.",
}

export default function TriageInboxPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Triage Inbox
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Your central queue for reviewing and resolving documentation drift findings.
      </p>

      {/* ── What is the inbox ────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">What Is the Triage Inbox?</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        The Triage Inbox is a prioritised list of all unresolved drift findings across your
        monitored repositories. Every time DocuGardener analyses a pull request and finds
        documentation drift above the threshold, a finding appears here. Think of it as a to-do
        list for your documentation health.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4">
        Each item in the inbox shows the repository name, PR title, drift score, affected files,
        and the current status.
      </p>

      {/* ── Status chips ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Status Chips</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Every finding has a status chip indicating where it is in the resolution workflow:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Status
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Meaning
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                Review required
              </span>
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              The finding is new and needs human review. No action has been taken yet.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                AI working
              </span>
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              DocuGardener is generating a fix PR. This typically takes 30 -- 60 seconds.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                Fix ready
              </span>
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              A fix PR has been created and is ready for review or has been auto-merged.
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Actions ──────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Available Actions</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Click on any finding to open the detail panel. From there you can take one of the following
        actions:
      </p>

      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">Apply Fix</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        DocuGardener generates exact Markdown diffs for the affected files. Click{" "}
        <strong>Apply fix</strong> to have DocuGardener open a pull request with the suggested
        documentation changes. The PR is linked back to the original finding for traceability.
      </p>

      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">Dismiss with Reason</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        If a finding is a false positive or not relevant, dismiss it with a reason. Dismissed
        findings are removed from the inbox but remain in the audit log. Common dismiss reasons
        include &ldquo;false positive&rdquo;, &ldquo;intentional divergence&rdquo;, and
        &ldquo;will fix later.&rdquo;
      </p>

      <h3 className="text-base font-bold text-gray-800 mt-6 mb-2">Mark No Update Needed</h3>
      <p className="text-gray-600 leading-relaxed mb-4">
        If the documentation is actually correct and the drift score is misleading, mark the
        finding as &ldquo;no update needed.&rdquo; This teaches DocuGardener about your
        documentation conventions over time.
      </p>

      {/* ── Bulk actions ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Bulk Actions</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Select multiple findings using the checkboxes on the left side of each row, then use the
        bulk action bar that appears at the top of the list. You can bulk dismiss or bulk mark as
        &ldquo;no update needed.&rdquo;
      </p>

      {/* ── Filters ──────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Filters</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        The inbox supports several filters to help you focus on what matters:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Filter
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Repository
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Show findings from a specific repository only.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Severity
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Filter by drift score range (low, medium, high).
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Status</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Show only findings with a specific status (Review required, AI working, Fix ready).
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Policy violations ────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Policy Violations</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        If you have documentation policies configured, violations appear alongside drift findings
        in the inbox. Policy violations are visually distinct — they show the policy name and a
        description of what was violated. Resolution options are the same: apply a fix, dismiss, or
        mark as acceptable.
      </p>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-4">
        <strong>Tip:</strong> Policy violations have a &ldquo;Policy next steps&rdquo; panel in
        the detail view that explains exactly what needs to change to satisfy the policy.
      </div>
    </>
  )
}

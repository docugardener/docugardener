// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"

export const metadata = {
  title: "Human Oversight Attestation (Article 14) — DocuGardener",
  description:
    "DocuGardener's Article 14 EU AI Act attestation — how humans remain in control of every AI-suggested documentation change.",
}

const LAST_UPDATED = "2026-04-18"

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-3 text-gray-600 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

export default function HumanOversightPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <MarketingHeader activePage={null} />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <Link
          href="/trust#human-oversight"
          className="text-xs text-green-600 hover:underline mb-6 inline-block"
        >
          ← Back to Trust &amp; Compliance
        </Link>

        <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
          EU AI Act — Article 14
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
          Human Oversight Attestation
        </h1>
        <p className="text-sm text-gray-400 mb-4">Last updated: {LAST_UPDATED}</p>
        <p className="text-sm text-gray-500 mb-12 border-l-4 border-green-200 pl-4">
          This document attests to DocuGardener's implementation of human oversight measures
          as required by Article 14 of Regulation (EU) 2024/1689 (the EU AI Act) for General
          Purpose AI (GPAI) systems.
        </p>

        {/* 1. The Human-in-the-Loop Model */}
        <Section id="hitl-model" title="1. The Human-in-the-Loop Model">
          <p>
            DocuGardener is architected so that every AI-generated documentation suggestion
            requires an explicit human decision before it can take effect. The workflow is:
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              A developer opens a Pull Request on GitHub making code changes.
            </li>
            <li>
              DocuGardener's analysis pipeline detects potential documentation drift — places
              where the code change is inconsistent with existing documentation.
            </li>
            <li>
              DocuGardener generates a suggested documentation fix and opens a{" "}
              <strong className="text-gray-800">separate Pull Request</strong> on GitHub
              containing only the suggested change.
            </li>
            <li>
              A human team member reviews the AI-generated PR using normal GitHub code review
              tools: they can read the diff, request modifications, leave comments, approve,
              or close (reject) the PR.
            </li>
            <li>
              The documentation change is merged into the codebase{" "}
              <strong className="text-gray-800">only if a human explicitly merges the PR</strong>.
              DocuGardener never pushes directly to a protected branch.
            </li>
          </ol>
          <p className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-green-800 text-xs mt-2">
            The Pull Request mechanism is a structural human oversight control, not a
            procedural policy. DocuGardener has no API access to merge its own PRs. The GitHub
            branch protection model enforces this at the platform level.
          </p>
        </Section>

        {/* 2. What DG Never Does Automatically */}
        <Section id="never-automatic" title="2. What DocuGardener Never Does Automatically">
          <p>
            The following actions are architecturally prohibited — they are not configurable
            options that could be accidentally enabled:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-gray-800">Direct push to main/master.</strong> DocuGardener
              only creates branches and opens PRs. It never pushes commits directly to a
              protected branch.
            </li>
            <li>
              <strong className="text-gray-800">
                Editing files in a repository without a PR.
              </strong>{" "}
              All changes are delivered as PR diffs. There is no "silent edit" mode.
            </li>
            <li>
              <strong className="text-gray-800">Modifying non-documentation files.</strong>{" "}
              DocuGardener's PRs contain only documentation file changes (Markdown, RST,
              AsciiDoc, etc.). Code files are never modified.
            </li>
            <li>
              <strong className="text-gray-800">
                Accessing repository content outside of analysis.
              </strong>{" "}
              DocuGardener clones the repository only when a webhook event triggers analysis
              and discards the clone immediately after.
            </li>
          </ul>
        </Section>

        {/* 3. Auto-Merge Feature Disclosure */}
        <Section id="auto-merge" title="3. Auto-Merge Feature Disclosure">
          <p>
            DocuGardener includes an optional auto-merge feature intended for teams that use
            AI coding agents (e.g. GitHub Copilot, Cursor, Devin) to generate code. This
            feature allows DocuGardener's documentation fix PRs to be merged automatically
            when they accompany an AI-authored code change.
          </p>
          <p>
            <strong className="text-gray-800">
              This feature is disabled by default for all tenants.
            </strong>
          </p>
          <p>All of the following conditions must be met for auto-merge to occur:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Auto-merge must be explicitly enabled by an organisation Admin in DocuGardener
              Settings → AI Configuration. Non-admin roles cannot enable this feature.
            </li>
            <li>
              The <code className="bg-gray-100 px-1 rounded text-xs">autoMergeAiDocs: true</code>{" "}
              flag must be set in the tenant's DocuGardener configuration.
            </li>
            <li>
              The triggering Pull Request must be identified as AI-authored (i.e. the PR
              author matches a configured AI agent identity, or the branch name matches a
              known AI agent pattern such as{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">copilot/</code>,{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">cursor/</code>, or{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">devin/</code>
              ).
            </li>
            <li>
              Auto-merge applies <strong className="text-gray-800">only</strong> to
              DocuGardener's own documentation-fix PRs — never to the triggering AI-authored
              code PR itself, and never to any human-authored PR.
            </li>
          </ul>
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 mt-2">
            <p className="text-amber-800 text-xs font-medium mb-1">
              When auto-merge is enabled:
            </p>
            <ul className="text-amber-700 text-xs list-disc pl-4 space-y-1">
              <li>Every auto-merged PR is recorded in the audit log with actor, timestamp, and commit SHA.</li>
              <li>Auto-merged changes can be reverted by opening a new PR reverting the merge commit.</li>
              <li>The feature can be disabled at any time from Settings, taking effect immediately for future PRs.</li>
              <li>A notification is sent to the organisation's configured notification channel whenever an auto-merge occurs.</li>
            </ul>
          </div>
        </Section>

        {/* 4. Audit Trail */}
        <Section id="audit-trail" title="4. Audit Trail">
          <p>
            Every action taken by DocuGardener — and by users interacting with DocuGardener —
            is recorded in a tamper-evident audit log. The audit log provides the evidence
            trail required by Article 12 (record-keeping) and supports Article 14 oversight
            obligations.
          </p>
          <p>
            <strong className="text-gray-800">What is logged:</strong>
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>All triage actions (approve, dismiss, defer) with actor and timestamp</li>
            <li>All auto-merge events with PR reference and triggering commit SHA</li>
            <li>Role and permission changes</li>
            <li>Settings and configuration changes (including auto-merge enable/disable)</li>
            <li>Evidence exports and report downloads</li>
            <li>Login events and session activity</li>
          </ul>
          <p>
            <strong className="text-gray-800">Integrity mechanism:</strong> Audit log entries
            are chained using SHA-256 hashes (each entry includes the hash of the previous
            entry) to detect any tampering or deletion of records.
          </p>
          <p>
            <strong className="text-gray-800">Retention:</strong> Audit logs are retained for
            a minimum of 90 days on standard plans. Enterprise plans support configurable
            retention periods. Logs are exportable by organisation Admins in CSV format from
            the Audit Log page.
          </p>
          <p className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-green-800 text-xs">
            The audit log can be used to demonstrate compliance with Article 14 oversight
            requirements to competent authorities. DocuGardener will cooperate with
            supervisory authority investigations on request.
          </p>
        </Section>

        {/* 5. Contact */}
        <Section id="contact" title="5. Contact">
          <p>
            For questions about DocuGardener's Article 14 compliance, human oversight
            architecture, or to request technical documentation for a supervisory authority:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-gray-800">AI Act / compliance queries:</strong>{" "}
              <a
                href="mailto:compliance@docugardener.dev"
                className="text-green-600 hover:underline"
              >
                compliance@docugardener.dev
              </a>
            </li>
            <li>
              <strong className="text-gray-800">Security incidents:</strong>{" "}
              <a
                href="mailto:security@docugardener.dev"
                className="text-green-600 hover:underline"
              >
                security@docugardener.dev
              </a>
            </li>
          </ul>
          <p className="mt-4">
            See also:{" "}
            <Link href="/trust" className="text-green-600 hover:underline">
              Trust &amp; Compliance Hub
            </Link>{" "}
            ·{" "}
            <Link href="/trust#model-cards" className="text-green-600 hover:underline">
              Model Cards
            </Link>
          </p>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  )
}

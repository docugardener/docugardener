// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "User Guide — DocuGardener Docs",
  description:
    "Learn how to use DocuGardener's triage inbox, drift detection, AI Author Mode, and more.",
}

const SECTIONS = [
  {
    group: "Daily Workflow",
    items: [
      {
        title: "Drift Detection",
        description:
          "Understand how DocuGardener scores documentation drift, what triggers an analysis, and how to interpret results.",
        href: "/docs/user-guide/drift-detection",
      },
      {
        title: "Triage Inbox",
        description:
          "Review, fix, or dismiss drift findings. Learn about status chips, bulk actions, and filters.",
        href: "/docs/user-guide/triage-inbox",
      },
    ],
  },
  {
    group: "Automation",
    items: [
      {
        title: "Auto-Fix & AI Author Mode",
        description:
          "Let DocuGardener automatically generate and merge documentation fixes for AI-authored PRs.",
        href: "/docs/user-guide/auto-fix",
      },
      {
        title: "Cross-Repo Drift Detection",
        description:
          "Configure sibling repository fan-out to detect documentation drift spanning multiple related repos.",
        href: "/docs/user-guide/cross-repo-drift",
      },
    ],
  },
  {
    group: "Team Management",
    items: [
      {
        title: "Team & RBAC",
        description:
          "Manage team members, assign roles (Admin, Member, Auditor, Billing Admin), and configure SSO.",
        href: "/docs/user-guide/team",
      },
    ],
  },
]

export default function UserGuidePage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        User Guide
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Everything you need to get the most out of DocuGardener, from daily triage to governance
        policies.
      </p>

      <p className="text-gray-600 leading-relaxed mb-6">
        This guide covers the features you interact with after initial setup. If you have not set
        up DocuGardener yet, start with the{" "}
        <Link
          href="/docs/quickstart"
          className="text-green-600 underline underline-offset-2 hover:text-green-700"
        >
          Quick Start
        </Link>{" "}
        (SaaS) or{" "}
        <Link
          href="/docs/self-hosting"
          className="text-green-600 underline underline-offset-2 hover:text-green-700"
        >
          Self-Hosting Guide
        </Link>
        .
      </p>

      {SECTIONS.map((section) => (
        <div key={section.group} className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">{section.group}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group block border border-gray-200 rounded-lg p-5 hover:border-green-300 hover:shadow-sm transition-all"
              >
                <h3 className="text-base font-bold text-gray-900 group-hover:text-green-600 transition-colors mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* ── Additional sections (coming soon) ────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">More Topics</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        The following user guide sections are available in the sidebar navigation:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
        <li>
          <strong>Repositories</strong> — Adding and removing monitored repositories.
        </li>
        <li>
          <strong>Notifications</strong> — Email and Slack notification settings.
        </li>
        <li>
          <strong>Documentation Policies</strong> — Defining and enforcing documentation rules.
        </li>
        <li>
          <strong>Agent Governance</strong> — Controlling how DocuGardener interacts with
          AI-authored code.
        </li>
        <li>
          <strong>Billing</strong> — Plan details, upgrading, and usage tracking.
        </li>
      </ul>
    </>
  )
}

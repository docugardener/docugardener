// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Repositories — DocuGardener Docs",
  description:
    "How to add, configure, and manage repositories in DocuGardener.",
}

export default function RepositoriesPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Repositories
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        DocuGardener monitors pull requests in repositories you connect. This page explains how to
        add repositories, configure per-repo settings, and remove them.
      </p>

      {/* ── Adding a repo ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Adding a Repository</h2>
      <ol className="list-decimal list-inside text-gray-600 space-y-3 mb-8">
        <li>
          <strong>Install the GitHub App</strong> on the target repository if you haven&rsquo;t
          already. See{" "}
          <Link href="/docs/self-hosting/github-app" className="text-green-600 underline underline-offset-2 hover:text-green-700">
            GitHub App Setup
          </Link>{" "}
          for instructions.
        </li>
        <li>
          <strong>Open Settings → Repositories</strong> in the DocuGardener dashboard.
        </li>
        <li>
          Click <strong>Add repository</strong>, search for the repository by name, and click
          <strong> Enable</strong>.
        </li>
        <li>
          DocuGardener will immediately begin monitoring new pull requests in that repository.
          Existing open PRs are not re-analysed automatically — push a new commit to trigger an
          analysis on an existing PR.
        </li>
      </ol>

      {/* ── Per-repo settings ─────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">Per-Repository Settings</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Click the cog icon next to any repository in the list to open its settings.
      </p>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-1/3">Setting</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Drift score threshold", "The minimum drift score that triggers a failing check run (default: 30). Raise it to allow more drift before failing, or lower it to catch even small inconsistencies."],
            ["Documentation paths", "Glob patterns for files treated as documentation (e.g. docs/**/*.md, README.md). By default all Markdown files are included."],
            ["Ignore paths", "Glob patterns for files to exclude from analysis (e.g. CHANGELOG.md, node_modules/)."],
            ["Branch filter", "Only analyse PRs targeting the specified base branch (e.g. main). Leave blank to analyse PRs targeting any branch."],
            ["AI Author Mode", "Allow DocuGardener to open an automatic fix PR when drift is detected. Requires the PRO or TEAM plan."],
          ].map(([name, desc]) => (
            <tr key={name}>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium align-top">{name}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Enabling / disabling ──────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Enabling and Disabling</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        You can toggle a repository on or off without removing it. When disabled, DocuGardener
        ignores all webhook events from that repository. Quota is not consumed while a repository is
        disabled.
      </p>

      {/* ── Quota ─────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Quota and Repository Limits</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Plan</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">PR analyses / month</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Repositories</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["FREE", "50", "1"],
            ["PRO", "500", "5"],
            ["TEAM", "Unlimited", "Unlimited"],
            ["ENTERPRISE", "Unlimited", "Unlimited"],
          ].map(([plan, analyses, repos]) => (
            <tr key={plan}>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">{plan}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{analyses}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{repos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        When your monthly quota is exhausted, new PRs receive a{" "}
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Quota exceeded</span>{" "}
        check run. Quota resets on the first day of each calendar month.
      </p>

      {/* ── Removing ─────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Removing a Repository</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Open <strong>Settings → Repositories</strong>, click the three-dot menu next to the
        repository, and select <strong>Remove</strong>. This removes the repository from
        DocuGardener&rsquo;s monitoring list. Historical analysis results are retained until you
        explicitly delete them from the Jobs page.
      </p>
      <p className="text-gray-600 leading-relaxed text-sm">
        If you also want to stop GitHub from sending webhooks, uninstall the GitHub App from
        that repository in your GitHub settings.
      </p>
    </>
  )
}

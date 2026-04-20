// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cross-Repo Drift Detection — DocuGardener Docs",
  description:
    "Configure sibling repository fan-out to detect documentation drift that spans multiple related repositories.",
}

export default function CrossRepoDriftPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      {/* Page header */}
      <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2">
        Cross-Repo Drift Detection
      </h1>
      <p className="text-base text-gray-600 dark:text-gray-400 mb-8 max-w-2xl">
        DocuGardener can fan out drift analysis across sibling repositories. When a code change in one
        repo would break documentation in a related repo, the finding surfaces in the same PR review —
        without requiring a separate analysis run.
      </p>

      {/* Beta callout */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 mb-10 flex gap-3">
        <span className="text-amber-600 dark:text-amber-400 text-lg leading-snug">⚠</span>
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Beta feature</p>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Cross-repo drift detection is in beta. Enable it with{" "}
            <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded">
              CROSS_REPO_BETA=true
            </code>{" "}
            and a TEAM or ENTERPRISE plan. The feature is off by default.
          </p>
        </div>
      </div>

      {/* What It Does */}
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-10 mb-3">What It Does</h2>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        When a PR is opened in a watched repository, DocuGardener normally analyses documentation drift
        within that single repo. With cross-repo drift detection enabled, the analysis pipeline also
        queries the vector index for related documentation in sibling repositories. Any drift found in
        those siblings is reported as an additional section in the PR check-run comment.
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        Sibling findings are validated before surfacing. DocuGardener applies a confidence gate and a
        prompt injection defence to ensure that findings from adjacent repos are genuine and not
        artefacts of unrelated content.
      </p>

      {/* Configuring Sibling Repos */}
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-10 mb-3">
        Configuring Sibling Repos
      </h2>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        Sibling repositories are configured per repository. Navigate to{" "}
        <strong>Settings → Repositories</strong>, select the repository you want to configure, and
        add the sibling repo full names (e.g. <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">acme-org/backend</code>) in the{" "}
        <strong>Cross-repo siblings</strong> field.
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        This field is only visible for TEAM and ENTERPRISE plans. Adding sibling repos on a FREE or
        PRO plan has no effect — the fan-out step is silently skipped.
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
        Each entry is a <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">owner/repo</code> string. The
        sibling repos must be installed with the same DocuGardener GitHub App. Analysis will not fan
        out to repositories the App does not have access to.
      </p>

      {/* Plan Limits */}
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-10 mb-3">Plan Limits</h2>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 pr-4 font-semibold text-gray-700 dark:text-gray-300">
                Plan
              </th>
              <th className="text-left py-2 pr-4 font-semibold text-gray-700 dark:text-gray-300">
                Sibling repos per analysis
              </th>
              <th className="text-left py-2 font-semibold text-gray-700 dark:text-gray-300">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            <tr>
              <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">FREE</td>
              <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                <span className="text-red-500 font-semibold">✗</span> Not available
              </td>
              <td className="py-2 text-gray-500 dark:text-gray-500">Fan-out step skipped</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">PRO</td>
              <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                <span className="text-red-500 font-semibold">✗</span> Not available
              </td>
              <td className="py-2 text-gray-500 dark:text-gray-500">Fan-out step skipped</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">TEAM</td>
              <td className="py-2 pr-4 text-green-700 dark:text-green-400 font-medium">Up to 3</td>
              <td className="py-2 text-gray-500 dark:text-gray-500">Requires CROSS_REPO_BETA=true</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">ENTERPRISE</td>
              <td className="py-2 pr-4 text-green-700 dark:text-green-400 font-medium">Up to 10</td>
              <td className="py-2 text-gray-500 dark:text-gray-500">Requires CROSS_REPO_BETA=true</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* CROSS_REPO_BETA Kill Switch */}
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-10 mb-3">
        CROSS_REPO_BETA Kill Switch
      </h2>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        The entire cross-repo fan-out step is guarded by the{" "}
        <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
          CROSS_REPO_BETA
        </code>{" "}
        environment variable. The default is <strong>false</strong> — the feature is completely
        inactive unless you opt in.
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        Set it in your <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">.env</code> file or as a container environment variable:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto mb-6">
        <code>{`# Enable cross-repo drift detection (TEAM+ plan required)
CROSS_REPO_BETA=true`}</code>
      </pre>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
        To disable at any time, remove the variable or set it to{" "}
        <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">false</code>.
        No restart of the worker is required — the flag is checked at job execution time.
      </p>

      {/* Example PR Report Output */}
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-10 mb-3">
        Example PR Report Output
      </h2>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        When cross-repo siblings have drift, an additional section appears in the PR check-run
        comment below the primary findings:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto mb-6">
        <code>{`## 🔗 Cross-Repo Impact

The following sibling repositories may be affected by this change:

### acme-org/docs-site (confidence: 0.87)

| File | Finding |
|------|---------|
| docs/api/authentication.md | \`POST /auth/token\` payload shape changed — docs still show old \`client_secret\` field |
| docs/api/rate-limits.md | New 429 retry-after header not documented |

> ⚠ These findings require human review before the fix PR is opened.`}</code>
      </pre>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Fix PRs for sibling findings are opened in the <strong>sibling repo</strong>, not in the repo
        where the triggering PR was raised. They are linked back from the original PR comment.
      </p>
    </div>
  )
}

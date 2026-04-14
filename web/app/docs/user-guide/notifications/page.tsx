import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Notifications — DocuGardener Docs",
  description:
    "Configure Slack, email, and GitHub check-run notifications in DocuGardener.",
}

export default function NotificationsPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Notifications
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        DocuGardener can alert you to drift findings via GitHub check runs, Slack messages, and
        (on TEAM plan) email digests. Configure notification channels in{" "}
        <strong>Settings → Notifications</strong>.
      </p>

      {/* ── GitHub check runs ─────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">GitHub Check Runs</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        GitHub check runs are always enabled and require no additional configuration. After every
        pull-request analysis, DocuGardener posts a check run titled{" "}
        <strong>&ldquo;DocuGardener — Drift Analysis&rdquo;</strong> directly on the PR page.
      </p>
      <p className="text-gray-600 leading-relaxed mb-8">
        The check run includes the overall drift score, a per-file breakdown, and suggested fixes.
        If the drift score is at or above your{" "}
        <Link href="/docs/user-guide/repositories" className="text-green-600 underline underline-offset-2 hover:text-green-700">
          configured threshold
        </Link>
        , the check run is marked as failed, which can block merging if your branch protection
        rules require all checks to pass.
      </p>

      {/* ── Slack ─────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">
        Slack
        <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 align-middle">PRO / TEAM</span>
      </h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Connect a Slack workspace to receive a message in your chosen channel whenever a drift
        analysis completes with a score above the threshold.
      </p>
      <h3 className="text-base font-bold text-gray-900 mb-2">Setup</h3>
      <ol className="list-decimal list-inside text-gray-600 space-y-3 mb-6">
        <li>
          Go to <strong>Settings → Integrations → Slack</strong> and click{" "}
          <strong>Connect Slack</strong>.
        </li>
        <li>
          Authorise the DocuGardener Slack app in the OAuth flow and select the channel to post
          into.
        </li>
        <li>
          Optionally set a <strong>mention handle</strong> (e.g. <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">@docs-team</code>)
          to ping a specific person or group when high-severity drift is found.
        </li>
      </ol>
      <h3 className="text-base font-bold text-gray-900 mb-2">Slack message format</h3>
      <p className="text-gray-600 leading-relaxed mb-6">
        Each Slack notification includes: repository name, PR title and number, drift score, the
        top affected documentation file, and a link to the Triage Inbox entry.
      </p>

      {/* ── Notification triggers ─────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Notification Triggers</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Event</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">GitHub Check Run</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Slack</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Drift detected (score ≥ threshold)", "✓ Fail", "✓ If connected"],
            ["Drift below threshold", "✓ Pass", "—"],
            ["Analysis error / quota exceeded", "✓ Neutral", "—"],
            ["Auto-fix PR opened", "—", "✓ If connected"],
          ].map(([event, check, slack]) => (
            <tr key={event}>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{event}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{check}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{slack}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Muting ───────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Silencing Notifications for a Repository</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Open <strong>Settings → Repositories</strong>, click the cog next to the repository, and
        toggle <strong>Notifications off</strong>. The check run still appears on the PR but no
        Slack or email alert is sent.
      </p>
    </>
  )
}

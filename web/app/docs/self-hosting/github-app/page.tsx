// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "GitHub App Setup — DocuGardener Docs",
  description:
    "Create and configure the GitHub App that lets DocuGardener receive webhooks and post check runs.",
}

export default function GitHubAppPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        GitHub App Setup
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        DocuGardener requires a GitHub App to receive pull-request webhooks and post check runs back
        to your repositories. This page walks you through creating and configuring the app.
      </p>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-8">
        <strong>One app, many repos.</strong> You create the GitHub App once in your GitHub
        organisation (or personal account). Any repository you install the app on will
        automatically start receiving drift-detection check runs.
      </div>

      {/* ── Step 1 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          1
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Open the GitHub App creation page</h2>
          <p className="text-gray-600 leading-relaxed mb-2">
            Go to <strong>GitHub → Settings → Developer settings → GitHub Apps → New GitHub App</strong>.
            For an organisation, navigate to <em>Organisation settings</em> instead of personal settings.
          </p>
        </div>
      </div>

      {/* ── Step 2 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          2
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-2">Fill in the app details</h2>
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr>
                <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-1/3">Field</th>
                <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">GitHub App name</td>
                <td className="px-3 py-2 border border-gray-200 text-gray-600">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">DocuGardener</code> (or any name)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Homepage URL</td>
                <td className="px-3 py-2 border border-gray-200 text-gray-600">Your DocuGardener instance URL, e.g. <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">https://docugardener.example.com</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Webhook URL</td>
                <td className="px-3 py-2 border border-gray-200 text-gray-600">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">https://&lt;your-host&gt;/api/webhooks/github</code>
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Webhook secret</td>
                <td className="px-3 py-2 border border-gray-200 text-gray-600">Generate a strong random string. This must match <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">GITHUB_WEBHOOK_SECRET</code> in your <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.env</code>.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">SSL verification</td>
                <td className="px-3 py-2 border border-gray-200 text-gray-600">Enable (required for production). Disable only for local testing over HTTP.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Step 3 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          3
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-2">Set permissions</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            Under <strong>Repository permissions</strong>, set the following:
          </p>
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr>
                <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Permission</th>
                <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Level</th>
                <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Why</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Checks", "Read & write", "Post check run results on PRs"],
                ["Contents", "Read & write", "Clone repository for analysis + create fix PRs"],
                ["Pull requests", "Read & write", "Read PR metadata, diffs, and open fix PRs"],
                ["Metadata", "Read-only", "Required by GitHub for all apps"],
              ].map(([perm, level, why]) => (
                <tr key={perm}>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">{perm}</td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600">{level}</td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Step 4 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          4
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Subscribe to events</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            Under <strong>Subscribe to events</strong>, check:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-1 mb-2">
            <li><strong>Pull request</strong> — triggers the analysis pipeline</li>
          </ul>
          <p className="text-gray-600 leading-relaxed text-sm">
            No other events are required.
          </p>
        </div>
      </div>

      {/* ── Step 5 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          5
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Create the app and note your credentials</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            Click <strong>Create GitHub App</strong>. You will be taken to the app&rsquo;s settings page.
            Note the <strong>App ID</strong> — you will need it shortly.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Scroll to <strong>Private keys</strong> and click <strong>Generate a private key</strong>.
            A <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">.pem</code> file is downloaded.
            Save it to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">secrets/github-app.pem</code>
            in your DocuGardener directory.
          </p>
        </div>
      </div>

      {/* ── Step 6 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          6
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Update your environment variables</h2>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`GITHUB_APP_ID=123456          # The App ID shown on the app page
GITHUB_WEBHOOK_SECRET=...     # The secret you set in step 2
GITHUB_PRIVATE_KEY_PATH=./secrets/github-app.pem`}
          </pre>
        </div>
      </div>

      {/* ── Step 7 ───────────────────────────────────────── */}
      <div className="flex gap-4 mb-8">
        <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
          7
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 mb-1">Install the app on your repositories</h2>
          <p className="text-gray-600 leading-relaxed mb-2">
            Go to <strong>GitHub App settings → Install App</strong> and install it on the
            organisation or specific repositories you want monitored. After installation, any new
            pull request in those repos will trigger a DocuGardener analysis.
          </p>
          <p className="text-gray-600 leading-relaxed text-sm">
            You can also install on selected repositories to limit the scope. Repositories can be
            added or removed at any time without touching your DocuGardener configuration.
          </p>
        </div>
      </div>

      {/* ── Local dev note ───────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Local Development</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        For local development GitHub cannot reach <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">localhost</code>.
        Use a proxy like{" "}
        <a
          href="https://smee.io"
          className="text-green-600 underline underline-offset-2 hover:text-green-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          smee.io
        </a>{" "}
        to forward webhooks to your local machine. See the{" "}
        <Link href="/docs/self-hosting/docker" className="text-green-600 underline underline-offset-2 hover:text-green-700">
          Docker Compose guide
        </Link>{" "}
        for the full proxy setup.
      </p>
    </>
  )
}

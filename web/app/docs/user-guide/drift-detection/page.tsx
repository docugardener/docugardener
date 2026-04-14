import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Drift Detection — DocuGardener Docs",
  description:
    "How DocuGardener detects documentation drift in every pull request.",
}

export default function DriftDetectionPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        How Drift Detection Works
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Understand how DocuGardener analyses every pull request to find documentation that has
        fallen out of sync with the code.
      </p>

      {/* ── What is drift ────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">
        What Is Documentation Drift?
      </h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Documentation drift occurs when code changes are not reflected in the corresponding
        documentation. For example: a developer renames an API endpoint from{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          /api/users
        </code>{" "}
        to{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          /api/v2/users
        </code>
        , but the README still references the old path. That is drift. Over time, these small gaps
        accumulate and the documentation becomes unreliable.
      </p>

      {/* ── How it works ─────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">The Analysis Pipeline</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        When you open or update a pull request in a monitored repository, DocuGardener runs a
        multi-stage analysis pipeline:
      </p>
      <ol className="list-decimal list-inside text-gray-600 space-y-3 mb-6">
        <li>
          <strong>Webhook received</strong> — GitHub sends a{" "}
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            pull_request
          </code>{" "}
          event to the FastAPI webhook handler.
        </li>
        <li>
          <strong>Clone &amp; parse</strong> — The worker clones the PR branch and parses changed
          files using AST analysis to understand structural code changes (not just text diffs).
        </li>
        <li>
          <strong>Vector embedding</strong> — Documentation files and code files are embedded into
          the Weaviate vector database. This allows semantic comparison, not just keyword matching.
        </li>
        <li>
          <strong>LLM analysis</strong> — An LLM compares the code changes against nearby
          documentation and generates a drift assessment with per-file breakdown and suggested
          fixes.
        </li>
        <li>
          <strong>Scoring</strong> — Each finding receives a drift score from 0 to 100.
        </li>
        <li>
          <strong>Reporting</strong> — Results are posted as a GitHub check run on the PR and
          appear in the DocuGardener Triage Inbox.
        </li>
      </ol>

      {/* ── What triggers ────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">What Triggers an Analysis?</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        An analysis runs every time a pull request is <strong>opened</strong> or{" "}
        <strong>synchronized</strong> (new commits pushed to an existing PR). Draft PRs are also
        analysed. Closing or merging a PR does not trigger a new analysis.
      </p>

      {/* ── The drift score ──────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">The Drift Score</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Score Range
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Meaning
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Check Run Status
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">0 -- 29</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Documentation is in sync or has only minor, cosmetic differences.
            </td>
            <td className="px-3 py-2 border border-gray-200">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                Pass
              </span>
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">30 -- 69</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Meaningful drift detected. Documentation should be updated before merging.
            </td>
            <td className="px-3 py-2 border border-gray-200">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                Warning / Fail
              </span>
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              70 -- 100
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Severely outdated. Multiple documentation files are stale or missing entirely.
            </td>
            <td className="px-3 py-2 border border-gray-200">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                Fail
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-gray-600 leading-relaxed mb-4">
        The default threshold is <strong>30</strong>. Any PR with a drift score at or above the
        threshold will show a failing check run. You can change this threshold by setting the{" "}
        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
          DRIFT_SCORE_THRESHOLD
        </code>{" "}
        environment variable (0 -- 100).
      </p>

      {/* ── What it looks at ─────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">What DocuGardener Looks At</h2>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
        <li>Code changes in the pull request (added, modified, and deleted files).</li>
        <li>
          Adjacent Markdown files ({" "}
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            README.md
          </code>
          ,{" "}
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            docs/
          </code>{" "}
          folder, API docs).
        </li>
        <li>Inline code comments and docstrings where relevant.</li>
        <li>Previously embedded documentation from the vector database for semantic comparison.</li>
      </ul>

      {/* ── What it does NOT do ──────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">
        What DocuGardener Does NOT Do
      </h2>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-4">
        DocuGardener is a <strong>read-only analysis tool</strong> by default. It does not modify
        your code or documentation unless you explicitly enable AI Author Mode or click
        &ldquo;Apply fix&rdquo; in the Triage Inbox.
      </div>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
        <li>
          <strong>Does not modify your code.</strong> Analysis is read-only.
        </li>
        <li>
          <strong>Does not store your source code.</strong> Repository contents are cloned
          temporarily during analysis and discarded afterwards. Only vector embeddings and
          metadata are retained.
        </li>
        <li>
          <strong>Does not slow down your CI.</strong> Analysis runs asynchronously. The check run
          is posted as a separate status — it does not block other CI jobs.
        </li>
      </ul>

      {/* ── Tier vs Status in Job History ────────────────── */}
      <h2 id="job-history-status" className="text-xl font-bold text-gray-900 mt-10 mb-3">
        Tier vs Status in Job History
      </h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        The <strong>Job History</strong> page shows two independent indicators per scan. They
        answer different questions and should be read together.
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-24">
              Column
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              What it tells you
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Based on
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700">Tier</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              How severe the drift was when the PR was first scanned.{" "}
              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">Blocked</span>{" "}
              means the score was above 80 — critical enough to fail the PR check run.
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Original <strong>drift score</strong> — never changes after analysis.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700">Status</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Where the ticket is in the resolution workflow right now — e.g.{" "}
              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Resolved</span>,{" "}
              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">Review</span>,{" "}
              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-violet-100 text-violet-800">AI fixing</span>.
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Current <strong>triage state</strong> — updates as the fix progresses.
            </td>
          </tr>
        </tbody>
      </table>

      <h3 className="text-base font-bold text-gray-900 mb-2">Common scenario: Blocked + Resolved</h3>
      <p className="text-gray-600 leading-relaxed mb-3">
        You may see a row where Tier is{" "}
        <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">Blocked</span>{" "}
        and Status is{" "}
        <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Resolved</span>{" "}
        at the same time. This is not a contradiction — it means:
      </p>
      <ol className="list-decimal list-inside text-gray-600 space-y-1.5 mb-4 pl-2">
        <li>The PR introduced <strong>critical drift</strong> (score &gt; 80), which caused the GitHub check run to fail.</li>
        <li>DocuGardener (or a team member) created a <strong>fix PR</strong> with the corrected documentation.</li>
        <li>The fix PR was <strong>merged</strong> — the drift is now remediated.</li>
      </ol>
      <p className="text-gray-600 leading-relaxed mb-6">
        The Tier badge is a permanent historical record of how serious the original drift was.
        The Status badge tells you the current state of the workflow. Together they give you a
        full picture: <em>&ldquo;This was a critical issue — and it has been fixed.&rdquo;</em>
      </p>

      {/* ── The GitHub check run ─────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">The GitHub Check Run</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        After analysis completes, DocuGardener posts a check run on the pull request titled{" "}
        <strong>&ldquo;DocuGardener — Drift Analysis&rdquo;</strong>. The check run summary
        includes:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
        <li>
          <strong>Overall drift score</strong> — the aggregate score for the entire PR.
        </li>
        <li>
          <strong>Per-file breakdown</strong> — which documentation files are affected and why.
        </li>
        <li>
          <strong>Suggested fixes</strong> — exact Markdown diffs that would bring the docs back
          into sync.
        </li>
        <li>
          <strong>Policy violations</strong> — if any documentation policies are breached (e.g.
          &ldquo;every public endpoint must have a docs page&rdquo;).
        </li>
      </ul>
    </>
  )
}

import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Agent Governance — DocuGardener Docs",
  description:
    "Control what AI Author Mode is allowed to do with agent rules and guardrails.",
}

export default function AgentGovernancePage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Agent Governance
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        When AI Author Mode is enabled, DocuGardener can autonomously open documentation-fix PRs.
        Agent governance gives you precise control over what the AI agent is allowed to do, what it
        must always avoid, and when a human must review before a fix is merged.
      </p>

      {/* ── What is AI Author Mode ───────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">AI Author Mode Recap</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        With AI Author Mode enabled on a repository, whenever a PR analysis finds drift, the agent:
      </p>
      <ol className="list-decimal list-inside text-gray-600 space-y-2 mb-6">
        <li>Generates the documentation fixes suggested during analysis.</li>
        <li>Opens a new pull request against the original PR&rsquo;s base branch.</li>
        <li>Posts a link to the fix PR in the Triage Inbox and Slack (if connected).</li>
      </ol>
      <p className="text-gray-600 leading-relaxed mb-6">
        The fix PR is still subject to your normal review process — it does not auto-merge unless
        you also enable the Auto-Heal setting in an individual repository&rsquo;s configuration.
      </p>

      {/* ── Agent rules ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Agent Rules</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Agent rules are plain-English instructions appended to every LLM prompt. Use them to:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
        <li>Prohibit the agent from touching certain files (<em>&ldquo;Never modify CHANGELOG.md&rdquo;</em>).</li>
        <li>Enforce a writing style (<em>&ldquo;Use British English spellings&rdquo;</em>).</li>
        <li>Require a specific structure (<em>&ldquo;Every API page must include an Examples section&rdquo;</em>).</li>
        <li>Limit scope (<em>&ldquo;Only update files in the docs/ directory&rdquo;</em>).</li>
      </ul>

      <h3 className="text-base font-bold text-gray-900 mb-2">Adding rules</h3>
      <ol className="list-decimal list-inside text-gray-600 space-y-2 mb-6">
        <li>Open <strong>Settings → Agent Governance</strong>.</li>
        <li>Click <strong>Add rule</strong> and type your instruction in plain English.</li>
        <li>Assign the rule to <em>All repositories</em> or a specific repository.</li>
        <li>Save. The rule applies to all subsequent AI Author Mode runs.</li>
      </ol>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-8">
        <strong>PRO plan:</strong> up to 5 active rules per repository.<br/>
        <strong>TEAM plan:</strong> unlimited rules.
      </div>

      {/* ── Auto-merge guardrails ────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Auto-Merge Guardrails</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        The <strong>Auto-Heal</strong> setting (per repository, PRO+) allows DocuGardener to enable
        GitHub&rsquo;s auto-merge on the fix PR when all required status checks pass. To prevent
        uncontrolled merges:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
        <li>
          <strong>Required reviewers</strong> — set at least one required reviewer in your GitHub
          branch protection rules. Auto-merge will not proceed until a human approves.
        </li>
        <li>
          <strong>Drift score ceiling</strong> — Auto-Heal only fires when the drift score is at or
          above the configured threshold. Low-severity drift never triggers an autonomous fix.
        </li>
        <li>
          <strong>Max files changed</strong> — You can set a maximum number of files the agent is
          allowed to modify in a single fix PR. If the fix requires more changes, the PR is opened
          but auto-merge is not enabled.
        </li>
      </ul>

      {/* ── Audit trail ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Audit Trail</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Every action taken by the AI agent is recorded in the{" "}
        <Link href="/docs/user-guide/team" className="text-green-600 underline underline-offset-2 hover:text-green-700">
          audit log
        </Link>
        {" "}(TEAM plan). Each entry includes:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
        <li>The repository and PR that triggered the run.</li>
        <li>The agent rules that were in effect.</li>
        <li>The files that were modified and the nature of each change.</li>
        <li>The fix PR URL.</li>
        <li>A cryptographic hash chain entry for tamper detection.</li>
      </ul>

      {/* ── Disabling ─────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Disabling AI Author Mode</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        To turn off AI Author Mode for a specific repository, open <strong>Settings → Repositories</strong>,
        click the cog icon, and toggle <strong>AI Author Mode</strong> off. Existing fix PRs are
        not affected.
      </p>
      <p className="text-gray-600 leading-relaxed">
        To disable it globally across all repositories, go to <strong>Settings → Agent Governance</strong>
        and toggle <strong>AI Author Mode (global)</strong> off.
      </p>
    </>
  )
}

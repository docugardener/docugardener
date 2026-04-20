// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import {
  GitPullRequest,
  Zap,
  GitBranch,
  Terminal,
  Code2,
  RefreshCw,
  ShieldCheck,
  FileText,
  Users,
  Key,
  Download,
  BarChart2,
  MessageSquare,
  Kanban,
  ScrollText,
  Map,
  Bot,
  GitFork,
} from "lucide-react"

interface FeatureCardProps {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  badge: string
  title: string
  description: string
  bullets: string[]
}

function FeatureCard({
  icon: Icon,
  iconBg,
  iconColor,
  badge,
  title,
  description,
  bullets,
}: FeatureCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">
          {badge}
        </span>
      </div>
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
      <ul className="space-y-1 mt-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
            <span className="text-green-500 mt-0.5 shrink-0">✓</span>
            {b}
          </li>
        ))}
      </ul>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-4 mt-12 first:mt-0">
      {children}
    </p>
  )
}

const GROUP_NAV = [
  { label: "Core Workflow",            href: "#core-workflow" },
  { label: "Governance & Compliance",  href: "#governance" },
  { label: "More Capabilities",        href: "#more" },
]

export default function FeaturesPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <MarketingHeader activePage="features" />

      {/* Page hero */}
      <section className="py-16 text-center px-6 bg-white">
        <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
          Product
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-4">
          The agent&apos;s safety net for documentation
        </h1>
        <p className="text-gray-600 max-w-xl mx-auto">
          From zero-touch AI Author Mode to enterprise audit trails — every capability that keeps your docs honest as AI writes more of your code.
        </p>
      </section>

      {/* Plan comparison + group nav */}
      <div className="border-b border-gray-100">
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">
            Wondering which plan fits?{" "}
            <Link href="/pricing" className="font-semibold text-green-600 hover:text-green-700 underline underline-offset-2">
              See the full plan comparison →
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 pb-4 px-6">
          {GROUP_NAV.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 px-3 py-1 rounded-full transition"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Feature grid */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 pb-20">

          {/* ── Core Workflow ─────────────────────────────────────────────── */}
          <section id="core-workflow" aria-label="Core Workflow">
            <GroupLabel>Core Workflow</GroupLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={Code2}
                iconBg="bg-purple-50"
                iconColor="text-purple-600"
                badge="All plans"
                title="AI Author Mode"
                description="The documentation safety net for AI-native teams. Detects PRs authored by Copilot, Cursor, Devin, or Claude via four independent signals — then opens and merges the documentation fix automatically when CI passes."
                bullets={[
                  "Detects: bot sender · branch prefix · PR body marker · custom pattern",
                  "Auto-merges via squash, merge commit, or rebase — your choice",
                  "AI Authorship Signal row in every fix PR for full traceability",
                ]}
              />
              <FeatureCard
                icon={GitPullRequest}
                iconBg="bg-green-50"
                iconColor="text-green-600"
                badge="All plans"
                title="PR Drift Detection"
                description="Every pull request triggers a full documentation analysis. DocuGardener compares semantic meaning of code and docs to catch inconsistencies before they merge."
                bullets={[
                  "Semantic diff across code and Markdown",
                  "Drift score 0–100 with per-file breakdown",
                  "GitHub check run integration",
                ]}
              />
              <FeatureCard
                icon={Zap}
                iconBg="bg-green-50"
                iconColor="text-green-600"
                badge="Pro+"
                title="Auto-Fix Suggestions"
                description="Instead of flagging a problem and leaving, DocuGardener generates the exact Markdown update — apply as a GitHub suggestion or let it open an auto-fix PR."
                bullets={[
                  "Precise Markdown diff, not generic advice",
                  "Apply as GitHub suggestion in one click",
                  "Auto-fix PR opens for team review",
                ]}
              />
              <FeatureCard
                icon={Terminal}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                badge="All plans"
                title="Pre-Push Drift Check"
                description="Catch documentation drift before it even reaches CI. The VS Code extension calls a stateless /check endpoint on every pre-push hook, so developers get feedback in their IDE."
                bullets={[
                  "Zero-latency local feedback loop",
                  "Suggested docs open directly in editor",
                  "Policy violation diagnostics in Problems panel",
                ]}
              />
              <FeatureCard
                icon={GitBranch}
                iconBg="bg-orange-50"
                iconColor="text-orange-600"
                badge="All plans"
                title="Triage Inbox"
                description="A Linear-style queue for all unresolved drift findings across your connected repositories. Review, dismiss with reason, bulk-approve, or escalate — without leaving DocuGardener."
                bullets={[
                  "Chronological drift queue",
                  "Dismiss with mandatory reason (configurable)",
                  "Bulk actions for large backlogs",
                ]}
              />
              <FeatureCard
                icon={RefreshCw}
                iconBg="bg-gray-100"
                iconColor="text-gray-600"
                badge="Pro+"
                title="Nightly Rollup Reports"
                description="End-of-day summary delivered to Slack or email. Shows drift score delta, PRs scanned, and top unresolved findings — keeping the team informed without opening a dashboard."
                bullets={[
                  "Slack and email delivery",
                  "Drift score trend over 7 / 30 days",
                  "Top affected repos highlighted",
                ]}
              />
            </div>
          </section>

          {/* ── Governance & Compliance ───────────────────────────────────── */}
          <section id="governance" aria-label="Governance and Compliance">
            <GroupLabel>Governance &amp; Compliance</GroupLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={ScrollText}
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
                badge="Pro+"
                title="Documentation Policy Enforcement"
                description="Define documentation obligations as code. YAML rules specify which file paths require which docs, with advisory, blocking, or blocking-with-reason enforcement levels."
                bullets={[
                  "Path-based require_docs rules in .github/docugardener.yml",
                  "Advisory, blocking, or blocking-with-reason enforcement",
                  "Audit-logged when policy violations are dismissed",
                ]}
              />
              <FeatureCard
                icon={Map}
                iconBg="bg-rose-50"
                iconColor="text-rose-600"
                badge="Pro+"
                title="Risk Zone Dashboard"
                description="Management-facing view of documentation risk concentration across your fleet. See which repos and doc types carry the highest unresolved drift — and drill into the findings."
                bullets={[
                  "Repo vitality index with drill-down to open drift",
                  "Filter by repo, doc type, and time range",
                  "Single health score for executive reporting",
                ]}
              />
              <FeatureCard
                icon={ShieldCheck}
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
                badge="Pro+"
                title="Audit Log"
                description="Every security-relevant action is recorded with a tamper-evident SHA-256 hash chain. CSV / JSON evidence export for compliance packages available on Team."
                bullets={[
                  "SHA-256 hash chain — every record verifiable",
                  "18 event types across login, triage, settings, and role changes",
                  "Exportable CSV / JSON with date-range filters",
                ]}
              />
              <FeatureCard
                icon={Users}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                badge="All plans"
                title="RBAC"
                description="Four built-in roles — Admin, Member, Auditor, and Billing Admin. Admins manage repos and team. Auditors get read-only access to the audit log."
                bullets={[
                  "Admin · Member · Auditor · Billing Admin",
                  "Invite by email from the Settings page",
                  "Role changes audit-logged",
                ]}
              />
              <FeatureCard
                icon={Key}
                iconBg="bg-purple-50"
                iconColor="text-purple-600"
                badge="Team"
                title="SSO & SCIM Provisioning"
                description="Enterprise identity integration via SAML SSO and SCIM 2.0. Automate user provisioning and deprovisioning from your identity provider."
                bullets={[
                  "SAML SSO login",
                  "SCIM 2.0 user lifecycle management",
                  "Central session revocation",
                ]}
              />
              <FeatureCard
                icon={Download}
                iconBg="bg-green-50"
                iconColor="text-green-600"
                badge="Team"
                title="Evidence Export"
                description="Export the complete audit log as CSV or JSON for a specified date range and event filter. Rate-limited and access-controlled for compliance packages."
                bullets={[
                  "Date range + event type filters",
                  "CSV and JSON formats",
                  "Rate-limited to prevent abuse",
                ]}
              />
              <FeatureCard
                icon={BarChart2}
                iconBg="bg-orange-50"
                iconColor="text-orange-600"
                badge="Pro+"
                title="Fleet Analytics"
                description="Aggregate documentation health across all connected repositories. Track drift score trends, PR analysis counts, and per-repo health over time."
                bullets={[
                  "Fleet health score across all repos",
                  "PR analysis volume over time",
                  "Per-repo drift score breakdown",
                ]}
              />
              <FeatureCard
                icon={FileText}
                iconBg="bg-gray-100"
                iconColor="text-gray-600"
                badge="Pro+"
                title="BYOK & Local Models"
                description="Four deployment modes to fit your data residency and security posture — from fully managed to fully air-gapped."
                bullets={[
                  "Platform · BYOK Cloud · BYOK Local · Sovereign",
                  "BYOK Local and Sovereign: zero data leaves your network",
                  "Exportable environment profile for security review",
                ]}
              />
            </div>
          </section>

          {/* ── More Capabilities ─────────────────────────────────────────── */}
          <section id="more" aria-label="More Capabilities">
            <GroupLabel>More Capabilities</GroupLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FeatureCard
                icon={Bot}
                iconBg="bg-violet-50"
                iconColor="text-violet-600"
                badge="Pro+"
                title="Cross-Vendor Agent Instructions"
                description="Keep every AI coding agent aligned with your documentation policy — automatically. DocuGardener compiles your policy into native instruction files for 4 agent ecosystems."
                bullets={[
                  "AGENTS.md · copilot-instructions.md · cursor rules · CLAUDE.md",
                  "Nightly staleness check — one-click Propose opens the update PR",
                  "Preview compiled output inline before proposing",
                ]}
              />
              <FeatureCard
                icon={GitFork}
                iconBg="bg-sky-50"
                iconColor="text-sky-600"
                badge="Team+"
                title="Cross-Repo Drift Detection"
                description="Fan-out across sibling repos — detects when a code change breaks docs in related repos. Findings appear inline in the PR comment and the Triage Inbox."
                bullets={[
                  "Fan-out analysis across up to 3 (Team) or 10 (Enterprise) siblings",
                  "Prompt injection defence on all cross-repo LLM calls",
                  "Configurable per-repo via Settings → Repositories",
                ]}
              />
              <FeatureCard
                icon={MessageSquare}
                iconBg="bg-teal-50"
                iconColor="text-teal-600"
                badge="Pro+"
                title="Slack Integration"
                description="Post drift alerts, nightly rollups, and triage updates to any Slack channel. Configure per-repo channel routing from the Settings page."
                bullets={[
                  "Per-repo Slack channel routing",
                  "Drift alerts on PR open",
                  "Nightly rollup digest",
                ]}
              />
              <FeatureCard
                icon={Kanban}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                badge="Pro+"
                title="Jira Integration"
                description="Keep your Jira tickets in the loop. DocuGardener posts lifecycle comments on linked tickets when drift is detected, a fix PR is created, or the issue is resolved."
                bullets={[
                  "Auto-comment on linked Jira tickets at 4 lifecycle points",
                  "Works with any ticket key in PR branch, title, or body",
                  "No extra setup — uses your existing Jira workflow",
                ]}
              />
            </div>
          </section>

        </div>
      </main>

      {/* CTA banner */}
      <section className="bg-green-600 py-16 text-center text-white">
        <h2 className="text-2xl font-extrabold tracking-tight mb-3">
          Your agents write the code. We write the docs.
        </h2>
        <p className="text-green-100 mb-6 text-sm">
          Free plan available. No credit card required.
        </p>
        <Link href="/api/auth/signin">
          <Button className="bg-white text-green-700 hover:bg-green-50 font-bold px-8 h-11">
            Start Free
          </Button>
        </Link>
      </section>

      <MarketingFooter />
    </div>
  )
}

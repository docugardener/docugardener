import Link from "next/link"
import {
  Zap,
  GitPullRequest,
  ShieldCheck,
  MessageSquare,
} from "lucide-react"

const groups = [
  {
    icon: Zap,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    title: "Zero Ops Deployment",
    description:
      "Install from GitHub Marketplace in 60 seconds. No server, no API key, no config files. Bundled LLM included — drift analysis works out of the box.",
  },
  {
    icon: GitPullRequest,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    title: "Drift Detection & Auto-Fix",
    description:
      "Every PR triggers a full doc analysis. For AI-authored PRs (Copilot, Cursor, Devin), DocuGardener opens and merges the fix automatically. You just approve.",
  },
  {
    icon: ShieldCheck,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    title: "Governance & Audit",
    description:
      "Tamper-evident audit log, RBAC with 4 roles, SSO/SCIM, and evidence export for compliance packages. Policy enforcement from a single source of truth.",
  },
  {
    icon: MessageSquare,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    title: "Integrations",
    description:
      "Slack drift alerts, Jira ticket creation, agent instruction file export for Copilot, Cursor, Claude Code, and Gemini CLI.",
  },
]

export function FeaturesTeaser() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
            Features
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Everything you need to keep docs honest
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
          {groups.map((g) => {
            const Icon = g.icon
            return (
              <article
                key={g.title}
                className="flex items-start gap-4 p-5 rounded-xl border border-gray-100 bg-gray-50/50"
              >
                <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${g.iconBg}`}>
                  <Icon className={`w-5 h-5 ${g.iconColor}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">{g.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{g.description}</p>
                </div>
              </article>
            )
          })}
        </div>

        <div className="text-center">
          <Link
            href="/features"
            className="text-sm font-semibold text-green-600 hover:text-green-700 transition"
          >
            Explore all features &rarr;
          </Link>
        </div>
      </div>
    </section>
  )
}

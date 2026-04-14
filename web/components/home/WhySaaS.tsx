import { Zap, Bot, GitBranch, LucideIcon } from "lucide-react"

interface Reason {
  icon: LucideIcon
  iconBg: string
  iconColor: string
  title: string
  value: string
  vsCallout: string
}

const reasons: Reason[] = [
  {
    icon: Zap,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    title: "Zero Ops",
    value:
      "No server to provision, patch, or monitor. We run DocuGardener — you just connect your repos.",
    vsCallout:
      "vs. self-hosted: you own the infra, uptime, backups, and upgrades.",
  },
  {
    icon: Bot,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    title: "Bundled LLM",
    value:
      "Semantic drift analysis included — no OpenAI, Anthropic, or Gemini key required to get started.",
    vsCallout:
      "vs. self-hosted: you supply and pay for your own LLM API key.",
  },
  {
    icon: GitBranch,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    title: "One-Click GitHub Install",
    value:
      "Install from GitHub Marketplace in 60 seconds. Select repos. Your first PR scan fires automatically.",
    vsCallout:
      "vs. self-hosted: clone the repo, configure env vars, deploy the stack, configure a GitHub App manually.",
  },
]

export function WhySaaS() {
  return (
    <section
      role="region"
      aria-label="Why use the hosted version"
      className="py-20 bg-white"
    >
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
            Why SaaS?
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Why use the hosted version?
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            Honest reasons — not feature gatekeeping. The full source is on
            GitHub and self-hosting is always free.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {reasons.map((r) => {
            const Icon = r.icon
            return (
              <article
                key={r.title}
                className="flex flex-col gap-4 p-6 rounded-xl border border-gray-100 bg-gray-50/50"
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${r.iconBg}`}
                >
                  <Icon className={`w-5 h-5 ${r.iconColor}`} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">
                    {r.title}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">
                    {r.value}
                  </p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {r.vsCallout}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

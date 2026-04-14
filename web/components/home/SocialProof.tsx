import { Github, GitPullRequest, Clock, Shield } from "lucide-react"

const STATS = [
  {
    icon: GitPullRequest,
    value: "Every PR",
    label: "analysed automatically",
  },
  {
    icon: Clock,
    value: "< 5 min",
    label: "from sign-up to first result",
  },
  {
    icon: Shield,
    value: "Zero ops",
    label: "no config files, no CI changes",
  },
  {
    icon: Github,
    value: "AGPL",
    label: "open source — self-host free",
  },
]

export function SocialProof() {
  return (
    <section
      aria-label="Key stats"
      className="border-y border-gray-100 bg-white"
    >
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <Icon className="w-5 h-5 text-green-600 mb-0.5" />
              <span className="text-xl font-extrabold tracking-tight text-gray-900">
                {value}
              </span>
              <span className="text-xs text-gray-500 leading-snug">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

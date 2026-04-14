// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { Github, Plug, FolderGit2, GitPullRequest, ArrowRight } from "lucide-react"

const STEPS = [
  {
    n: 1,
    icon: Github,
    iconBg: "bg-gray-900",
    iconColor: "text-white",
    title: "Sign up with GitHub",
    body: "One click — no forms, no credit card. DocuGardener creates your free workspace from your GitHub account.",
    time: "~30 seconds",
  },
  {
    n: 2,
    icon: Plug,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    title: "Install the GitHub App",
    body: "We generate a GitHub App with the exact permissions needed — read code, write check runs. You approve it on GitHub and return automatically.",
    time: "~2 minutes",
  },
  {
    n: 3,
    icon: FolderGit2,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    title: "Pick repos to monitor",
    body: "Choose which repositories DocuGardener should watch. Start with one, add more any time in Settings.",
    time: "~30 seconds",
  },
  {
    n: 4,
    icon: GitPullRequest,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    title: "Open a pull request",
    body: "That's it. DocuGardener analyses every PR automatically and posts the drift report as a GitHub check run — no commands, no config files.",
    time: "Automatic",
  },
]

export function HowItWorks() {
  return (
    <section className="py-20 bg-gray-50 border-y border-gray-100">
      <div className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
            Getting started
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-3">
            From sign-up to first analysis in under 5 minutes
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto text-sm">
            No YAML config. No CI changes. Just connect GitHub and start watching PRs.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line — desktop only */}
          <div className="hidden lg:block absolute top-8 left-[calc(12.5%+1.75rem)] right-[calc(12.5%+1.75rem)] h-0.5 bg-gray-200" aria-hidden />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((step) => {
              const Icon = step.icon
              return (
                <div key={step.n} className="flex flex-col items-center text-center gap-3 relative">
                  {/* Step number badge */}
                  <div className="relative">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${step.iconBg}`}>
                      <Icon className={`w-6 h-6 ${step.iconColor}`} />
                    </div>
                    <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-black flex items-center justify-center">
                      {step.n}
                    </span>
                  </div>

                  <div>
                    <p className="font-bold text-gray-900 text-sm mb-1">{step.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{step.body}</p>
                  </div>

                  <span className="text-[10px] font-bold uppercase tracking-widest text-green-600 bg-green-50 border border-green-100 px-2.5 py-0.5 rounded-full">
                    {step.time}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            href="/auth/signin?signup=1"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-6 py-3 rounded-lg transition-colors"
          >
            Get started free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-gray-400 mt-3">Free plan · No credit card · 50 PR analyses/month</p>
        </div>
      </div>
    </section>
  )
}

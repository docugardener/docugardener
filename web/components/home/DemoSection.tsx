"use client"

import { useState, useEffect } from "react"

const steps = [
  {
    label: "Connect",
    title: "Install in 60 seconds",
    description:
      "Add the GitHub App to your organization. Select repositories. DocuGardener starts listening to pull requests immediately — no config files needed.",
    bullets: [
      "Works with any GitHub repo",
      "Supports public and private repositories",
      "Webhook verified and active instantly",
    ],
    code: (
      <div className="font-mono text-sm leading-relaxed">
        <div>
          <span className="text-green-400">$</span>{" "}
          <span className="text-zinc-300">gh app install docugardener</span>
        </div>
        <div className="mt-3">
          <span className="text-emerald-400">✓</span>{" "}
          <span className="text-zinc-500">Authenticated as acme-corp</span>
        </div>
        <div>
          <span className="text-emerald-400">✓</span>{" "}
          <span className="text-zinc-500">Webhook registered</span>
        </div>
        <div>
          <span className="text-emerald-400">✓</span>{" "}
          <span className="text-zinc-500">Listening on: pull_request, push</span>
        </div>
        <div className="mt-3 text-zinc-500">Repositories connected:</div>
        <div>
          <span className="text-green-400">  →</span>{" "}
          <span className="text-zinc-300">auth-service</span>
          <span className="text-zinc-500">        (main)</span>
        </div>
        <div>
          <span className="text-green-400">  →</span>{" "}
          <span className="text-zinc-300">billing-api</span>
          <span className="text-zinc-500">         (main)</span>
        </div>
        <div>
          <span className="text-green-400">  →</span>{" "}
          <span className="text-zinc-300">platform-gateway</span>
          <span className="text-zinc-500">    (main)</span>
        </div>
        <div className="mt-3 text-zinc-500">
          Ready. Open a PR to run the first scan.
        </div>
      </div>
    ),
  },
  {
    label: "Detect",
    title: "Drift detected in every PR",
    description:
      "Every pull request triggers a full documentation analysis. DocuGardener scores the drift and pins the result directly to the GitHub check run — no dashboard visit needed.",
    bullets: [
      "Semantic diff across code and docs",
      "Drift score from 0 to 100",
      "Inline comment with exact location",
    ],
    code: (
      <div className="font-mono text-sm leading-relaxed">
        <div className="text-zinc-300">
          PR #284{"  "}
          <span className="text-zinc-400">feat: add currency param</span>
        </div>
        <div className="text-zinc-600 mt-1">
          ─────────────────────────────────────
        </div>
        <div className="mt-2 text-zinc-500">Checks</div>
        <div>
          <span className="text-green-400">✓</span>{" "}
          <span className="text-zinc-300">Tests</span>
          <span className="text-zinc-500">                    passing</span>
        </div>
        <div>
          <span className="text-green-400">✓</span>{" "}
          <span className="text-zinc-300">Lint</span>
          <span className="text-zinc-500">                     passing</span>
        </div>
        <div>
          <span className="text-yellow-400">⚠</span>{" "}
          <span className="text-zinc-300">DocuGardener</span>
          <span className="text-zinc-500">             action required</span>
        </div>
        <div className="mt-3">
          <span className="text-zinc-500">Drift Score: </span>
          <span className="text-yellow-300">73 / 100</span>
        </div>
        <div className="text-zinc-600">
          ─────────────────────────────────────
        </div>
        <div className="mt-2">
          <span className="text-blue-400">api_docs.md</span>
          <span className="text-zinc-500"> · line 42</span>
        </div>
        <div className="text-zinc-300 ml-2">init_payment() — missing parameter</div>
        <div className="text-zinc-500 ml-2">`currency` not documented</div>
        <div className="mt-3">
          <span className="text-zinc-400">→</span>{" "}
          <span className="text-zinc-400">View details</span>
          {"  "}
          <span className="text-zinc-400">→</span>{" "}
          <span className="text-zinc-400">Dismiss with reason</span>
        </div>
      </div>
    ),
  },
  {
    label: "Fix & Merge",
    title: "Auto-fix — or zero-touch for AI PRs",
    description:
      "For human PRs, DocuGardener generates the exact Markdown fix — apply it in one click. For Copilot, Cursor, and Devin PRs, AI Author Mode opens and merges the fix PR automatically. You just approve.",
    bullets: [
      "Exact Markdown diff, not generic advice",
      "Auto-fix PR opened and merged when CI passes",
      "All 3 merge methods supported (squash · merge · rebase)",
      "Audit trail records every decision",
    ],
    code: (
      <div className="font-mono text-sm leading-relaxed">
        <div className="text-zinc-400">Suggested fix · api_docs.md</div>
        <div className="mt-2 bg-red-950/30 px-1 rounded">
          <span className="text-red-400">- </span>
          <span className="text-red-400">{"`init_payment(amount)`"}</span>
        </div>
        <div className="bg-green-950/30 px-1 rounded">
          <span className="text-green-400">+ </span>
          <span className="text-green-400">{"`init_payment(amount, currency=\"USD\")`"}</span>
        </div>
        <div className="bg-green-950/30 px-1 rounded">
          <span className="text-green-400">+ </span>
          <span className="text-green-400">{"- `currency` (str, default \"USD\") — ISO 4217"}</span>
        </div>
        <div className="mt-3 text-zinc-600">
          ── AI Author Mode ─────────────────────
        </div>
        <div className="mt-1">
          <span className="text-purple-400">🤖</span>{" "}
          <span className="text-zinc-300">AI-authored PR detected</span>
          <span className="text-zinc-500">  (branch_prefix)</span>
        </div>
        <div className="text-zinc-500 ml-4">fix PR #285 opened automatically</div>
        <div className="text-zinc-500 ml-4">CI passed · merging via squash…</div>
        <div className="mt-2">
          <span className="text-green-400">✓</span>{" "}
          <span className="text-green-400">Merged</span>
          <span className="text-zinc-500"> · No manual action required</span>
        </div>
        <div className="mt-1">
          <span className="text-green-400">✓</span>{" "}
          <span className="text-green-400">All checks passed</span>
          <span className="text-zinc-500"> · Ready to merge</span>
        </div>
      </div>
    ),
  },
]

export function DemoSection() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(false)
    const t = setTimeout(() => setVisible(true), 150)
    return () => clearTimeout(t)
  }, [active])

  useEffect(() => {
    if (paused) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(0)
    const duration = 4000
    const interval = 50
    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += interval
      setProgress(Math.min((elapsed / duration) * 100, 100))
      if (elapsed >= duration) {
        setActive((prev) => (prev + 1) % 3)
        elapsed = 0
        setProgress(0)
      }
    }, interval)
    return () => clearInterval(timer)
  }, [active, paused])

  const current = steps[active]

  return (
    <section id="demo" className="py-20 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
            How it works
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Three steps to drift-free docs
          </h2>
          <p className="text-gray-500 mt-3 max-w-xl mx-auto">
            From install to first fix in minutes. No config files. No agents to deploy.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-0 mb-4 max-w-sm mx-auto">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center flex-1">
              <button
                onClick={() => setActive(i)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all shrink-0 ${
                  active === i
                    ? "bg-green-600 border-green-600 text-white"
                    : "border-gray-200 text-gray-400 bg-white hover:border-green-300"
                }`}
              >
                {i + 1}
              </button>
              {i < steps.length - 1 && (
                <div className="flex-1 h-px bg-gray-200 mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Step labels */}
        <div className="flex items-center justify-center gap-0 mb-6 max-w-sm mx-auto">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center flex-1">
              <span
                className={`text-[11px] font-semibold text-center shrink-0 w-9 ${
                  active === i ? "text-green-600" : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
              {i < steps.length - 1 && <div className="flex-1" />}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100 rounded-full mb-10 max-w-sm mx-auto overflow-hidden">
          <div
            className="bg-green-500 rounded-full h-full transition-all duration-50"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Main panel */}
        <div
          className={`transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Left: text */}
            <div className="flex flex-col gap-4">
              <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full w-fit border border-green-100">
                Step {active + 1} of 3
              </span>
              <h3 className="text-2xl font-bold text-gray-900">{current.title}</h3>
              <p className="text-gray-600 leading-relaxed">{current.description}</p>
              <ul className="space-y-2 mt-2">
                {current.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-green-500 mt-0.5 shrink-0 font-bold">✓</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: code panel */}
            <div className="bg-gray-900 rounded-2xl p-6 overflow-x-auto">
              {current.code}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

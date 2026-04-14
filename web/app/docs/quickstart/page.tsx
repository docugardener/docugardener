// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Quick Start — DocuGardener Docs",
  description:
    "Get up and running with DocuGardener SaaS in 5 minutes. No credit card required.",
}

const STEPS = [
  {
    number: 1,
    title: "Sign up",
    body: (
      <>
        Go to{" "}
        <a
          href="https://docugardener.io"
          className="text-green-600 underline underline-offset-2 hover:text-green-700"
        >
          docugardener.io
        </a>{" "}
        and click <strong>Get started free</strong>. Sign in with your GitHub account. The Free
        plan includes 50 PR analyses per month, 1 repository, and 1 seat — no credit card
        required.
      </>
    ),
  },
  {
    number: 2,
    title: "Create your GitHub App",
    body: (
      <>
        After signing in, DocuGardener walks you through a guided wizard. Click{" "}
        <strong>Create &amp; Install GitHub App</strong> — you will be redirected to GitHub to
        approve permissions (read repository contents, write check runs). The whole process takes
        about 2 minutes.
      </>
    ),
  },
  {
    number: 3,
    title: "Select repos to monitor",
    body: (
      <>
        Once you return from GitHub, pick which repositories DocuGardener should watch. You can
        always add or remove repos later from <strong>Settings &rarr; Repositories</strong>.
      </>
    ),
  },
  {
    number: 4,
    title: "Open a pull request",
    body: (
      <>
        That&rsquo;s it for setup. Open any pull request in a monitored repository. DocuGardener
        automatically receives a webhook, analyses the changes, and posts a drift analysis as a
        GitHub check run directly on the PR.
      </>
    ),
  },
  {
    number: 5,
    title: "Review findings",
    body: (
      <>
        Visit the <strong>Triage Inbox</strong> in your DocuGardener dashboard to review drift
        findings. From there you can apply one-click fixes (which open a documentation PR), dismiss
        findings with a reason, or mark items as &ldquo;no update needed.&rdquo;
      </>
    ),
  },
]

export default function QuickStartPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Quick Start
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Get DocuGardener running on your repositories in under 5 minutes.
      </p>

      <div className="space-y-8">
        {STEPS.map((step) => (
          <div key={step.number} className="flex gap-4">
            {/* Number badge */}
            <div className="flex-none w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold mt-0.5">
              {step.number}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 mb-1">{step.title}</h2>
              <p className="text-gray-600 leading-relaxed">{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Timing note */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mt-8 mb-4">
        <strong>Note:</strong> The first analysis takes 30 -- 90 seconds depending on repository
        size. Subsequent analyses on the same repo are faster because the vector embeddings are
        already cached.
      </div>

      {/* What happens next */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">What Happens Next?</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Every time someone opens or updates a pull request in a monitored repo, DocuGardener will
        automatically:
      </p>
      <ol className="list-decimal list-inside text-gray-600 space-y-2 mb-4">
        <li>Clone the PR branch and parse the changed files.</li>
        <li>Embed documentation and code into a vector database for semantic comparison.</li>
        <li>
          Use an LLM to score documentation drift (0 = in sync, 100 = severely outdated).
        </li>
        <li>Post results as a GitHub check run on the PR.</li>
        <li>
          If AI Author Mode is enabled and the PR was authored by an AI agent, automatically open
          and merge a documentation fix PR.
        </li>
      </ol>

      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Upgrading Your Plan</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        The Free plan is a great starting point. When you need more repositories, seats, or higher
        analysis limits, upgrade to <strong>PRO</strong> ($29/month — 500 analyses, 5 repos, 10
        seats) or <strong>TEAM</strong> ($79/month — unlimited) from{" "}
        <strong>Settings &rarr; Billing</strong>.
      </p>
    </>
  )
}

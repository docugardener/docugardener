// SPDX-License-Identifier: AGPL-3.0-or-later
export interface FAQItem {
  id: string
  question: string
  answer: string
}

export interface FAQGroup {
  label: string
  items: FAQItem[]
}

export const faqGroups: FAQGroup[] = [
  {
    label: "WHAT & WHY",
    items: [
      {
        id: "q1",
        question: "What is DocuGardener?",
        answer:
          "DocuGardener is the documentation safety net for AI-native engineering teams. As Copilot, Cursor, and Devin write more of your code, DocuGardener detects documentation drift in every PR \u2014 and for AI-authored PRs, drafts and merges the fix automatically. For human PRs it flags the issue, generates the exact Markdown fix, and routes it to a triage inbox. No code is ever stored.",
      },
      {
        id: "q2",
        question: "What problem does it solve?",
        answer:
          "It prevents stale docs from causing broken integrations, failed onboarding, outdated runbooks, and audit gaps. When code changes, the related documentation should not silently fall behind.",
      },
      {
        id: "q3",
        question: "How is it different from an AI documentation writer?",
        answer:
          "DocuGardener verifies and remediates documentation drift inside the pull-request workflow, not just generates text. It combines deterministic checks, model-assisted analysis, and auditability so teams can trust the result more than a generic writing assistant.",
      },
      {
        id: "q4",
        question: "Why pay for it if the team already uses docs-as-code?",
        answer:
          "Docs-as-code solves versioning. It does not automatically solve truth. DocuGardener adds the missing control: verifying that the documentation still matches what the code now does.",
      },
      {
        id: "q4b",
        question: "How is DocuGardener different from AI doc generators?",
        answer:
          "Doc generators create documentation from scratch \u2014 they read your code and produce Markdown, Word files, or PDFs. DocuGardener solves the problem that comes after: keeping those docs accurate as the codebase evolves. It monitors every PR for drift between code and existing documentation, flags what went stale, and auto-fixes it. The two are complementary \u2014 one writes, the other maintains.",
      },
    ],
  },
  {
    label: "HOW IT WORKS",
    items: [
      {
        id: "q10",
        question: "How does it handle AI-authored PRs \u2014 Copilot, Cursor, Devin?",
        answer:
          "AI Author Mode is the headline capability. When enabled, DocuGardener detects AI-authored PRs via four independent signals: a bot-suffix sender login (highest confidence), a known AI branch prefix (copilot/, cursor/, claude/), an attribution marker in the PR body (e.g. \u2018Co-authored-by: GitHub Copilot\u2019), or a custom pattern you define. Once detected, it opens a documentation fix PR automatically \u2014 no inbox action required \u2014 and merges it when CI passes. You choose the merge method: squash, merge commit, or rebase. The fix PR body includes an \u2018AI Authorship Signal\u2019 row so reviewers always know what triggered the automation.",
      },
      {
        id: "q5",
        question: "How does it work for human-authored PRs?",
        answer:
          "Install the GitHub App, open a pull request, and DocuGardener checks whether the code change affects documentation. If it finds drift, it flags the issue in a GitHub check run, suggests the exact Markdown fix, and queues it in the Triage Inbox for review. From there you can apply the suggestion, open an auto-fix PR, or dismiss with a written reason.",
      },
      {
        id: "q6",
        question: "What kinds of documentation does it check best?",
        answer:
          "DocuGardener is strongest on documentation tightly coupled to code: API docs and OpenAPI specs, README and onboarding guides, runbooks and operational playbooks, and architecture decision records.",
      },
      {
        id: "q7",
        question: "Does it block pull requests?",
        answer:
          "Yes, when the configured severity threshold is met. The goal is not to add friction for its own sake, but to stop documented behavior from drifting away from shipped behavior.",
      },
      {
        id: "q8",
        question: "What if the team decides no documentation update is needed?",
        answer:
          "Teams can dismiss a finding, but DocuGardener makes that decision explicit. For higher-severity drift, the workflow can require a reason so the decision is attributable and auditable.",
      },
      {
        id: "q9",
        question: "Does DocuGardener write the documentation update for me?",
        answer:
          "Yes. Instead of only saying \u2018update your docs,\u2019 it can suggest the exact fix and, when enabled, open an auto-fix PR so the team reviews and merges rather than writes from scratch.",
      },
      {
        id: "q11",
        question: "Does it work before code reaches CI?",
        answer:
          "Yes. A VS Code pre-push workflow backed by a stateless /check endpoint lets teams catch likely documentation drift before pushing changes upstream.",
      },
      {
        id: "q11b",
        question: "Can DocuGardener keep AI coding tool instruction files up to date?",
        answer:
          "Yes. The Agent Governance module compiles your documentation policy into native instruction files for every AI coding tool your team uses: AGENTS.md (Claude Code, Gemini CLI, and generic agent frameworks), .github/copilot-instructions.md (GitHub Copilot), .cursor/rules/docugardener.mdc (Cursor AI), and CLAUDE.md (Claude Code project instructions). When policy changes, DocuGardener detects staleness and opens a PR to update all instruction files \u2014 keeping every AI tool aligned with the same documentation requirements, from a single source of truth.",
      },
    ],
  },
  {
    label: "SECURITY & PRIVACY",
    items: [
      {
        id: "q12",
        question: "Does DocuGardener store our source code?",
        answer:
          "The product is designed for ephemeral processing and zero-retention. Repository content is processed during analysis, but the source code itself is not persisted after the job completes.",
      },
      {
        id: "q13",
        question: "Can we use our own model provider?",
        answer:
          "Yes. DocuGardener supports BYOK in cloud and local modes. Teams can route through their own provider agreements or run local Ollama models for stronger control over data flow and infrastructure boundaries.",
      },
      {
        id: "q14",
        question: "What security features are built in?",
        answer:
          "Ephemeral analysis environments, zero source code retention, tenant isolation, RBAC, prompt guardrails, and a tamper-evident audit log with SHA-256 hash chaining.",
      },
      {
        id: "q14b",
        question: "Where can I find your Privacy Policy and Terms of Service?",
        answer:
          "Both are published on this site. The Privacy Policy explains what data we collect, how repository content is processed transiently, and your rights. The Terms of Service covers customer content ownership, BYOK provider terms, and our AI suggestion disclaimer. Links are in the footer of every page.",
      },
      {
        id: "q14c",
        question: "Will DocuGardener use our code to train AI models?",
        answer:
          "No. DocuGardener will not use your repository content or documentation to train its own models. In SaaS mode the analysis request is routed to a bundled hosted LLM provider under its standard terms. In BYOK mode, your chosen provider\u2019s data-use policy applies directly between you and that provider.",
      },
    ],
  },
  {
    label: "SELF-HOSTING",
    items: [
      {
        id: "q21",
        question: "Do I need a registered domain to self-host?",
        answer:
          "Yes, for automatic TLS via Let\u2019s Encrypt you need a public domain with an A record pointing to your server. For internal or private-network deployments without a domain, Caddy can issue a self-signed certificate \u2014 browsers will show an untrusted-certificate warning until you add Caddy\u2019s local CA to your trust store, which is usually acceptable for developer-audience tools.",
      },
      {
        id: "q22",
        question: "Is the self-hosted version secure out of the box?",
        answer:
          "Yes, when deployed with the production Docker Compose. Caddy handles automatic HTTPS so all traffic is encrypted, session cookies get the Secure flag, and GitHub OAuth works correctly. Internal services (Postgres, Redis, Weaviate, FastAPI) have no host-port bindings and are only reachable inside the private Docker network. The dev compose is HTTP-only and is not suitable for internet-facing deployments.",
      },
      {
        id: "q23",
        question: "How do I deploy DocuGardener?",
        answer:
          "Clone the repo, copy .env.production.example to .env.production, run bash scripts/generate-secrets.sh to generate all secrets, fill in your domain and GitHub credentials, then run: docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d --build. Caddy obtains a TLS certificate automatically on first start. Full step-by-step instructions are in DEPLOYMENT.md.",
      },
      {
        id: "q24",
        question: "What ports need to be open on the server?",
        answer:
          "Only 22 (SSH), 80 (HTTP \u2014 required for the Let\u2019s Encrypt challenge and to redirect to HTTPS), and 443 (HTTPS). All other ports \u2014 including the FastAPI port 8000, Postgres 5432, Redis 6379, and Weaviate 8080 \u2014 should be blocked at the firewall level. The production compose does not bind those services to host ports, but a top-level firewall rule is recommended as a second layer of defense.",
      },
      {
        id: "q25",
        question: "Can I self-host on a private network without a public domain?",
        answer:
          "Yes. Replace the Let\u2019s Encrypt block in docker/Caddyfile with tls internal and set your server\u2019s internal IP or hostname as the domain. Caddy generates a local CA and issues a certificate automatically. You can either accept the browser warning or run caddy trust on each client machine to add the CA to the system trust store.",
      },
    ],
  },
  {
    label: "PLANS & FIT",
    items: [
      {
        id: "q15",
        question: "What plans are available?",
        answer:
          "Free ($0): 1 public repo, 50 PR analyses/month — drift detection, triage inbox, AI Author Mode, and BYOK. Pro ($29/mo): 5 repos (public + private), 500 analyses/month, bundled LLM (no API key needed), Slack/Jira/Linear integrations, Agent Governance, analytics, and audit log. Team ($79/mo): unlimited repos and analyses, 100 seats, SSO/SAML, SCIM provisioning, audit evidence export, compliance templates, and DPA on request. Annual billing saves 20%.",
      },
      {
        id: "q15b",
        question: "Why pay for hosted when self-hosting is free?",
        answer:
          "Self-hosting is genuinely free and always will be under the AGPL license — no feature gates, no license checks. The SaaS plan charges for three things self-hosters must provide themselves: zero-ops infrastructure (no server to configure, patch, or monitor), a bundled LLM (no API key or spend to manage), and a one-click GitHub Marketplace install. If your team is comfortable running Docker and managing an LLM API key, self-hosting is the right call. If you want to be in production in three minutes with no infrastructure work, the hosted plan is worth it.",
      },
      {
        id: "q16",
        question: "Is there a way to try it on a private repository?",
        answer:
          "Yes. A 14-day Pro trial is available for one private repo with limited seats, so teams can evaluate the workflow on real internal code before purchasing.",
      },
      {
        id: "q17",
        question: "Who is DocuGardener for first?",
        answer:
          "The primary self-serve entry point is platform engineers and tech leads who feel documentation drift in daily delivery. The expansion path moves into security and compliance teams when audit, SSO, or evidence export become important.",
      },
      {
        id: "q18",
        question: "Is it built for regulated teams, or only for developers?",
        answer:
          "Both. Platform engineers use it to reduce review friction and stop stale merges. Security and compliance teams use it for evidence, traceability, and documentation governance.",
      },
      {
        id: "q19",
        question: "How is this different from GitBook, Mintlify, or docs portals?",
        answer:
          "DocuGardener is not a publishing portal. It is a verification and remediation layer that lives in the PR and CI workflow, keeping docs accurate as code changes \u2014 not a place to host them.",
      },
      {
        id: "q20",
        question: "What is the fastest way to see value?",
        answer:
          "Install the GitHub App, connect a repository, and let DocuGardener scan the next PR that changes an API or setup flow. The first useful moment happens inside your existing workflow, not after a long setup project.",
      },
      {
        id: "q20b",
        question: "Do you have a DPA for enterprise procurement?",
        answer:
          "Yes. A Data Processing Agreement is available on request for Team plan customers \u2014 email legal@docugardener.dev. The DPA covers GDPR Article 28 processor obligations, transient code processing, subprocessor controls, and our no-training-on-customer-content commitment.",
      },
    ],
  },
]

# DocuGardener — GTM Motion Playbook

**Internal use only.**
**Last updated:** 2026-03-30
**Source:** Owner Review Decision Record C-2 / IDEA-12

---

## The Motion in One Sentence

> Platform engineers self-serve on the free tier → experience the "magic moment" → upgrade to Pro for private repos and integrations → compliance teams expand to Team for SSO and audit evidence.

---

## 1. The Funnel

### Stage 0 — Awareness (GitHub Marketplace + word of mouth)

**Entry trigger:** Developer discovers DocuGardener on GitHub Marketplace, via a colleague's recommendation, or through a blog post / tweet about "documentation drift."

**Persona:** Individual developer or platform engineer. Often the person who manages CI/CD infrastructure or gets paged when a deploy breaks because docs were wrong.

**Success metric:** GitHub App installed on at least one public repository.

**Message:** "Your docs are already out of date. Install in 3 minutes. Free forever for one public repo."

**No friction required.** One-click GitHub App install from Marketplace. Bundled Gemini key means zero API key setup. First PR scan happens automatically.

---

### Stage 1 — Free (Credibility + Habit Formation)

**Limit:** 1 public repo, 50 PR analyses/month, 1 seat.

**Entry trigger:** GitHub App installed. First PR analyzed.

**The "magic moment":** The first PR that is correctly blocked because a function signature changed but the README was not updated. The developer sees exactly which file needs to change and what the suggested update is — not a generic complaint, a precise fix.

**Habit loop:** Every PR with a documentation implication now goes through the inbox. The developer either accepts, ignores (with a reason), or auto-merges the fix PR. This becomes part of the workflow within 2 weeks.

**Conversion pressure:**
- 50 PR/month quota approaches → upgrade prompt in check run annotation and billing dashboard.
- Private repo attempt → "Private repos require a Pro plan or 14-day trial."
- Colleague wants access → "1 seat on Free. Add your team on Pro."

**Success metric:** 3+ consecutive weeks of active triage (team is habituated to the workflow).

---

### Stage 2 — Trial (14-day PRO evaluation)

**Limit:** PRO features for 14 days on 1 private repo, 3 seats. One-time per tenant.

**Entry trigger:** Free user attempts to sync a private repo OR clicks "Start Free Trial" on billing page.

**What unlocks:**
- 1 private repo (the team's actual codebase)
- 3 seats (TL + 2 engineers)
- Slack/Jira integrations (to see notifications in real workflow)
- Ignore-rate analytics (to see team bypass patterns)
- Prompt Engineering Playground (to tune verification strictness)

**Goal:** Prove value on the buyer's real private codebase before asking for a credit card.

**Conversion trigger:** Trial expiry banner ("Trial ends in 3 days — upgrade to Pro to keep your private repo connected") + email sequence (Day 1: getting started, Day 7: usage summary, Day 12: expiry warning + upgrade CTA).

**Success metric:** Private repo scanned at least 5 times during trial AND at least 1 triage action taken in the inbox.

---

### Stage 3 — Pro ($29/mo)

**Limit:** 5 repos (public + private), 500 PR analyses/month, 10 seats.

**Entry trigger:** Trial expires with active usage OR team exceeds free tier quota.

**What unlocks (beyond trial):** Nightly rollup digest, AUDITOR and BILLING_ADMIN roles, full audit log (90-day retention), expanded quota.

**Buyer persona shift:** The buyer is now a team lead or engineering manager who approves the subscription. The champion is still the platform engineer from Stage 0–2.

**Internal sell:** Platform engineer presents to manager: "We've been using this for 2 weeks. It caught 4 instances of stale API docs before they merged. $29/month."

**Expansion signal:** > 7 seats, compliance-related questions in support, questions about SSO.

---

### Stage 4 — Team ($79/mo) — Compliance Expansion

**Limit:** Unlimited repos, unlimited PR analyses, 100 seats.

**Entry trigger:** Compliance team, security lead, or CTO gets involved after an audit question OR the engineering team outgrows Pro limits.

**What unlocks:** SSO/SAML + SCIM provisioning, session idle timeout, evidence export (CSV/JSON), unlimited repos/analyses, on-premise Helm chart (negotiated separately).

**Buyer persona shift:** The deal now involves a new stakeholder — security or compliance leadership. This is a different conversation than the initial platform eng install.

**Compliance expansion trigger questions (listen for these in support or sales conversations):**
- "Can I get a report showing all documentation decisions for Q1?"
- "We need SSO — our security team won't approve tools without it."
- "We're going through SOC2 and need to demonstrate documentation governance."
- "Can we run this on-premise? Our code can't leave our network."

**Success metric at this stage:** Signed annual contract; compliance team actively exporting evidence reports.

---

## 2. Buyer Persona Profiles

### Persona A — Platform Engineer / Tech Lead

**Title:** Senior Software Engineer, Staff Engineer, Platform Engineer, Engineering Manager (IC or lead)
**Size:** 5–200 person engineering team
**Industry:** Any — but highest pain in fast-moving teams with API surfaces (SaaS, FinTech, developer tools)

**Primary pain:**
- Stale docs causing production incidents ("integrators broke because the API changed and nobody updated Swagger")
- AI coding tools (Copilot, Cursor) accelerating PR volume without proportional doc coverage
- Manual doc review taking 30–60 minutes per PR, often skipped under deadline pressure

**Values:**
- Minimal setup friction (zero-config is a hard requirement — they won't configure 5 things to evaluate a tool)
- Fits existing GitHub PR workflow — no new tool to learn
- Gives the developer the fix, not just the complaint
- Pre-push IDE check to catch issues before CI

**How they find us:** GitHub Marketplace search, tweet/post from another platform eng, engineering blog post, word of mouth from a developer who used us at a previous company.

**How they evaluate:** Installs it. Runs it on their repo. Waits for a PR that changes a documented function. Judges the quality of the drift detection and the specificity of the suggested fix.

**What closes them:** The magic moment (first correctly blocked PR). The auto-fix PR feature. The VS Code pre-push check. The inbox keyboard shortcuts (they will try `j/k/a/i`).

**What repels them:** Setup complexity, false positives, generic complaints without specific fixes, any requirement to invite a salesperson before trying.

---

### Persona B — Security / Compliance Lead

**Title:** CISO, VP Engineering, Head of Security, Compliance Officer, CTO (at regulated companies)
**Size:** 50–2000 person organization
**Industry:** FinTech, MedTech, Enterprise SaaS, defense contractors, healthcare

**Primary pain:**
- Auditors asking "prove that your API documentation was accurate at time of the SOC2 review window"
- Undocumented changes creating compliance gaps that are only discovered during audits
- No attribution or evidence trail for documentation governance decisions
- Manual documentation review processes that are error-prone and not defensible

**Values:**
- Tamper-evident audit trail (not just logs — cryptographically verifiable)
- Zero data retention (can sign a DPA that says nothing leaves their environment)
- SSO/SAML (non-negotiable for any enterprise tool with user access)
- Role separation (auditors should not be able to modify data; ADMIN should not be able to suppress audit logs)
- On-premise or VPC deployment option

**How they find us:** Their platform engineer already has DocuGardener running on Pro. The compliance question comes up internally: "Does this tool produce audit evidence?" The platform eng contacts support or the engineer discovers the Team plan features.

**How they evaluate:** They do not self-serve. They need a conversation, a DPA, a security questionnaire response, and often a trial on their private infrastructure.

**What closes them:** The SHA-256 hash chain audit log demo ("show me that you cannot tamper with this record"). The evidence export CSV/JSON. The zero-retention architecture description in plain language. A signed DPA. References from a similar regulated company.

**What repels them:** Vague answers about data residency. "We store some metadata for analytics" without clear specification. Inability to provide a DPA. Shared tenant infrastructure without isolation proof.

---

## 3. Beachhead Messaging by Documentation Type

Use these hooks in outreach, landing pages, and demo narratives. Lead with the specific pain before introducing DocuGardener.

### API Documentation (Swagger / OpenAPI)

**The pain:** A developer adds a required parameter to `POST /checkout` but does not update the Swagger spec. Integrators push code that breaks in production. The incident post-mortem always includes "API docs were out of date."

**The hook:** "Stop your API docs from breaking your integrators. DocuGardener blocks the PR until the Swagger spec matches the code."

**Proof point:** "Every time a function signature changes, your API doc gets a verification check before it can merge."

---

### README / Onboarding Docs

**The pain:** A new engineer follows the README to set up the dev environment. The Docker command fails because someone changed the compose file 3 months ago and forgot to update the README. Onboarding now takes 2 days instead of 2 hours.

**The hook:** "Guarantee your README is always executable. DocuGardener checks every change to your docker-compose, Makefile, and setup scripts against the README that references them."

**Proof point:** "Your onboarding docs are drift-checked on every PR. New hires set up in 30 minutes, not 2 days."

---

### Runbooks (Incident Response Playbooks)

**The pain:** A P1 incident occurs at 2am. The on-call engineer follows the runbook step 3: "Restart the service with `kubectl rollout restart deployment/payment-api`." The command fails because the deployment was renamed 6 weeks ago. The runbook was never updated. The incident lasts 40 minutes instead of 5.

**The hook:** "Stale runbooks extend incidents. DocuGardener verifies that every infrastructure change that affects your runbooks gets a documentation update before it merges."

**Proof point:** "Your incident response playbooks are guaranteed to match your current infrastructure. No more 2am surprises."

---

### Architecture Decision Records (ADRs)

**The pain:** A new senior engineer reads the ADR that says "we use PostgreSQL as the primary store." But the team migrated 40% of the workload to DynamoDB 6 months ago. The ADR was never updated. The engineer designs the next feature against the wrong assumptions.

**The hook:** "Architecture docs that lie are worse than no architecture docs. DocuGardener detects when infrastructure-altering PRs conflict with your ADRs."

**Proof point:** "Your ADRs reflect what the system actually is — not what it was when someone last had time to write it down."

---

## 4. GitHub Marketplace Listing Copy

### Short Description (160 chars max)

```
Block merges when docs fall behind code. CI-native drift detection with tamper-evident audit evidence. Free for public repos.
```

### Long Description

**Stop stale docs from breaking your team.**

Every week, developers merge PRs that change APIs, update configurations, or refactor core modules — without updating the documentation. The result: broken integrators, failed onboarding, 2am runbook failures, and audit gaps.

DocuGardener is a GitHub App that lives in your CI/CD pipeline. It analyzes every Pull Request, detects when code changes contradict your documentation, and blocks the merge until the docs are updated — or a team decision is made and logged.

**How it works:**
1. Install the GitHub App on your repositories (2 minutes, no API key required to start)
2. Open a Pull Request that changes documented code
3. DocuGardener posts a check run with the drift score and the exact suggested fix
4. Accept the fix, ignore with a reason, or let DocuGardener open an auto-fix PR for you

**What makes it different:**

🔒 **Zero data retention** — Source code is analyzed in RAM and wiped instantly. We never store your code.

🤖 **Auto-fix PRs** — DocuGardener drafts the documentation update and opens a PR. You just review and merge.

🤖 **AI Author Mode** — When code is generated by Copilot or Cursor, DocuGardener detects it and handles documentation automatically. Zero human touchpoint.

📋 **Tamper-evident audit log** — Every drift decision is cryptographically logged with SHA-256 hash chaining. Exportable as CSV for SOC2 and ISO 27001 workflows.

🔌 **Bring Your Own Key (BYOK)** — Connect your own Gemini, OpenAI, or local Ollama endpoint. Your LLM costs go to your agreement, not ours.

🛡️ **Enterprise-ready** — SSO/SAML, SCIM provisioning, RBAC with four roles (Admin, Auditor, Billing Admin, Viewer), session management, on-premise Helm chart.

**Plans:**
- **Free**: 1 public repo, 50 PR analyses/month — forever free
- **Pro ($29/mo)**: 5 repos (private + public), 500 analyses/month, Slack/Jira, analytics
- **Team ($79/mo)**: Unlimited repos and analyses, SSO, audit evidence export, on-premise

**Try Pro free for 14 days on one private repo. No credit card required.**

### Feature Tags (for Marketplace categorization)

`documentation` `code-quality` `ci-cd` `compliance` `audit` `developer-tools` `ai` `drift-detection`

---

## 5. Outbound Email Templates

### Template A — Platform Engineering Angle

**Subject:** Your API docs are probably wrong right now

---

Hi [First Name],

Not a gotcha — just a probability statement. If your team merges more than 5 PRs a week, statistically at least one of them changed a documented API, configuration, or behavior without updating the docs.

I built DocuGardener to solve exactly this. It's a GitHub App that lives in your CI pipeline and blocks a PR from merging when code changes contradict your documentation.

Key details:
- Installs in 2 minutes, first scan happens automatically on the next PR
- Suggests the exact documentation fix inline in the check run
- Can open an auto-fix PR so the developer just reviews and merges
- Zero code retention — everything is analyzed in RAM and wiped

It's free for one public repo. If you have private repos, there's a 14-day trial with no credit card.

Would it be worth 15 minutes to see it catch something on one of your repos?

[Name]
DocuGardener

---

### Template B — Compliance / Security Angle

**Subject:** Can you prove your API documentation was accurate last quarter?

---

Hi [First Name],

Most engineering teams cannot answer that question without manually checking git history across every repository — which nobody has time to do before an audit.

DocuGardener produces a cryptographically verifiable audit trail of every documentation governance decision in your GitHub workflow. Every time a developer accepts, ignores, or dismisses a documentation drift finding, it is recorded with their identity, timestamp, and justification — using SHA-256 hash chaining that makes tampering detectable.

The audit log is exportable as CSV or JSON for SOC2, ISO 27001, or custom audit workflows.

What the tool does technically: it analyzes every Pull Request and blocks merges when code changes contradict your documentation. Nothing is retained — all analysis happens in RAM.

If you're heading into an audit and want to demonstrate documentation governance controls, I'd like to show you the evidence export in 15 minutes.

[Name]
DocuGardener

---

*Maintained by: GTM / Product Owner*
*Review cycle: Before each major outbound campaign*

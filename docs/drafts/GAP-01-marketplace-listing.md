# GAP-01 — GitHub Marketplace Listing Draft

> **Status:** DRAFT — awaiting owner approval before submission
> **Submitted by:** Agent, 2026-04-18
> **Action required:** Review all sections, approve or redline, then submit via GitHub UI under `docugardener` org

---

## App name
**DocuGardener**

---

## Short description (160 chars max)
> *Used on Marketplace search cards and category pages*

```
AI-powered documentation drift detection. Automatically finds and fixes docs that fall behind your code on every pull request.
```
*(128 chars)*

---

## Category
**Code review** (primary)
**Testing** (secondary)

---

## Pricing

| Plan | Price | Included |
|---|---|---|
| Free | $0/month | 1 repo, 10 analyses/month, community support |
| Pro | $29/month | 10 repos, 500 analyses/month, AI auto-fix PRs, Slack notifications |
| Team | $99/month | Unlimited repos, unlimited analyses, SSO, SCIM, Jira/Linear integrations, audit log |

---

## Long description (Marketplace listing body)

### Keep your docs from lying to your team.

DocuGardener watches every pull request and automatically detects when code changes leave documentation behind — before the PR merges.

**How it works:**
1. Install the GitHub App — takes 2 minutes, no config files needed
2. DocuGardener reads every PR's diff and checks it against your docs
3. Drift found → check run fails with a precise inline report
4. One click → AI generates a fix PR with updated docs

**What it catches:**
- Function signatures changed but docstrings/README not updated
- New API endpoints with no documentation
- Deleted methods still referenced in docs
- Config parameters renamed without updating examples

**Why teams use it:**
- Docs rot silently. By the time someone notices, the gap is months deep.
- Code review catches bugs. DocuGardener catches the documentation debt those bugs create.
- Zero workflow change — it shows up as a GitHub check run, just like your CI.

**Enterprise features:**
- SSO (SAML 2.0 / Okta) + SCIM user provisioning
- Audit log with tamper-evident hash chaining
- BYOK (bring your own LLM key — OpenAI, Anthropic, Gemini, or local Ollama)
- Jira and Linear integration — drift findings create issues automatically
- Policy-as-Code — define custom documentation rules in `.docugardener/rules.yml`

**Open source:**
DocuGardener is AGPL-3.0 licensed. Self-host for free, or use our managed SaaS at [docugardener.dev](https://docugardener.dev).

---

## Screenshots needed (placeholders — owner to provide)
1. Check run failing with drift report on a PR
2. AI-generated fix PR diff view
3. Inbox triage view (dashboard)
4. Settings → Integrations page

---

## Support / documentation URLs
- Docs: `https://docugardener.dev/docs`
- Support email: `support@docugardener.dev`
- Privacy policy: `https://docugardener.dev/privacy`
- Terms: `https://docugardener.dev/terms`

---

## Notes for submission
- Must be submitted by a GitHub org owner of `docugardener`
- Marketplace URL will be: `https://github.com/marketplace/docugardener`
- Billing integration: Stripe is wired — `BILLING_ENABLED=true` must be set before submission (GAP-04)
- Screenshot dimensions: 1280×800 minimum, PNG preferred

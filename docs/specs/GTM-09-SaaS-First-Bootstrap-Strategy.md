# GTM-09 — SaaS-First Bootstrap Strategy

**Internal use only. Decision record.**
**Date:** 2026-03-12
**Updated:** 2026-03-30 — Strategic pivot to AGPL open-source + SaaS-first. See update notes at bottom of document.
**Context:** Strategic review of OSS Community Edition vs. SaaS-First approach for a bootstrapped, capital-constrained launch.

---

## Decision

**Drop the OSS Community Edition plan. Focus entirely on SaaS with a frictionless free tier.**

This is not a deferral — it is a deliberate strategic choice based on the product's setup profile, target persona, and available resources.

---

## Why the OSS Community Edition Doesn't Work Here

The community edition model delivers value when:
- Install-to-value time is under 5 minutes
- The tool works in isolation (no external dependencies)
- The core technology is genuinely useful standalone

DocuGardener's setup profile is the opposite:

| Step | Friction |
|---|---|
| GitHub App installation | Requires org admin, non-trivial for casual evaluation |
| Docker stack | FastAPI + Next.js + Postgres + Weaviate + Redis + worker + scheduler |
| First result | Only visible after pushing a real PR against a repo with existing docs |
| Meaningful result | Requires the repo to already have documentation to drift from |

A developer who discovers DocuGardener on a Tuesday afternoon will not complete this setup to evaluate it. They will close the tab.

A crippled community edition makes this worse: they invest 2 hours in setup, find the interesting features are paywalled, and the experience becomes a net negative for brand perception. Bait-and-switch is the worst possible first impression with a technical audience.

**Additional overhead that OSS creates at this stage:**
- Two codebases to maintain (OSS + SaaS)
- Community management: GitHub issues, PRs, support questions
- Prompt/IP protection complexity (see: `GTM-09` analysis of moats)
- Divergence pressure: OSS users request features that pull roadmap away from SaaS priorities

None of this overhead creates revenue. At a bootstrapped stage with limited capital, every engineering hour must move toward the "two legs" stability target.

---

## The "Two Legs" Stability Target

The business goal is not hypergrowth. It is **self-funding stability** that funds continued development and ecosystem expansion.

Target: **100 paying teams at $25–50/month average = $2,500–5,000 MRR**

This covers:
- Infrastructure costs
- Development time
- Creates runway for the next product in the ecosystem

Achieving this does not require a mass marketing campaign, a viral OSS project, or enterprise sales motion. It requires a **developer-led, word-of-mouth flywheel** where one developer discovers the product, it solves a real problem, they bring it to their team, and the team upgrades.

The acquisition math: 100 paying teams from a base of ~500 active free-tier teams (20% conversion). Reaching 500 active teams requires roughly 2,000–3,000 installs over 12–18 months. That is achievable through the channels below without paid acquisition.

---

## The "Aha Moment" — Non-Negotiable Design Constraint

Every acquisition decision must be evaluated against this path:

```
Install GitHub App   (2 min, one click from Marketplace)
→ Connect one repo   (1 min)
→ Push a small PR
→ See the drift check run appear with a score and explanation
→  ↑ This is the aha moment. Everything else is noise.
```

**The hosted SaaS free tier is the only way to deliver this experience for a cold evaluator.** An OSS self-hosted version cannot. The free tier must feel generous enough that teams use it for 2–4 weeks before hitting the upgrade wall. Hitting it naturally (because the product works and they want more) is the right conversion trigger. Hitting it in week 1 creates churn.

Current free tier limits (1 repo, 50 PR/month) are reasonable. The frictionless setup path — bundled Gemini key, no API configuration required — is the competitive advantage over any self-hosted alternative.

---

## Acquisition Channels — Ranked by ROI for Bootstrapped Stage

### Tier 1: Zero Cost, Highest Intent

**1. GitHub Marketplace listing**
The single most important distribution move. Developers searching for documentation tools have buying intent. The listing inherits GitHub's trust — no cold relationship to establish. GitHub handles OAuth, billing infrastructure, and discovery ranking.

Actions:
- Complete listing with GIF demo showing a real check run appearing on a PR
- Clear headline: "Drift detection for documentation — runs on every PR"
- Collect first 10 reviews actively (reach out to early users directly)
- Apps with reviews rank meaningfully higher in Marketplace search

**2. Analyze public repos and publish findings**
Find a popular open-source project (10k+ stars, active PRs, known doc debt). Run DocuGardener against 3–6 months of their PRs. Write a data-driven post: *"We analyzed 400 PRs in [popular project] — here's what documentation drifted and why."*

This works because:
- It is not a sales post — it is genuinely useful data
- It demonstrates the product works on real code
- It gets shared by people interested in the specific project
- It positions the author as someone who understands documentation at scale

Repeat for 3–4 different ecosystems (Python libs, Go services, TypeScript monorepos). Each post is a permanent reference.

**3. Technical content — compound SEO**
Two article archetypes that consistently perform in developer communities:

*Architecture/Engineering:* "How we built two-stage deterministic verification for LLM analysis" — technical depth, attracts staff/principal engineers, establishes credibility. Publish on dev.to, Hashnode, and cross-post to personal blog.

*Problem framing:* "Documentation debt costs engineering teams X hours per month — here is the data" — targets team leads who feel the pain but haven't quantified it. Use real numbers from running the service.

3–4 hours to write, ranks on Google for years. After 6–8 articles, inbound is steady and self-sustaining.

---

### Tier 2: Moderate Effort, Strong Targeting

**4. Reddit — genuine participation, not promotion**
Target communities: r/ExperiencedDevs, r/devops, r/programming, r/softwaredevelopment.

The approach: actually participate. When someone posts "our docs are always out of date, how do you handle this?" — that is the window. Answer with what you learned building DocuGardener, mention the tool as one option among a real answer. Hard-sell gets downvoted; genuine answers get upvoted and the tool gets organic clicks.

Do not spam. One genuinely helpful comment per relevant thread is the entire strategy.

**5. ProductHunt launch — one-time burst**
Preparation required (otherwise wasted):
- Polished GIF demo of the end-to-end flow (under 60 seconds)
- Clear tagline and value prop copy
- Working free tier with instant sign-up (no waitlist)
- 10 hunter friends/early users ready to upvote and comment on launch day
- Launch on a Tuesday

Realistic outcome: 300–800 visitors that day, 20–60 sign-ups, 2–5 genuine paying conversions. More importantly: a permanent ProductHunt listing that shows up in "developer tools" Google searches for years.

**6. Target the 1,000 developers who write about this problem**
There is a specific persona: staff or principal engineers at 20–100 person companies who have publicly written about documentation rot, technical debt, or engineering culture. They have Twitter/LinkedIn audiences in the thousands. They are trusted by their followers.

Find 10–15 of them. Give them a free PRO account. Email them directly with a short personal note — not a template, not a press kit. Ask them to try it on their actual repo and give honest feedback. If it works for them, some will write about it without being asked. One tweet or LinkedIn post from a respected engineer is worth more than any paid campaign.

---

### Tier 3: Multiplier (Amplifies Everything Above)

**7. GitHub Actions workflow template**
Publish a `.github/workflows/docugardener.yml` starter template to the GitHub Actions Marketplace. Developers adding CI workflows discover it. Zero-friction entry path complementary to the App install.

**8. Integrate with existing developer workflows**
Look for where developers already talk about documentation quality: pull request templates, CODEOWNERS files, ADR templates. DocuGardener fits naturally as a mention in "how to keep docs current" articles and repo scaffolding tools.

---

## What to Skip at This Stage

| Channel | Why to Skip |
|---|---|
| Paid ads (Google, Twitter) | Developer audience is ad-blind; trust-driven not interrupt-driven; poor ROI at sub-$5k budget |
| Cold email campaigns | Saturated, low trust, high effort for low conversion in developer segment |
| Conferences / sponsorships | Expensive, slow feedback loop, wrong stage |
| Press outreach / PR agency | Requires news hook; product is not at that inflection point yet |
| Massive content volume | 2 excellent articles beat 20 mediocre ones; quality signals technical credibility |
| ~~OSS community edition (original)~~ | **Superseded 2026-03-30.** AGPL open-source is now the distribution model. See pivot notes below. |

---

## The OSS Question — Resolved 2026-03-30

> **This section was superseded by the strategic pivot on 2026-03-30.**

The OSS model was adopted: DocuGardener is now AGPL open-source with a SaaS-first go-to-market. The rationale from this document (self-hosted setup friction, crippled community edition UX, maintenance overhead) informed the final architecture — **AGPL resolves all of these**:

- **No crippled edition.** AGPL gives self-hosters the full code. Upgrade funnel = ops complexity (maintaining Docker infra), not artificial feature walls.
- **No second codebase.** SaaS and self-hosted run from the same repo. `DEPLOYMENT_MODE=saas` vs. `client-installed` controls infra-dependent paths only.
- **IP protection via AGPL copyleft.** Network-use clause covers SaaS forks. Enterprise ICP buys on trust, not enforcement.

**Enterprise ace features** (SaaS-only, not in AGPL community build): AI Author Mode (managed LLM budget), bundled managed LLM, SSO/SAML, compliance policy templates, audit log export.

These are infra-dependent or compliance-driven — not arbitrarily gated. A self-hoster can build them on their own stack using the AGPL source.

See `docs/specs/DocuGardener_Implementation_Backlog.md` Phase 12 for the active AGPL launch roadmap (DG-SAAS-01..09).

---

## Competitive Moat — What Actually Defends the Business

The analysis that prompted this decision record identified the following moat ranking (strongest to weakest):

| Moat | Defensibility | Timeline |
|---|---|---|
| GitHub Marketplace position + installation trust | Strong — enterprise orgs take 4–12 weeks to approve new App installs; first-mover advantage | Now |
| SOC2 Type II certification | Very strong — 6-month observation floor, $50–150k cost, cannot be shortened | 18–24 months |
| Drift pattern data + feedback loop | Strong if built — requires thumbs-down/thumbs-up signal on analysis results | 6–12 months after launch |
| Enterprise customer references | Compounds over time — one named customer with a quote is a significant sales tool | 6–9 months |
| Analysis prompt engineering | Weak — prompts are visible in OSS, and competent prompts are replicable in a day |  |
| Feature completeness | Weak — 80% feature parity cloneable in 4–6 weeks with AI coding assistants |  |

**Implication:** The business is not defended by the code. It is defended by trust, certification, and operational data. The strategy must optimize for those, not for protecting IP at the code level.

The most valuable engineering investment not yet made: a **feedback signal on analysis quality** (developer thumbs-down on a check run result). This creates a training signal that compounds into an accuracy advantage that a clone starting from zero cannot replicate. One developer, one week of engineering, perpetual moat improvement.

---

## Summary

| Question | Answer |
|---|---|
| OSS Community Edition? | **Yes — AGPL, resolved 2026-03-30.** One codebase, two deployment paths. |
| How to acquire users? | GitHub Marketplace + technical content + targeted developer outreach. |
| Primary conversion path? | One developer discovers → aha moment on first PR → brings team → upgrade to PRO/TEAM. |
| Stability target? | 100 paying teams, $2,500–5,000 MRR, achievable in 12–18 months. |
| When to revisit OSS? | After 100 paying customers, SOC2 in progress, pull-based enterprise demand. |
| What actually defends the business? | Marketplace position, SOC2 certification, data feedback loop, customer references. |

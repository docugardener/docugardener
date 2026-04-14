# DG-SAAS-06 — Signup & Onboarding UX

**Status:** Spec complete · Implementation pending
**Priority:** P1 · Effort: L
**Date:** 2026-03-30

---

## Problem Statement

The current flow was designed for `client-installed` deployments where an ops engineer pastes GitHub App credentials into a form. For SaaS acquisition the bar is completely different: a developer who found DocuGardener on GitHub should be able to sign up, connect a repo, and see value in under 5 minutes — with no docs, no ops, no credit card.

Current gaps:
- `/onboarding` is a raw technical form with no context, no progress, no explanation of why each field is needed
- After connecting the GitHub App the user is dropped cold into an empty dashboard with no direction
- No repo selection step — the user has to navigate to Settings to toggle repos on
- No "first PR analysis" moment — the product's core value is invisible until the user figures out the webhook trigger themselves

---

## Design Principles

1. **3 steps max** — Connect → Repos → Ready. Every extra step loses users.
2. **Defer integrations** — Slack, Jira, LLM config, team invites are post-first-value. Surface them as in-dashboard discovery prompts, not onboarding gates.
3. **Wizard path is the primary path** — Manual App ID / PEM key entry is a fallback for power users, collapsed by default.
4. **Progress is always visible** — A persistent 3-step indicator keeps the user oriented.
5. **Empty state = step 3** — The dashboard first-run state is the final onboarding step, not a dead end.

---

## User Flow

```
Landing page  ──→  /auth/signin  ──→  /onboarding  ──→  /onboarding/repos  ──→  /dashboard (empty state)
                   (existing,         (REWORK:           (NEW: repo           (REWORK:
                    minor polish)      step 1 of 3)       selector,            empty state =
                                                          step 2 of 3)         step 3 of 3)
```

**Return visitor (already has tenant):**
```
Landing page  ──→  /auth/signin  ──→  /dashboard  (skip onboarding entirely)
```

---

## Screen-by-Screen Specification

---

### Screen 0 — Sign-in  `/auth/signin`

**Status:** Existing — minor polish only

**Changes:**
- Add "New here? Free plan — no credit card required." below the card
- Add "Sign up" framing to the page title for first-time visitors
  (detect via `?signup=1` query param appended from landing page CTAs)
- When `?signup=1`: title = "Create your free account", else "Sign in to your workspace"

```
┌──────────────────────────────────────┐
│            DocuGardener              │
│    Automated Documentation Drift     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Create your free account      │  │
│  │                                │  │
│  │  [GitHub logo] Continue with GitHub │
│  │                                │  │
│  │  ─────────── or ───────────    │  │
│  │                                │  │
│  │  Email address                 │  │
│  │  [you@company.com           ]  │  │
│  │  [Send magic link →         ]  │  │
│  └────────────────────────────────┘  │
│                                      │
│  Free plan · No credit card needed   │
│                                      │
│  Enterprise SSO ↗                    │
│                                      │
│  By signing in you agree to Terms    │
│  and Privacy Policy.                 │
└──────────────────────────────────────┘
```

---

### Screen 1 — Connect GitHub App  `/onboarding`

**Status:** REWORK

**What changes:**
- Add 3-step progress indicator at the top (step 1 active)
- Add welcome headline: "Set up DocuGardener — takes about 3 minutes"
- Add one-sentence explanation of why a GitHub App is needed
- Collapse "Existing App" mode into an expandable section (not a tab) — wizard is the default view
- Remove "You will be redirected back to the dashboard upon completion." — replace with step indicator
- Add estimated time: "~2 min on GitHub, then back here automatically"

```
┌──────────────────────────────────────────┐
│  DocuGardener                            │
│                                          │
│  ① Connect ──── ② Repos ──── ③ Ready    │
│  ━━━━━━━━━━━━━━                          │
│                                          │
│  Connect your GitHub App                 │
│  DocuGardener needs a GitHub App to      │
│  watch pull requests and post drift      │
│  analysis results as check runs.         │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │  [Recommended]                   │    │
│  │                                  │    │
│  │  Auto-setup  ✦ 1 click           │    │
│  │  We pre-configure all            │    │
│  │  permissions, webhook events,    │    │
│  │  and redirect URLs.              │    │
│  │                                  │    │
│  │  ✓ Read code                     │    │
│  │  ✓ Write PRs & check runs        │    │
│  │  ✓ Webhook routing               │    │
│  │                                  │    │
│  │  [Create & Install GitHub App →] │    │
│  │  ~2 min · you'll return here     │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ▸ Already have a GitHub App?            │
│    (collapsed — expands to existing      │
│     App ID / PEM form)                   │
└──────────────────────────────────────────┘
```

---

### Screen 2 — Select Repos  `/onboarding/repos`  *(NEW)*

**Route:** `/onboarding/repos`
**Trigger:** After GitHub App is created/connected — redirect here instead of `/dashboard`

**What it does:**
- Fetches repos accessible to the installed GitHub App via Octokit
- Shows a multi-select list (checkbox per repo)
- Enables selected repos in DB (same toggle as Settings → Repositories)
- "Skip for now" goes straight to `/dashboard` with repos disabled

**API needed:** `GET /api/onboarding/repos` — lists installable repos
**API needed:** `POST /api/onboarding/repos` — enables selected repos

```
┌──────────────────────────────────────────┐
│  DocuGardener                            │
│                                          │
│  ✓ Connect ──── ② Repos ──── ③ Ready    │
│               ━━━━━━━━━━━━              │
│                                          │
│  Which repos should DocuGardener watch?  │
│  You can add or remove repos later in    │
│  Settings → Repositories.               │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │  ☐  acme/backend                 │    │
│  │  ☐  acme/frontend                │    │
│  │  ☐  acme/api-gateway             │    │
│  │  ☐  acme/docs                    │    │
│  │  ☐  acme/mobile                  │    │
│  └──────────────────────────────────┘    │
│                                          │
│  [Skip for now]    [Enable selected →]   │
│                    (disabled until ≥1    │
│                     repo checked)        │
│                                          │
│  ℹ  DocuGardener analyses PRs on push.  │
│     No changes are made to your code.   │
└──────────────────────────────────────────┘
```

**Edge cases:**
- No repos listed (App not installed on any repo): show "Install the GitHub App on at least one repo first" with a link back to GitHub App settings
- >20 repos: paginate or show search filter
- API error: show error + "Skip for now" still available

---

### Screen 3 — Ready State  `/dashboard` (empty state rework)

**Status:** REWORK of existing empty state

**What changes:**
- When `hasFirstJob === false` AND onboarding just completed: show a contextual "you're set up" banner with the step 3 indicator
- Show the connected repos as proof of setup
- Show a single clear next action: "Open a pull request in [repo] to trigger your first analysis"
- Below: a "Discover more" checklist of optional next steps — each item links directly to the relevant settings page. Items are dismissible individually.

```
┌────────────────────────────────────────────────────────┐
│  [sidebar nav]  Dashboard                              │
│                                                        │
│  ✓ Connect ──── ✓ Repos ──── ③ Ready                  │
│                            ━━━━━━━━━                   │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  🎉  DocuGardener is watching your repos         │  │
│  │                                                  │  │
│  │  Monitoring:  acme/backend  acme/frontend        │  │
│  │                                                  │  │
│  │  Next step: open a pull request in any of        │  │
│  │  these repos to trigger your first               │  │
│  │  documentation drift analysis.                   │  │
│  │                                                  │  │
│  │  DocuGardener will post the result as a          │  │
│  │  GitHub check run on the PR — nothing            │  │
│  │  else changes.                                   │  │
│  │                                                  │  │
│  │  [View connected repos →]  [Dismiss]             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌── Optional: get more from DocuGardener ──────────┐  │
│  │  ☐  Invite teammates  →  Settings → Team         │  │
│  │  ☐  Connect Slack alerts  →  Settings → Integrations │
│  │  ☐  Configure your LLM provider  →  Settings → Intelligence │
│  │  ☐  Explore documentation policies  →  Settings → Agent Governance │
│  └───────────────────────────────────────────────────┘ │
│                                                        │
│  [normal dashboard content below — jobs, inbox, etc.] │
└────────────────────────────────────────────────────────┘
```

**After first PR analysis arrives:**
- The "🎉 You're set up" banner is replaced by normal dashboard content
- The "Discover more" checklist persists until dismissed (localStorage `dg-onboarding-checklist-dismissed`)
- Step 3 indicator disappears (onboarding complete)

---

## What Is Deliberately Excluded from Onboarding

| Integration | Why deferred | Where surfaced instead |
|---|---|---|
| Slack | Requires workspace OAuth, separate setup | Settings → Integrations · post-first-analysis Slack nudge in empty inbox |
| Jira | Requires Atlassian OAuth | Settings → Integrations |
| LLM config (BYOK) | Platform mode works zero-config | Settings → Intelligence · "Discover more" checklist |
| Team invites | Not needed for solo first-run | Settings → Team · "Discover more" checklist |
| Agent governance | Advanced feature | Settings → Agent Governance · "Discover more" checklist |
| Pricing / upgrade | Free plan is default | Billing page · plan-gated feature prompts |

---

## Data & API Changes

### Existing routes (no changes to contract)
- `POST /api/onboarding/connect` — unchanged
- `GET /api/onboarding/status` — unchanged (used for "Discover more" checklist state)

### New routes
| Route | Method | Purpose |
|---|---|---|
| `/api/onboarding/repos` | GET | List repos accessible to the installed GitHub App |
| `/api/onboarding/repos` | POST | Enable selected repos (batch toggle) |

### Redirect change
- `GET /api/github/manifest/callback` — after successful App creation, redirect to `/onboarding/repos` instead of `/dashboard`
- `POST /api/onboarding/connect` (manual mode) — same redirect change

### Session / DB
- No new DB columns needed
- "Onboarding complete" state = `tenantId` set + `hasFirstJob` flag from status API
- "Discover more" checklist dismissal stored in `localStorage` only (no DB)

---

## Implementation Plan

### Phase A — Sign-in polish  *(~1h)*
- [ ] `SAAS-06-A1` Add `?signup=1` param handling to `/auth/signin` — change title + add "Free plan" note
- [ ] `SAAS-06-A2` Update landing page CTAs to append `?signup=1` to `/auth/signin` links

### Phase B — Onboarding page rework  *(~2h)*
- [ ] `SAAS-06-B1` Add 3-step progress indicator component (`OnboardingProgress`)
- [ ] `SAAS-06-B2` Rework `/onboarding` layout — welcome headline, explanation copy, progress at step 1
- [ ] `SAAS-06-B3` Collapse "Existing App" into expandable `<details>` section below wizard card
- [ ] `SAAS-06-B4` Update manifest callback redirect: `/api/github/manifest/callback` → `/onboarding/repos`
- [ ] `SAAS-06-B5` Update manual connect success redirect → `/onboarding/repos`

### Phase C — Repo selection step  *(~3h)*
- [ ] `SAAS-06-C1` `GET /api/onboarding/repos` — fetch repos from GitHub App installation
- [ ] `SAAS-06-C2` `POST /api/onboarding/repos` — batch enable repos
- [ ] `SAAS-06-C3` Build `/onboarding/repos` page — checklist, enable button, skip link, progress at step 2

### Phase D — Dashboard empty state rework  *(~2h)*
- [ ] `SAAS-06-D1` "You're set up" banner component — shows when `hasFirstJob === false` and tenant has repos
- [ ] `SAAS-06-D2` "Discover more" checklist component — 4 optional items, localStorage dismiss per item
- [ ] `SAAS-06-D3` Wire banner into dashboard layout — show above jobs/inbox, hide after first job arrives
- [ ] `SAAS-06-D4` Progress indicator at step 3 in banner

### Phase E — QA  *(~1h)*
- [ ] `SAAS-06-E1` Full flow walkthrough: new GitHub account → sign in → create app → select repo → dashboard
- [ ] `SAAS-06-E2` Edge cases: no repos available, skip repo selection, return visitor (skip onboarding)
- [ ] `SAAS-06-E3` Mobile layout check for all 4 screens

---

## Acceptance Criteria

- [ ] New user can sign in with GitHub, connect a GitHub App, select a repo, and reach the "ready" state in under 5 minutes without reading any documentation
- [ ] Progress indicator is visible and correct on all 3 onboarding screens
- [ ] Skipping repo selection is always possible — no hard gates
- [ ] Dashboard shows the "you're set up" banner only for users with no first job and at least one connected repo
- [ ] "Discover more" checklist items link to correct settings pages and dismiss independently
- [ ] Return visitors (existing tenant) are never shown the onboarding flow
- [ ] Manual App entry (existing App mode) still works — collapsed but accessible

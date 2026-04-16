# SPRINT-C: Onboarding Funnel
> Status: In progress | Owner: AI agents | Date: 2026-04-16

## Context
Free tier is the primary acquisition channel. Time-to-first-value is currently hours-to-days.
A new user who signs up and sees an empty dashboard will churn before their first PR.
This sprint closes that gap with four coordinated items.

---

## C-01: Empty State — Inbox & Dashboard

### Problem
`DriftAlertList` renders a minimal grey box when `alerts.length === 0`.
The Jobs page and Dashboard overview show nothing useful to new users.

### Acceptance Criteria
- [ ] Inbox empty state shows: headline "Waiting for your next PR", subtext explaining what will appear, a single CTA "Set up a repository →" linking to `/dashboard/settings?tab=repositories`
- [ ] Shows estimated setup status: if no repos connected → "No repositories connected yet"; if repos connected → "Monitoring N repo(s) — open a PR to trigger your first analysis"
- [ ] Dashboard overview page: if total jobs = 0, replace the stats grid with a 3-step visual ("Connect repo → Open PR → See drift report") with current step highlighted
- [ ] Jobs page empty state: similar treatment — "No analyses yet. Open a PR in a connected repo."
- [ ] All empty states include a secondary link "See a sample report →" pointing to `/demo`

### Files to change
- `web/components/inbox/DriftAlertList.tsx` — replace line ~123 empty state
- `web/app/dashboard/page.tsx` or equivalent overview page — conditional on zero jobs
- `web/app/dashboard/jobs/page.tsx` — empty state for jobs list

---

## C-02: First-Repo Connect Wizard

### Problem
After connecting a GitHub App and adding repos in Settings, the user lands back at a settings tab
with no next-step guidance.

### Acceptance Criteria
- [ ] After a repo is successfully added (POST /api/repos returns 200), show a dismissible "next step" card in the repos settings tab:
  - Headline: "Repository connected"
  - Body: "Open a pull request in **{repoName}** to trigger your first drift analysis. DocuGardener will analyse it automatically and post results as a GitHub check run."
  - Secondary: "Learn what a drift report looks like → /demo"
  - Dismiss button (localStorage key `dg-repo-wizard-dismissed-{repoId}`)
- [ ] If the user has ≥1 repo and zero completed jobs (fetch from `/api/stats/summary`), show a persistent "Getting started" banner at the top of the Inbox page (above the list, dismissible):
  - "DocuGardener is monitoring your repos. Open a PR to see your first drift report."
  - Link to `/demo`

### Files to change
- `web/components/settings/RepoListCard.tsx` — add post-add wizard card
- `web/app/dashboard/inbox/page.tsx` or `InboxPageClient` — add getting-started banner

---

## C-03: Demo Drift Report (`/demo`)

### Goal
A public (no-auth) page at `/demo` that renders a real drift report using a hardcoded fixture
from an actual DG analysis. Uses the real `SemanticDiffViewer` and `DriftAlertList` components
in read-only mode — looks 100% like the real product.

### Fixture data
Use the fixture defined at `web/lib/demo-fixture.ts` (created by backend agent).
The fixture is a realistic `DriftAlert` object based on a real DG analysis of the DG repo itself.

### Acceptance Criteria
- [ ] `/demo` route is public — no auth required, no redirect to login
- [ ] Page layout: MarketingHeader + MarketingFooter (matches landing page style)
- [ ] Top banner: amber/blue info bar — "This is a sample drift report. Connect your repo to see real results. [Get started →]"
- [ ] Left panel: renders `DriftAlertList` with the fixture alert (1 item, "Review required" chip)
- [ ] Right panel: renders `SemanticDiffViewer` with the fixture alert in read-only mode:
  - Accept / Dismiss buttons are **hidden** (replace with "Sign in to triage →" CTA)
  - All other content (diff items, score, confidence, policy section) renders normally
- [ ] Mobile: stacked layout (list above, viewer below)
- [ ] Page title: "Sample Drift Report — DocuGardener"
- [ ] Add "See a live demo" link to the landing page hero section (below the primary CTA)

### Files to create/change
- `web/app/demo/page.tsx` — new public route
- `web/lib/demo-fixture.ts` — fixture data (created by backend agent — see below)
- `web/app/page.tsx` — add demo link to hero

---

## C-04: First-Analysis Email Notification

### Goal
When a tenant's **first** drift analysis completes successfully, send a "Your first drift report
is ready" email to the tenant's admin users via Resend (already wired in `web/lib/email.ts`).

### Trigger point
`src/pipeline/handler.py` — after `job_manager.complete_job(job_id, result_payload)` succeeds,
check if this is the first completed job for the tenant. If yes, dispatch the email.

### Email content
- Subject: "Your first drift report is ready — DocuGardener"
- Body:
  - Headline: "DocuGardener analysed your first PR"
  - Repo name + PR number
  - Drift score (with severity label)
  - Summary sentence from `drift_analysis.summary`
  - CTA button: "View report →" linking to `/dashboard/inbox`
  - Footer: unsubscribe note (one-time notification, not a recurring email)

### Implementation notes
- Check: `SELECT COUNT(*) FROM "Job" WHERE "tenantId" = ? AND status = 'COMPLETED'` — if = 1 after this job, it's the first.
- Get admin emails: `SELECT email FROM "User" WHERE "tenantId" = ? AND role = 'ADMIN'`
- Send via POST to `/api/notifications/first-analysis` (new internal Next.js route) or directly
  via Python `httpx` POST to Resend API (prefer this — no extra Next.js route needed).
- Use `RESEND_API_KEY` from env (already available in Python via `settings`).
- Add `RESEND_API_KEY` to `src/core/config.py` if not already present.
- Graceful failure: wrap in try/except, log warning, never fail the job.

### Files to change/create
- `src/pipeline/handler.py` — add first-analysis check + email dispatch after complete_job
- `src/core/config.py` — add `resend_api_key: str | None = None`
- New function `send_first_analysis_email()` — either in `src/notifications/email.py` (new) or
  inline in handler

---

## Definition of Done
- [ ] All local Vitest tests pass (no regressions)
- [ ] Python tests pass
- [ ] `/demo` renders without auth in browser
- [ ] Empty states visible when inbox/jobs are empty
- [ ] Wizard card appears after repo add
- [ ] Email function exists and is tested (mock Resend in unit test)

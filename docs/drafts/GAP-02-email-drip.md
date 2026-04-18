# GAP-02 — Welcome Email Drip Sequence Draft

> **Status:** DRAFT — awaiting owner approval before implementation
> **Submitted by:** Agent, 2026-04-18
> **Sender:** DocuGardener <hello@docugardener.dev>
> **Provider:** Resend (already configured)
> **Action required:** Review copy for each email, approve or redline

---

## Day 0 — Install confirmation (trigger: GitHub App installed + first repo connected)

**Subject:** You're set up — DocuGardener is watching your repos

**Body:**
```
Hi {first_name},

DocuGardener is installed and watching {repo_count} {repo_count == 1 ? "repository" : "repositories"}.

The next time a pull request opens on {repo_name}, you'll see a check run with a drift report — no config needed.

What happens next:
→ Open a PR on any connected repo
→ DocuGardener runs automatically
→ If docs are out of date, the check fails with a precise report
→ One click generates a fix PR

If you want to configure notifications or add more repos:
[Go to Settings →] https://docugardener.dev/dashboard/settings

Questions? Reply to this email — we read every one.

— The DocuGardener team
```

---

## Day 1 — First analysis tips (trigger: 24h after install, send if no analysis run yet)

**Subject:** Haven't seen a PR yet — here's how to get your first result

**Body:**
```
Hi {first_name},

DocuGardener is ready but hasn't seen a pull request yet on {repo_name}.

The fastest way to test it:
1. Create a branch, change a function signature or add a new endpoint
2. Open a PR — DocuGardener runs within 30 seconds
3. Check the "Checks" tab on the PR for the drift report

Already seen a result? Ignore this — you're ahead of schedule.

A few things worth knowing:
• DocuGardener checks .md, .rst, docstrings, and inline comments
• You can configure which file types to watch in Settings → Rules
• Drift severity ranges from Low to Critical — only Critical blocks merges by default

[Open a test PR →] https://github.com/{repo_name}/compare

— The DocuGardener team
```

---

## Day 3 — Upgrade nudge (trigger: 3 days after install, send if on Free plan)

**Subject:** {first_name}, you're hitting the Free plan limits soon

**Body:**
```
Hi {first_name},

You've been using DocuGardener for 3 days — here's where you stand:

Analyses used: {analyses_used} / 10 this month
Repos connected: {repo_count} / 1

When you hit the limit, new PRs won't be checked until next month.

Pro plan ($29/month) removes those limits and adds:
✓ 10 repos, 500 analyses/month
✓ AI auto-fix PRs — DocuGardener opens the fix PR for you
✓ Slack notifications when drift is detected
✓ Priority support

[Upgrade to Pro →] https://docugardener.dev/dashboard/settings?tab=billing

Still evaluating? No pressure — Free stays free forever for 1 repo.

— The DocuGardener team
```

*(Skip if already on Pro or Team plan)*

---

## Day 7 — Check-in (trigger: 7 days after install)

**Subject:** How's DocuGardener working for you?

**Body:**
```
Hi {first_name},

It's been a week. A quick check-in:

How many drift findings has DocuGardener caught on {repo_name}?
→ {drift_count} findings detected so far

If that number is 0, it could mean:
• No PRs opened yet — DocuGardener only runs on pull requests
• Docs are already in great shape (genuinely possible!)
• The repos connected don't have much documentation yet

If you've found it useful, two things that help us a lot:
1. Star the repo → https://github.com/docugardener/docugardener
2. Tell a colleague — word of mouth is how we grow

If something isn't working right, reply to this email. We fix reported issues within 48 hours.

— The DocuGardener team

P.S. If you're on a team and want SSO, SCIM, Jira integration, or audit logs — those are on the Team plan. [See what's included →] https://docugardener.dev/pricing
```

---

## Implementation notes (for when drafts are approved)

- Trigger logic: RQ scheduler job, runs daily, checks `tenant.createdAt` offset
- Day 1 conditional: only send if `tenant.firstAnalysisAt IS NULL`
- Day 3 conditional: only send if `tenant.plan = 'FREE'`
- All emails skip if `tenant.emailOptOut = true`
- Template variables: `{first_name}`, `{repo_name}`, `{repo_count}`, `{analyses_used}`, `{drift_count}`
- `drift_count` = count of Jobs with `status=COMPLETED` and drift detected for this tenant
- Implementation file: `src/notifications/drip.py` (new), scheduled via `src/jobs/` scheduler

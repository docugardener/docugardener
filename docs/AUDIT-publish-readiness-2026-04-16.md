# DocuGardener — Public Repository Readiness Audit

**Date:** 2026-04-16  
**Auditor:** SA (automated, 3 specialist agents)  
**Verdict:** ❌ NOT READY — 5 blockers must be resolved before making the repo public  
**Based on:** `docs/specs/SEC-publish-readiness.md` (2026-04-14) + new findings

---

## TL;DR for Dev Team

Five items block the public release. All are straightforward edits — no architecture changes. Estimated fix time: ~1 hour total. Items are listed in priority order. Do not make the repo public until items B1–B5 are resolved.

---

## ✅ Already Done (no action needed)

| Item | Description |
|------|-------------|
| SEC-C3 | `docker-compose.yml` — Smee URL uses env var; Postgres uses `${POSTGRES_PASSWORD:-password}` |
| SEC-C4 | Helm chart license annotation is `AGPL-3.0-or-later` |
| SEC-H1 | SPDX headers on all Python + TypeScript/TSX files (0 files missing) |
| SEC-H2 | `BILLING_ENABLED` flag implemented in backend + frontend; `WaitlistForm.tsx` and `/api/waitlist` route exist |
| SEC-M1 | `.gitignore` covers `.env`, `.env.production`, `secrets/`, `*.pem`, `*.key` |
| Git history | No secrets, API keys, or credentials were ever committed — history is clean |
| CI/CD | All workflow files use `${{ secrets.X }}` — no plaintext secrets in CI |
| LICENSE | Full AGPL-3.0 text present |
| Dependencies | No GPL-2.0-only packages in Python (`pyproject.toml`) or Node (`web/package.json`) |
| README | AGPL-3.0 badge + disclosure present; self-hosting quickstart present |
| Self-hosting docs | Docker, GitHub App, environment variable reference pages all present under `web/app/docs/self-hosting/` |

---

## ❌ Blockers — Must Fix Before Public

### B1 — First user's personal email hardcoded in tracked source files

**Severity:** BLOCKER (personal data exposure)  
**Files to change:**

| File | Line | Current value | Fix |
|------|------|--------------|-----|
| `web/scripts/seed_dashboard.ts` | 9 | `"wbd@tut.by"` | Replace with `"admin@example.com"` |
| `web/scripts/promote_admin.ts` | 8 | `"wbd@tut.by"` | Replace with `"admin@example.com"` |
| `web/e2e/tests/auth/invite-magic-link.spec.ts` | 5, 14, 54 | `wbd@tut.by` (in const + test name + comment) | Replace with an env var or `"invite-test@example.com"` |

**Why it's a blocker:** A real person's email address will be permanently indexed in the public repo and its git history. The seed scripts hardcode it as a constant rather than reading from an env var.

**Suggested fix for the E2E spec:**
```typescript
// Before:
const INVITE_EMAIL = "wbd@tut.by"

// After:
const INVITE_EMAIL = process.env.E2E_INVITE_EMAIL ?? "invite-test@example.com"
```

---

### B2 — Author's personal Gmail address in tracked internal doc

**Severity:** BLOCKER (personal data exposure)  
**File:** `docs/ORGA-01-Launch-Setup.md`  
**Line:** 88 — contains `alexeykopachev47@gmail.com`

**Options (pick one):**

**Option A — Recommended:** Add to `.gitignore` and remove from tracking entirely. This is an internal launch operations doc and has no value to external users.
```bash
echo "docs/ORGA-01-Launch-Setup.md" >> .gitignore
git rm --cached docs/ORGA-01-Launch-Setup.md
```

**Option B:** Replace the email on line 88 with `your-recovery-email@example.com`.

---

### B3 — Secrets scan (Gitleaks) missing from CI

**Severity:** BLOCKER (SEC-M2 from the original spec was never implemented)  
**File:** `.github/workflows/ci.yml`

Currently, only Trivy CVE scanning exists (`security-scan.yml`, weekly, container images). There is no credential-pattern scan on push/PR. A future accidental commit of a secret would not be caught automatically.

**Fix — add this job to `.github/workflows/ci.yml`:**
```yaml
  secrets-scan:
    name: Secrets Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Place it as a parallel job alongside `lint-typecheck` (no dependencies needed).

---

### B4 — Infisical workspace UUID in tracked files

**Severity:** BLOCKER (internal infra topology exposed; breaks silently for self-hosters)  
**Files:**

| File | Issue |
|------|-------|
| `.infisical.json` | Contains `"workspaceId": "2c296ecb-314b-4cd6-baef-92b8e3384c84"` — your private Infisical workspace |
| `scripts/dev.sh:16` | `PROJECT_ID="2c296ecb-314b-4cd6-baef-92b8e3384c84"` hardcoded |

The workspace ID is not a credential (requires auth tokens to use), but it:
1. Exposes your private Infisical infrastructure to the public
2. Causes `scripts/dev.sh` to silently attempt connecting to your workspace for any external developer who runs it

Note: `dev.sh` already has a graceful fallback to `.env` if Infisical is unreachable — that part is good.

**Fix — two steps:**

1. Add `.infisical.json` to `.gitignore` and untrack it:
```bash
echo ".infisical.json" >> .gitignore
git rm --cached .infisical.json
```

2. In `scripts/dev.sh`, make the project ID come from an env var:
```bash
# Before (line 16):
PROJECT_ID="2c296ecb-314b-4cd6-baef-92b8e3384c84"

# After:
PROJECT_ID="${INFISICAL_PROJECT_ID:-}"

# Then update the condition (around line 20) to also check if PROJECT_ID is set:
if infisical ... && [ -n "${PROJECT_ID}" ]; then
```

Add `INFISICAL_PROJECT_ID=` to `.env.example` with a comment: `# Optional — your Infisical workspace ID. Leave blank to use .env file directly.`

---

### B5 — Internal project names in public docker-compose comments

**Severity:** BLOCKER (exposes private product names)  
**File:** `docker/docker-compose.yml`

| Line | Current comment | Fix |
|------|----------------|-----|
| 194 | `# 5432 reserved by SkillSeal; internal network still uses 5432` | `# Host port 5433 avoids conflicts with local Postgres; internal network still uses 5432` |
| 260 | `# 3003 is Next.js dev server (3001/3002 reserved by NestFleet)` | `# 3003 is Next.js dev server; Grafana on 3004` |

"SkillSeal" and "NestFleet" are internal private products. Their existence should not be disclosed in a public open-source repo.

---

## ⚠️ Medium — Fix Before or Shortly After Public Push

### M1 — Real smee.io channel name in `.env.example`

**File:** `.env.example:36`  
**Current:** `NEXT_PUBLIC_WEBHOOK_URL=https://smee.io/DocuGardenerDevProxy`  
**Fix:** `NEXT_PUBLIC_WEBHOOK_URL=https://smee.io/YOUR_CHANNEL_ID`

"DocuGardenerDevProxy" is your personal development channel. Replace with a generic placeholder.

---

### M2 — Local machine paths in docs

**Files:**
- `docs/DEPLOYMENT.md:62` — `cd /Users/Alexey_Kopachev/Alex/AI\ Projects/DocuGardener`
- `docs/TROUBLESHOOTING.md` — same path pattern
- `docs/specs/PUB-01-github-publish.md:49` — same

**Fix:** Replace all occurrences of `/Users/Alexey_Kopachev/Alex/AI Projects/DocuGardener` with `~/docugardener` or `/path/to/docugardener`.

---

### M3 — `deploy.yml` has `docugardener.dev` as hardcoded fallback domain

**File:** `.github/workflows/deploy.yml:80`  
**Current:** `APP_URL: ${{ vars.APP_URL || 'https://docugardener.dev' }}`

For the canonical repo this is fine. For anyone who forks, the fallback will target your production domain. Add a comment:
```yaml
# Self-hosters: set APP_URL in your repo variables (Settings → Variables → Actions)
APP_URL: ${{ vars.APP_URL || 'https://docugardener.dev' }}
```

---

## ℹ️ Low / Post-Launch

### L1 — AGPL §13 — no in-app source code link

AGPL best practice is to display a "Source Code" link in the app UI for SaaS users. Currently satisfied by README prominence only.

**Suggested fix (low priority):** Add a "Source Code" link to the marketing footer (`web/components/marketing/MarketingFooter.tsx`) pointing to `https://github.com/docugardener/docugardener`.

---

### L2 — Untracked temp files should be gitignored

Files in root: `read_files.py`, `read_files_2.sh`, `tmp_read.py` are not tracked but also not gitignored. Add to `.gitignore`:
```
read_files*.py
read_files*.sh
tmp_read.py
tmp_*/
```

---

### L3 — `wbd@tut.by` also appears in E2E test file comments (same as B1)

Already covered by B1 — noting here for completeness so it's not missed during the B1 fix pass.

---

## Fix Checklist (copy to your ticket)

```
Blockers (all required before public):
[ ] B1  Replace wbd@tut.by in seed_dashboard.ts, promote_admin.ts, invite-magic-link.spec.ts
[ ] B2  Gitignore docs/ORGA-01-Launch-Setup.md OR redact personal Gmail on line 88
[ ] B3  Add Gitleaks job to .github/workflows/ci.yml
[ ] B4  Gitignore .infisical.json + make PROJECT_ID an env var in scripts/dev.sh
[ ] B5  Remove "SkillSeal" and "NestFleet" from docker/docker-compose.yml comments (lines 194, 260)

Medium (before or shortly after public):
[ ] M1  .env.example:36 — replace real smee.io channel name with YOUR_CHANNEL_ID
[ ] M2  docs/DEPLOYMENT.md, TROUBLESHOOTING.md — replace local machine paths
[ ] M3  .github/workflows/deploy.yml — add comment for self-hosters on APP_URL variable

Low / post-launch:
[ ] L1  Add AGPL source code link to MarketingFooter.tsx
[ ] L2  Add temp files to .gitignore (read_files*.py, tmp_read.py)
```

---

## Clarification Question for the Team

**Re: B2 / `docs/ORGA-01-Launch-Setup.md`** — is this doc needed in the public repo at all? It reads as internal launch operations notes (Infisical setup, Stripe onboarding steps, recovery email). Recommendation is to gitignore the entire file rather than sanitize it line-by-line.

---

*Generated by automated SA audit — 2026-04-16. Contact repo owner for clarifications.*

# SEC — Public GitHub Publish: Security Readiness

**Date:** 2026-04-14  
**Updated:** 2026-04-16  
**Status:** ✅ All blockers resolved — repo is public-ready
**Scope:** Pre-publish security audit findings and remediation checklist for DocuGardener going to public GitHub (`github.com/docugardener`)
**License:** AGPL-3.0-or-later

---

## Background

DocuGardener is a local working directory (no git history). The plan is to publish to a public GitHub repo under the `github.com/docugardener` org. A full security audit was conducted on 2026-04-14 as part of PO/SA review before first commit.

The project uses:
- Python 3.12 / FastAPI backend (`src/`)
- Next.js 14 App Router frontend (`web/`)
- Docker Compose for local dev and production (`docker/`)
- Helm chart for Kubernetes (`helm/`)
- GitHub Actions for CI (`.github/workflows/`)

---

## CRITICAL — Blocks `git init` / First Commit

### SEC-C1 — Rotate All Live Credentials

**File:** `.env` (never to be committed; confirmed absent from git)

The local `.env` file contains real, functional secrets that have been exposed in plaintext on disk and must be rotated regardless of publish status.

**Credentials to rotate immediately:**

| Secret | Location in .env | Action |
|--------|-----------------|--------|
| `GEMINI_API_KEY` | line ~56 | Rotate in Google Cloud Console |
| `BUNDLED_GEMINI_KEY` | line ~109 | Same key — rotate once |
| `STRIPE_SECRET_KEY` | line ~118 | Rotate in Stripe Dashboard (test keys) |
| `STRIPE_WEBHOOK_SECRET` | line ~119 | Rotate in Stripe Dashboard |
| `GITHUB_WEBHOOK_SECRET` | line ~25 | Rotate in GitHub App settings |
| `SMTP_PASS` | line ~76 | Revoke Gmail App Password; generate new |
| `ENCRYPTION_KEY` | line ~101 | Generate new 32-byte hex |
| `FEEDBACK_HMAC_SECRET` | line ~131 | Generate new 32-byte hex |
| `INFISICAL_ENCRYPTION_KEY` | line ~125 | Rotate in Infisical |
| `INFISICAL_AUTH_SECRET` | line ~126 | Rotate in Infisical |

**Note:** `GITHUB_APP_ID` is not secret (public metadata) but document it in `.env.example`.

**After rotation:**
- Update `.env` with new values for local dev
- Update GitHub Actions repository secrets with new production values (when provisioned)
- Update Infisical workspace with new values

---

### SEC-C2 — `secrets/github-app.pem`

**File:** `secrets/github-app.pem`

Real GitHub App private key stored on disk. The `secrets/` directory is currently not committed (no git repo exists). Before `git init`:

- [ ] Confirm `secrets/` is in `.gitignore` (see SEC-05)
- [ ] Do NOT rotate the PEM unless the GitHub App itself is compromised — rotating creates a new key in GitHub App settings
- [ ] Ensure no backup/cloud-sync tool (Time Machine, iCloud Drive, Dropbox) has uploaded this file

For production: the PEM is supplied as `GITHUB_PRIVATE_KEY` environment variable (base64-encoded inline), not as a file path. The `secrets/` path is dev-only.

---

### SEC-C3 — Hardcoded Values in `docker/docker-compose.yml`

**File:** `docker/docker-compose.yml`

Two issues in the development compose file:

**Issue 1 — Line 196: Hardcoded Smee webhook channel URL**
```yaml
# Current (exposes your private webhook channel ID):
command: -u https://smee.io/85AZjBVA8yAG1EBI -t http://host.docker.internal:8000/webhooks/github

# Required:
command: -u ${WEBHOOK_PROXY_URL} -t http://host.docker.internal:8000/webhooks/github
```

Add to `.env.example`:
```
# Development webhook proxy (get your own at https://smee.io)
WEBHOOK_PROXY_URL=https://smee.io/YOUR_CHANNEL_ID
```

**Issue 2 — Line 211: POSTGRES_PASSWORD literal**
```yaml
# Current:
POSTGRES_PASSWORD: password

# Required:
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
```

This allows developers to override via env while keeping `password` as the safe local default. Production compose already uses env var substitution correctly.

**Acceptance criteria:**
- [ ] `WEBHOOK_PROXY_URL` extracted to env var in docker-compose.yml
- [ ] `POSTGRES_PASSWORD` uses `${POSTGRES_PASSWORD:-password}` substitution
- [ ] `.env.example` documents `WEBHOOK_PROXY_URL` with instructions

---

### SEC-C4 — Helm Chart License Annotation

**File:** `helm/docugardener/Chart.yaml` line 22

Leftover from the BUSL-1.1 era (before the AGPL pivot in Phase 13).

```yaml
# Current:
annotations:
  artifacthub.io/license: BUSL-1.1

# Required:
annotations:
  artifacthub.io/license: AGPL-3.0-or-later
```

Single-line fix. Must be corrected before the Helm chart is published to Artifact Hub or GHCR OCI registry.

---

## HIGH — Fix Before First Public Push

### SEC-H1 — AGPL-3.0-or-later SPDX Headers Missing

**Scope:** 100% of Python files in `src/` and TypeScript/TSX files in `web/` are missing the required SPDX header. Only `src/main.py` has it.

**Required by:** CLAUDE.md — "All new files: AGPL-3.0-or-later SPDX header"

**Target header:**
```python
# SPDX-License-Identifier: AGPL-3.0-or-later
```
```typescript
// SPDX-License-Identifier: AGPL-3.0-or-later
```

**Implementation — bulk script approach:**

```bash
# Python files: insert after shebang or encoding declaration if present, else line 1
find src/ -name "*.py" | while read f; do
  if ! grep -q "SPDX-License-Identifier" "$f"; then
    sed -i '' '1s/^/# SPDX-License-Identifier: AGPL-3.0-or-later\n/' "$f"
  fi
done

# TypeScript/TSX files
find web/ -name "*.ts" -o -name "*.tsx" | while read f; do
  if ! grep -q "SPDX-License-Identifier" "$f"; then
    sed -i '' '1s/^/\/\/ SPDX-License-Identifier: AGPL-3.0-or-later\n/' "$f"
  fi
done
```

**Exceptions (do NOT add headers):**
- `web/next.config.ts`, `web/tailwind.config.ts`, `web/postcss.config.mjs` — generated config files
- `prisma/schema.prisma` — Prisma schema (not a source file)
- Any file in `node_modules/`, `.venv/`, `dist/`, `.next/`

**Acceptance criteria:**
- [ ] All `src/**/*.py` files have `# SPDX-License-Identifier: AGPL-3.0-or-later` on line 1
- [ ] All `web/**/*.ts` and `web/**/*.tsx` files have `// SPDX-License-Identifier: AGPL-3.0-or-later` on line 1
- [ ] `grep -rL "SPDX" src/ --include="*.py"` returns empty
- [ ] `grep -rL "SPDX" web/app web/components web/lib --include="*.ts" --include="*.tsx"` returns empty

---

### SEC-H2 — Billing Stub: `BILLING_ENABLED` Flag

**Context:** Stripe checkout is fully wired in the current codebase (production-ready). For the initial public launch, paid plan flows must be stubbed until the legal entity is operational. This follows the NestFleet pattern exactly.

**Pattern (from NestFleet `src/api/v1/billing.ts`):**
```typescript
billingRouter.use("/billing/*", async (c, next) => {
  if (!config.BILLING_ENABLED) {
    return c.json({ error: "BILLING_NOT_ENABLED" }, 404)
  }
  return next()
})
```

**DocuGardener implementation:**

1. **Backend** (`src/core/config.py`):
   ```python
   billing_enabled: bool = Field(default=False)
   ```
   Default `False` — opt-in for production when legal entity is ready.

2. **Backend** (`src/stripe/webhooks.py`, `src/stripe/client.py`):
   - Wrap Stripe webhook handler: return 404 if `not settings.billing_enabled`
   - Wrap Stripe client instantiation: raise `BillingDisabledError` if disabled

3. **Frontend** (`web/app/api/billing/checkout/route.ts`):
   ```typescript
   if (!process.env.BILLING_ENABLED) {
     return NextResponse.json({ error: "BILLING_NOT_ENABLED" }, { status: 404 })
   }
   ```

4. **Frontend** — Upgrade buttons in `web/app/dashboard/billing/page.tsx`:
   - When `BILLING_ENABLED=false`: replace "Upgrade to Pro" / "Upgrade to Team" buttons with "Join Waitlist →" button
   - Waitlist button links to a simple email capture form (new component: `web/components/billing/WaitlistForm.tsx`)
   - Form posts to `POST /api/waitlist` — stores email + plan interest; returns `{ ok: true }`

5. **Waitlist API** (`web/app/api/waitlist/route.ts`):
   - `POST /api/waitlist` — `{ email, plan }` → write to DB or send to SMTP/email service
   - Rate limit: 5 req/IP/hour (no enumeration)
   - Always returns `{ ok: true }` (no enumeration attacks)

6. **Feature gates stay intact** — plan-gated features continue to show PRO/TEAM badges and "upgrade" prompts. Only the checkout action is replaced with waitlist.

7. **Trial system** (`web/app/api/billing/trial/route.ts`):
   - When `BILLING_ENABLED=false`: return `{ available: false }` — no trial activation

**`.env.example` addition:**
```
# Set to true only when legal entity and Stripe are fully operational
BILLING_ENABLED=false
```

**Acceptance criteria:**
- [ ] `BILLING_ENABLED=false` (default) disables all Stripe API calls
- [ ] Stripe webhook route returns 404 when disabled
- [ ] Upgrade buttons show "Join Waitlist" form instead of Stripe checkout
- [ ] Waitlist form captures email + plan interest
- [ ] Feature gates and upgrade prompts remain visible (plan value is still communicated)
- [ ] Trial activation returns `{ available: false }` when billing disabled
- [ ] `BILLING_ENABLED=true` re-enables full Stripe flow without code changes

---

## MEDIUM — Fix Before or Shortly After Publish

### SEC-M1 — `.gitignore` Explicit Coverage

**File:** `.gitignore`

Verify and add where missing:

```gitignore
# Secrets — never commit
secrets/
*.pem
*.key
*.p12
*.p8

# Environment files
.env
.env.*
!.env.example
!.env.production.example

# Next.js build
.next/
out/

# Python
.venv/
__pycache__/
*.pyc
```

**Acceptance criteria:**
- [ ] `git ls-files | grep -E "(\.env|\.pem|\.key|secrets/)"` returns empty after `git init`

---

### SEC-M2 — Gitleaks in CI ✅ Complete 2026-04-16

Added to `.github/workflows/ci.yml` as a parallel `secrets-scan` job using `gitleaks/gitleaks-action@v2` with `fetch-depth: 0` (full history). Runs on every push and PR. Commit: `2c53c2c`.

---

## MEDIUM / Informational — Already Clean

| Area | Finding | Status |
|------|---------|--------|
| Python dependencies (`pyproject.toml`) | No GPL/LGPL/AGPL conflicts; no liteLLM | ✅ Clean |
| Node dependencies (`web/package.json`) | No GPL/LGPL conflicts; no liteLLM | ✅ Clean |
| GitHub Actions workflows | No hardcoded secrets; all use `${{ secrets.X }}` | ✅ Clean |
| `.env.example` | All placeholder values, no real credentials | ✅ Clean |
| `.env.production.example` | All placeholder values, marked REQUIRED | ✅ Clean |
| `docker/docker-compose.prod.yml` | Passwords from env vars (correct) | ✅ Clean |
| `.infisical.json` | Workspace ID only (non-secret) | ✅ Safe to publish |
| `GITHUB_APP_ID` | Public metadata, not a secret | ✅ Safe to publish |

---

## Pre-Publish Checklist (Execution Order)

```
SEC-C items (before git init):
[x] SEC-C1  Rotate all credentials listed above  ✅ done before first commit
[x] SEC-C2  Confirm secrets/ never committed; verify .gitignore  ✅
[x] SEC-C3  Fix docker-compose.yml — Smee URL + Postgres password  ✅
[x] SEC-C4  Fix Helm chart license annotation  ✅

SEC-H items (before first public push):
[x] SEC-H1  Bulk-add SPDX headers — all Python + TypeScript files  ✅
[x] SEC-H2  Implement BILLING_ENABLED flag + waitlist form  ✅
[x] SEC-M1  Verify .gitignore explicit coverage  ✅
[x] SEC-M2  Add gitleaks step to ci.yml  ✅ 2026-04-16

Additional blockers found in 2026-04-16 audit (B1–B5):
[x] B1  Remove personal email wbd@tut.by from source files  ✅ 2026-04-16 (commit 2c53c2c)
[x] B2  Gitignore docs/ORGA-01-Launch-Setup.md (personal Gmail inside)  ✅ 2026-04-16
[x] B3  = SEC-M2 (Gitleaks)  ✅ 2026-04-16
[x] B4  Gitignore .infisical.json; dev.sh reads INFISICAL_PROJECT_ID env var  ✅ 2026-04-16
[x] B5  Remove SkillSeal/NestFleet from docker-compose.yml comments  ✅ 2026-04-16

Final gate:
[x] git init → git add . → git status (verify no .env / .pem / secrets/)  ✅
[x] git commit -m "chore: initial commit"  ✅ (initial public commit 2026-04-14)
[x] git remote add origin git@github.com:docugardener/docugardener.git  ✅
[x] git push -u origin main  ✅ (production live at docugardener.dev since 2026-04-15)

Deferred (medium/low — post-publish):
[ ] M1  .env.example:36 — smee.io channel → YOUR_CHANNEL_ID
[ ] M2  Replace /Users/Alexey_Kopachev local paths in DEPLOYMENT.md + TROUBLESHOOTING.md
[ ] M3  deploy.yml APP_URL — add self-hoster comment
[ ] L1  AGPL §13 — add Source Code link to MarketingFooter.tsx
[ ] L2  Add read_files*.py / tmp_read.py to .gitignore
```

---

## Revision History

| Date | Change |
|------|--------|
| 2026-04-14 | Initial spec — created from SA/PO security audit prior to first public commit |
| 2026-04-16 | All blockers resolved. B1–B5 from follow-up audit cleared (commit 2c53c2c). SEC-M2 (Gitleaks) added to CI. Status updated to ✅ public-ready. Deferred M1–M3, L1–L2 items added to checklist. |

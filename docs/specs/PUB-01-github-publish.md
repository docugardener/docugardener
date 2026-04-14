# PUB-01 — GitHub Publish & Production Launch Plan

**Date:** 2026-04-14
**Status:** Pending execution
**Owner:** Alexey Kopachev
**Target repo:** `https://github.com/docugardener/docugardener` (private → public)
**Target domain:** `docugardener.dev` (registered)
**Production host:** Hetzner VPS (to be provisioned)
**License:** AGPL-3.0-or-later
**Reference pattern:** NestFleet project CI/CD (SSH deploy + Docker Compose + Caddy)

---

## Overview

Single-repo, single-deploy model. One codebase serves both the FREE self-hosted version and the hosted SaaS (`docugardener.dev`). Deployment mode is controlled by `DEPLOYMENT_MODE=saas` env var.

The publish path has four sequential waves:
1. **Wave 0** — Security fixes (before `git init`)
2. **Wave 1** — Git init + billing stub + repo push
3. **Wave 2** — Infrastructure, CI/CD pipeline, first production deploy
4. **Post-launch** — Onboarding UX, monitoring, feature work

All Wave 0 items are covered in detail in `docs/specs/SEC-publish-readiness.md`. This document covers Waves 1–3.

---

## Wave 0 — Security Pre-requisites

> Fully specified in `docs/specs/SEC-publish-readiness.md`

**Must be complete before any git operation:**

- [ ] SEC-C1 Rotate all live credentials
- [ ] SEC-C2 Confirm `secrets/` not committed
- [ ] SEC-C3 Fix `docker/docker-compose.yml` (Smee URL + Postgres password)
- [ ] SEC-C4 Fix Helm chart license annotation
- [ ] SEC-H1 Bulk-add AGPL-3.0 SPDX headers
- [ ] SEC-H2 Implement `BILLING_ENABLED` flag + waitlist form
- [ ] SEC-M1 Verify `.gitignore` complete

---

## Wave 1 — Git Init + Publish-Ready Code

### PUB-01-A: Git Initialization

```bash
cd /Users/Alexey_Kopachev/Alex/AI\ Projects/DocuGardener

# Initialize
git init
git branch -M main

# Add remote (private repo already exists at github.com/docugardener)
git remote add origin git@github.com:docugardener/docugardener.git

# Safety check before first add
git status                                    # must show only expected files
git ls-files --others | grep -E "\.env|\.pem|secret"  # must return empty

# First commit
git add .
git commit -m "chore: initial public commit — AGPL-3.0-or-later"
git push -u origin main
```

**Gate:** `git ls-files | grep -E "(\.env|\.pem|secrets/)"` must return empty.

---

### PUB-01-B: Billing Stub (BILLING_ENABLED flag)

**Context:** Stripe checkout is fully wired in the current codebase. For initial launch, all paid plan flows must redirect to a waitlist. Legal entity activation will re-enable billing with `BILLING_ENABLED=true` + Stripe keys — zero code changes required.

**Implementation plan:**

#### 1. Backend config (`src/core/config.py`)
```python
billing_enabled: bool = Field(default=False, description="Enable Stripe billing. Set true only when legal entity operational.")
```

#### 2. Backend Stripe guard (`src/stripe/webhooks.py`)
```python
@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    if not settings.billing_enabled:
        raise HTTPException(status_code=404, detail="Billing not enabled")
    # ... existing handler
```

#### 3. Frontend API guard (`web/app/api/billing/checkout/route.ts`)
```typescript
export async function POST(req: Request) {
  if (!process.env.BILLING_ENABLED || process.env.BILLING_ENABLED !== "true") {
    return NextResponse.json({ error: "BILLING_NOT_ENABLED" }, { status: 404 })
  }
  // ... existing checkout logic
}
```
Apply same guard to: `/api/billing/trial`, `/api/billing/portal`, `/api/billing/cancel`.

#### 4. Frontend billing page (`web/app/dashboard/billing/page.tsx`)
```typescript
const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true"

// Replace upgrade buttons:
{billingEnabled ? (
  <Button onClick={handleUpgrade}>Upgrade to Pro — $29/mo</Button>
) : (
  <WaitlistButton plan="pro" />
)}
```

#### 5. New component (`web/components/billing/WaitlistButton.tsx`)
- Renders "Join waitlist →" button
- Opens inline form: email input + plan label
- Submits to `POST /api/waitlist`
- On success: shows "You're on the list — we'll email you when Pro launches"

#### 6. New API route (`web/app/api/waitlist/route.ts`)
```typescript
// POST /api/waitlist
// Body: { email: string, plan: "pro" | "team" }
// - Validate email (Zod)
// - Rate limit: 5 req/IP/hour
// - Store in DB (simple WaitlistEntry table) OR send email notification
// - Always return { ok: true } (no enumeration)
```

#### 7. Prisma schema addition
```prisma
model WaitlistEntry {
  id        String   @id @default(cuid())
  email     String
  plan      String   // "pro" | "team"
  createdAt DateTime @default(now())
  @@unique([email, plan])
}
```

#### 8. `.env.example` addition
```
# Billing — set true only when legal entity + Stripe operational
BILLING_ENABLED=false
NEXT_PUBLIC_BILLING_ENABLED=false
```

**Acceptance criteria:**
- [ ] `BILLING_ENABLED=false` (default) disables all Stripe API calls
- [ ] Stripe webhook returns 404 when disabled
- [ ] Upgrade buttons show waitlist form; no Stripe redirect occurs
- [ ] Waitlist form submits email + plan; confirmation shown
- [ ] Feature gate badges (PRO/TEAM) remain visible — value still communicated
- [ ] `BILLING_ENABLED=true` + Stripe env vars = full billing restored, no code changes

---

### PUB-01-C: ORGA-01 Verification

Verify the following before moving to Wave 2:

- [ ] `github.com/docugardener` org exists and is accessible
- [ ] Repository `docugardener/docugardener` is created (private)
- [ ] `OWNER_EMAIL=info@docugardener.dev` is the designated owner email
- [ ] Domain `docugardener.dev` is registered and Cloudflare zone is active
- [ ] Google Workspace: `info@docugardener.dev` can send and receive email

---

## Wave 2 — Infrastructure + CI/CD

### INF-01: Provision Hetzner VPS

**Target spec:** CX41 (4 vCPU, 16 GB RAM, 160 GB SSD) — heavier than NestFleet due to Weaviate + PostgreSQL + Redis + FastAPI + Next.js

**Steps:**

1. Log in to Hetzner Cloud Console (`console.hetzner.cloud`)
2. Create server:
   - **Image:** Ubuntu 24.04 LTS
   - **Type:** CX41 (or CPX31 as starting point, scale up if needed)
   - **Location:** Nuremberg or Helsinki (EU GDPR alignment)
   - **SSH key:** add deploy key (generate `HETZNER_SSH_KEY` now — see INF-05)
   - **Firewall:** create firewall with rules below
   - **Name:** `docugardener-prod-01`

3. **Firewall rules:**
   ```
   Inbound:
     TCP 22   — SSH (restrict to your IP or bastion if possible)
     TCP 80   — HTTP (Caddy ACME challenge)
     TCP 443  — HTTPS (Caddy production traffic)
   Outbound:
     All allowed
   ```

4. **Post-provision bootstrap** (run once via SSH):
   ```bash
   # SSH in
   ssh root@<HETZNER_IP>

   # Update + install Docker
   apt-get update && apt-get upgrade -y
   curl -fsSL https://get.docker.com | sh
   systemctl enable docker

   # Create deploy user
   useradd -m -s /bin/bash deploy
   usermod -aG docker deploy
   mkdir -p /home/deploy/.ssh
   echo "<DEPLOY_PUBLIC_KEY>" >> /home/deploy/.ssh/authorized_keys
   chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
   chown -R deploy:deploy /home/deploy/.ssh

   # Create app directory
   mkdir -p /opt/docugardener
   chown deploy:deploy /opt/docugardener

   # Write production .env (from Infisical / manual)
   # This is done once; thereafter CI/CD updates code only
   cat > /opt/docugardener/.env << 'EOF'
   # Populated manually from production secrets
   EOF
   chmod 600 /opt/docugardener/.env
   ```

5. **Clone repo on server** (one-time):
   ```bash
   su - deploy
   cd /opt/docugardener
   git clone git@github.com:docugardener/docugardener.git .
   ```

---

### INF-02: Cloudflare DNS

**Zone:** `docugardener.dev` (already registered; Cloudflare zone must be active)

**Records to create:**

| Type | Name | Value | Proxy | TTL |
|------|------|-------|-------|-----|
| A | `docugardener.dev` | `<HETZNER_IP>` | DNS only (grey cloud) | 60s |
| A | `www.docugardener.dev` | `<HETZNER_IP>` | DNS only | 60s |
| CNAME | `api.docugardener.dev` | `docugardener.dev` | DNS only | 60s |
| MX | `docugardener.dev` | Google Workspace MX records | — | — |
| TXT | `docugardener.dev` | Google SPF/DKIM/DMARC | — | — |

**Why DNS only (grey cloud):** Caddy runs ACME HTTP-01 for Let's Encrypt. Cloudflare proxy (orange cloud) would intercept port 80, breaking certificate issuance. Enable Cloudflare proxy only after confirming TLS is working, and only for HTTP traffic (not needed for ACME after first issuance).

---

### INF-03: Google Workspace Email

**Verify operational:**
- [ ] `info@docugardener.dev` receives email
- [ ] `info@docugardener.dev` can send email (SMTP test)
- [ ] MX records are live in Cloudflare DNS (see INF-02)
- [ ] SPF / DKIM / DMARC TXT records are in place
- [ ] Aliases: `hello@docugardener.dev`, `support@docugardener.dev` → `info@docugardener.dev`

**SMTP settings for `SMTP_*` env vars:**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info@docugardener.dev
SMTP_PASS=<google-app-password>
SMTP_FROM=DocuGardener <info@docugardener.dev>
```

---

### INF-04: GitHub Actions CD Pipeline

**Pattern:** NestFleet `ci.yml` adapted for DocuGardener multi-image stack.

**New file:** `.github/workflows/deploy.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

concurrency:
  group: production-deploy
  cancel-in-progress: false   # never cancel an in-flight deploy

jobs:
  # ── 1. Tests (reuse existing ci.yml gates via needs) ──────────────────────
  # deploy.yml triggers AFTER ci.yml passes via workflow_run, or inline:

  build-and-push:
    name: Build & Push Docker Images
    runs-on: ubuntu-latest
    needs: []   # runs after CI passes (configure via branch protection)
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push API image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.api
          push: true
          tags: |
            ghcr.io/docugardener/api:latest
            ghcr.io/docugardener/api:${{ github.sha }}
          cache-from: type=gha,scope=api
          cache-to: type=gha,mode=max,scope=api

      - name: Build & push Web image
        uses: docker/build-push-action@v5
        with:
          context: web
          file: docker/Dockerfile.web
          push: true
          tags: |
            ghcr.io/docugardener/web:latest
            ghcr.io/docugardener/web:${{ github.sha }}
          cache-from: type=gha,scope=web
          cache-to: type=gha,mode=max,scope=web
          build-args: |
            NEXT_PUBLIC_BILLING_ENABLED=${{ vars.NEXT_PUBLIC_BILLING_ENABLED }}

      - name: Build & push Worker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.worker
          push: true
          tags: |
            ghcr.io/docugardener/worker:latest
            ghcr.io/docugardener/worker:${{ github.sha }}
          cache-from: type=gha,scope=worker
          cache-to: type=gha,mode=max,scope=worker

  deploy:
    name: Deploy to Hetzner
    runs-on: ubuntu-latest
    needs: [build-and-push]
    environment: production

    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: deploy
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            set -e
            cd /opt/docugardener

            # Pull latest code
            git fetch origin main
            git reset --hard origin/main

            # Pull new images
            docker compose -f docker/docker-compose.prod.yml pull api web worker

            # Run migrations before swapping
            docker compose -f docker/docker-compose.prod.yml run --rm migrate

            # Rolling restart (zero-downtime where possible)
            docker compose -f docker/docker-compose.prod.yml up -d --no-deps \
              api worker web scheduler

            # Prune old images
            docker image prune -af --filter "until=24h"

  smoke-test:
    name: Smoke Tests
    runs-on: ubuntu-latest
    needs: [deploy]

    steps:
      - name: Health check
        run: |
          for i in {1..10}; do
            STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
              https://docugardener.dev/api/health || echo "000")
            if [ "$STATUS" = "200" ]; then
              echo "Health check passed"
              exit 0
            fi
            echo "Attempt $i: status=$STATUS, retrying..."
            sleep 10
          done
          echo "Health check failed after 10 attempts"
          exit 1

      - name: API version check
        run: |
          curl -sf https://docugardener.dev/api/health | jq '.status == "ok"'
```

**Branch protection rules to configure on `main`:**
- Require status checks: `lint`, `unit-tests`, `integration-tests`, `frontend-ci`, `secrets-scan`
- Require 1 approving review (or bypass for solo repo)
- Restrict pushes to `main` (only CI deploys)

---

### INF-05: GitHub Repository Secrets

**Set in:** `github.com/docugardener/docugardener` → Settings → Secrets and Variables

**Required secrets:**

| Secret Name | Value | Notes |
|-------------|-------|-------|
| `HETZNER_SSH_KEY` | Private SSH key (deploy user) | Generate: `ssh-keygen -t ed25519 -C "deploy@docugardener"` |
| `HETZNER_HOST` | Hetzner VPS IP or hostname | e.g. `1.2.3.4` |
| `CRON_SECRET` | 32-char random hex | For `audit-retention.yml` cron job |
| `DOCKERHUB_USERNAME` | Optional — fallback for GHCR rate limits | Can omit initially |
| `DOCKERHUB_TOKEN` | Optional | Can omit initially |

**Required variables (non-secret, `vars.`):**

| Variable Name | Value |
|---------------|-------|
| `APP_URL` | `https://docugardener.dev` |
| `NEXT_PUBLIC_BILLING_ENABLED` | `false` |

**Production `.env` on Hetzner** (set once on server at `/opt/docugardener/.env`):
All other production secrets live here — DB password, encryption key, GitHub App credentials, Gemini key, SMTP, etc. This file is written manually once during INF-01 bootstrap and never touched by CI.

---

### INF-06: First Production Deploy

After INF-01 through INF-05 are complete:

1. Push a commit to `main`
2. Watch GitHub Actions: CI → build-and-push → deploy → smoke-test
3. Verify: `https://docugardener.dev` loads correctly
4. Verify: GitHub App webhook reaches the server (open a test PR)
5. Verify: `info@docugardener.dev` sends and receives

**Rollback procedure:**
```bash
ssh deploy@<HETZNER_HOST>
cd /opt/docugardener
git reset --hard <PREVIOUS_SHA>
docker compose -f docker/docker-compose.prod.yml pull api web worker
docker compose -f docker/docker-compose.prod.yml up -d --no-deps api worker web
```

---

## Wave 3 — Post-Launch (Day 1–14)

### FEAT-010 — Onboarding UX

Spec: `docs/specs/FEAT-010-DG-SAAS-06-Signup-Onboarding-UX.md`

Priority: ship within first 7 days of launch. Current onboarding is a raw technical form — not suitable for SaaS acquisition. 3-step wizard (Connect → Repos → Ready).

### FEAT-006 — Upgrade Context Cards

In-product upgrade prompts on feature-gated surfaces. Must land within 14 days — PRO/TEAM value is visible but unreachable without a clear CTA path (even when billing is stubbed, the waitlist CTA must be on every plan-gated surface).

### FEAT-004 — Post-launch Monitoring Baseline

Minimum monitoring before calling "live":
- [ ] Uptime check on `https://docugardener.dev/api/health` (UptimeRobot or similar, free tier)
- [ ] Alert: 3× consecutive failures → `info@docugardener.dev`
- [ ] Grafana dashboard accessible at `https://docugardener.dev/grafana` (or internal only)
- [ ] Prometheus scraping FastAPI + RQ metrics
- [ ] DB disk usage alert at 80% (Hetzner volume monitoring)
- [ ] Runbook: `docs/ops/runbook.md` (restart procedure, rollback, log access)

---

## Repo-to-Public Flip

When legal entity is operational and billing is ready:

1. Set `BILLING_ENABLED=true` in production `.env` + GitHub vars
2. Add Stripe keys to production `.env`
3. Deploy → Stripe flows re-enable automatically
4. Set `github.com/docugardener/docugardener` visibility → Public
5. Announce on: GitHub release, `info@docugardener.dev` waitlist, landing page

**Order matters:** billing must be enabled before repo goes public (no point advertising FREE+PRO if PRO is broken at launch).

---

## Revision History

| Date | Change |
|------|--------|
| 2026-04-14 | Initial spec — created from SA/PO review; NestFleet CI/CD pattern adapted for DocuGardener |

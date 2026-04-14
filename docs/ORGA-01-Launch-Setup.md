# ORGA-01 — Complete Launch Setup Guide

Domain · Email · GitHub Org · GitHub App · Marketplace · Prod Infra

---

## Step 1 — Register `docugardener.dev` at Cloudflare

1. Go to [cloudflare.com](https://cloudflare.com) → log in
2. Left sidebar → **Domain Registration** → **Register Domains**
3. Search `docugardener.dev` → confirm it's available → click **Purchase**
4. Fill in registrant contact info (your name, address — this is WHOIS data)
5. Enable **WHOIS Privacy** (free on Cloudflare) — hides personal contact from public WHOIS
6. Choose auto-renew → **Complete purchase**
7. The domain appears in your Cloudflare account within a few minutes
8. DNS is automatically managed by Cloudflare — no nameserver change needed

---

## Step 2 — Block Cybersquatters: Register `docugardener.io`

1. Same flow: **Domain Registration** → **Register Domains** → search `docugardener.io` → purchase
2. Enable WHOIS Privacy here too
3. Once registered, set up a permanent redirect to `.dev`:
   - In Cloudflare dashboard → select `docugardener.io` zone
   - Left sidebar → **Rules** → **Redirect Rules** → **Create rule**
   - Rule name: `Redirect to docugardener.dev`
   - **If:** Field = `Hostname` / Operator = `equals` / Value = `docugardener.io`
   - Also add: Field = `Hostname` / Operator = `equals` / Value = `www.docugardener.io`
   - **Then:** Type = `Static` / URL = `https://docugardener.dev` / Status = `301`
   - Save and deploy
4. No A records, no hosting, no SSL cert needed — Cloudflare handles it all

---

## Step 3 — Set Up Email Provider (Zoho or Google Workspace)

All customer-facing addresses (`support@`, `info@`, `billing@`, `legal@`, `hello@`) route to a professional `info@docugardener.dev` mailbox — no personal email involved. Choose one provider below.

> **Note:** Steps 3 and 4 are done together. Step 3 sets up the provider and mailboxes; Step 4 wires up DNS, routing rules, and SMTP.

---

### Option A — Zoho Mail (Free)

**Best if:** you want zero cost to start.
**Limitation:** signup occasionally fails — if it does, use Option B.

#### 3a-Z — Sign up for Zoho Mail

1. Go to [zoho.com/mail](https://zoho.com/mail) → **Sign Up Free**
2. Choose **Email Hosting for your domain**
3. Enter domain: `docugardener.dev` → Continue
4. Create the admin mailbox: username = `info`, full address = `info@docugardener.dev`
5. Set a strong password → Complete signup
6. Zoho shows you a **TXT verification record** — copy it (needed in 3b-Z)
7. Zoho also shows **MX records** — skip them (Cloudflare Email Routing will own MX)

#### 3b-Z — Verify domain in Zoho

1. Cloudflare → `docugardener.dev` → **DNS** → **Add record**
2. Type: `TXT` / Name: `@` / Content: `zoho-verification=<value from Zoho>` / TTL: Auto
3. Save → back in Zoho → click **Verify** → passes within 1–2 minutes

#### 3c-Z — Create the `ops@` mailbox

Zoho Mail admin → **Mail Accounts** → **Add User**:
- Username: `ops` / full address: `ops@docugardener.dev` → set password → Save

#### 3d-Z — Enable Cloudflare Email Routing, point catch-all to Zoho

1. Cloudflare → `docugardener.dev` → **Email** → **Email Routing** → **Get started**
2. Click **Add records and enable** (Cloudflare adds MX records automatically)
3. **Routing rules** tab → **Catch-all address** → Enable
4. Action: **Send to an email** → `info@docugardener.dev` → Save
5. Cloudflare sends a verification email to Zoho — log in and confirm it

---

### Option B — Google Workspace ($6/user/month) ✓ Recommended

**Best if:** Zoho signup fails, or you want Gmail UI + Google Meet/Drive/Calendar included. Never blocks signups.

#### 3a-G — Sign up for Google Workspace

1. Go to [workspace.google.com](https://workspace.google.com) → **Get started**
2. Business name: `DocuGardener` / Employees: **Just you** / Country: yours
3. Recovery email: `alexeykopachev47@gmail.com`
4. Choose **I have a domain** → enter `docugardener.dev`
5. Admin username: `info` → full address: `info@docugardener.dev` → set password → Agree and continue
6. Plan: **Business Starter** ($6/month) → complete checkout

#### 3b-G — Verify domain ownership

1. Google Workspace setup → **Verify domain** → choose **Add a TXT record**
2. Copy the TXT value (`google-site-verification=xxxx`)
3. Cloudflare → `docugardener.dev` → **DNS** → **Add record**:
   - Type: `TXT` / Name: `@` / Content: paste value / TTL: Auto
4. Back in Google → **Verify** → passes within 1–5 minutes

#### 3c-G — Add Google MX records in Cloudflare

> Google Workspace owns MX directly — Cloudflare Email Routing is **not used** with this option.

Remove any existing MX records, then add:

| Type | Name | Value | Priority |
|------|------|-------|----------|
| MX | `@` | `aspmx.l.google.com` | 1 |
| MX | `@` | `alt1.aspmx.l.google.com` | 5 |
| MX | `@` | `alt2.aspmx.l.google.com` | 5 |
| MX | `@` | `alt3.aspmx.l.google.com` | 10 |
| MX | `@` | `alt4.aspmx.l.google.com` | 10 |

#### 3d-G — Create the `ops@` mailbox

Google Admin Console (admin.google.com) → **Directory** → **Users** → **Add new user**:
- First name: `Ops` / Last name: `DocuGardener` / Username: `ops` → set password → **Add new user**

#### 3e-G — Set up catch-all in Google Admin

1. Google Admin Console → **Apps** → **Google Workspace** → **Gmail** → **Default routing**
2. **Add another rule** → match: **All recipients** → deliver to `info@docugardener.dev`
3. Save

#### 3f-G — Route ops/alerts to `ops@` (specific rules, evaluated before catch-all)

Still in **Default routing**, add three rules:

| Match recipient | Deliver to |
|----------------|------------|
| `ops@docugardener.dev` | `ops@docugardener.dev` |
| `alerts@docugardener.dev` | `ops@docugardener.dev` |
| `monitoring@docugardener.dev` | `ops@docugardener.dev` |

Add one more rule: match `noreply@docugardener.dev` → **Reject**.

---

## Step 4 — DNS Records, Routing Rules (Zoho only) and SMTP

### 4a — SPF, DKIM, DMARC records in Cloudflare

**If using Zoho (Option A):**

| Type | Name | Value |
|------|------|-------|
| TXT | `@` | `v=spf1 include:zoho.eu include:_spf.mx.cloudflare.net ~all` |
| TXT | `zmail._domainkey` | *(from Zoho admin → Settings → Domains → DomainKeys)* |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:ops@docugardener.dev` |

**If using Google Workspace (Option B):**

| Type | Name | Value |
|------|------|-------|
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` |
| TXT | `google._domainkey` | *(from Google Admin → Apps → Gmail → Authenticate email → Generate DKIM key)* |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:ops@docugardener.dev` |

For Google DKIM: Admin Console → **Apps** → **Google Workspace** → **Gmail** → **Authenticate email** → **Generate new record** → copy TXT → add to Cloudflare → click **Start authentication**.

### 4b — Cloudflare Email Routing rules (Zoho / Option A only)

> Skip this section if using Google Workspace — routing is handled inside Google Admin (Step 3f-G).

Go to Cloudflare → `docugardener.dev` → **Email** → **Email Routing** → **Routing rules** → **Create address**:

| Address | Action | Destination | Purpose |
|---------|--------|-------------|---------|
| `ops@docugardener.dev` | Send to email | `ops@docugardener.dev` (Zoho) | Infra ops inbox |
| `alerts@docugardener.dev` | Send to email | `ops@docugardener.dev` (Zoho) | Grafana/BetterStack alerts |
| `monitoring@docugardener.dev` | Send to email | `ops@docugardener.dev` (Zoho) | Uptime + health notifications |
| `noreply@docugardener.dev` | Drop | — | Outbound only — no inbox needed |
| *(catch-all)* | Send to email | `info@docugardener.dev` (Zoho) | Everything else → human inbox |

**Result (both options):**
- `support@`, `billing@`, `legal@`, `hello@`, and everything else → `info@` (human mail)
- `ops@`, `alerts@`, `monitoring@` → `ops@` (automated noise, separate inbox)
- `noreply@` → silently dropped (outbound SMTP only)
- No personal email involved anywhere

### 4c — Configure SMTP for transactional email (magic links, receipts)

**If using Zoho (Option A):**

1. Log in to Zoho as `info@docugardener.dev`
2. Top-right avatar → **Zoho Mail Settings** → **Security** → **App Passwords**
3. Generate app password → name it `docugardener-prod-smtp` → copy it
4. Add to `.env.production`:

```env
EMAIL_FROM="DocuGardener <noreply@docugardener.dev>"
SMTP_HOST=smtp.zoho.eu
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=info@docugardener.dev
SMTP_PASS=<zoho-app-password>
```

**If using Google Workspace (Option B):**

1. Log in as `info@docugardener.dev` → myaccount.google.com
2. **Security** → **2-Step Verification** → enable it
3. **App passwords** → generate → name it `docugardener-prod-smtp` → copy it
4. Add to `.env.production`:

```env
EMAIL_FROM="DocuGardener <noreply@docugardener.dev>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=info@docugardener.dev
SMTP_PASS=<google-app-password>
```

**Both options — after adding env vars:**

5. Restart web container: `docker compose up -d --no-deps web`
6. Test: trigger a magic-link login → confirm email arrives and link works

---

## Step 5 — Create GitHub Organisation

1. Go to github.com → click your **avatar** (top-right) → **Your organizations** → **New organization**
2. Choose plan: **Free**
3. Organization name: `docugardener` → URL will be `github.com/docugardener`
4. Contact email: `billing@docugardener.dev`
5. Confirm you're creating this for your own use (not a company with separate legal entity yet)
6. Skip inviting members for now → **Complete setup**
7. In org settings → **Profile**:
   - Display name: `DocuGardener`
   - Website: `https://docugardener.dev`
   - Description: `Documentation health monitoring for engineering teams`
   - Email: `info@docugardener.dev`

---

## Step 6 — Transfer GitHub App to the Org

The GitHub App (`DocuGardener`) is currently registered under your personal account. It must move to the org so it's not tied to a personal login.

1. github.com → your personal **Settings** (not org settings) → **Developer settings** → **GitHub Apps**
2. Click **DocuGardener** → scroll to bottom → **Danger zone** → **Transfer ownership**
3. Enter `docugardener` (the org name) → confirm transfer
4. You'll be redirected to the app settings page under the org
5. Now update the App's URLs to point to production:
   - **Homepage URL:** `https://docugardener.dev`
   - **Webhook URL:** `https://api.docugardener.dev/webhooks/github`
   - **Callback URL (OAuth):** `https://app.docugardener.dev/api/auth/callback/github`
   - **Setup URL (post-install redirect):** `https://app.docugardener.dev/onboarding`
6. Save changes
7. Update `.env.production` — the App ID and private key stay the same; only update slugs if they changed:

```env
GITHUB_APP_SLUG=docugardener
NEXTAUTH_URL=https://app.docugardener.dev
```

8. Regenerate the **webhook secret** while you're here (rotate from dev value):
   - In App settings → **Webhook** → **Webhook secret** → enter a new secret
   - Update `GITHUB_WEBHOOK_SECRET=<new-value>` in `.env.production`
   - Restart api container: `docker compose up -d --no-deps api`

---

## Step 7 — GitHub Marketplace Listing

1. Go to `github.com/apps/docugardener` → **Edit listing** (or create listing if not yet published)
2. Fill in / update all fields:

   **Basic info:**
   - Name: `DocuGardener`
   - Primary category: `Code quality`
   - Secondary category: `Testing`
   - Short description (max 120 chars): `Detect documentation drift in every pull request. Keep your docs in sync with your code.`

   **URLs:**
   - Homepage: `https://docugardener.dev`
   - Support URL: `https://docugardener.dev/docs`
   - Privacy Policy: `https://docugardener.dev/privacy`
   - Terms of Service: `https://docugardener.dev/terms`

   **Pricing plans** (Marketplace plan IDs must match Stripe price IDs):
   - Free: 0 repos, 20 analyses/month
   - Pro: $29/month — unlimited repos, 500 analyses/month
   - Team: $79/month — unlimited everything, SSO, audit export

3. Upload screenshots (at least 3 required for review):
   - Dashboard / Job History page
   - Triage Inbox with drift alert
   - Fix PR in GitHub with DocuGardener check run

4. **Submit for review** → GitHub reviews in 3–5 business days
5. While waiting: test the install flow from `github.com/apps/docugardener` → Install → verify webhook fires correctly against production

---

## Step 8 — Prod Infra Prep (Hetzner + DNS + Caddy + Deploy)

### 8a — Provision Hetzner VPS

1. Go to hetzner.com → **Cloud** → **New server**
2. Location: Nuremberg or Helsinki (EU, GDPR-friendly)
3. Image: **Ubuntu 24.04**
4. Type: **CX22** (2 vCPU, 4GB RAM) — sufficient for launch; upgrade to CX32 at ~50 tenants
5. Add your SSH public key (`~/.ssh/id_ed25519.pub`) during creation
6. Add a **Firewall**:
   - Allow inbound: TCP 22 (SSH), TCP 80 (HTTP), TCP 443 (HTTPS)
   - Block everything else inbound
7. Note the assigned public IP address

### 8b — Point DNS to Hetzner

In Cloudflare → `docugardener.dev` → **DNS** → **Records**, add:

| Type | Name | Value | Proxy status |
|------|------|-------|-------------|
| A | `@` | `<hetzner-ip>` | Proxied (orange cloud ON) |
| A | `app` | `<hetzner-ip>` | Proxied |
| A | `api` | `<hetzner-ip>` | Proxied |
| A | `www` | `<hetzner-ip>` | Proxied |

Set SSL/TLS mode to **Full (strict)**: Cloudflare → `docugardener.dev` → **SSL/TLS** → **Overview** → Full (strict).

### 8c — SSH into server and install Docker

```bash
ssh root@<hetzner-ip>

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose v2
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

### 8d — Clone repo and set up environment

```bash
# Clone (once GitHub org + AGPL repo is live — DG-SAAS-03)
git clone https://github.com/docugardener/docugardener.git /opt/docugardener
cd /opt/docugardener

# Copy and fill in production env
cp .env.production.example .env
nano .env   # fill in all required values

# Copy web env
cp web/.env.example web/.env.local
nano web/.env.local   # fill in NEXTAUTH_SECRET, NEXTAUTH_URL, DB URL, etc.
```

### 8e — Update Caddy for production domains

Edit `docker/Caddyfile`:

```caddyfile
app.docugardener.dev {
    reverse_proxy web:3000
}

api.docugardener.dev {
    reverse_proxy api:8000
}

docugardener.dev, www.docugardener.dev {
    redir https://app.docugardener.dev{uri} 301
}
```

### 8f — First deploy

```bash
cd /opt/docugardener
docker compose -f docker/docker-compose.prod.yml up -d --build

# Watch logs
docker compose -f docker/docker-compose.prod.yml logs -f

# Smoke test
curl https://api.docugardener.dev/health
# Expected: {"status": "healthy", ...}

curl https://app.docugardener.dev
# Expected: 200 OK (landing page)
```

### 8g — GitHub Actions deploy workflow (OPS-03)

Add secrets to the GitHub org (`github.com/organizations/docugardener/settings/secrets/actions`):

| Secret name | Value |
|-------------|-------|
| `HETZNER_SSH_KEY` | Contents of `~/.ssh/id_ed25519` (private key) |
| `HETZNER_HOST` | `<hetzner-ip>` |
| `HETZNER_USER` | `root` |

Create `.github/workflows/deploy.yml` in the repo:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: [ci]   # depends on CI passing
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: ${{ secrets.HETZNER_USER }}
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd /opt/docugardener
            git pull origin main
            docker compose -f docker/docker-compose.prod.yml up -d --build

      - name: Smoke test
        run: |
          sleep 15
          curl --fail https://api.docugardener.dev/health
```

---

## Master Checklist

### Domain
- [ ] `docugardener.dev` registered at Cloudflare + WHOIS privacy enabled
- [ ] `docugardener.io` registered + redirect rule → `https://docugardener.dev`

### Email (Option A — Zoho)
- [ ] Zoho Mail set up — `info@` + `ops@` mailboxes created
- [ ] Zoho domain verified (TXT record in Cloudflare)
- [ ] SPF + DKIM + DMARC records added in Cloudflare DNS
- [ ] Cloudflare Email Routing enabled, catch-all → `info@docugardener.dev` (verified)
- [ ] Specific routing rules: ops/alerts/monitoring → `ops@`; noreply → drop
- [ ] Zoho SMTP app password generated + added to `.env.production`
- [ ] Transactional email tested end-to-end

### Email (Option B — Google Workspace)
- [ ] Google Workspace Business Starter signed up, `info@docugardener.dev` admin created
- [ ] Domain verified (google-site-verification TXT record in Cloudflare)
- [ ] Google MX records (×5) added in Cloudflare
- [ ] `ops@docugardener.dev` user created in Google Admin
- [ ] Catch-all routing rule in Google Admin → `info@`
- [ ] Specific routing rules: ops/alerts/monitoring → `ops@`; noreply → reject
- [ ] SPF + DKIM (authenticated) + DMARC records added in Cloudflare DNS
- [ ] Google app password generated + added to `.env.production`
- [ ] Transactional email tested end-to-end

### GitHub
- [ ] Org `docugardener` created at github.com/docugardener
- [ ] GitHub App transferred from personal → org
- [ ] App webhook URL updated → `https://api.docugardener.dev/webhooks/github`
- [ ] App callback URL updated → `https://app.docugardener.dev/api/auth/callback/github`
- [ ] Webhook secret rotated, `.env.production` updated
- [ ] Marketplace listing URLs + pricing updated
- [ ] Marketplace screenshots uploaded (3+)
- [ ] Listing submitted for GitHub review

### Prod Infra
- [ ] Hetzner CX22 VPS provisioned (Ubuntu 24.04)
- [ ] Firewall configured (22/80/443 only)
- [ ] Docker + Docker Compose v2 installed
- [ ] A records added in Cloudflare (app, api, @, www) → Hetzner IP
- [ ] Cloudflare SSL/TLS set to Full (strict)
- [ ] Repo cloned to `/opt/docugardener`
- [ ] `.env` and `web/.env.local` filled with production values
- [ ] Caddyfile updated with production domains
- [ ] First deploy successful — health check returns 200
- [ ] OPS-03 deploy workflow added + Hetzner secrets added to GitHub org

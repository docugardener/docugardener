# DocuGardener — Production Deployment Guide

## Overview

The production stack runs entirely in Docker Compose. A **Caddy** reverse proxy sits in front of everything, handles automatic TLS via Let's Encrypt, and is the only service exposed to the internet. All internal services (Postgres, Redis, Weaviate, FastAPI, Next.js) communicate over a private Docker network with no host-port bindings.

```
Internet
  │  443 / 80
  ▼
Caddy (TLS termination)
  ├── /webhooks/*       →  FastAPI  :8000
  ├── /api/webhooks/*   →  FastAPI  :8000  (strips /api prefix)
  ├── /health           →  FastAPI  :8000
  ├── /diagnostics*     →  FastAPI  :8000
  ├── /auth/saml/*      →  FastAPI  :8000
  ├── /scim/v2*         →  FastAPI  :8000
  ├── /check*           →  FastAPI  :8000
  ├── /plugin-key*      →  FastAPI  :8000
  ├── /repos/*          →  FastAPI  :8000
  ├── /billing/*        →  FastAPI  :8000
  ├── /inbox/*          →  FastAPI  :8000
  ├── /prompts/*        →  FastAPI  :8000
  ├── /api/feedback*    →  FastAPI  :8000
  └── *                 →  Next.js  :3001
                                │
                  PgBouncer :5432 (connection pooler)
                         │
                  Postgres / Redis / Weaviate
                  (Docker-internal only)
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| A registered domain | e.g. `docugardener.acme.com` with an A record → server IP |
| VPS / cloud instance | 2 vCPU, 4 GB RAM minimum; Ubuntu 22.04 recommended |
| Docker ≥ 24 + Docker Compose v2 | `docker compose version` to verify |
| Ports 80 and 443 open | Caddy needs these for Let's Encrypt HTTP challenge |
| Ports 22 open | SSH access |
| **All other ports blocked** | See firewall section below |
| GitHub App created | [Create a GitHub App](https://github.com/settings/apps) |
| GitHub OAuth App created | [Create OAuth App](https://github.com/settings/developers) |

---

## Step 1 — Firewall

Block everything except SSH, HTTP, and HTTPS. On Ubuntu with `ufw`:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP (Let's Encrypt challenge + redirect to HTTPS)
ufw allow 443/tcp     # HTTPS
ufw allow 443/udp     # HTTP/3 QUIC
ufw enable
ufw status
```

> **Why this matters:** Docker's iptables rules bypass `ufw` for container-to-host traffic. If you only rely on Docker host-port bindings being absent, a misconfiguration can still expose internal services. A top-level firewall rule blocks them at the network level regardless.

---

## Step 2 — Clone and prepare

```bash
git clone https://github.com/docugardener/docugardener.git
cd docugardener
mkdir -p secrets
```

Place your GitHub App private key at `secrets/github-app.pem` and lock it down:

```bash
chmod 600 secrets/github-app.pem
```

---

## Step 3 — Create the production env file

```bash
cp .env.production.example .env.production

# Generate all secrets automatically
bash scripts/generate-secrets.sh >> .env.production

# Now open .env.production and fill in the non-generated values:
#   DOMAIN, LETSENCRYPT_EMAIL, GITHUB_APP_ID, GITHUB_WEBHOOK_SECRET,
#   GITHUB_ID, GITHUB_SECRET, GEMINI_API_KEY
nano .env.production

# Lock down permissions
chmod 600 .env.production
```

### GitHub OAuth callback URL

In your GitHub OAuth App settings, set the callback URL to:
```
https://<your-domain>/api/auth/callback/github
```

---

## Step 4 — Deploy

```bash
docker compose --env-file .env.production \
               -f docker/docker-compose.prod.yml \
               up -d --build
```

On first run Docker will:
1. Build the FastAPI and Next.js images
2. Start Postgres and wait for it to be healthy
3. Run `prisma migrate deploy` (the `migrate` service — exits when done)
4. Start the Next.js web app
5. Start PgBouncer (connection pooler between Python services and Postgres)
6. Start the FastAPI backend, two RQ workers, and the nightly scheduler
7. Start Caddy — which immediately obtains a TLS certificate

Check the logs:

```bash
# All services
docker compose -f docker/docker-compose.prod.yml logs -f

# Just Caddy (certificate acquisition)
docker logs docugardener-caddy -f

# Just Next.js
docker logs docugardener-web -f
```

---

## Step 5 — Verify

```bash
# HTTPS response
curl -I https://<your-domain>

# Should return:
#   HTTP/2 200
#   strict-transport-security: max-age=63072000; includeSubDomains; preload
#   x-content-type-options: nosniff
#   x-frame-options: DENY

# Health endpoint
curl https://<your-domain>/health
```

---

## Updating

```bash
git pull
docker compose --env-file .env.production \
               -f docker/docker-compose.prod.yml \
               up -d --build
```

The `migrate` service runs on every `up`, applying any new Prisma migrations before the web app restarts.

> **Env var change?** `docker compose up -d --build` reuses cached environment values from the previous run. If you changed `.env.production`, add `--force-recreate` to ensure all containers pick up the new values:
> ```bash
> docker compose --env-file .env.production \
>                -f docker/docker-compose.prod.yml \
>                up -d --build --force-recreate
> ```

> **`NEXT_PUBLIC_DEV_LOGIN` (E2E / CI only):** This variable is baked into the Next.js image at build time. If it is set only as a runtime env var the dev-login button will never appear in the built image. When running E2E tests or CI smoke tests that require the dev-login path, set it on the `docker build` step, not just in the running container. For production deployments this variable should **not** be set (dev login is disabled by default).

---

## PgBouncer (connection pooler)

The production stack includes **PgBouncer** in transaction-mode pooling between the Python services (`docugardener`, `worker`, `worker-2`, `scheduler`) and Postgres. This caps Postgres connections and prevents connection exhaustion under load.

- FastAPI and workers connect to `pgbouncer:5432` — **not** `postgres:5432` directly
- Next.js (`web`) and the Prisma migration runner (`migrate`) bypass PgBouncer and connect to `postgres:5432` directly, because Prisma requires session-mode semantics
- No configuration needed — PgBouncer starts automatically with the stack

If you see `FATAL: too many connections` in Postgres logs, reduce `MAX_CLIENT_CONN` or `DEFAULT_POOL_SIZE` in the `pgbouncer` service environment in `docker-compose.prod.yml`.

---

## QA & Testing

Post-deploy tests run automatically as part of the `deploy.yml` workflow — no manual action required. For on-demand verification or a full pre-release sign-off, use the test runner on the VPS.

### Safe suites — zero production impact

```bash
# On the VPS (from /opt/docugardener):
bash scripts/run-tests-vps.sh           # python + web (default)
```

Runs 1,700+ Python unit/integration tests and 1,400+ Vitest component tests against the production Docker image with mocked services. Takes ~3 minutes.

### Pre-release QA sign-off — hits live production

```bash
bash scripts/run-tests-vps.sh e2e --confirm-prod
```

Creates real GitHub PRs, exercises the full webhook→pipeline→fix-PR flow against `docugardener.dev`, and temporarily mutates tenant config. Run this deliberately before a significant release — **never in an automated loop**. Requires `--confirm-prod` to prevent accidental execution.

### CI / Playwright (GitHub Actions, no production impact)

```bash
# Full unit + integration + Vitest in Actions (use before a release)
gh workflow run ci.yml --repo docugardener/docugardener

# Playwright browser tests against an ephemeral Postgres DB (monthly)
gh workflow run e2e.yml --repo docugardener/docugardener
```

### Cadence summary

| When | Command | Impact |
|------|---------|--------|
| Every deploy (automatic) | `deploy.yml` post-deploy step | None |
| After any hotfix | `bash scripts/run-tests-vps.sh` | None |
| Before a release | `bash scripts/run-tests-vps.sh e2e --confirm-prod` | Live prod |
| Monthly | `gh workflow run e2e.yml` | None (ephemeral DB) |
| Before a release | `gh workflow run ci.yml` | None (Actions) |

---

## Backups

The `backup-cron` service runs nightly at 02:00 UTC, backing up both PostgreSQL and Weaviate.

### What gets backed up

| Component | Method | Output |
|---|---|---|
| PostgreSQL | `pg_dump` (gzipped) | `/backups/pg-YYYYMMDD-HHMMSS.sql.gz` |
| Weaviate | HTTP backup API (filesystem module) | `/var/lib/weaviate/backups/backup-YYYYMMDD-HHMMSS/` |

Backups are stored in the `backup-data` Docker volume, shared between the `backup-cron` and `weaviate` services.

### Local retention

By default, PostgreSQL dumps older than **7 days** are automatically deleted. Override with:

```bash
# in .env.production
BACKUP_RETENTION_DAYS=14
```

### Remote backup to S3 (optional)

To upload backups to Hetzner Object Storage (or any S3-compatible provider), add these to `.env.production`:

```bash
BACKUP_S3_BUCKET=s3://your-bucket/docugardener
BACKUP_S3_ENDPOINT=https://fsn1.your-objectstorage.com
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

The backup script uses the AWS CLI (`aws s3 cp`) — the `postgres:15-alpine` image does not include it by default. For S3 uploads, swap the backup-cron image to one with `awscli` installed or mount a statically-linked `aws` binary.

### Manual backup

```bash
docker exec docugardener-backup /scripts/backup.sh
```

### Restore PostgreSQL

```bash
# Copy the backup out of the volume
docker cp docugardener-backup:/backups/pg-20260314-020000.sql.gz ./restore.sql.gz

# Restore
gunzip -c restore.sql.gz | docker exec -i docugardener-postgres \
    psql -U postgres -d docugardener-web
```

### Restore Weaviate

```bash
curl -X POST http://localhost:8080/v1/backups/filesystem/backup-20260314-020000/restore \
    -H "Content-Type: application/json" \
    -d '{"include": []}'
```

---

## Monitoring & Alerting

The production stack includes **Prometheus** (metrics collection) and **Grafana** (dashboards + alerting).

### Accessing Grafana

**Recommended:** expose Grafana on a subdomain by adding a DNS A record and a Caddy block (already in `docker/Caddyfile`):

```
Type: A  |  Name: grafana  |  Value: <your-server-ip>  |  Proxy: DNS only (grey cloud in Cloudflare)
```

Then open **https://grafana.your-domain.com** — Caddy provisions TLS automatically.

> **Note:** Leave Cloudflare proxy OFF (grey cloud) for the grafana subdomain. Caddy handles TLS itself; the orange proxy causes cert conflicts.

Default credentials: `admin` / value of `GRAFANA_ADMIN_PASSWORD` in `.env`. **Change the password** on first login via Profile → Change password.

### Provisioned alert rules

6 alert rules fire automatically:

| Alert | Condition | Severity |
|---|---|---|
| API Error Rate >5% | 5xx / total requests >5% | critical |
| RQ Queue Depth >100 | queue size >100 for 5 min | warning |
| Webhook Failure Rate >10% | failed / total webhooks >10% | warning |
| LLM Error Rate >5% | LLM errors / requests >5% | warning |
| RQ Queue Stuck | queue non-empty for 5+ min | critical |
| Worker Silent | queue non-empty, no completions in 10 min | critical |

### Wiring alert notifications (required manual step)

Alert rules are provisioned automatically. The **notification destination must be configured manually in Grafana UI** after first launch — Grafana's internal DB takes ownership of contact points after startup and ignores further env var changes.

1. Go to **Alerting → Contact points → docugardener-ops → Edit**
2. Delete the placeholder receiver
3. Click **Add contact point integration** → select **Slack**
4. Paste your Slack Incoming Webhook URL
5. Click **Test** — confirm the message arrives in your Slack channel
6. **Save contact point**

To create a Slack Incoming Webhook: Slack workspace → Apps → Incoming WebHooks → Add → choose a channel → copy the URL.

### Custom Grafana password

```bash
# in .env
GRAFANA_ADMIN_PASSWORD=your-secure-password
```

Note: Grafana only reads this on first launch. After that, use the UI to change the password (Profile → Change password).

### Prometheus retention

Production retains 30 days of metrics (vs 7 days in dev). Adjust in `docker-compose.prod.yml` under the `prometheus` service command flag `--storage.tsdb.retention.time`.

---

## Local / internal deployment (no public domain)

If you are deploying on a private network without a public domain, Caddy can generate a **self-signed certificate** instead of using Let's Encrypt. Replace the `{$DOMAIN}` block in `docker/Caddyfile` with:

```caddyfile
https://<your-internal-ip-or-hostname> {
    tls internal
    ...
}
```

Browsers will show an "untrusted certificate" warning until you add Caddy's local CA to your trust store (`caddy trust`). For developer-audience internal tools this is usually acceptable.

---

## Security checklist

- [ ] Firewall allows only 22, 80, 443
- [ ] `secrets/github-app.pem` has `chmod 600`
- [ ] `.env.production` has `chmod 600` and is in `.gitignore`
- [ ] Generated secrets set to unique random values: `NEXTAUTH_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `ENCRYPTION_KEY`, `FEEDBACK_HMAC_SECRET`, `AUDIT_EXPORT_SIGNING_KEY`
- [ ] `GITHUB_WEBHOOK_SECRET` matches what is configured in the GitHub App settings
- [ ] GitHub OAuth callback URL is `https://<domain>/api/auth/callback/github`
- [ ] `OWNER_EMAIL` set to a real address (gates the `/admin/owner` console — leave unset to disable)
- [ ] Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`) set if billing is enabled
- [ ] `ufw status` shows only 22/80/443 open

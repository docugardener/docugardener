# DocuGardener — Production Deployment Guide

## Overview

The production stack runs entirely in Docker Compose. A **Caddy** reverse proxy sits in front of everything, handles automatic TLS via Let's Encrypt, and is the only service exposed to the internet. All internal services (Postgres, Redis, Weaviate, FastAPI, Next.js) communicate over a private Docker network with no host-port bindings.

```
Internet
  │  443 / 80
  ▼
Caddy (TLS termination)
  ├── /webhooks/*  →  FastAPI  :8000
  ├── /health      →  FastAPI  :8000
  └── *            →  Next.js  :3001
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
git clone https://github.com/<your-org>/docugardener.git
cd docugardener

# Place your GitHub App private key
mkdir -p secrets
cp /path/to/your-github-app.pem secrets/github-app.pem
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
5. Start the FastAPI backend, worker, and scheduler
6. Start Caddy — which immediately obtains a TLS certificate

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

The production stack includes **Prometheus** (metrics collection) and **Grafana** (dashboards + alerting), with no host-port bindings. Access Grafana via SSH tunnel:

```bash
ssh -L 3002:localhost:3000 your-server
# Then open http://localhost:3002 in your browser
# Default credentials: admin / value of GRAFANA_ADMIN_PASSWORD
```

### Provisioned alert rules

| Alert | Condition | Severity | For |
|---|---|---|---|
| API Error Rate >5% | 5xx / total HTTP requests >5% | critical | 5 min |
| RQ Queue Depth >100 | `docugardener_queue_size{default}` >100 | warning | 5 min |
| Webhook Failure Rate >10% | Failed / total webhooks >10% | warning | 5 min |
| LLM Error Rate >5% | LLM errors / total LLM requests >5% | warning | 10 min |

Alert rules are provisioned from `docker/grafana/provisioning/alerting/alerts.yml` and loaded on Grafana startup.

### Notification channel

Alerts are sent to the `docugardener-ops` contact point (webhook). Configure the destination in `.env.production`:

```bash
# Slack incoming webhook, PagerDuty, or any HTTP endpoint
GRAFANA_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
```

If not set, alerts are silently dropped (the default points to a non-existent localhost sink).

### Custom Grafana password

```bash
# in .env.production
GRAFANA_ADMIN_PASSWORD=your-secure-password
```

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
- [ ] All four generated secrets (`NEXTAUTH_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `ENCRYPTION_KEY`) are set to unique random values
- [ ] `GITHUB_WEBHOOK_SECRET` matches what is configured in the GitHub App settings
- [ ] GitHub OAuth callback URL is `https://<domain>/api/auth/callback/github`
- [ ] `ufw status` shows only 22/80/443 open

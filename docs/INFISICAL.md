# DocuGardener — Infisical Self-Hosted Setup Guide (B-10)

> Self-hosted secrets management on your Hetzner instance.
> This replaces manual `.env` file management with a secure, audited, web-based secrets store.

---

## Prerequisites

- Hetzner VPS with Docker + Docker Compose v2 installed
- DocuGardener's `postgres` service running (Infisical uses it as its backend)
- A domain for the Infisical admin UI, e.g. `secrets.docugardener.io` (optional for local dev)

---

## 1. Local Development Setup

Uncomment the `infisical` service block in `docker/docker-compose.yml`:

```bash
# In docker/docker-compose.yml, uncomment the Infisical service block
# and the following three volume entries:
#   - infisical-data:

# Generate secrets first:
echo "INFISICAL_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "INFISICAL_AUTH_SECRET=$(openssl rand -hex 32)"
```

Add to your `.env`:
```bash
# Infisical self-hosted
INFISICAL_ENCRYPTION_KEY=<output from above>
INFISICAL_AUTH_SECRET=<output from above>
```

Then:
```bash
docker compose -f docker/docker-compose.yml up -d infisical
# Open: http://localhost:8081
```

---

## 2. First-Boot Setup (Web UI)

1. Open `http://localhost:8081` (local) or `https://secrets.docugardener.io` (prod)
2. Click **Create your first admin account**
3. Set email + password — this is your Infisical root account
4. Create an **Organisation**: `DocuGardener`
5. Create two **Projects**:
   - `docugardener-dev` — local development secrets
   - `docugardener-prod` — production secrets

---

## 3. Migrating Secrets from .env

In each Infisical project → **Secrets** tab → **Import** → upload your `.env` file.

**Key secrets to migrate:**

| Secret Name | Description |
|------------|-------------|
| `GEMINI_API_KEY` | Google Gemini LLM key |
| `GITHUB_APP_ID` | GitHub App numeric ID |
| `GITHUB_WEBHOOK_SECRET` | GitHub App webhook HMAC secret |
| `ENCRYPTION_KEY` | 32-byte hex BYOK encryption key |
| `STRIPE_SECRET_KEY` | Stripe API key (`sk_test_xxx` / `sk_live_xxx`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret (`whsec_xxx`) |
| `STRIPE_PRICE_PRO` | Stripe Pro plan Price ID |
| `STRIPE_PRICE_TEAM` | Stripe Team plan Price ID |

---

## 4. Injecting Secrets into Docker Compose

### Option A — Infisical CLI (recommended for CI/CD)
```bash
# Install Infisical CLI
brew install infisical/get-cli/infisical

# Authenticate
infisical login --domain http://localhost:8081

# Run docker compose with secrets injected
infisical run --projectId <project-id> --env prod -- \
  docker compose -f docker/docker-compose.yml up -d
```

### Option B — Machine Identity Token (for production/Hetzner)
```bash
# In Infisical: Settings → Machine Identities → Create
# Copy the token, inject via environment:
export INFISICAL_TOKEN=<machine-token>
infisical run --token $INFISICAL_TOKEN --env prod -- \
  docker compose -f docker/docker-compose.yml up -d
```

---

## 5. GitHub Actions Integration

```yaml
# In .github/workflows/ci.yml, add:
- name: Import secrets from Infisical
  uses: Infisical/secrets-action@v1.0.7
  with:
    client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
    client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
    env-slug: "prod"
    project-slug: "docugardener-prod"
    domain: "https://secrets.docugardener.io"
    export-type: env
```

---

## 6. Production Deployment on Hetzner

On `shared-services-01`:
```bash
# Add to the shared-services docker-compose.yml
# Use production ENCRYPTION_KEY and AUTH_SECRET (different from local!)
# Configure Caddy to reverse proxy to infisical:8080

# Caddy config snippet:
# secrets.docugardener.io {
#   reverse_proxy infisical:8080
# }
```

---

## 7. Health Check
```bash
curl http://localhost:8081/api/status
# Expected: {"status":"ok"}
```

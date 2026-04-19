# DocuGardener Deployment Guide

Two deployment methods are supported:

| Method | Best for |
|---|---|
| **Docker Compose** (Steps 1–11) | Local development, single-server hosting |
| **Kubernetes / Helm** (see [Kubernetes Deployment](#kubernetes-deployment-ent-13)) | On-premise regulated environments (TEAM plan), HA production |

---

## Step 1: Prerequisites

Before deploying, ensure you have:

- [ ] Docker & Docker Compose installed
- [ ] GitHub account with admin access to test repos
- [ ] Gemini API key from Google AI Studio

---

## Step 2: Create GitHub App

1. Go to **GitHub Settings** → **Developer Settings** → **GitHub Apps** → **New GitHub App**

2. Fill in the form:
   - **Name**: `DocuGardener-YourOrg`
   - **Homepage URL**: `https://your-domain.example.com` (or any valid HTTPS URL)
   - **Webhook URL**: Go to [smee.io](https://smee.io), click "Start a new channel", and paste that URL here.
   - **Webhook Secret**: Generate a secure random string

3. **Permissions** (Repository):
   - Contents: Read
   - Pull requests: Read & Write
   - Checks: Read & Write
   - Metadata: Read

4. **Subscribe to events**:
   - Pull request
   - Push

5. After creation:
   - Note the **App ID**
   - Generate and download the **Private Key** (.pem file)
   - Install the app on your test repository

---

## Step 3: Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **Create API Key**
3. Copy the key

---

## Step 4: Configure Environment

Copy `.env.example` to `.env` and fill in:

```bash
cd /path/to/docugardener
cp .env.example .env
```

Edit `.env`:

```env
# === Application ===
ENVIRONMENT=development
DEBUG=true

# === GitHub App ===
GITHUB_APP_ID=<your-app-id>
GITHUB_WEBHOOK_SECRET=<your-webhook-secret>
GITHUB_PRIVATE_KEY_PATH=./secrets/github-app.pem

# === LLM (Gemini) ===
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your-gemini-key>
GEMINI_MODEL=gemini-2.0-flash

# === Vector DB ===
VECTOR_DB_PROVIDER=weaviate
WEAVIATE_URL=http://weaviate:8080

# === Database (SCAL-01) ===
# POSTGRES_PASSWORD is shared between the postgres container and PgBouncer.
# SQL_DATABASE_URL must route through pgbouncer:5432 (not postgres:5432 directly).
POSTGRES_PASSWORD=changeme
SQL_DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/docugardener-web

# === Processing ===
DRIFT_SCORE_THRESHOLD=30
```

---

## Step 5: Add GitHub App Private Key

Place the PEM file downloaded from your GitHub App settings at `secrets/github-app.pem`, then lock down its permissions:

```bash
mkdir -p secrets
chmod 600 secrets/github-app.pem
```

---

## Step 6: Start Services

```bash
docker-compose -f docker/docker-compose.yml up -d
```

This starts:

- DocuGardener API (port 8000)
- RQ Worker × 2 (jobs processed in parallel — `high` + `default` priority queues)
- Weaviate Vector DB (port 8080)
- Redis Queue (port 6379)
- Postgres Web DB (internal port 5432, host port 5433)
- PgBouncer connection pooler (transaction mode, sits between app and Postgres)
- Scheduler Service (Nightly Rollup at 02:00 UTC)

---

## Step 7: Configure Web Frontend

Copy the frontend environment template and fill in values:

```bash
cd web
cp .env.example .env
```

Edit `web/.env`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/docugardener-web?schema=public"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<generate-a-random-secret>"

# GitHub OAuth App (separate from the GitHub App above)
GITHUB_ID="<your-github-oauth-app-client-id>"
GITHUB_SECRET="<your-github-oauth-app-client-secret>"

# AI Provider (BYOK — optional if using Platform Default)
GEMINI_API_KEY="<your-gemini-key>"

# Zero-Config Bundled LLM Key (UX-03)
# Reuse GEMINI_API_KEY in dev; use a separate rate-limited key in production.
BUNDLED_GEMINI_KEY="<your-gemini-key>"
BUNDLED_GEMINI_MODEL="gemini-2.0-flash"
```

Install frontend dependencies:

```bash
npm install
```

> **Note:** `BUNDLED_GEMINI_KEY` must be set in **both** `web/.env` (Next.js reads it at startup to show the "Platform Default" card in Settings) and the root `.env` (Python backend reads it for the zero-config fallback). In development you can reuse the same key value.

---

## Step 8: Run Database Migrations

Ensure the database schema is up-to-date:

```bash
cd web
npx prisma migrate dev --name init
```

---

## Step 9: Verify Deployment

```bash
# Check health
curl http://localhost:8000/health

# Check readiness
curl http://localhost:8000/ready
```

Expected response:

```json
{"status": "healthy"}
```

---

## Step 10: Expose Webhook (Development)

Since we used smee.io for the webhook, we need to forward it to our local instance.

1. Install the smee/ngrok client (optional, or use the Docker service if configured)
2. **Recommended**: If valid `smee.io` URL is configured in `.env` (future setup), the app can listen directly.
3. **Alternative**: Use ngrok if you prefer:

   ```bash
   ngrok http 8000
   ```

   And update the Webhook URL in GitHub App settings to the ngrok URL.

---

## Step 11: Test with a PR

1. Create a test PR in your configured test repository
2. Watch the logs: `docker-compose -f docker/docker-compose.yml logs -f docugardener`
3. You should see:
   - Webhook received
   - Analysis started
   - Drift score calculated
   - Comment posted on PR

---

---

## Kubernetes Deployment (ENT-13)

Available on the **TEAM plan**. Deploys all four services (api, worker, scheduler, web) plus optional bundled PostgreSQL, Redis, and Weaviate subcharts.

### Prerequisites

- Kubernetes 1.25+
- Helm 3.14+
- External PostgreSQL, Redis, and Weaviate (or enable bundled subcharts for dev)

### Quick install

```bash
# 1. Create namespace and pre-provision secrets
kubectl create namespace docugardener

kubectl create secret generic docugardener-secrets \
  --namespace docugardener \
  --from-literal=DATABASE_URL="postgresql://user:pass@postgres.internal:5432/docugardener" \
  --from-literal=REDIS_URL="redis://redis.internal:6379/0" \
  --from-literal=GEMINI_API_KEY="your-key" \
  --from-literal=GITHUB_APP_ID="your-app-id" \
  --from-literal=GITHUB_PRIVATE_KEY="$(cat secrets/github-app.pem)" \
  --from-literal=ENCRYPTION_KEY="your-32-byte-key!!!!!!!!!!!!!!" \
  --from-literal=NEXTAUTH_SECRET="your-nextauth-secret" \
  --from-literal=NEXTAUTH_URL="https://docugardener.example.com"

# 2. Install from OCI registry
helm install docugardener oci://ghcr.io/docugardener/helm/docugardener \
  --version 0.1.0 \
  --namespace docugardener \
  --set secrets.existingSecret=docugardener-secrets \
  --set ingress.enabled=true \
  --set "ingress.hosts[0].host=docugardener.example.com"
```

### Air-gap (no external internet)

Pull images to your internal registry, then override the global registry prefix:

```bash
helm install docugardener oci://ghcr.io/docugardener/helm/docugardener \
  --version 0.1.0 \
  --namespace docugardener \
  --set global.imageRegistry=my-registry.example.com \
  --set "global.imagePullSecrets[0].name=regcred" \
  --set secrets.existingSecret=docugardener-secrets
```

See `helm/docugardener/README.md` for the full air-gap image list and configuration reference.

### Security profile

The chart ships PSA **restricted** compliant by default: `runAsNonRoot`, `readOnlyRootFilesystem`, `capabilities.drop: [ALL]`, `seccompProfile: RuntimeDefault`, `automountServiceAccountToken: false`, and default-deny NetworkPolicies for every component.

### CI / CD

`.github/workflows/helm-publish.yml` runs `helm lint` → PSA compliance check → kind smoke test → OCI push + cosign signature on every merge to `main` that touches `helm/`.

---

## Troubleshooting

| Issue | Solution |
| :--- | :--- |
| Webhook not received | Check ngrok URL matches GitHub App |
| Auth error | Verify private key path and permissions |
| Gemini error | Verify API key is valid |
| Weaviate error | Check container is running |
| No nightly rollup issues | Verify scheduler container is running (`docker ps`) |

Gitgub APP webhook
Webhook URL <https://localhost/api/webhooks/github>
secret 84d3b6f9e2a1c5b8d7e4f0a3c6b9d2e5f8a1c4b7

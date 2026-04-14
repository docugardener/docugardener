# DocuGardener — Restore Procedure (B-13)

> **Purpose**: Documented restore sequence for Hetzner VPS after a catastrophic failure.
> All data is preserved via Hetzner Snapshots (daily) and off-site Postgres/Weaviate backups.

---

## 1. Pre-Restore Checklist

Before starting, verify:
- [ ] You have access to the Hetzner Console or `hcloud` CLI
- [ ] You have the latest snapshot ID or a restored VPS ready
- [ ] Infisical is available (either self-hosted on `shared-services-01` or via another instance)
- [ ] You can SSH into the server: `ssh root@<server-ip>`

---

## 2. Recovery Options

### Option A — Restore from Hetzner Snapshot (Full System)
```bash
# In Hetzner Console → Servers → docugardener-01 → Snapshots
# Create server from snapshot → choose latest daily snapshot
# OR using hcloud CLI:
hcloud server rebuild docugardener-01 --image <snapshot-id>
```

### Option B — Fresh VPS Restore (Lost server entirely)
```bash
# 1. Create new Hetzner VPS (CX31, Ubuntu 24.04, Nürnberg/Helsinki)
# 2. Run provisioning playbook (see Deployment Guide)
# 3. Restore data via scripts/restore-start-order.sh
```

---

## 3. Ordered Service Restore

**Start order is critical due to dependencies:**

```
postgres → redis/valkey → weaviate → docugardener-api → worker → caddy
```

Use the automated script:
```bash
cd /opt/docugardener
bash scripts/restore-start-order.sh
```

Or manually step-by-step:

### Step 1 — Start Postgres (all other services depend on it)
```bash
docker compose -f docker/docker-compose.yml up -d postgres
docker compose -f docker/docker-compose.yml exec postgres pg_isready -U postgres
# Wait until: localhost:5432 - accepting connections
```

### Step 2 — Restore Postgres Data (if not from snapshot)
```bash
# Copy backup file from off-site storage
scp backup@backup-host:/backups/docugardener-postgres-latest.sql.gz /tmp/

# Restore
gunzip -c /tmp/docugardener-postgres-latest.sql.gz | \
  docker compose -f docker/docker-compose.yml exec -T postgres \
  psql -U postgres docugardener-web

echo "✅ Postgres restored"
```

### Step 3 — Start Valkey (Redis-compatible job queue)
```bash
docker compose -f docker/docker-compose.yml up -d redis
docker compose -f docker/docker-compose.yml exec redis valkey-cli ping
# Expected: PONG
```

### Step 4 — Start Weaviate (Vector DB)
```bash
docker compose -f docker/docker-compose.yml up -d weaviate
# Wait for readiness
until docker compose -f docker/docker-compose.yml exec weaviate wget -q --spider http://localhost:8080/v1/.well-known/ready 2>/dev/null; do
  echo "Waiting for Weaviate..."; sleep 5
done
echo "✅ Weaviate ready"
```

### Step 5 — Restore Weaviate Data (if not from snapshot)
```bash
# Weaviate objects are regeneratable by re-triggering analysis jobs
# For a full restore, use the Weaviate backup module (if configured):
# GET http://localhost:8080/v1/backups/filesystem/<backup-id>/restore
```

### Step 6 — Start DocuGardener API + Worker
```bash
docker compose -f docker/docker-compose.yml up -d docugardener worker scheduler
```

### Step 7 — Start Caddy (Reverse Proxy + TLS)
```bash
docker compose -f docker/docker-compose.yml up -d caddy 2>/dev/null || \
  systemctl start caddy
```

---

## 4. Post-Restore Smoke Tests

Run after all containers are up:

```bash
# API health
curl https://api.docugardener.io/health
# Expected: {"status": "healthy", ...}

# Webhook endpoint reachable
curl -X POST https://api.docugardener.io/webhooks/github \
  -H "Content-Type: application/json" -d '{"action":"ping"}' \
  --max-time 5
# Expected: 401 Unauthorized (signature required — healthy response)

# Queue alive
docker compose -f docker/docker-compose.yml exec redis valkey-cli llen "rq:queue:default"
# Expected: 0 or a small positive integer

# Postgres connection
docker compose -f docker/docker-compose.yml exec postgres \
  psql -U postgres -d docugardener-web -c "SELECT COUNT(*) FROM \"Tenant\";"
# Expected: a count, no error

# Worker running
docker compose -f docker/docker-compose.yml logs worker --tail 5
# Expected: "Starting RQ worker..."
```

---

## 5. Hetzner Snapshot Schedule

| Type | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Hetzner Snapshot | Daily (04:00 CET) | 7 days | Hetzner |
| Postgres pg_dump | Daily (03:00 CET) | 30 days | Off-site S3/B2 |
| Weaviate Backup | Weekly | 4 weeks | Off-site S3/B2 |

**Create a manual snapshot before major changes:**
```bash
hcloud server create-image docugardener-01 \
  --description "pre-deploy-$(date +%Y%m%d)" \
  --type snapshot
```

---

## 6. RTO / RPO Targets (Launch Phase)

| Metric | Target |
|--------|--------|
| Recovery Time Objective (RTO) | < 2 hours |
| Recovery Point Objective (RPO) | < 24 hours |
| Estimated restore time from snapshot | ~20 minutes |
| Estimated restore time from pg_dump | ~40 minutes |

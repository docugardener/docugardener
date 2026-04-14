#!/usr/bin/env bash
# OPS-01: Automated backup for DocuGardener production stack.
#
# Backs up:
#   1. PostgreSQL (pg_dump, gzipped)
#   2. Weaviate (HTTP backup API)
#
# Targets:
#   - Local: /backups/ volume (always)
#   - Remote: S3-compatible object storage (if BACKUP_S3_BUCKET is set)
#
# Usage:
#   ./scripts/backup.sh                   # run once (manual)
#   Scheduled by docker-compose backup-cron service (nightly)
#
# Required env vars:
#   POSTGRES_PASSWORD       — Postgres password
#
# Optional env vars:
#   BACKUP_S3_BUCKET        — s3://bucket-name/prefix (Hetzner Object Storage)
#   BACKUP_S3_ENDPOINT      — e.g. https://fsn1.your-objectstorage.com
#   AWS_ACCESS_KEY_ID       — S3 credentials
#   AWS_SECRET_ACCESS_KEY   — S3 credentials
#   BACKUP_RETENTION_DAYS   — local retention (default: 7)
#   WEAVIATE_URL            — Weaviate base URL (default: http://weaviate:8080)

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
WEAVIATE_URL="${WEAVIATE_URL:-http://weaviate:8080}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
PG_BACKUP="${BACKUP_DIR}/pg-${TIMESTAMP}.sql.gz"
WV_BACKUP_ID="backup-${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Starting backup at ${TIMESTAMP}"

# ---------------------------------------------------------------------------
# 1. PostgreSQL backup
# ---------------------------------------------------------------------------
echo "[backup] PostgreSQL: dumping..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h postgres \
    -U postgres \
    -d docugardener-web \
    --no-owner \
    --no-privileges \
    | gzip > "${PG_BACKUP}"

PG_SIZE=$(du -sh "${PG_BACKUP}" | cut -f1)
echo "[backup] PostgreSQL: done (${PG_SIZE}) → ${PG_BACKUP}"

# ---------------------------------------------------------------------------
# 2. Weaviate backup
# ---------------------------------------------------------------------------
echo "[backup] Weaviate: requesting snapshot..."
WV_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${WEAVIATE_URL}/v1/backups/filesystem" \
    -H "Content-Type: application/json" \
    -d "{\"id\": \"${WV_BACKUP_ID}\", \"include\": []}" \
    2>/dev/null || echo "000")

if [ "${WV_STATUS}" = "200" ] || [ "${WV_STATUS}" = "422" ]; then
    # 422 = backup ID already exists (idempotent)
    echo "[backup] Weaviate: snapshot requested (HTTP ${WV_STATUS})"

    # Poll for completion (max 5 min)
    for i in $(seq 1 30); do
        STATUS=$(curl -s "${WEAVIATE_URL}/v1/backups/filesystem/${WV_BACKUP_ID}" 2>/dev/null \
            | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
        if [ "${STATUS}" = "SUCCESS" ]; then
            echo "[backup] Weaviate: snapshot complete"
            break
        elif [ "${STATUS}" = "FAILED" ]; then
            echo "[backup] WARNING: Weaviate snapshot failed"
            break
        fi
        sleep 10
    done
else
    echo "[backup] WARNING: Weaviate backup API returned HTTP ${WV_STATUS} — skipping"
fi

# ---------------------------------------------------------------------------
# 3. Upload to S3 (if configured)
# ---------------------------------------------------------------------------
if [ -n "${BACKUP_S3_BUCKET:-}" ] && [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
    echo "[backup] Uploading PostgreSQL backup to S3..."
    aws s3 cp "${PG_BACKUP}" "${BACKUP_S3_BUCKET}/pg-${TIMESTAMP}.sql.gz" \
        --endpoint-url "${BACKUP_S3_ENDPOINT}" \
        --quiet
    echo "[backup] S3 upload complete"
else
    echo "[backup] S3 not configured — skipping remote upload"
fi

# ---------------------------------------------------------------------------
# 4. Local retention cleanup
# ---------------------------------------------------------------------------
echo "[backup] Cleaning local backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "pg-*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
REMAINING=$(find "${BACKUP_DIR}" -name "pg-*.sql.gz" | wc -l | tr -d ' ')
echo "[backup] Local retention: ${REMAINING} backup(s) kept"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo "[backup] Backup completed at $(date -u +%Y%m%d-%H%M%S)"

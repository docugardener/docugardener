#!/usr/bin/env bash
# =============================================================================
# DocuGardener — Orchestrated Restore Start Script (B-13)
# =============================================================================
# Starts all containers in the correct dependency order after a restore.
# Run from the project root: bash scripts/restore-start-order.sh
#
# Requirements: docker compose v2, access to /opt/docugardener
# =============================================================================

set -euo pipefail

COMPOSE="docker compose -f docker/docker-compose.yml"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

log_info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }

wait_for_healthy() {
  local service=$1
  local max_wait=${2:-60}
  local waited=0

  log_info "Waiting for ${service} to become healthy..."
  while [[ $waited -lt $max_wait ]]; do
    local health
    health=$($COMPOSE ps --format json "$service" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('Health',''))" 2>/dev/null || echo "unknown")
    if [[ "$health" == "healthy" ]]; then
      log_info "${service} is healthy ✅"
      return 0
    fi
    sleep 3
    waited=$((waited + 3))
  done

  log_error "${service} did not become healthy within ${max_wait}s"
  return 1
}

# =============================================================================
# Step 1 — Postgres
# =============================================================================
log_info "Step 1/5 — Starting Postgres..."
$COMPOSE up -d postgres
wait_for_healthy postgres 90

# =============================================================================
# Step 2 — Valkey (Redis-compatible)
# =============================================================================
log_info "Step 2/5 — Starting Valkey..."
$COMPOSE up -d redis
wait_for_healthy redis 30

# Smoke test
if $COMPOSE exec redis valkey-cli ping | grep -q PONG; then
  log_info "Valkey PONG ✅"
else
  log_error "Valkey did not respond to PING"
  exit 1
fi

# =============================================================================
# Step 3 — Weaviate
# =============================================================================
log_info "Step 3/5 — Starting Weaviate..."
$COMPOSE up -d weaviate
wait_for_healthy weaviate 120

# =============================================================================
# Step 4 — DocuGardener API + Worker + Scheduler
# =============================================================================
log_info "Step 4/5 — Starting DocuGardener services..."
$COMPOSE up -d docugardener worker scheduler

# Wait for API
max=60; waited=0
until curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  sleep 3; waited=$((waited+3))
  [[ $waited -lt $max ]] || { log_error "API did not respond within ${max}s"; exit 1; }
done
log_info "DocuGardener API responding ✅"

# =============================================================================
# Step 5 — Caddy (Reverse Proxy)
# =============================================================================
log_info "Step 5/5 — Starting Caddy..."
if $COMPOSE ps caddy &>/dev/null; then
  $COMPOSE up -d caddy
  log_info "Caddy started via docker compose ✅"
elif systemctl is-active --quiet caddy; then
  log_info "Caddy already running via systemd ✅"
else
  systemctl start caddy && log_info "Caddy started via systemd ✅" || log_warn "Could not start Caddy — check manually"
fi

# =============================================================================
# Smoke Tests
# =============================================================================
log_info "Running post-restore smoke tests..."

# API health
if curl -sf http://localhost:8000/health | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('status')=='healthy'" 2>/dev/null; then
  log_info "✅ API health OK"
else
  log_warn "⚠️  API health check returned unexpected status"
fi

# Postgres connectivity
if $COMPOSE exec postgres psql -U postgres -d docugardener-web -c "SELECT 1" -q &>/dev/null; then
  log_info "✅ Postgres connection OK"
else
  log_error "Postgres connection failed"
fi

log_info ""
log_info "============================================================"
log_info "DocuGardener restore complete!"
log_info "Run a full smoke test: curl https://api.docugardener.io/health"
log_info "============================================================"

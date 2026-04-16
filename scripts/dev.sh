#!/usr/bin/env bash
# =============================================================================
# DocuGardener — Dev startup with Infisical secret injection (SEC-04)
#
# Primary: secrets injected from Infisical (http://localhost:8081)
# Fallback: if Infisical unreachable, docker-compose falls back to .env
#
# Usage:
#   ./scripts/dev.sh              # start all services
#   ./scripts/dev.sh up -d api    # pass any docker-compose args
# =============================================================================

set -euo pipefail

INFISICAL_DOMAIN="http://localhost:8081"
PROJECT_ID="${INFISICAL_PROJECT_ID:-}"
ENV="dev"
COMPOSE_FILE="docker/docker-compose.yml"

# Check Infisical is reachable and project ID is configured
if [ -n "${PROJECT_ID}" ] && curl -sf "${INFISICAL_DOMAIN}/api/status" > /dev/null 2>&1; then
  echo "[dev.sh] Infisical reachable — injecting secrets from project ${PROJECT_ID} (${ENV})"
  exec infisical run \
    --domain "${INFISICAL_DOMAIN}" \
    --projectId "${PROJECT_ID}" \
    --env "${ENV}" \
    -- \
    docker-compose -f "${COMPOSE_FILE}" --env-file .env "${@:-up}"
else
  echo "[dev.sh] Infisical unreachable — falling back to .env file"
  exec docker-compose -f "${COMPOSE_FILE}" --env-file .env "${@:-up}"
fi

#!/usr/bin/env bash
# =============================================================================
# DocuGardener — Generate Production Secrets
# =============================================================================
# Usage:  bash scripts/generate-secrets.sh >> .env.production
#
# Requires: openssl (pre-installed on macOS and most Linux distros)
# =============================================================================
set -euo pipefail

if ! command -v openssl &>/dev/null; then
    echo "ERROR: openssl is required but not installed." >&2
    exit 1
fi

echo ""
echo "# --- Generated secrets ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) ---"
echo "# Run: bash scripts/generate-secrets.sh >> .env.production"
echo ""
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)"
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"

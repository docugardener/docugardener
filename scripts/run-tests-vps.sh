#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# =============================================================================
# DocuGardener — VPS Test Runner
#
# Runs test suites on the production VPS.
#
# Usage (from /opt/docugardener on the VPS):
#   bash scripts/run-tests-vps.sh [suite ...] [--confirm-prod]
#
#   Suites: python  web  e2e  playwright  all
#   Default (no args): python web   ← safe, no production impact
#
# ── Safe suites (no production impact) ───────────────────────────────────────
#   bash scripts/run-tests-vps.sh              # python + web (default)
#   bash scripts/run-tests-vps.sh python web   # same, explicit
#
# ── Production QA (requires --confirm-prod) ──────────────────────────────────
#   bash scripts/run-tests-vps.sh e2e --confirm-prod
#     Creates real GitHub PRs, mutates live tenant config, burns LLM tokens.
#     Run manually before a release — never in an automated loop.
#
# ── Cadence reference ────────────────────────────────────────────────────────
#   Every deploy (auto)   deploy.yml post-deploy step → python web (~3 min)
#   Pre-release sign-off  bash scripts/run-tests-vps.sh e2e --confirm-prod
#   Monthly Playwright    gh workflow run e2e.yml  (ephemeral DB, no prod)
#   Pre-release CI        gh workflow run ci.yml   (Actions, no prod)
#
# Prerequisites — run scripts/setup-vps-e2e.sh once first.
#
# What each suite does:
#   python      Unit + integration tests inside the app Docker image.
#               SQLite in-memory, all mocked. Zero prod impact.
#   web         Vitest component tests + TypeScript type-check.
#               Runs in node:20-slim container. Zero prod impact.
#   e2e         Python e2e tests against https://docugardener.dev.
#               ⚠ Hits live production — requires --confirm-prod.
#               Requires: gh CLI authed, full Docker stack running.
#   playwright  Playwright browser tests against https://docugardener.dev.
#               ⚠ Hits live production — requires --confirm-prod.
#               Requires: Node.js 20+, Playwright chromium installed.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
pass() { echo -e "${GREEN}  ✓ $*${NC}"; }
fail() { echo -e "${RED}  ✗ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $*${NC}"; }
header() { echo -e "\n${BOLD}── $* ────────────────────────────────────────────${NC}"; }

# ── Load .env ─────────────────────────────────────────────────────────────────
if [ -f "${ROOT}/.env" ]; then
  set -a; source "${ROOT}/.env"; set +a
else
  warn ".env not found at ${ROOT}/.env — some env vars may be missing"
fi

# ── VPS-specific defaults ─────────────────────────────────────────────────────
# Postgres is exposed on host port 5433 (docker-compose.yml ports: 5433:5432).
# Used by Playwright suite (which runs on the host, not inside Docker).
# The Python e2e suite runs inside the Docker network and uses postgres:5432 directly.
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
VPS_DB_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5433/docugardener-web"

E2E_API_BASE="${E2E_API_BASE:-https://docugardener.dev}"
E2E_WEB_BASE="${E2E_WEB_BASE:-https://docugardener.dev}"
E2E_TENANT_ID="${E2E_TENANT_ID:-cmmjpxq3x0005bul35iu3viuv}"
E2E_REPO_ID="${E2E_REPO_ID:-repo-9615a1707d}"

PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://docugardener.dev}"

# Docker Compose file and project
#
# DC is an ARRAY, not a string. As a string it had to be used unquoted (${DC})
# to word-split into arguments, which also split any path containing a space —
# so the script could not run from a checkout like "…/AI Projects/DocuGardener".
# It failed with: unknown docker command: "compose Projects/DocuGardener/.env".
# Invisible on the VPS (/opt/docugardener has no space). Always expand as
# "${DC[@]}" so each element stays one argument.
DC_FILE="${ROOT}/docker/docker-compose.yml"

# Compose ships in two forms and hosts differ: the VPS has the `docker compose`
# CLI plugin, while some local setups (e.g. Colima without the plugin wired in)
# only have the standalone `docker-compose` v2 binary. Detect instead of
# assuming either — hardcoding one form breaks the other host.
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose --env-file "${ROOT}/.env" -f "${DC_FILE}")
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose --env-file "${ROOT}/.env" -f "${DC_FILE}")
else
  fail "neither 'docker compose' nor 'docker-compose' found — cannot run any suite"
  exit 1
fi

# ── Suite selection ───────────────────────────────────────────────────────────
# Parse --confirm-prod flag (required for e2e / playwright which touch production)
SUITES_TO_RUN=()
CONFIRM_PROD=false
for arg in "$@"; do
  if [ "${arg}" = "--confirm-prod" ]; then
    CONFIRM_PROD=true
  else
    SUITES_TO_RUN+=("${arg}")
  fi
done

# Default (no suite args): run only the safe suites that do NOT touch production.
# Pass e2e / playwright explicitly + --confirm-prod for full QA.
if [ ${#SUITES_TO_RUN[@]} -eq 0 ]; then
  SUITES_TO_RUN=(python web)
fi

# Normalise "all" → all suites
for i in "${!SUITES_TO_RUN[@]}"; do
  if [ "${SUITES_TO_RUN[$i]}" = "all" ]; then
    SUITES_TO_RUN=(python web e2e playwright)
    break
  fi
done

# ── Result tracking ───────────────────────────────────────────────────────────
declare -a PASSED=()
declare -a FAILED=()
declare -a SKIPPED=()

suite_result() {
  local suite="$1" code="$2"
  if [ "${code}" -eq 0 ]; then
    PASSED+=("${suite}")
    pass "${suite}"
  else
    FAILED+=("${suite}")
    fail "${suite} (exit ${code})"
  fi
}

wants() {
  local suite="$1"
  for s in "${SUITES_TO_RUN[@]}"; do
    [ "${s}" = "${suite}" ] && return 0
  done
  return 1
}

# ── Production guard ──────────────────────────────────────────────────────────
# e2e and playwright suites hit the LIVE production app and database.
# They must be run deliberately, never automatically.
if (wants e2e || wants playwright) && [ "${CONFIRM_PROD}" = "false" ]; then
  echo ""
  echo -e "${RED}${BOLD}  ✗ Production guard — cannot run e2e / playwright without --confirm-prod${NC}"
  echo ""
  echo "  These suites run against the LIVE production environment:"
  echo "    • Create real GitHub PRs on docugardener/docugardener-test"
  echo "    • Temporarily mutate tenant plan, features, and quota in the live DB"
  echo "    • Burn real LLM API tokens (~15–20 calls per run)"
  echo ""
  echo "  Re-run with --confirm-prod when you intend a manual QA sign-off:"
  echo ""
  echo "    bash scripts/run-tests-vps.sh e2e --confirm-prod"
  echo "    bash scripts/run-tests-vps.sh playwright --confirm-prod"
  echo "    bash scripts/run-tests-vps.sh e2e playwright --confirm-prod"
  echo ""
  echo "  Safe suites (no production impact):"
  echo "    bash scripts/run-tests-vps.sh              # python + web (default)"
  echo "    bash scripts/run-tests-vps.sh python web"
  echo ""
  exit 1
fi

# ── Pre-flight ────────────────────────────────────────────────────────────────
header "Pre-flight"

# docker compose build must have been run
if ! "${DC[@]}" images docugardener 2>/dev/null | grep -q "docugardener"; then
  warn "docugardener image not found — run 'docker compose build docugardener' first"
fi
pass "Docker compose config found"

# The python + e2e suites run in the `test-runner` service, built from the
# `test` stage. The production image has had no pip since SEC-TRIVY-03, so these
# suites can no longer pip-install their dependencies into it at runtime —
# that is exactly what turned deploy.yml red on 2026-08-05. The test deps are
# pinned in docker/requirements-test.txt and baked into the image instead.
#
# This build is idempotent and almost always a cache hit: the `test` stage
# derives from `builder`, which the production build has already cached.
if wants python || wants e2e; then
  echo "  Building test-runner image (cache hit unless requirements-test.txt changed)..."
  if "${DC[@]}" --profile test build test-runner > /tmp/dg-test-build.log 2>&1; then
    pass "test-runner image ready"
  else
    fail "test-runner image build failed — see /tmp/dg-test-build.log"
    tail -20 /tmp/dg-test-build.log
    exit 1
  fi
fi

# FastAPI health (needed for e2e)
if wants e2e || wants playwright; then
  if curl -sf "${E2E_API_BASE}/health" > /dev/null 2>&1; then
    pass "FastAPI at ${E2E_API_BASE}"
  else
    warn "FastAPI not reachable at ${E2E_API_BASE} — e2e tests will fail"
  fi
fi

# gh CLI (needed for e2e)
if wants e2e; then
  if gh auth status > /dev/null 2>&1; then
    pass "gh CLI authenticated"
  else
    warn "gh CLI not authenticated — Python e2e tests will fail (run: gh auth login)"
  fi
fi

# Node.js version (needed for web + playwright)
if wants web || wants playwright; then
  NODE_VER=$(node --version 2>/dev/null || echo "missing")
  NODE_MAJOR=$(echo "${NODE_VER}" | sed 's/v//' | cut -d. -f1)
  if [ "${NODE_VER}" = "missing" ] || [ "${NODE_MAJOR:-0}" -lt 20 ]; then
    warn "Node.js 20+ required for web/playwright suites (found: ${NODE_VER})"
    wants web && SKIPPED+=("web")
    wants playwright && SKIPPED+=("playwright")
  else
    pass "Node.js ${NODE_VER}"
  fi
fi

# ── Suite: python ─────────────────────────────────────────────────────────────
if wants python; then
  header "Suite: python (unit + integration)"
  echo "  Using docker compose run against test-runner (tests/ mounted from host)"

  # --no-deps: unit+integration tests are fully mocked — no postgres/redis/weaviate needed.
  # --user root: the venv is root-owned; pytest also needs a writable cache dir.
  # --profile test: test-runner is profile-gated so `up` can never start it.
  # Extra mounts: tests that read config/script/doc files need project dirs accessible.
  # pytest is baked into the image (docker/requirements-test.txt) — no runtime install.
  set +e
  "${DC[@]}" --profile test run --rm --no-deps --user root \
    -v "${ROOT}/tests:/app/tests:ro" \
    -v "${ROOT}/pyproject.toml:/app/pyproject.toml:ro" \
    -v "${ROOT}/docker:/app/docker:ro" \
    -v "${ROOT}/scripts:/app/scripts:ro" \
    -v "${ROOT}/docs:/app/docs:ro" \
    -v "${ROOT}/helm:/app/helm:ro" \
    -v "${ROOT}/.github:/app/.github:ro" \
    -v "${ROOT}/DEPLOYMENT.md:/app/DEPLOYMENT.md:ro" \
    -v "${ROOT}/README.md:/app/README.md:ro" \
    -e PYTHONPATH=/app \
    -e APP_ENV=development \
    -e DEBUG=true \
    -e LOG_LEVEL=WARNING \
    test-runner \
    python -m pytest tests/unit/ tests/integration/ -q --tb=short 2>&1 \
    | tee /tmp/dg-test-python.log
  PYTHON_EXIT=${PIPESTATUS[0]}
  set -e

  # Summarise known-flaky tests so the user knows
  FAIL_COUNT=$(grep -c "^FAILED" /tmp/dg-test-python.log 2>/dev/null || echo 0)
  if [ "${PYTHON_EXIT}" -ne 0 ] && [ "${FAIL_COUNT}" -le 10 ]; then
    warn "${FAIL_COUNT} known-flaky tests may fail due to VPS env (see /tmp/dg-test-python.log)"
    warn "If all failures are in test_webhook_security.py, they are pre-existing — not regressions"
  fi

  suite_result "python" "${PYTHON_EXIT}"
fi

# ── Suite: web ────────────────────────────────────────────────────────────────
if wants web && ! [[ " ${SKIPPED[*]} " =~ " web " ]]; then
  header "Suite: web (Vitest + TypeScript)"

  echo "  Running inside node:20-slim container (openssl installed for Prisma binary detection)"
  echo "  node_modules cached at ${ROOT}/web/node_modules"

  # apt-get install openssl: enables Prisma to detect OpenSSL 3.x and pick the correct binary.
  # npm ci: installs/updates node_modules into the mounted web/ dir (cached between runs).
  # prisma generate: regenerates the query engine for linux/debian-openssl-3.0.x.
  set +e
  docker run --rm \
    -v "${ROOT}/web:/app" \
    -w /app \
    node:20-slim \
    sh -c '
      apt-get update -qq && apt-get install -y -qq openssl > /dev/null 2>&1
      npm ci --silent
      npx prisma generate --silent
      npx vitest run --reporter=verbose
    ' 2>&1 | tee /tmp/dg-test-vitest.log
  VITEST_EXIT=${PIPESTATUS[0]}
  set -e

  echo "  Running TypeScript check..."
  set +e
  docker run --rm \
    -v "${ROOT}/web:/app" \
    -w /app \
    node:20-slim \
    sh -c 'npx tsc --noEmit' 2>&1 | tee /tmp/dg-test-tsc.log
  TSC_EXIT=${PIPESTATUS[0]}
  set -e

  if [ "${VITEST_EXIT}" -eq 0 ] && [ "${TSC_EXIT}" -eq 0 ]; then
    suite_result "web" 0
  else
    [ "${VITEST_EXIT}" -ne 0 ] && fail "Vitest failed (exit ${VITEST_EXIT})"
    [ "${TSC_EXIT}" -ne 0 ]    && fail "TypeScript check failed (exit ${TSC_EXIT})"
    suite_result "web" 1
  fi
fi

# ── Suite: e2e ────────────────────────────────────────────────────────────────
if wants e2e; then
  header "Suite: e2e (Python e2e against ${E2E_API_BASE})"
  echo "  TENANT_ID: ${E2E_TENANT_ID}"
  echo "  REPO_ID  : ${E2E_REPO_ID}"
  echo "  DB (internal): postgresql://postgres:***@postgres:5432/docugardener-web"

  # Run inside the Docker compose network so the 'postgres' hostname resolves.
  # Runs in test-runner (pytest baked in) — tests/ mounted from host, read-only.
  # /usr/bin/gh is mounted so e2e tests that create/close GitHub PRs can use it.
  # GH_TOKEN is forwarded so gh CLI authenticates without interactive login.
  set +e
  "${DC[@]}" --profile test run --rm --no-deps --user root \
    -v "${ROOT}/tests:/app/tests:ro" \
    -v "${ROOT}/pyproject.toml:/app/pyproject.toml:ro" \
    -v /usr/bin/gh:/usr/bin/gh:ro \
    -e E2E_ENABLED=1 \
    -e E2E_API_BASE="${E2E_API_BASE}" \
    -e E2E_WEB_BASE="${E2E_WEB_BASE}" \
    -e E2E_TENANT_ID="${E2E_TENANT_ID}" \
    -e E2E_REPO_ID="${E2E_REPO_ID}" \
    -e SQL_DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/docugardener-web" \
    -e GH_TOKEN="${GH_TOKEN:-}" \
    -e GIT_AUTHOR_NAME="DocuGardener E2E" \
    -e GIT_AUTHOR_EMAIL="e2e@docugardener.dev" \
    -e GIT_COMMITTER_NAME="DocuGardener E2E" \
    -e GIT_COMMITTER_EMAIL="e2e@docugardener.dev" \
    -e PYTHONPATH=/app \
    test-runner \
    bash -c '
      git config --global user.name "DocuGardener E2E" &&
      git config --global user.email "e2e@docugardener.dev" &&
      git config --global credential.helper "!gh auth git-credential" &&
      python -m pytest tests/e2e/ -m e2e -v -s --tb=short
    ' 2>&1 \
  | tee /tmp/dg-test-e2e.log
  E2E_EXIT=${PIPESTATUS[0]}
  set -e

  suite_result "e2e" "${E2E_EXIT}"
fi

# ── Suite: playwright ─────────────────────────────────────────────────────────
if wants playwright && ! [[ " ${SKIPPED[*]} " =~ " playwright " ]]; then
  header "Suite: playwright (browser tests against ${PLAYWRIGHT_BASE_URL})"
  warn "This suite seeds test users into the live database — data is cleaned up after"
  echo "  Base URL: ${PLAYWRIGHT_BASE_URL}"

  WEB_DIR="${ROOT}/web"
  cd "${WEB_DIR}"

  set +e
  PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
  DATABASE_URL="${VPS_DB_URL}" \
  CI=true \
  npx playwright test --project=chromium 2>&1 \
  | tee /tmp/dg-test-playwright.log
  PW_EXIT=${PIPESTATUS[0]}
  set -e

  cd "${ROOT}"
  suite_result "playwright" "${PW_EXIT}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Test Results${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"

for s in "${PASSED[@]+"${PASSED[@]}"}";  do echo -e "  ${GREEN}PASS${NC}  ${s}"; done
for s in "${FAILED[@]+"${FAILED[@]}"}";  do echo -e "  ${RED}FAIL${NC}  ${s}"; done
for s in "${SKIPPED[@]+"${SKIPPED[@]}"}"; do echo -e "  ${YELLOW}SKIP${NC}  ${s}"; done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  All suites passed.${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}  ${#FAILED[@]} suite(s) failed. Check logs in /tmp/dg-test-*.log${NC}"
  exit 1
fi

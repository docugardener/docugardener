#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# =============================================================================
# DocuGardener — One-time VPS test environment setup
#
# Run once on the VPS before using scripts/run-tests-vps.sh.
#
# Usage (from /opt/docugardener on the VPS):
#   bash scripts/setup-vps-e2e.sh
#
# What this does:
#   1. Installs gh CLI (if missing)
#   2. Verifies Node.js 20+
#   3. Creates .venv-e2e for the Python e2e suite (pytest + DB drivers only;
#      keeps the production venv untouched)
#   4. Installs Playwright chromium + system dependencies
#   5. Prints a checklist of required manual steps
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
pass() { echo -e "${GREEN}  ✓ $*${NC}"; }
fail() { echo -e "${RED}  ✗ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $*${NC}"; }
header() { echo -e "\n${BOLD}── $* ────────────────────────────────────────────${NC}"; }

# ── 1. gh CLI ─────────────────────────────────────────────────────────────────
header "Step 1: gh CLI"

if command -v gh > /dev/null 2>&1; then
  pass "gh CLI already installed ($(gh --version | head -1))"
else
  echo "  Installing gh CLI..."
  if command -v apt-get > /dev/null 2>&1; then
    # Debian/Ubuntu
    type -p curl > /dev/null || apt-get install -y curl
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update -qq
    apt-get install -y gh
    pass "gh CLI installed"
  else
    fail "Unsupported package manager — install gh manually: https://cli.github.com"
    exit 1
  fi
fi

# ── 2. Node.js ────────────────────────────────────────────────────────────────
header "Step 2: Node.js"

NODE_VER=$(node --version 2>/dev/null || echo "missing")
NODE_MAJOR=$(echo "${NODE_VER}" | sed 's/v//' | cut -d. -f1)

if [ "${NODE_VER}" = "missing" ]; then
  fail "Node.js not found"
  echo ""
  echo "  Install Node.js 20 via nvm (recommended):"
  echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash"
  echo "    source ~/.bashrc"
  echo "    nvm install 20 && nvm use 20"
  echo ""
  echo "  Or via NodeSource:"
  echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
  echo "    apt-get install -y nodejs"
  exit 1
elif [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  fail "Node.js 20+ required — found ${NODE_VER}"
  exit 1
else
  pass "Node.js ${NODE_VER}"
fi

# ── 3. Python e2e venv ────────────────────────────────────────────────────────
header "Step 3: Python e2e virtualenv (.venv-e2e)"

VENV="${ROOT}/.venv-e2e"

if [ -d "${VENV}" ] && "${VENV}/bin/python" -c "import pytest" 2>/dev/null; then
  pass ".venv-e2e already exists with pytest"
else
  echo "  Creating .venv-e2e..."
  python3 -m venv "${VENV}"

  echo "  Installing e2e dependencies (pytest + DB drivers + requests)..."
  "${VENV}/bin/pip" install --quiet --upgrade pip

  # We only need the test runner + DB access + HTTP client.
  # The src/ package itself runs inside Docker, not in this venv.
  "${VENV}/bin/pip" install --quiet \
    pytest \
    pytest-asyncio \
    requests \
    sqlalchemy \
    psycopg2-binary \
    python-dateutil

  pass ".venv-e2e created at ${VENV}"
fi

# ── 4. Playwright browsers ────────────────────────────────────────────────────
header "Step 4: Playwright browsers"

WEB_DIR="${ROOT}/web"
if [ ! -d "${WEB_DIR}/node_modules" ]; then
  echo "  Installing web npm dependencies..."
  cd "${WEB_DIR}" && npm ci --silent && cd "${ROOT}"
fi

echo "  Installing Playwright chromium + system dependencies..."
cd "${WEB_DIR}"
npx playwright install chromium --with-deps
pass "Playwright chromium installed"
cd "${ROOT}"

# ── 5. Manual checklist ───────────────────────────────────────────────────────
header "Manual steps required"

echo ""
echo "  Complete these before running scripts/run-tests-vps.sh:"
echo ""

# Check gh auth
if gh auth status > /dev/null 2>&1; then
  pass "gh CLI is authenticated"
else
  echo -e "  ${RED}[REQUIRED]${NC} Authenticate gh CLI:"
  echo "    Option A — interactive:  gh auth login"
  echo "    Option B — PAT (no browser):"
  echo "      export GH_TOKEN=<your-pat-with-repo+read:org-scopes>"
  echo "    The PAT needs: repo, read:org (to create PRs on alexeykopachev/docugardener-test)"
fi

echo ""
echo -e "  ${YELLOW}[VERIFY]${NC} Confirm these env vars are in /opt/docugardener/.env:"
echo "    POSTGRES_PASSWORD=<value>"
echo "    E2E_TENANT_ID=cmmjpxq3x0005bul35iu3viuv   (production tenant)"
echo "    E2E_REPO_ID=cmn68ihbe000bcm4yd55l2um7      (production repo)"
echo ""
echo -e "  ${YELLOW}[OPTIONAL]${NC} Override API/Web base URLs if using a staging domain:"
echo "    E2E_API_BASE=https://docugardener.dev       (default)"
echo "    E2E_WEB_BASE=https://docugardener.dev       (default)"
echo "    PLAYWRIGHT_BASE_URL=https://docugardener.dev (default)"
echo ""
echo -e "  ${YELLOW}[NOTE]${NC} The 'playwright' suite seeds test users into the live DB."
echo "         Safe to run — fixtures clean up after themselves."
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo -e "${GREEN}${BOLD}Setup complete.${NC}"
echo ""
echo "  Run tests with:"
echo "    bash scripts/run-tests-vps.sh           # all suites"
echo "    bash scripts/run-tests-vps.sh python    # Python only"
echo "    bash scripts/run-tests-vps.sh e2e       # E2E only"
echo "    make test-vps                           # same as all"

#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# =============================================================================
# DocuGardener — Production Image Hardening Verification
# =============================================================================
# Asserts the invariants that keep the Python production image free of
# build-time attack surface. Written for SEC-TRIVY-03 (commit 53a010a), which
# removed pip from the production stage after Trivy flagged pip's *vendored*
# msgpack and setuptools:
#
#   msgpack    1.1.2   GHSA-6v7p-g79w-8964  high
#   setuptools 70.3.0  CVE-2025-47273       high
#   setuptools 70.3.0  CVE-2026-59890       medium
#
# pip vendors its own dependency tree (src/pip/_vendor/vendor.txt), so any pip
# present in a scanned image contributes CVEs that no requirements pin
# explains. Upgrading pip does not help — 26.2 still pins both. The fix is to
# not ship pip at all.
#
# Run this after ANY change to docker/Dockerfile or a base-image bump.
#
# Usage:
#   bash scripts/verification/verify-image-hardening.sh                    # isolated (fast, ~1 min)
#   bash scripts/verification/verify-image-hardening.sh --image TAG        # assert the PROD image
#   bash scripts/verification/verify-image-hardening.sh --test-image TAG   # assert the TEST image
#   bash scripts/verification/verify-image-hardening.sh --compose-only     # guards only, no daemon
#   bash scripts/verification/verify-image-hardening.sh --image TAG --trivy
#
#   --image TAG       Assert the production invariants against an already-built
#                     image instead of the isolated fixture. Build it first:
#                       docker build -f docker/Dockerfile --target production \
#                         -t docugardener:verify .
#   --test-image TAG  Assert the mirror-image invariants for the `test` stage:
#                     pytest and pip present, src.main importable, mounted tests
#                     collectable. Build with --target test.
#   --compose-only    Run only the compose guards (every docker/Dockerfile
#                     service pins a target; test-runner is profile-gated).
#                     Pure text checks — no Docker daemon required.
#   --trivy           Also run a Trivy library scan (requires network; pulls
#                     aquasec/trivy). Fails on MEDIUM+ findings.
#
# The compose guards run in every mode. An unpinned service is a diff-time
# mistake, and catching it before an image is ever built is the whole point.
#
# Exit 0 = all invariants hold. Non-zero = a regression; read the FAIL line.
#
# Note: the Colima host has no buildx, so this deliberately avoids BuildKit
# flags such as --progress=plain, which the legacy builder rejects.
# =============================================================================

set -euo pipefail

BASE_IMAGE="python:3.13-slim"
MODE="isolated"
TARGET_IMAGE=""
RUN_TRIVY=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --image)
            MODE="image"
            TARGET_IMAGE="${2:-}"
            [[ -z "$TARGET_IMAGE" ]] && { echo "ERROR: --image needs a tag"; exit 2; }
            shift 2
            ;;
        --test-image)
            MODE="test-image"
            TARGET_IMAGE="${2:-}"
            [[ -z "$TARGET_IMAGE" ]] && { echo "ERROR: --test-image needs a tag"; exit 2; }
            shift 2
            ;;
        --compose-only) MODE="compose-only"; shift ;;
        --trivy) RUN_TRIVY=1; shift ;;
        -h|--help) sed -n '3,46p' "$0"; exit 0 ;;
        *) echo "ERROR: unknown argument '$1' (try --help)"; exit 2 ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# -----------------------------------------------------------------------------
# Compose-level guards. No Docker daemon needed — pure text checks, so they run
# anywhere (including the VPS, which has no .venv and no yaml module).
#
# These exist because Docker's default build target is the LAST stage in the
# Dockerfile, and the last stage is now `test`. If a service ever loses its
# explicit target, it silently starts shipping pip + pytest to production.
# -----------------------------------------------------------------------------
check_compose() {
    local rc=0 f n_df n_tgt
    echo "--- compose guards ---"
    for f in "$REPO_ROOT/docker/docker-compose.yml" "$REPO_ROOT/docker/docker-compose.prod.yml"; do
        [[ -f "$f" ]] || { echo "FAIL: missing $f"; rc=1; continue; }
        local name; name="$(basename "$f")"

        # Every service building docker/Dockerfile must declare a target within
        # the 3 lines that follow (allows one interleaved comment line).
        n_df=$(grep -c "^      dockerfile: docker/Dockerfile$" "$f" || true)
        n_tgt=$(grep -A3 "^      dockerfile: docker/Dockerfile$" "$f" | grep -c "^      target: " || true)
        if [[ "$n_df" -eq 0 ]]; then
            echo "FAIL: $name — no docker/Dockerfile services found (did the file move?)"; rc=1
        elif [[ "$n_df" -ne "$n_tgt" ]]; then
            echo "FAIL: $name — $n_df Dockerfile service(s) but only $n_tgt declare a target"
            echo "      an unpinned service defaults to the LAST stage (test) and ships pytest"
            rc=1
        else
            echo "OK: $name — all $n_df docker/Dockerfile service(s) pin a build target"
        fi

        # Only test-runner may target the test stage.
        local n_test; n_test=$(grep -c "^      target: test$" "$f" || true)
        if [[ "$n_test" -ne 1 ]]; then
            echo "FAIL: $name — expected exactly 1 service targeting the test stage, found $n_test"; rc=1
        else
            echo "OK: $name — exactly one service targets the test stage"
        fi

        # test-runner must be profile-gated, or `docker compose up` starts it.
        local block; block="$(sed -n '/^  test-runner:/,/^  [a-z]/p' "$f")"
        if ! grep -q 'profiles:.*test' <<<"$block"; then
            echo "FAIL: $name — test-runner is not profile-gated; 'up' would start it in prod"; rc=1
        elif ! grep -q "^      target: test$" <<<"$block"; then
            echo "FAIL: $name — test-runner does not build the test stage"; rc=1
        else
            echo "OK: $name — test-runner is profile-gated and builds the test stage"
        fi
    done
    return $rc
}

if [[ "$MODE" == "compose-only" ]]; then
    check_compose || exit 1
    echo "=== COMPOSE GUARDS HOLD ==="
    exit 0
fi

# Colima is the usual local Docker host; respect an existing DOCKER_HOST.
if [[ -z "${DOCKER_HOST:-}" && -S "$HOME/.colima/default/docker.sock" ]]; then
    export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
fi

if ! docker info >/dev/null 2>&1; then
    echo "ERROR: no reachable Docker daemon. Start one first (e.g. 'colima start')."
    exit 2
fi

# -----------------------------------------------------------------------------
# The invariants. Runs inside the image under test; any FAIL exits non-zero.
# -----------------------------------------------------------------------------
read -r -d '' ASSERTIONS <<'ASSERT' || true
fail() { echo "FAIL: $1"; exit 1; }

command -v pip >/dev/null 2>&1 && fail "pip is on PATH — it must not ship in production"
echo "OK: pip not on PATH"

python -c "import pip" >/dev/null 2>&1 && fail "pip is importable — removal missed a copy"
echo "OK: pip not importable"

find / -name "pip" -maxdepth 7 -type d 2>/dev/null | grep -q . && fail "a pip/ directory remains"
echo "OK: no pip directories"

# The actual point: pip's vendored tree is what Trivy reports.
find / -path "*/pip/_vendor/*" -name "vendor.txt" 2>/dev/null | grep -q . \
    && fail "pip/_vendor present — vendored msgpack/setuptools still shipping"
echo "OK: no pip/_vendor (vendored msgpack + setuptools gone)"

# Catches the compose default-target footgun: docker/Dockerfile's LAST stage is
# `test`, so a service that loses its explicit `target: production` would build
# the test stage and ship pytest to prod. This assertion is how that surfaces.
python -c "import pytest" >/dev/null 2>&1 \
    && fail "pytest is in the production image — a service is building the test stage"
echo "OK: no pytest (production is not accidentally built from the test stage)"

python -c "print('')" >/dev/null 2>&1 || fail "python interpreter is broken"
echo "OK: python runs"

# Mirrors the Dockerfile HEALTHCHECK; if this breaks, the container never
# reports healthy and the deploy silently rolls nothing out.
python -c "import httpx" >/dev/null 2>&1 || fail "httpx missing — HEALTHCHECK would fail"
echo "OK: httpx imports (healthcheck dependency)"

# Must SURVIVE: torch declares setuptools as a runtime requirement. Only pip
# is meant to be removed. A reported 70.3.0 is pip's vendored copy; a real
# install resolves to 80.x/83.x.
# POSIX test, not [[ ]]: these assertions run under the image's /bin/sh, which
# is dash on Debian slim. dash treats [[ as a missing command and carries on,
# which would silently skip this check.
SETUPTOOLS_VER="$(python -c "import setuptools; print(setuptools.__version__)" 2>/dev/null || true)"
[ -z "$SETUPTOOLS_VER" ] && fail "real setuptools was removed — torch needs it"
case "$SETUPTOOLS_VER" in
    70.3.0) fail "setuptools is 70.3.0 — that is pip's vendored copy, not a real install" ;;
esac
echo "OK: real setuptools present ($SETUPTOOLS_VER)"

# Informational only: setuptools >= 81 stopped shipping pkg_resources. That is
# unrelated to pip removal — do not misread its absence as damage from it.
if python -c "import pkg_resources" >/dev/null 2>&1; then
    echo "note: pkg_resources present"
else
    echo "note: pkg_resources absent (setuptools>=81 drops it; unrelated to pip removal)"
fi
ASSERT

# -----------------------------------------------------------------------------
# Invariants for the TEST image — the mirror image of the production set. The
# test stage is what post-deploy suites run in, so pytest must be baked in and
# the app must be importable. If these fail, deploy.yml goes red again.
# -----------------------------------------------------------------------------
read -r -d '' TEST_ASSERTIONS <<'ASSERT' || true
fail() { echo "FAIL: $1"; exit 1; }

python -c "import pytest" >/dev/null 2>&1 \
    || fail "pytest missing from the test image — post-deploy suites cannot run"
echo "OK: pytest present ($(python -c 'import pytest; print(pytest.__version__)'))"

python -c "import pytest_asyncio" >/dev/null 2>&1 \
    || fail "pytest-asyncio missing — async tests will error at collection"
echo "OK: pytest-asyncio present"

# pip is expected HERE (unlike production) — the stage derives from `builder`.
command -v pip >/dev/null 2>&1 \
    || fail "pip missing from the test image — the test stage should derive from builder"
echo "OK: pip present (expected in the test stage only)"

python -c "import src.main" >/dev/null 2>&1 \
    || fail "cannot import src.main — PYTHONPATH or the src/ COPY is wrong"
echo "OK: src.main imports"

# Proves the mounted-tests contract still works end to end.
if [ -d /app/tests ]; then
    python -m pytest /app/tests/unit --collect-only -q >/dev/null 2>&1 \
        || fail "pytest cannot collect mounted tests"
    echo "OK: pytest collects mounted tests"
else
    echo "note: /app/tests not mounted — collection check skipped"
fi
ASSERT

# -----------------------------------------------------------------------------
if [[ "$MODE" == "test-image" ]]; then
    echo "=== asserting TEST image: $TARGET_IMAGE ==="
    docker image inspect "$TARGET_IMAGE" >/dev/null 2>&1 \
        || { echo "ERROR: image '$TARGET_IMAGE' not found — build it first"; exit 2; }
    echo "--- test-image invariants ---"
    # Mirrors the mounts run-tests-vps.sh uses for collection. scripts/ matters:
    # tests/unit/test_golden_scorer.py imports the `scripts` package, so a
    # tests-only mount fails collection and misreports a healthy image as broken.
    docker run --rm --entrypoint sh \
        -v "$REPO_ROOT/tests:/app/tests:ro" \
        -v "$REPO_ROOT/pyproject.toml:/app/pyproject.toml:ro" \
        -v "$REPO_ROOT/scripts:/app/scripts:ro" \
        "$TARGET_IMAGE" -c "$TEST_ASSERTIONS"
    check_compose || exit 1
    echo "=== ALL TEST-IMAGE INVARIANTS HOLD ==="
    exit 0
fi

# -----------------------------------------------------------------------------
if [[ "$MODE" == "isolated" ]]; then
    echo "=== isolated fixture on $BASE_IMAGE (no app deps, fast) ==="
    WORKDIR="$(mktemp -d)"
    trap 'rm -rf "$WORKDIR"' EXIT

    # Mirrors docker/Dockerfile's two-stage shape without the heavy ML deps, so
    # only the removal block itself is under test. Keep the RUN below in sync
    # with the production stage of docker/Dockerfile.
    cat > "$WORKDIR/Dockerfile" <<EOF
FROM $BASE_IMAGE AS builder
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:\$PATH"
RUN pip install --no-cache-dir --upgrade pip \\
    && pip install --no-cache-dir httpx "setuptools>=80"

FROM $BASE_IMAGE AS production
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:\$PATH"

RUN rm -rf /usr/local/lib/python3.*/site-packages/pip \\
           /usr/local/lib/python3.*/site-packages/pip-*.dist-info \\
           /usr/local/lib/python3.*/ensurepip \\
           /opt/venv/lib/python3.*/site-packages/pip \\
           /opt/venv/lib/python3.*/site-packages/pip-*.dist-info \\
    && rm -f /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.* \\
             /opt/venv/bin/pip /opt/venv/bin/pip3 /opt/venv/bin/pip3.* \\
    && ! command -v pip
EOF

    TARGET_IMAGE="dg-verify-hardening:$$"
    if ! docker build -q -f "$WORKDIR/Dockerfile" -t "$TARGET_IMAGE" "$WORKDIR" >/dev/null; then
        echo "FAIL: isolated fixture did not build — the removal block is broken"
        exit 1
    fi
    trap 'rm -rf "$WORKDIR"; docker rmi -f "$TARGET_IMAGE" >/dev/null 2>&1 || true' EXIT
else
    echo "=== asserting against image: $TARGET_IMAGE ==="
    docker image inspect "$TARGET_IMAGE" >/dev/null 2>&1 \
        || { echo "ERROR: image '$TARGET_IMAGE' not found — build it first"; exit 2; }
fi

echo "--- invariants ---"
docker run --rm --entrypoint sh "$TARGET_IMAGE" -c "$ASSERTIONS"

# Runs on every invocation: the in-image pytest assertion only fires if a bad
# image was already built, whereas this catches an unpinned service in the diff.
check_compose || exit 1

# -----------------------------------------------------------------------------
if [[ "$RUN_TRIVY" -eq 1 ]]; then
    echo "--- trivy library scan (MEDIUM+) ---"
    if docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
        aquasec/trivy:latest image --scanners vuln --pkg-types library \
        --severity MEDIUM,HIGH,CRITICAL --exit-code 1 --quiet "$TARGET_IMAGE"; then
        echo "OK: trivy reports zero library vulnerabilities"
    else
        echo "FAIL: trivy found library vulnerabilities (see table above)"
        exit 1
    fi
fi

echo "=== ALL INVARIANTS HOLD ==="

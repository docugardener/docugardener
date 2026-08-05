# syntax=docker/dockerfile:1

# =============================================================================
# DocuGardener Docker Image
# Multi-stage build for minimal production image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build dependencies
# -----------------------------------------------------------------------------
FROM python:3.13-slim as builder

WORKDIR /build

# Install build dependencies (including SAML C libs for python3-saml)
# apt-get upgrade pulls Debian security patches for base-image OS packages
# (e.g. libunbound8, linux-libc-dev) that ship stale in python:3.13-slim.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    libxmlsec1-dev \
    libxml2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY docker/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip

# CPU-only torch, installed BEFORE requirements.txt — order matters.
#
# requirements.txt asks for sentence-transformers, which pulls torch. On the
# default PyPI index torch declares its whole CUDA stack gated only on the OS:
#     nvidia-cudnn-cu13==9.20.0.48;   platform_system == "Linux"
#     nvidia-cusparselt-cu13==0.8.1;  platform_system == "Linux"
#     nvidia-nccl-cu13==2.29.7;       platform_system == "Linux"
#     nvidia-nvshmem-cu13==3.4.5;     platform_system == "Linux"
#     triton==3.7.1;                  platform_system == "Linux" and ...
# There is no GPU check, so a CPU-only VPS gets the lot: measured inside the
# deployed image, /opt/venv carried 2.7GB of nvidia/ plus 691MB of triton/ in a
# 5.4GB venv. None of it executes — src/analysis/embeddings.py:40 constructs
# SentenceTransformer(..., device="cpu") and the host has no NVIDIA hardware.
# That dead weight is what left no disk headroom for rebuilds and broke the
# 2026-08-05 deploy with "no space left on device".
#
# Installing the CPU build first means pip finds torch already satisfied when
# it resolves sentence-transformers, so the CUDA wheels are never fetched.
# Pinned deliberately: torch has been unpinned since the initial commit, so the
# image has been growing with upstream. Bump this on purpose, not by accident.
RUN pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        "torch==2.13.0+cpu"

RUN pip install --no-cache-dir -r requirements.txt

# -----------------------------------------------------------------------------
# Stage 2: Production image
# -----------------------------------------------------------------------------
FROM python:3.13-slim as production

# Security: Run as non-root user
RUN useradd --create-home --shell /bin/bash docugardener

WORKDIR /app

# Install runtime dependencies (SAML C libs for python3-saml).
# Use RUNTIME shared libs, not -dev headers: the compiled xmlsec/lxml C
# extensions are already baked into /opt/venv by the builder stage, so the
# production image only needs the .so runtime plus the openssl crypto engine
# (libxmlsec1t64-openssl, required for SAML sign/verify). Dropping the -dev
# packages also removes libc6-dev -> linux-libc-dev (kernel headers), which
# Trivy flags with dozens of non-exploitable kernel CVEs — no kernel runs in
# this container, the headers are pure build-time artifacts. Verified: onelogin
# add_sign produces a valid signed SAML Response against this exact lib set.
#
# APT_REFRESH busts this layer's build cache so `apt-get upgrade` re-runs and
# pulls freshly-published Debian security patches. Without it, an unchanged
# Dockerfile line keeps a stale cached apt layer (Buildx GHA cache / VPS local
# cache), so newly-disclosed CVE fixes never reach the image. The scan workflow
# passes github.run_id (fresh every scan); deploy passes the commit SHA.
ARG APT_REFRESH=0
RUN echo "apt-refresh token: ${APT_REFRESH}" \
    && apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    git \
    libxmlsec1t64 \
    libxmlsec1t64-openssl \
    libxml2 \
    libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH="/app"

# Remove pip from the production image (SEC-TRIVY-03).
#
# Nothing installs packages at runtime: CMD is uvicorn, the healthcheck is a
# bare `python -c "import httpx"`, there is no entrypoint script, and no module
# under src/ imports pip, setuptools or pkg_resources. pip is a build-time
# artifact here, exactly like the -dev headers dropped in 19e11c2.
#
# This replaces the previous `pip install --upgrade "pip>=26.1"` line. That
# line patched CVE-2026-3219 / CVE-2026-6357, but pip *vendors* its own
# dependencies, so upgrading pip dragged in three fresh Trivy findings:
#   msgpack   1.1.2  GHSA-6v7p-g79w-8964  (high)
#   setuptools 70.3.0 CVE-2025-47273      (high)
#   setuptools 70.3.0 CVE-2026-59890      (medium)
# Upgrading further does not help — pip 26.2 (latest release) still pins
# msgpack==1.1.2 and setuptools==70.3.0 in src/pip/_vendor/vendor.txt. Deleting
# pip removes the vendored copies and the original pip CVEs in one move, and
# stops every future pip-vendored advisory from landing on this image.
#
# Only pip is removed; the venv's REAL setuptools is left untouched (torch
# declares it as a runtime requirement). The flagged 70.3.0 is provably the
# vendored copy — a real install resolves to 80.x. Verified that no installed
# dependency imports pkg_resources, so nothing here relies on the shim that
# setuptools>=81 stopped shipping.
#
# ensurepip is removed too; it bundles a pip wheel that Trivy also inspects,
# and no venv is ever created inside this container.
RUN rm -rf /usr/local/lib/python3.*/site-packages/pip \
           /usr/local/lib/python3.*/site-packages/pip-*.dist-info \
           /usr/local/lib/python3.*/ensurepip \
           /opt/venv/lib/python3.*/site-packages/pip \
           /opt/venv/lib/python3.*/site-packages/pip-*.dist-info \
    && rm -f /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.* \
             /opt/venv/bin/pip /opt/venv/bin/pip3 /opt/venv/bin/pip3.* \
    && ! command -v pip

# Copy application code
COPY --chown=docugardener:docugardener src/ ./src/

# Security: Create tmpfs mount point
# Note: Actual tmpfs mount happens at container runtime
RUN mkdir -p /tmp/docugardener && \
    chown docugardener:docugardener /tmp/docugardener

# Switch to non-root user
USER docugardener

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health').raise_for_status()"

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]

# -----------------------------------------------------------------------------
# Stage 3: Test runner  — NEVER DEPLOYED
# -----------------------------------------------------------------------------
# Exists because the production stage has no pip (SEC-TRIVY-03). Post-deploy
# tests used to `pip install pytest ...` inside the production container at
# deploy time; removing pip broke that and turned deploy.yml red. Rather than
# putting pip back, the test tooling gets its own stage.
#
# ⚠️ THIS STAGE MUST STAY LAST, AND EVERY COMPOSE SERVICE MUST PIN
#    `target: production`.
#
# Docker's default build target is the LAST stage in this file. All 8 services
# that build this Dockerfile (docugardener, worker, worker-2, scheduler — in
# both docker-compose.yml and docker-compose.prod.yml) therefore pin
# `target: production` explicitly. Without that pin, this stage would ship pip
# and pytest to production and silently undo the hardening above.
#
# Why last rather than wedged between `builder` and `production`: placing it
# earlier would make the pin unnecessary under BuildKit, but the legacy builder
# builds every stage up to the target — which would run this pip install during
# production deploys, putting a PyPI network call back into the deploy path.
# Last + explicit target is correct under both builders.
#
# Guarded by scripts/verification/verify-image-hardening.sh, which fails if the
# production image contains pytest or pip, or if any service omits a target.
# Test deps are built with the builder's pip into a relocatable directory, so
# the test image itself needs no pip. Pinned — see requirements-test.txt.
FROM builder AS testdeps
COPY docker/requirements-test.txt ./
RUN pip install --no-cache-dir --target /testdeps -r requirements-test.txt

# The test image derives from `production`, NOT from `builder`.
#
# Deriving from builder duplicates the entire venv: measured on the VPS, the
# resulting image was 9.55GB with only 132MB shared — 9.42GB of unique layers
# re-copying torch and friends onto a disk that was already the constraint.
# Deriving from production instead means every production layer is shared and
# this stage adds only the ~50MB of pytest below.
FROM production AS test

# Root: pytest needs a writable cache dir, and production switches to the
# unprivileged docugardener user.
USER root

COPY --from=testdeps /testdeps /opt/testdeps
# pytest is importable via PYTHONPATH rather than installed into the venv, so
# the production venv stays byte-identical to what actually ships.
ENV PYTHONPATH="/app:/opt/testdeps"
ENV PATH="/opt/testdeps/bin:$PATH"

# tests/ is NOT copied: run-tests-vps.sh mounts it from the host, so editing a
# test never requires rebuilding this image. src/ is already present from the
# production stage. No CMD: the runner always supplies one.


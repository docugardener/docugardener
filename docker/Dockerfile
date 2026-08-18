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

# Pin setuptools from PyPI (SEC-TRIVY-04).
#
# The torch line above uses --index-url, which REPLACES PyPI for that whole
# resolution rather than adding to it. torch declares setuptools as a runtime
# requirement, so pip resolved it from download.pytorch.org/whl/cpu — a mirror
# whose newest setuptools is 78.1.0 (verified 2026-08-18: it carries only
# 70.0.0, 70.2.0, 78.1.0). The deployed image confirmed it: setuptools 78.1.0,
# while a PyPI resolution gives 80.9.0+.
#
# That one stale package produced four Trivy findings:
#   setuptools 78.1.0             CVE-2025-47273  (high)    fixed 78.1.1
#   setuptools 78.1.0             CVE-2026-59890  (medium)  fixed 83.0.0
#   _vendor/wheel 0.45.1          CVE-2026-24049  (high)    fixed 0.46.2
#   _vendor/jaraco.context 5.3.0  CVE-2026-23949  (high)    fixed 6.1.0
# It never self-heals — the requirements.txt install above runs against PyPI
# but finds setuptools already satisfied and leaves the mirror copy in place.
# 84.0.0 is the first version that clears all four: it vendors wheel 0.46.3 and
# jaraco_context 6.1.0.
#
# Placed AFTER requirements.txt on purpose. python3-saml builds xmlsec from an
# sdist against libxmlsec1-dev, so the install path itself runs setuptools;
# upgrading first would swap the toolchain under a known-good build for no
# runtime benefit. Everything Trivy scans and everything prod executes comes
# from the final venv, so patching it here is equivalent and strictly safer.
#
# setuptools >= 81 no longer ships pkg_resources. Verified against the LIVE
# production image before this change: no module in /opt/venv imports
# pkg_resources at all, and src.main, src.analysis.embeddings, torch,
# sentence_transformers, transformers, numpy, httpx, sqlalchemy, redis and rq
# all import cleanly with pkg_resources blocked. The remaining setuptools
# importers (torch/utils/cpp_extension.py, torch/_dynamo/backends/registry.py,
# sympy/utilities/autowrap.py, cffi/setuptools_ext.py) are JIT/build paths that
# CPU inference never reaches. Bump deliberately, like torch.
RUN pip install --no-cache-dir "setuptools==84.0.0" \
    && python -c "from importlib.metadata import version; v = version('setuptools'); assert v == '84.0.0', v; print('setuptools', v)"

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
# declares it as a runtime requirement) and is pinned to 84.0.0 by the builder
# stage — see SEC-TRIVY-04 above. The 70.3.0 flagged here was the pip-vendored
# copy, which this rm deletes. Note the earlier claim that "a real install
# resolves to 80.x" was wrong for THIS image: the --index-url on the torch
# install pinned the real setuptools to the PyTorch mirror's 78.1.0, which is
# what SEC-TRIVY-04 fixes. Verified that no installed dependency imports
# pkg_resources, so nothing here relies on the shim setuptools>=81 dropped.
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

# Make /opt/testdeps importable via a .pth file rather than PYTHONPATH.
#
# PYTHONPATH is NOT reliable here: run-tests-vps.sh passes `-e PYTHONPATH=/app`
# on both the python and e2e suites, which REPLACES any PYTHONPATH baked into
# the image — dropping /opt/testdeps and producing
#     /opt/venv/bin/python: No module named pytest
# (deploy run 31013764983). A .pth file in site-packages is processed by the
# interpreter at startup and cannot be clobbered by the caller's environment.
#
# Copying into a .pth instead of into site-packages itself is deliberate: the
# test deps overlap the venv (requests, python-dateutil already present as
# transitive deps) and overwriting them could silently change the versions the
# application code runs against.
RUN echo "/opt/testdeps" > "$(python -c 'import site; print(site.getsitepackages()[0])')/_testdeps.pth" \
    && python -c "import pytest, pytest_asyncio; print('pytest', pytest.__version__, 'importable without PYTHONPATH')"

ENV PATH="/opt/testdeps/bin:$PATH"

# tests/ is NOT copied: run-tests-vps.sh mounts it from the host, so editing a
# test never requires rebuilding this image. src/ is already present from the
# production stage. No CMD: the runner always supplies one.


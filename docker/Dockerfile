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
# Install Python dependencies
COPY docker/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# -----------------------------------------------------------------------------
# Stage 2: Production image
# -----------------------------------------------------------------------------
FROM python:3.13-slim as production

# Security: Run as non-root user
RUN useradd --create-home --shell /bin/bash docugardener

WORKDIR /app

# Install runtime dependencies (including SAML C libs for python3-saml)
# apt-get upgrade pulls Debian security patches (libunbound8, linux-libc-dev, etc.).
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    git \
    libxmlsec1-dev \
    libxml2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Patch the base-image system pip (CVE-2026-3219, CVE-2026-6357).
# Runs before the PATH switch below, so `pip` resolves to /usr/local/bin/pip
# (system pip), not the venv's already-patched pip.
RUN pip install --no-cache-dir --upgrade "pip>=26.1"

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH="/app"

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

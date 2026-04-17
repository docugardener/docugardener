# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Diagnostics endpoint for operators and support.

Returns live connectivity checks for all backend dependencies
(Redis, Weaviate, PostgreSQL) plus runtime info (Python version,
process uptime, RQ queue depths). Useful for post-deploy verification
and on-call triage without requiring SSH access to the host.

Not tenant-scoped — intended for operator use only.
Exposed at:
  GET /diagnostics        — full dependency health + runtime info
  GET /diagnostics/db     — PostgreSQL-only connectivity check
"""

import socket
import sys
import time
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter
from redis.exceptions import RedisError

from src.core.config import settings
from src.core.logging import get_logger
from src.worker.queue import QUEUE_DEFAULT, QUEUE_HIGH, get_redis_connection

logger = get_logger(__name__)
router = APIRouter()

# Module-level start time so uptime is accurate across requests.
_PROCESS_START: float = time.monotonic()


async def _check_redis() -> dict[str, Any]:
    """Ping Redis and return latency in ms."""
    try:
        conn = get_redis_connection()
        t0 = time.monotonic()
        conn.ping()
        latency_ms = round((time.monotonic() - t0) * 1000, 2)

        # RQ queue depths (listLength of the backing Redis list).
        queue_depths: dict[str, int] = {}
        for q_name in (QUEUE_HIGH, QUEUE_DEFAULT):
            key = f"rq:queue:{q_name}"
            queue_depths[q_name] = conn.llen(key)

        return {"status": "ok", "latency_ms": latency_ms, "queues": queue_depths}
    except RedisError as exc:
        logger.warning("diagnostics: Redis check failed", error=str(exc))
        return {"status": "error", "error": str(exc)}


async def _check_weaviate() -> dict[str, Any]:
    """Hit Weaviate's /.well-known/ready and return latency in ms."""
    url = f"{settings.weaviate_url}/v1/.well-known/ready"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            t0 = time.monotonic()
            resp = await client.get(url)
            latency_ms = round((time.monotonic() - t0) * 1000, 2)
            if resp.status_code == 200:
                return {"status": "ok", "latency_ms": latency_ms}
            return {
                "status": "degraded",
                "http_status": resp.status_code,
                "latency_ms": latency_ms,
            }
    except Exception as exc:
        logger.warning("diagnostics: Weaviate check failed", error=str(exc))
        return {"status": "error", "error": str(exc)}


async def _check_postgres() -> dict[str, Any]:
    """
    Issue a cheap SELECT 1 against PostgreSQL and return latency in ms.

    Uses the SQLAlchemy engine configured for the application so the
    check exercises the same connection pool used by live traffic.
    """
    try:
        from sqlalchemy import text

        from src.pipeline.job_manager import _get_engine

        engine = _get_engine()
        t0 = time.monotonic()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        return {"status": "ok", "latency_ms": latency_ms}
    except Exception as exc:
        logger.warning("diagnostics: PostgreSQL check failed", error=str(exc))
        return {"status": "error", "error": str(exc)}


@router.get("/diagnostics", response_model=dict[str, Any], tags=["Diagnostics"])
async def diagnostics() -> dict[str, Any]:
    """
    Operator diagnostics — live dependency health + runtime info.

    Checks Redis, Weaviate, and PostgreSQL connectivity; reports RQ
    queue depths, Python version, and process uptime. Intended for
    post-deploy verification and on-call triage.

    Returns:
        JSON object with keys: python_version, uptime_seconds,
        hostname, redis, weaviate, postgres, deployment_mode, timestamp.
    """
    redis_result, weaviate_result, postgres_result = (
        await _check_redis(),
        await _check_weaviate(),
        await _check_postgres(),
    )

    uptime_seconds = round(time.monotonic() - _PROCESS_START, 1)

    return {
        "python_version": sys.version,
        "uptime_seconds": uptime_seconds,
        "hostname": socket.gethostname(),
        "deployment_mode": settings.deployment_mode,
        "redis": redis_result,
        "weaviate": weaviate_result,
        "postgres": postgres_result,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/diagnostics/db", response_model=dict[str, Any], tags=["Diagnostics"])
async def diagnostics_db() -> dict[str, Any]:
    """
    PostgreSQL-only connectivity check.

    Lightweight endpoint for load-balancer health checks or monitoring
    systems that need to verify database reachability independently of
    the full diagnostics payload.

    Returns:
        JSON object with keys: status, latency_ms (or error), timestamp.
    """
    result = await _check_postgres()
    return {**result, "timestamp": datetime.now(UTC).isoformat()}

# SPDX-License-Identifier: AGPL-3.0-or-later
"""SEC-COST-01 Layer 2 — per-tenant rate limit for the VS Code ``/check`` endpoint.

``/check`` is stateless (creates no Job records), so it bypasses both the GAP-01
monthly PR quota and the PH15-01 platform cap. This adds a lightweight Redis-backed
per-tenant limiter so no single API key can drain the shared platform LLM budget
through ``/check``. The Gemini spend cap remains the absolute spend backstop; this
just bounds per-tenant *rate* and gives a graceful 429 instead of a global stop.

Limits are tuned to interactive dev usage (pre-push checks run many times per
session) — NOT the PR-analysis monthly quota:
- burst guard: ``_BURST_PER_MIN`` requests/minute, all tiers
- daily cap by plan: FREE 100/day, PRO 500/day, TEAM unlimited

Fail-open: any Redis error returns ``(True, "")`` so transient infra never blocks a check.
"""

from __future__ import annotations

from datetime import UTC, datetime

import redis as _redis

from src.core.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)

# Per-tier daily caps for /check. -1 = unlimited.
_DAILY_CAP: dict[str, int] = {"FREE": 100, "PRO": 500, "TEAM": -1}
# Abuse/burst guard — all tiers.
_BURST_PER_MIN = 20

_client: _redis.Redis | None = None


def _redis_client() -> _redis.Redis:
    global _client
    if _client is None:
        # Short timeouts so a Redis outage fails open fast instead of hanging the request.
        _client = _redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
    return _client


def check_rate_limit(tenant_id: str, plan: str) -> tuple[bool, str]:
    """Per-tenant rate check for ``/check``.

    Returns ``(allowed, reason)`` — ``reason`` is a user-facing string when blocked.
    Fails open (allows) on any Redis error.
    """
    plan_u = (plan or "FREE").upper()
    daily_cap = _DAILY_CAP.get(plan_u, _DAILY_CAP["FREE"])
    try:
        r = _redis_client()
        now = datetime.now(UTC)

        # Burst guard — per minute, all tiers.
        min_key = f"check_rl:{tenant_id}:min:{now:%Y%m%d%H%M}"
        n_min = r.incr(min_key)
        if n_min == 1:
            r.expire(min_key, 120)
        if n_min > _BURST_PER_MIN:
            logger.warning("check rate limit: burst exceeded", tenant_id=tenant_id, per_min=n_min)
            return False, (
                f"Too many checks — limit is {_BURST_PER_MIN}/minute. Wait a moment and retry."
            )

        # Daily cap — per tier.
        if daily_cap != -1:
            day_key = f"check_rl:{tenant_id}:day:{now:%Y%m%d}"
            n_day = r.incr(day_key)
            if n_day == 1:
                r.expire(day_key, 90_000)  # ~25h
            if n_day > daily_cap:
                logger.warning(
                    "check rate limit: daily cap reached",
                    tenant_id=tenant_id,
                    plan=plan_u,
                    per_day=n_day,
                )
                return False, (
                    f"Daily check limit reached ({daily_cap}/day on the {plan_u.title()} plan). "
                    f"Resets tomorrow — or self-host for unlimited checks."
                )
        return True, ""
    except Exception as exc:  # fail-open — never block a check on infra trouble
        logger.warning("check rate limit: redis error, failing open", error=str(exc))
        return True, ""

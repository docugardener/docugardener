# SPDX-License-Identifier: AGPL-3.0-or-later
"""
PH15-01 — operator-wide platform LLM monthly cap.

Extracted into its own module so it can be unit-tested independently and
imported by ``src.api.webhooks`` without circular-import risk.

Public API
----------
check_platform_llm_cap(*, db, settings, llm_cfg) -> dict | None
stamp_platform_llm_flag(*, job, db, settings, llm_cfg) -> None
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa

logger = logging.getLogger(__name__)


def check_platform_llm_cap(
    *,
    db: Any,
    settings: Any,
    llm_cfg: dict,
) -> dict | None:
    """Check whether the operator-wide platform LLM monthly cap has been reached.

    Returns a ``{"status": "skipped", "reason": ...}`` dict if the cap is
    exhausted, or ``None`` if processing should continue.

    The cap applies only when the tenant is using the bundled Gemini key —
    i.e. ``llm_cfg`` has neither ``apiKey`` nor ``baseUrl``.
    Setting ``PLATFORM_LLM_MONTHLY_CAP_USD=0`` disables enforcement entirely.

    Accounting is in USD (matching ``estimated_cost_usd`` from the LLM provider) —
    no currency conversion, so there is no FX drift in the enforcement path.

    Parameters
    ----------
    db:
        A SQLAlchemy session (or mock with compatible ``.query()`` interface).
        Caller owns the session lifecycle.
    settings:
        Application settings object; must expose
        ``platform_llm_monthly_cap_usd: float``.
    llm_cfg:
        Tenant-level LLM configuration dict.  Keys: ``apiKey``, ``baseUrl``.
    """
    _using_platform_llm: bool = not llm_cfg.get("apiKey") and not llm_cfg.get("baseUrl")
    _cap_usd: float = float(getattr(settings, "platform_llm_monthly_cap_usd", 10.0))

    if not _using_platform_llm or _cap_usd <= 0:
        return None

    _month_start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Lazy import to avoid circular dependencies.
    # In unit tests, db is a MagicMock so _BudgetJob is used only as the
    # query() argument — its attributes are never accessed.
    try:
        from src.storage.sql_models import Job as _BJ  # noqa: N814
    except (ImportError, Exception):  # pragma: no cover
        logger.error(
            "Could not import Job from sql_models — cap check skipped",
            extra={"cap_usd": _cap_usd},
        )
        return None

    # Build filter conditions using text-level column references so the
    # check works even before the Alembic migration has been applied to the
    # live DB (new column is nullable, so existing rows are NULL ≠ True).
    _platform_jobs: list[Any] = (
        db.query(_BJ)
        .filter(
            sa.text('"usedPlatformLlm" IS TRUE'),
            _BJ.status == "COMPLETED",
            _BJ.createdAt >= _month_start,
        )
        .all()
    )

    _usd_spend: float = sum(
        (j.result or {}).get("llm_usage", {}).get("estimated_cost_usd", 0.0)
        for j in _platform_jobs
        if isinstance(j.result, dict)
    )
    if _usd_spend >= _cap_usd:
        logger.warning(
            "Platform LLM operator cap reached — skipping analysis",
            extra={
                "spend_usd": round(_usd_spend, 4),
                "cap_usd": _cap_usd,
            },
        )
        return {
            "status": "skipped",
            "reason": (
                f"Platform LLM monthly budget exhausted "
                f"(${_usd_spend:.2f} / ${_cap_usd:.2f}). "
                f"Add your own LLM API key in Settings \u2192 AI Configuration to continue."
            ),
        }

    return None


def stamp_platform_llm_flag(
    *,
    job: Any,
    db: Any,
    settings: Any,
    llm_cfg: dict,
) -> None:
    """Stamp ``used_platform_llm`` on a BudgetJob record and commit.

    ``True``  — job consumed the bundled Gemini key (counts against operator cap).
    ``False`` — tenant supplied their own ``apiKey`` or ``baseUrl`` (BYOK).

    Parameters
    ----------
    job:
        A ``_BudgetJob`` ORM instance with a ``used_platform_llm`` attribute.
    db:
        The SQLAlchemy session that owns ``job``.
    settings:
        Application settings; must expose ``bundled_gemini_key: str``.
    llm_cfg:
        Tenant-level LLM configuration dict.
    """
    _using_platform_llm: bool = (
        bool(getattr(settings, "bundled_gemini_key", None))
        and not llm_cfg.get("apiKey")
        and not llm_cfg.get("baseUrl")
    )
    job.usedPlatformLlm = _using_platform_llm
    db.commit()

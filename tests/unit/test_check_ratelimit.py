# SPDX-License-Identifier: AGPL-3.0-or-later
"""SEC-COST-01 Layer 2 — unit tests for the /check per-tenant rate limiter.

No real Redis: a fake client returns controlled counter values per key.
"""

from __future__ import annotations

from unittest.mock import patch

from src.api import _check_ratelimit as rl


class _FakeRedis:
    """Returns `min_val` for :min: keys and `day_val` for :day: keys."""

    def __init__(self, min_val: int = 1, day_val: int = 1):
        self._min = min_val
        self._day = day_val

    def incr(self, key: str) -> int:
        return self._min if ":min:" in key else self._day

    def expire(self, key: str, ttl: int) -> bool:
        return True


def test_allows_under_limits():
    with patch.object(rl, "_redis_client", return_value=_FakeRedis(min_val=3, day_val=10)):
        allowed, reason = rl.check_rate_limit("t1", "FREE")
    assert allowed is True
    assert reason == ""


def test_blocks_on_burst():
    # 21 > _BURST_PER_MIN (20)
    with patch.object(rl, "_redis_client", return_value=_FakeRedis(min_val=21, day_val=1)):
        allowed, reason = rl.check_rate_limit("t1", "FREE")
    assert allowed is False
    assert "minute" in reason.lower()


def test_blocks_on_daily_cap_free():
    # under burst, over FREE daily cap (100)
    with patch.object(rl, "_redis_client", return_value=_FakeRedis(min_val=2, day_val=101)):
        allowed, reason = rl.check_rate_limit("t1", "FREE")
    assert allowed is False
    assert "daily" in reason.lower()


def test_pro_higher_daily_cap():
    # 101/day blocks FREE but is well under PRO's 500
    with patch.object(rl, "_redis_client", return_value=_FakeRedis(min_val=2, day_val=101)):
        allowed, _ = rl.check_rate_limit("t1", "PRO")
    assert allowed is True


def test_team_unlimited_daily():
    # TEAM has no daily cap (-1); only burst applies
    with patch.object(rl, "_redis_client", return_value=_FakeRedis(min_val=2, day_val=99999)):
        allowed, reason = rl.check_rate_limit("t1", "TEAM")
    assert allowed is True
    assert reason == ""


def test_fails_open_on_redis_error():
    with patch.object(rl, "_redis_client", side_effect=RuntimeError("redis down")):
        allowed, reason = rl.check_rate_limit("t1", "FREE")
    assert allowed is True
    assert reason == ""


def test_unknown_plan_treated_as_free():
    # day_val over FREE cap; unknown plan → FREE limits → blocked
    with patch.object(rl, "_redis_client", return_value=_FakeRedis(min_val=2, day_val=101)):
        allowed, _ = rl.check_rate_limit("t1", "")
    assert allowed is False

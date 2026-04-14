"""
GAP-04: Tests for graceful RQ worker shutdown configuration.

Verifies that docker/docker-compose.yml:
  A. Sets stop_grace_period on the worker service
  B. The grace period is at least 60 seconds
  C. The worker command uses the expected queue name
  D. restart policy is defined (not None / not always — on-failure or unless-stopped)
"""

import pathlib
import yaml
import re
import pytest


COMPOSE_PATH = pathlib.Path(__file__).parents[2] / "docker" / "docker-compose.yml"


@pytest.fixture(scope="module")
def compose() -> dict:
    """Parse and return the docker-compose.yml as a dict."""
    assert COMPOSE_PATH.exists(), f"docker-compose.yml not found at {COMPOSE_PATH}"
    with COMPOSE_PATH.open() as fh:
        return yaml.safe_load(fh)


@pytest.fixture(scope="module")
def worker_service(compose: dict) -> dict:
    """Return the worker service definition."""
    assert "worker" in compose.get("services", {}), "No 'worker' service in docker-compose.yml"
    return compose["services"]["worker"]


# ── A. stop_grace_period present ─────────────────────────────────────────────

def test_stop_grace_period_is_set(worker_service):
    """worker service must define stop_grace_period."""
    assert "stop_grace_period" in worker_service, (
        "GAP-04: worker service is missing stop_grace_period"
    )


# ── B. Grace period >= 60 seconds ─────────────────────────────────────────────

def _parse_duration_seconds(value: str | int) -> int:
    """Convert Docker duration string ('60s', '2m', '90s') to seconds."""
    if isinstance(value, int):
        return value
    value = str(value).strip()
    if value.endswith("s"):
        return int(value[:-1])
    if value.endswith("m"):
        return int(value[:-1]) * 60
    if value.endswith("h"):
        return int(value[:-1]) * 3600
    return int(value)  # bare integer seconds


def test_stop_grace_period_at_least_60s(worker_service):
    """stop_grace_period must be >= 60 seconds so in-flight jobs can finish."""
    raw = worker_service.get("stop_grace_period", "0s")
    seconds = _parse_duration_seconds(raw)
    assert seconds >= 60, (
        f"GAP-04: stop_grace_period should be >= 60s, got {raw!r} ({seconds}s)"
    )


# ── C. Worker command targets the right queue ─────────────────────────────────

def test_worker_command_targets_default_queue(worker_service):
    """The rq worker command must target the 'default' queue."""
    cmd = worker_service.get("command", "")
    assert "rq worker" in cmd, "worker service command should use 'rq worker'"
    assert "default" in cmd, "worker service command should target the 'default' queue"


def test_worker_command_includes_redis_url(worker_service):
    """The rq worker command must reference a Redis URL."""
    cmd = worker_service.get("command", "")
    assert "redis://" in cmd, (
        "worker command should include --url redis://... for explicit queue connection"
    )


# ── D. Restart policy ─────────────────────────────────────────────────────────

def test_worker_has_restart_policy(worker_service):
    """Worker should have a restart policy so it recovers from crashes."""
    assert "restart" in worker_service, (
        "GAP-04: worker service should define a restart policy"
    )


def test_worker_restart_policy_is_not_always(worker_service):
    """restart: always is wrong for workers — use on-failure or unless-stopped.
    'always' restarts even on clean exit which wastes resources.
    """
    policy = worker_service.get("restart", "")
    assert policy != "always", (
        "restart: always is not recommended for RQ workers (restarts on clean exit too); "
        "use 'on-failure' or 'unless-stopped' instead"
    )

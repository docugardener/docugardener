"""
Root conftest — environment stubs for unit testing without native tools.

Problem: gitpython's __init__.py runs `git version` on import to refresh the
path cache. On macOS with Xcode not yet licensed (exit code 69) that raises
ImportError, breaking collection of any test that transitively imports
`src.github.clone` (→ `src.pipeline.analyzer` → reporter, handler, etc.).

Fix: insert a minimal stub for `git` into sys.modules before any test module
is collected. The stub only needs to satisfy the attribute accesses used in
our source code (`git.Repo`, `git.exc.GitCommandError`, `git.exc.InvalidGitRepositoryError`).
"""

import sys
import types


def _make_git_stub() -> types.ModuleType:
    git_mod = types.ModuleType("git")

    # git.exc sub-module
    exc_mod = types.ModuleType("git.exc")

    class GitCommandError(Exception):
        pass

    class InvalidGitRepositoryError(Exception):
        pass

    exc_mod.GitCommandError = GitCommandError
    exc_mod.InvalidGitRepositoryError = InvalidGitRepositoryError
    git_mod.exc = exc_mod
    git_mod.GitCommandError = GitCommandError
    git_mod.InvalidGitRepositoryError = InvalidGitRepositoryError

    # Minimal Repo stub (include clone_from so @patch targets on it work)
    class Repo:
        def __init__(self, *args, **kwargs):
            pass

        @classmethod
        def clone_from(cls, *args, **kwargs):
            return cls()

    git_mod.Repo = Repo
    return git_mod


# Only install the stub if the real git module cannot be loaded cleanly.
if "git" not in sys.modules:
    try:
        import git as _real_git  # noqa: F401 – attempt real import
    except (ImportError, Exception):
        stub = _make_git_stub()
        sys.modules["git"] = stub
        sys.modules["git.exc"] = stub.exc


# ── Redis webhook dedup cleanup ───────────────────────────────────────────────
# The webhook handler uses Redis SET NX (5-min TTL) to deduplicate deliveries.
# Without this cleanup, tests that reuse fixed delivery IDs (e.g. "test-delivery-123")
# fail when the suite is run more than once within the TTL window, or when an
# earlier test in the same session has already consumed the key.
import os as _os

import pytest as _pytest


@_pytest.fixture(autouse=True)
def _clear_redis_dedup_keys():
    """Delete all webhook:delivery:* keys from Redis before each test."""
    try:
        import redis as _redis

        _rd = _redis.from_url(
            _os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
        )
        _keys = _rd.keys("webhook:delivery:*")
        if _keys:
            _rd.delete(*_keys)
    except Exception:
        pass  # Redis unavailable — webhook dedup falls back to no-op anyway
    yield


# ── RQ / Redis stub ───────────────────────────────────────────────────────────
# Unit tests run without Redis. Patch Redis.from_url so no real connection is
# attempted. get_queue() still executes normally (satisfying queue-routing tests
# that assert on Queue() call args), but enqueue() is a no-op MagicMock.
from unittest.mock import MagicMock as _MagicMock
from unittest.mock import patch as _patch


@_pytest.fixture(autouse=True)
def _mock_redis_connection():
    """Replace Redis.from_url with a MagicMock for all unit tests."""
    mock_redis = _MagicMock()
    mock_queue = _MagicMock()
    mock_queue.enqueue.return_value = _MagicMock(id="mock-job-id")
    mock_redis.return_value = mock_redis  # from_url returns itself
    with _patch("src.worker.queue.Redis") as mock_redis_cls:
        mock_redis_cls.from_url.return_value = mock_redis
        with _patch("rq.Queue") as mock_q_cls:
            mock_q_cls.return_value = mock_queue
            yield mock_queue

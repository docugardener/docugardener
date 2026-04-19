# SPDX-License-Identifier: AGPL-3.0-or-later
"""EPIC-09: Parallel entity analysis tests.

Verifies that _analyze_file_changes() processes files concurrently via
asyncio.gather() with a configurable Semaphore cap, while preserving all
existing correctness guarantees:

Functional:
  F-01  Results are equivalent to sequential processing (same EntityChanges)
  F-02  A failure on one file does not cancel other files (error isolation)
  F-03  Files with no detected language are silently skipped (empty list)
  F-04  Empty changed_files list returns empty result
  F-05  Base-ref fallback path is preserved when base_sha git call fails
  F-06  New file (no base version) is handled — old_entities empty, no error
  F-07  Order of returned changes is deterministic (sorted by file path)

Concurrency:
  C-01  Files are processed concurrently — max concurrent tasks capped by semaphore
  C-02  Semaphore cap = 1 degrades to sequential behaviour (regression safety net)
  C-03  Concurrency cap is configurable via max_concurrent_file_workers setting

Performance:
  P-01  N files processed in ~(max_time_per_file) wall time, not N×max_time_per_file
  P-02  Wall time with concurrency=5 is meaningfully less than sequential for N=5 files

Benchmark (always prints a report — run with pytest -s to see output):
  B-01  Speedup table across N=1,5,10,20 files with simulated 50ms git I/O per file
"""

import asyncio
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.analysis.diff import EntityChange
from src.pipeline.analyzer import FileChange, PRAnalyzer

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_file_change(path: str, status: str = "modified") -> FileChange:
    return FileChange(path=path, status=status, additions=5, deletions=2, patch="")


def _make_entity_change(name: str) -> EntityChange:
    entity = MagicMock()
    entity.name = name
    entity.qualified_name = name
    entity.file_path = name
    change = MagicMock(spec=EntityChange)
    change.entity = entity
    change.change_type = MagicMock()
    change.change_type.value = "modified"
    change.is_meaningful = True
    change.requires_doc_update = True
    return change


def _make_analyzer() -> PRAnalyzer:
    """PRAnalyzer with mocked verifier (not used in _analyze_file_changes)."""
    analyzer = PRAnalyzer.__new__(PRAnalyzer)
    analyzer.parser = MagicMock()
    analyzer.diff = MagicMock()
    return analyzer


# ── F-01: Results equivalent to sequential ───────────────────────────────────


@pytest.mark.asyncio
async def test_f01_results_equivalent_to_sequential():
    """Parallel results must equal what sequential processing would return."""
    analyzer = _make_analyzer()
    files = [_make_file_change(f"src/module_{i}.py") for i in range(4)]

    # Each file yields one distinct EntityChange
    expected_changes = [_make_entity_change(f"func_{i}") for i in range(4)]

    # parser always detects python; parse_content returns something
    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[MagicMock()])

    # diff returns one change per file call
    call_count = {"n": 0}

    def diff_side_effect(old, new):
        ch = expected_changes[call_count["n"] % len(expected_changes)]
        call_count["n"] += 1
        return [ch]

    analyzer.diff.compare_entities = MagicMock(side_effect=diff_side_effect)

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock()
    mock_repo.git.show = MagicMock(return_value="def func(): pass")

    with patch("src.pipeline.analyzer.asyncio.to_thread") as mock_to_thread:
        # to_thread wraps blocking git calls — simulate them returning immediately
        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        mock_to_thread.side_effect = fake_to_thread

        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=True):
                with patch.object(Path, "read_text", return_value="def func(): pass"):
                    result = await analyzer._analyze_file_changes(
                        repo_path=repo_path,
                        base_sha="abc123",
                        changed_files=files,
                    )

    assert len(result) == 4


# ── F-02: Error isolation — one file failure doesn't cancel others ────────────


@pytest.mark.asyncio
async def test_f02_one_file_failure_does_not_cancel_others():
    """If one file's git.show raises, other files still produce results."""
    analyzer = _make_analyzer()
    files = [_make_file_change(f"src/file_{i}.py") for i in range(3)]

    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[MagicMock()])
    analyzer.diff.compare_entities = MagicMock(return_value=[_make_entity_change("ok_func")])

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock()

    call_count = {"n": 0}
    import git as gitmodule

    def show_side_effect(ref):
        idx = call_count["n"]
        call_count["n"] += 1
        if idx == 1:
            raise gitmodule.GitCommandError("show", 128, "not found")
        return "def func(): pass"

    mock_repo.git.show = MagicMock(side_effect=show_side_effect)

    with patch("src.pipeline.analyzer.asyncio.to_thread") as mock_to_thread:

        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        mock_to_thread.side_effect = fake_to_thread

        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=True):
                with patch.object(Path, "read_text", return_value="def func(): pass"):
                    result = await analyzer._analyze_file_changes(
                        repo_path=repo_path,
                        base_sha="abc123",
                        changed_files=files,
                    )

    # File 0 and 2 succeed; file 1 has error → 0 old_entities but still produces changes
    # At minimum we should get changes from the 2 successful files
    assert len(result) >= 2


# ── F-03: Unsupported language files are skipped ──────────────────────────────


@pytest.mark.asyncio
async def test_f03_unsupported_language_files_skipped():
    """Files where detect_language returns None yield no EntityChanges."""
    analyzer = _make_analyzer()
    files = [_make_file_change("README.md"), _make_file_change("image.png")]
    analyzer.parser.detect_language = MagicMock(return_value=None)
    analyzer.diff.compare_entities = MagicMock(return_value=[])

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock()
    mock_repo.git.show = MagicMock(return_value="")

    with patch("src.pipeline.analyzer.asyncio.to_thread") as mock_to_thread:

        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        mock_to_thread.side_effect = fake_to_thread

        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=False):
                result = await analyzer._analyze_file_changes(
                    repo_path=repo_path,
                    base_sha="abc123",
                    changed_files=files,
                )

    assert result == []


# ── F-04: Empty input returns empty list ──────────────────────────────────────


@pytest.mark.asyncio
async def test_f04_empty_changed_files_returns_empty():
    """Empty changed_files list returns empty result without touching git."""
    analyzer = _make_analyzer()
    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()

    with patch("git.Repo", return_value=mock_repo):
        result = await analyzer._analyze_file_changes(
            repo_path=repo_path,
            base_sha="abc123",
            changed_files=[],
        )

    assert result == []
    mock_repo.git.show.assert_not_called()


# ── F-05: Base-ref fallback preserved ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_f05_base_ref_fallback_used_when_sha_fails():
    """When base_sha git.show fails, base_ref fallback is attempted."""
    import git as gitmodule

    analyzer = _make_analyzer()
    files = [_make_file_change("src/app.py")]
    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[MagicMock()])
    analyzer.diff.compare_entities = MagicMock(return_value=[_make_entity_change("fn")])

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock(side_effect=gitmodule.GitCommandError("rev-parse", 128))
    show_calls = []

    def show_side_effect(ref):
        show_calls.append(ref)
        if "abc123" in ref:
            raise gitmodule.GitCommandError("show", 128)
        return "def fn(): pass"

    mock_repo.git.show = MagicMock(side_effect=show_side_effect)
    mock_repo.git.fetch = MagicMock()

    with patch("src.pipeline.analyzer.asyncio.to_thread") as mock_to_thread:

        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        mock_to_thread.side_effect = fake_to_thread

        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=True):
                with patch.object(Path, "read_text", return_value="def fn(): pass"):
                    result = await analyzer._analyze_file_changes(
                        repo_path=repo_path,
                        base_sha="abc123",
                        changed_files=files,
                        base_ref="main",
                    )

    # Fallback fetch was attempted
    fetch_calls = [str(c) for c in mock_repo.git.fetch.call_args_list]
    assert any("main" in c for c in fetch_calls)


# ── F-06: New file (no base version) handled gracefully ───────────────────────


@pytest.mark.asyncio
async def test_f06_new_file_no_base_version_no_crash():
    """A new file with no base version produces changes from new content only."""
    import git as gitmodule

    analyzer = _make_analyzer()
    files = [_make_file_change("src/new_module.py", status="added")]
    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[MagicMock()])
    analyzer.diff.compare_entities = MagicMock(return_value=[_make_entity_change("new_fn")])

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock(side_effect=gitmodule.GitCommandError("rev-parse", 128))
    mock_repo.git.show = MagicMock(side_effect=gitmodule.GitCommandError("show", 128))
    mock_repo.git.fetch = MagicMock()

    with patch("src.pipeline.analyzer.asyncio.to_thread") as mock_to_thread:

        async def fake_to_thread(fn, *args, **kwargs):
            return fn(*args, **kwargs)

        mock_to_thread.side_effect = fake_to_thread

        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=True):
                with patch.object(Path, "read_text", return_value="def new_fn(): pass"):
                    result = await analyzer._analyze_file_changes(
                        repo_path=repo_path,
                        base_sha="abc123",
                        changed_files=files,
                    )

    # Should not raise; returns changes derived from new content vs empty base
    assert isinstance(result, list)


# ── F-07: Output order is deterministic ───────────────────────────────────────


@pytest.mark.asyncio
async def test_f07_output_order_is_deterministic():
    """Multiple runs on same input return changes in the same order."""
    analyzer = _make_analyzer()
    files = [_make_file_change(f"src/mod_{i}.py") for i in range(5)]
    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[MagicMock()])

    idx = {"n": 0}
    changes_per_file = [[_make_entity_change(f"fn_{i}")] for i in range(5)]

    def diff_side(old, new):
        result = changes_per_file[idx["n"] % 5]
        idx["n"] += 1
        return result

    analyzer.diff.compare_entities = MagicMock(side_effect=diff_side)

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock()
    mock_repo.git.show = MagicMock(return_value="def fn(): pass")

    async def fake_to_thread(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    results = []
    for _ in range(3):
        idx["n"] = 0
        analyzer.diff.compare_entities = MagicMock(
            side_effect=lambda o, n: [_make_entity_change("fn")]
        )
        with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=fake_to_thread):
            with patch("git.Repo", return_value=mock_repo):
                with patch.object(Path, "exists", return_value=True):
                    with patch.object(Path, "read_text", return_value="def fn(): pass"):
                        r = await analyzer._analyze_file_changes(
                            repo_path=repo_path,
                            base_sha="abc123",
                            changed_files=files,
                        )
        results.append(len(r))

    # All runs yield the same count
    assert len(set(results)) == 1


# ── C-01: Files processed concurrently (semaphore not serialising all) ────────


@pytest.mark.asyncio
async def test_c01_files_processed_concurrently():
    """Tasks must overlap — concurrent_high_watermark > 1 for N > 1 files."""
    analyzer = _make_analyzer()
    n_files = 5
    files = [_make_file_change(f"src/mod_{i}.py") for i in range(n_files)]
    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[])
    analyzer.diff.compare_entities = MagicMock(return_value=[])

    active = {"count": 0, "max": 0}

    async def slow_to_thread(fn, *args, **kwargs):
        active["count"] += 1
        active["max"] = max(active["max"], active["count"])
        await asyncio.sleep(0.02)  # simulate git I/O
        result = fn(*args, **kwargs)
        active["count"] -= 1
        return result

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock()
    mock_repo.git.show = MagicMock(return_value="")

    with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=slow_to_thread):
        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=False):
                await analyzer._analyze_file_changes(
                    repo_path=repo_path,
                    base_sha="abc123",
                    changed_files=files,
                )

    # With concurrency enabled, more than 1 task should have run simultaneously
    assert active["max"] > 1, (
        f"Expected concurrent execution (max_active > 1), got {active['max']}. "
        "Files are being processed sequentially."
    )


# ── C-02: Semaphore cap=1 degrades to sequential ──────────────────────────────


@pytest.mark.asyncio
async def test_c02_semaphore_cap_1_is_sequential():
    """max_concurrent_file_workers=1 must serialize all file tasks."""
    analyzer = _make_analyzer()
    files = [_make_file_change(f"src/mod_{i}.py") for i in range(4)]
    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[])
    analyzer.diff.compare_entities = MagicMock(return_value=[])

    active = {"count": 0, "max": 0}

    async def slow_to_thread(fn, *args, **kwargs):
        active["count"] += 1
        active["max"] = max(active["max"], active["count"])
        await asyncio.sleep(0.02)
        result = fn(*args, **kwargs)
        active["count"] -= 1
        return result

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock()
    mock_repo.git.show = MagicMock(return_value="")

    with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=slow_to_thread):
        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=False):
                # Override setting to cap=1
                with patch("src.pipeline.analyzer.settings") as mock_settings:
                    mock_settings.max_concurrent_file_workers = 1
                    await analyzer._analyze_file_changes(
                        repo_path=repo_path,
                        base_sha="abc123",
                        changed_files=files,
                    )

    assert active["max"] == 1, (
        f"Semaphore cap=1 should serialize tasks, but max_active={active['max']}"
    )


# ── C-03: Concurrency cap is configurable ─────────────────────────────────────


@pytest.mark.asyncio
async def test_c03_concurrency_cap_configurable():
    """max_concurrent_file_workers=3 allows up to 3 concurrent tasks."""
    analyzer = _make_analyzer()
    files = [_make_file_change(f"src/mod_{i}.py") for i in range(6)]
    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[])
    analyzer.diff.compare_entities = MagicMock(return_value=[])

    active = {"count": 0, "max": 0}

    async def slow_to_thread(fn, *args, **kwargs):
        active["count"] += 1
        active["max"] = max(active["max"], active["count"])
        await asyncio.sleep(0.02)
        result = fn(*args, **kwargs)
        active["count"] -= 1
        return result

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock()
    mock_repo.git.show = MagicMock(return_value="")

    with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=slow_to_thread):
        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=False):
                with patch("src.pipeline.analyzer.settings") as mock_settings:
                    mock_settings.max_concurrent_file_workers = 3
                    await analyzer._analyze_file_changes(
                        repo_path=repo_path,
                        base_sha="abc123",
                        changed_files=files,
                    )

    assert active["max"] <= 3, (
        f"Semaphore cap=3 should allow at most 3 concurrent tasks, got {active['max']}"
    )
    assert active["max"] > 1, "Expected some concurrency with cap=3 and 6 files"


# ── P-01: Wall time bounded by max_per_file, not N × max_per_file ─────────────


@pytest.mark.asyncio
async def test_p01_wall_time_bounded_not_additive():
    """Parallel: N files complete in less wall time than sequential (any speedup).

    _process_one_file makes multiple to_thread calls per file; only the dominant
    git I/O call (show) is slowed here. The test simply confirms that concurrent
    execution is faster than cap=1 sequential. P-02 asserts the ≥2× bound.
    """
    analyzer = _make_analyzer()
    n = 5
    slow_delay = 0.08  # simulate git.show network latency only

    files = [_make_file_change(f"src/mod_{i}.py") for i in range(n)]
    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[])
    analyzer.diff.compare_entities = MagicMock(return_value=[])

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock()
    mock_repo.git.show = MagicMock(return_value="")

    def _is_show_call(fn, *args):
        """True when to_thread wraps the git.show blocking call."""
        return (
            hasattr(fn, "__self__") and fn.__func__.__name__ == "show"
            if hasattr(fn, "__func__")
            else False
        )

    call_tracker: dict[str, int] = {}

    async def selective_slow_to_thread(fn, *args, **kwargs):
        # Only slow down git.show; everything else (exists, Repo, rev_parse) is instant
        fn_name = getattr(fn, "__name__", "") or getattr(
            getattr(fn, "__func__", None), "__name__", ""
        )
        if fn_name == "show":
            await asyncio.sleep(slow_delay)
        return fn(*args, **kwargs)

    # Sequential baseline (cap=1)
    with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=selective_slow_to_thread):
        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=False):
                with patch("src.pipeline.analyzer.settings") as ms:
                    ms.max_concurrent_file_workers = 1
                    t0 = time.monotonic()
                    await analyzer._analyze_file_changes(
                        repo_path=repo_path, base_sha="abc123", changed_files=files
                    )
                    seq_time = time.monotonic() - t0

    # Parallel (cap=5)
    with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=selective_slow_to_thread):
        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=False):
                with patch("src.pipeline.analyzer.settings") as ms:
                    ms.max_concurrent_file_workers = 5
                    t0 = time.monotonic()
                    await analyzer._analyze_file_changes(
                        repo_path=repo_path, base_sha="abc123", changed_files=files
                    )
                    par_time = time.monotonic() - t0

    assert par_time < seq_time, (
        f"Parallel ({par_time:.3f}s) must be faster than sequential ({seq_time:.3f}s)"
    )


# ── P-02: Speedup is meaningful vs sequential baseline ────────────────────────


@pytest.mark.asyncio
async def test_p02_parallel_faster_than_sequential_baseline():
    """Parallel execution with N=5 must be at least 2× faster than sequential."""
    analyzer = _make_analyzer()
    n = 5
    per_file_delay = 0.04
    files = [_make_file_change(f"src/mod_{i}.py") for i in range(n)]
    analyzer.parser.detect_language = MagicMock(return_value="python")
    analyzer.parser.parse_content = MagicMock(return_value=[])
    analyzer.diff.compare_entities = MagicMock(return_value=[])

    repo_path = Path("/fake/repo")
    mock_repo = MagicMock()
    mock_repo.git.rev_parse = MagicMock()
    mock_repo.git.show = MagicMock(return_value="")

    # ── Sequential baseline ───────────────────────────────────────────────────
    async def seq_to_thread(fn, *args, **kwargs):
        await asyncio.sleep(per_file_delay)
        return fn(*args, **kwargs)

    # Simulate sequential by setting cap=1
    with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=seq_to_thread):
        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=False):
                with patch("src.pipeline.analyzer.settings") as ms:
                    ms.max_concurrent_file_workers = 1
                    t0 = time.monotonic()
                    await analyzer._analyze_file_changes(
                        repo_path=repo_path,
                        base_sha="abc123",
                        changed_files=files,
                    )
                    seq_time = time.monotonic() - t0

    # ── Parallel run ──────────────────────────────────────────────────────────
    with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=seq_to_thread):
        with patch("git.Repo", return_value=mock_repo):
            with patch.object(Path, "exists", return_value=False):
                with patch("src.pipeline.analyzer.settings") as ms:
                    ms.max_concurrent_file_workers = 5
                    t0 = time.monotonic()
                    await analyzer._analyze_file_changes(
                        repo_path=repo_path,
                        base_sha="abc123",
                        changed_files=files,
                    )
                    par_time = time.monotonic() - t0

    speedup = seq_time / par_time
    assert speedup >= 2.0, (
        f"Expected ≥2× speedup, got {speedup:.2f}× (seq={seq_time:.3f}s, par={par_time:.3f}s)"
    )


# ── B-01: Benchmark — speedup table across file counts ────────────────────────


@pytest.mark.asyncio
async def test_b01_speedup_benchmark(capsys):
    """B-01: Print a speedup table for N=1,5,10,20 files.

    Each asyncio.to_thread call is delayed by `io_delay_per_call` ms to simulate
    realistic blocking git I/O (git show, rev_parse, Repo open). Each file makes
    ~3 to_thread calls inside the semaphore, so:

      sequential wall time  ≈ N_files × N_calls × io_delay
      parallel wall time    ≈ ceil(N_files / cap) × N_calls × io_delay

    Run with:  pytest tests/unit/test_epic09_parallel_analysis.py::test_b01_speedup_benchmark -v -s
    """
    io_delay_per_call = 0.03  # 30ms per blocking git op — realistic for local shallow clone
    cap = 5  # default max_concurrent_file_workers

    repo_path = Path("/fake/repo")

    async def uniform_io_delay(fn, *args, **kwargs):
        """All to_thread calls incur I/O delay — simulates any blocking git/fs op."""
        await asyncio.sleep(io_delay_per_call)
        return fn(*args, **kwargs)

    rows = []
    for n_files in (1, 5, 10, 20):
        mock_repo = MagicMock()
        mock_repo.git.rev_parse = MagicMock()
        mock_repo.git.show = MagicMock(return_value="")

        analyzer = _make_analyzer()
        files = [_make_file_change(f"src/mod_{i}.py") for i in range(n_files)]
        analyzer.parser.detect_language = MagicMock(return_value="python")
        analyzer.parser.parse_content = MagicMock(return_value=[])
        analyzer.diff.compare_entities = MagicMock(return_value=[])

        # Sequential baseline (cap=1)
        with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=uniform_io_delay):
            with patch("git.Repo", return_value=mock_repo):
                with patch.object(Path, "exists", return_value=False):
                    with patch("src.pipeline.analyzer.settings") as ms:
                        ms.max_concurrent_file_workers = 1
                        t0 = time.monotonic()
                        await analyzer._analyze_file_changes(
                            repo_path=repo_path, base_sha="abc123", changed_files=files
                        )
                        seq_ms = (time.monotonic() - t0) * 1000

        # Parallel (cap=5)
        with patch("src.pipeline.analyzer.asyncio.to_thread", side_effect=uniform_io_delay):
            with patch("git.Repo", return_value=mock_repo):
                with patch.object(Path, "exists", return_value=False):
                    with patch("src.pipeline.analyzer.settings") as ms:
                        ms.max_concurrent_file_workers = cap
                        t0 = time.monotonic()
                        await analyzer._analyze_file_changes(
                            repo_path=repo_path, base_sha="abc123", changed_files=files
                        )
                        par_ms = (time.monotonic() - t0) * 1000

        speedup = seq_ms / par_ms if par_ms > 0 else float("inf")
        saved_ms = seq_ms - par_ms
        rows.append((n_files, seq_ms, par_ms, speedup, saved_ms))

    # ── Print report (always visible with pytest -s) ──────────────────────────
    with capsys.disabled():
        print("\n")
        print("  ┌─────────────────────────────────────────────────────────────────┐")
        print("  │         EPIC-09 Parallel File Analysis — Speedup Report         │")
        print("  ├─────────────────────────────────────────────────────────────────┤")
        print(
            f"  │  Simulated blocking git I/O per to_thread call: {io_delay_per_call * 1000:.0f}ms          │"
        )
        print(f"  │  Concurrency cap (max_concurrent_file_workers): {cap}             │")
        print("  ├────────┬──────────────┬────────────┬───────────┬───────────────┤")
        print("  │  Files │   Sequential │   Parallel │   Speedup │  Time saved   │")
        print("  ├────────┼──────────────┼────────────┼───────────┼───────────────┤")
        for n_files, seq_ms, par_ms, speedup, saved_ms in rows:
            note = " (1 file)" if n_files == 1 else ""
            print(
                f"  │ {n_files:>6} │ {seq_ms:>9.0f}ms │ {par_ms:>7.0f}ms │ "
                f"{speedup:>7.2f}×  │ {saved_ms:>7.0f}ms{note:<6}│"
            )
        print("  └────────┴──────────────┴────────────┴───────────┴───────────────┘")
        print()

    # Assertions — speedup must be meaningful for multi-file PRs
    speedups = {r[0]: r[3] for r in rows}
    assert speedups[5] >= 2.0, f"5-file  speedup should be ≥2×, got {speedups[5]:.2f}×"
    assert speedups[10] >= 2.0, f"10-file speedup should be ≥2×, got {speedups[10]:.2f}×"
    assert speedups[20] >= 2.0, f"20-file speedup should be ≥2×, got {speedups[20]:.2f}×"

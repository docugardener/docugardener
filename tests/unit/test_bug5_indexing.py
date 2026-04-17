# SPDX-License-Identifier: AGPL-3.0-or-later
"""
BUG-5 regression tests — Weaviate indexing called on first analysis per repo.

Verifies that PRAnalyzer calls DocumentIndexer.index_repository() when
lastIndexedAt is None (repo never indexed), and skips it when already indexed.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

# ── helpers ────────────────────────────────────────────────────────────────────


def _make_mock_change():
    """Return a minimal mock EntityChange compatible with the analyzer loop."""
    change = MagicMock()
    change.entity = MagicMock()
    change.entity.qualified_name = "MyClass.my_method"
    change.entity.name = "my_method"
    change.entity.file_path = "src/main.py"
    change.directory_weight = 1.0
    change.blast_radius = 1
    return change


# ── tests ──────────────────────────────────────────────────────────────────────


class TestBug5IndexingTrigger:
    """index_repository() is called once on first analysis, skipped thereafter."""

    def _run_analyzer_with_mocks(
        self,
        last_indexed_at: "datetime | None",
        mock_index_repo: AsyncMock,
        mock_stamp: MagicMock,
    ) -> None:
        """
        Patch the full analyzer stack so we can assert on indexer behaviour
        without touching real DB, GitHub, or Weaviate.
        """
        import asyncio

        from src.pipeline.analyzer import PRAnalyzer
        from src.pipeline.handler import FileChange

        files = [FileChange(path="src/main.py", status="modified", additions=5, deletions=2)]

        mock_db = AsyncMock()
        mock_db_ctx = MagicMock()
        mock_db_ctx.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_indexer = MagicMock()
        mock_indexer.index_repository = mock_index_repo
        mock_indexer.find_related_docs = AsyncMock(return_value=[])

        mock_draft = MagicMock()
        mock_draft.is_verified = False

        mock_change = _make_mock_change()

        mock_verifier = MagicMock()
        mock_verifier.analyze_drift = AsyncMock(
            return_value=MagicMock(
                drift_score=75,
                severity="significant",
                required_updates=[mock_change],
                block_merge=False,
                summary="drift detected",
            )
        )
        mock_verifier.generate_documentation = AsyncMock(return_value=mock_draft)
        mock_verifier.session_llm_usage = {}

        with (
            patch("src.pipeline.analyzer.get_db_manager", return_value=mock_db_ctx),
            patch("src.pipeline.analyzer.DocumentIndexer", return_value=mock_indexer),
            patch("src.pipeline.analyzer.ephemeral_clone") as mock_clone,
            patch("src.pipeline.analyzer.SemanticDiff") as MockDiff,
            patch("src.pipeline.analyzer.get_parser"),
            # Short-circuit the git-dependent internal methods
            patch.object(
                PRAnalyzer, "_analyze_file_changes", new=AsyncMock(return_value=[mock_change])
            ),
            patch.object(PRAnalyzer, "_estimate_blast_radius", new=AsyncMock(return_value=1)),
            patch("src.pipeline.job_manager.job_manager") as mock_jm,
        ):
            mock_clone.return_value.__aenter__ = AsyncMock(return_value=MagicMock())
            mock_clone.return_value.__aexit__ = AsyncMock(return_value=False)

            mock_diff = MagicMock()
            mock_diff.filter_meaningful_changes.return_value = [mock_change]
            MockDiff.return_value = mock_diff

            mock_jm.get_repo_last_indexed_at.return_value = last_indexed_at
            mock_jm.stamp_repo_indexed = mock_stamp

            analyzer = PRAnalyzer(verifier=mock_verifier)

            asyncio.run(
                analyzer.analyze_pr(
                    owner="TestOrg",
                    repo="test-repo",
                    pr_number=1,
                    base_sha="base",
                    head_sha="head",
                    changed_files=files,
                    installation_token="tok",
                    tenant_id="tenant-001",
                    repo_db_id="repo-abc",
                )
            )

    def test_indexes_when_never_indexed(self):
        """BUG-5: index_repository() is called when lastIndexedAt is None."""
        mock_index = AsyncMock()
        mock_stamp = MagicMock()
        self._run_analyzer_with_mocks(
            last_indexed_at=None,
            mock_index_repo=mock_index,
            mock_stamp=mock_stamp,
        )
        mock_index.assert_awaited_once()
        mock_stamp.assert_called_once_with("repo-abc")

    def test_skips_index_when_already_indexed(self):
        """BUG-5: index_repository() is NOT called when lastIndexedAt is set."""
        mock_index = AsyncMock()
        mock_stamp = MagicMock()
        self._run_analyzer_with_mocks(
            last_indexed_at=datetime(2026, 4, 1),
            mock_index_repo=mock_index,
            mock_stamp=mock_stamp,
        )
        mock_index.assert_not_awaited()
        mock_stamp.assert_not_called()

    def test_no_repo_db_id_skips_index(self):
        """BUG-5: when repo_db_id is None (test/legacy path) indexing is skipped."""
        mock_index = AsyncMock()

        # Reuse the helper but pass repo_db_id=None via a separate direct call.
        import asyncio

        from src.pipeline.analyzer import PRAnalyzer
        from src.pipeline.handler import FileChange

        files = [FileChange(path="src/main.py", status="modified", additions=5, deletions=2)]

        mock_db = AsyncMock()
        mock_db_ctx = MagicMock()
        mock_db_ctx.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_indexer = MagicMock()
        mock_indexer.index_repository = mock_index
        mock_indexer.find_related_docs = AsyncMock(return_value=[])

        mock_draft = MagicMock()
        mock_draft.is_verified = False
        mock_change = _make_mock_change()
        mock_verifier = MagicMock()
        mock_verifier.analyze_drift = AsyncMock(
            return_value=MagicMock(
                drift_score=60,
                severity="moderate",
                required_updates=[mock_change],
                block_merge=False,
                summary="drift",
            )
        )
        mock_verifier.generate_documentation = AsyncMock(return_value=mock_draft)
        mock_verifier.session_llm_usage = {}

        with (
            patch("src.pipeline.analyzer.get_db_manager", return_value=mock_db_ctx),
            patch("src.pipeline.analyzer.DocumentIndexer", return_value=mock_indexer),
            patch("src.pipeline.analyzer.ephemeral_clone") as mock_clone,
            patch("src.pipeline.analyzer.SemanticDiff") as MockDiff,
            patch("src.pipeline.analyzer.get_parser"),
            patch.object(
                PRAnalyzer, "_analyze_file_changes", new=AsyncMock(return_value=[mock_change])
            ),
            patch.object(PRAnalyzer, "_estimate_blast_radius", new=AsyncMock(return_value=1)),
        ):
            mock_clone.return_value.__aenter__ = AsyncMock(return_value=MagicMock())
            mock_clone.return_value.__aexit__ = AsyncMock(return_value=False)

            mock_diff = MagicMock()
            mock_diff.filter_meaningful_changes.return_value = [mock_change]
            MockDiff.return_value = mock_diff

            analyzer = PRAnalyzer(verifier=mock_verifier)
            asyncio.run(
                analyzer.analyze_pr(
                    owner="TestOrg",
                    repo="test-repo",
                    pr_number=1,
                    base_sha="base",
                    head_sha="head",
                    changed_files=files,
                    installation_token="tok",
                    tenant_id="tenant-001",
                    repo_db_id=None,  # no repo_db_id — indexing must be skipped
                )
            )
        mock_index.assert_not_awaited()

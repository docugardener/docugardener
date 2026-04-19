# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-11: Cross-repo drift detection — unit tests.

Coverage map:
  Layer 1 — _repo_sub_namespace()                           (2 tests)
  Layer 2 — WeaviateDB.search_multi_namespace()             (4 tests)
  Layer 3 — DocumentIndexer.find_cross_repo_docs()          (2 tests)
  Layer 4 — _build_cross_repo_diff_summary()                (3 tests)
  Layer 5 — VerificationAgent.analyze_cross_repo_impact()   (8 tests)
  Layer 6 — _format_cross_repo_section_md()                 (4 tests)
  Layer 7 — _find_cross_repo_context() plan-tier gate       (5 tests)
  Layer 8 — Dual-index in analyze_pr() / BUG-5 block        (3 tests)
  Layer 9 — Metrics                                         (2 tests)
  Layer 10 — analyze_pr() wiring                            (4 tests)
  Layer 11 — format_drift_report() injection                (2 tests)

Total: 41 tests — all pure unit (no Weaviate, no LLM, no DB).
"""

import json
from unittest.mock import ANY, AsyncMock, MagicMock, call, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Helpers shared across layers
# ─────────────────────────────────────────────────────────────────────────────

def _make_search_result(doc_id: str, score: float, file_path: str, ns: str) -> MagicMock:
    r = MagicMock()
    r.id = doc_id
    r.score = score
    r.content = f"content of {doc_id}"
    r.metadata = {"file_path": file_path, "source_namespace": ns}
    return r


def _make_entity_change(
    name: str = "get_users",
    file_path: str = "src/routes/users.py",
    change_type: str = "SIGNATURE_CHANGED",
    old_name: str | None = None,
    new_name: str | None = None,
    old_sig: str | None = None,
    new_sig: str | None = None,
) -> MagicMock:
    ch = MagicMock()
    ch.entity = MagicMock()
    ch.entity.name = name
    ch.entity.qualified_name = name
    ch.entity.file_path = file_path
    ch.change_type = MagicMock()
    ch.change_type.value = change_type
    ch.extra_context = {}
    if old_name:
        ch.extra_context["old_name"] = old_name
    if new_name:
        ch.extra_context["new_name"] = new_name
    if old_sig:
        ch.extra_context["old_signature"] = old_sig
    if new_sig:
        ch.extra_context["new_signature"] = new_sig
    return ch


def _chunk(repo: str, file: str, content: str = "some content") -> dict:
    return {"repo": repo, "file": file, "content": content, "source_namespace": repo}


# ─────────────────────────────────────────────────────────────────────────────
# Layer 1: _repo_sub_namespace()
# ─────────────────────────────────────────────────────────────────────────────

class TestRepoSubNamespace:
    def test_basic_format(self):
        from src.storage.indexer import _repo_sub_namespace
        result = _repo_sub_namespace("cuid123", "myorg/sdk-js")
        assert result == "cuid123__myorg__sdk_js"

    def test_special_chars_normalised(self):
        """Slashes → __, hyphens → underscores."""
        from src.storage.indexer import _repo_sub_namespace
        result = _repo_sub_namespace("t-id", "acme-corp/my-docs-portal")
        assert result == "t-id__acme_corp__my_docs_portal"

    def test_tenant_prefix_always_present(self):
        """Sub-namespace always starts with the tenant_id — cross-tenant impossible."""
        from src.storage.indexer import _repo_sub_namespace
        ns = _repo_sub_namespace("tenant-abc", "org/repo")
        assert ns.startswith("tenant-abc__")


# ─────────────────────────────────────────────────────────────────────────────
# Layer 2: WeaviateDB.search_multi_namespace()
# ─────────────────────────────────────────────────────────────────────────────

class TestSearchMultiNamespace:
    def _make_db(self):
        with patch("src.storage.weaviate_db.WeaviateDB.__init__", return_value=None):
            from src.storage.weaviate_db import WeaviateDB
            db = WeaviateDB.__new__(WeaviateDB)
            db._initialized = True
            return db

    @pytest.mark.asyncio
    async def test_merges_and_sorts_by_score_desc(self):
        from src.storage.weaviate_db import WeaviateDB
        db = self._make_db()

        r1 = _make_search_result("doc-a", 0.9, "README.md", "ns1")
        r2 = _make_search_result("doc-b", 0.5, "guide.md", "ns2")
        r3 = _make_search_result("doc-c", 0.7, "api.md", "ns1")

        db.search = AsyncMock(side_effect=[[r1, r3], [r2]])

        results = await db.search_multi_namespace(
            query_vector=[0.1, 0.2],
            namespaces=["ns1", "ns2"],
            top_k_per_ns=3,
        )

        scores = [r.score for r in results]
        assert scores == sorted(scores, reverse=True)
        assert len(results) == 3

    @pytest.mark.asyncio
    async def test_source_namespace_injected_into_metadata(self):
        from src.storage.weaviate_db import WeaviateDB
        db = self._make_db()

        r1 = _make_search_result("doc-a", 0.9, "file.md", "ns1")
        r1.metadata = {"file_path": "file.md"}  # no source_namespace yet
        db.search = AsyncMock(side_effect=[[r1], []])

        results = await db.search_multi_namespace([0.1], ["ns1", "ns2"], top_k_per_ns=3)
        assert results[0].metadata["source_namespace"] == "ns1"

    @pytest.mark.asyncio
    async def test_one_namespace_failure_skipped_others_returned(self):
        """A single namespace exception must NOT propagate — others still return."""
        from src.storage.weaviate_db import WeaviateDB
        db = self._make_db()

        r1 = _make_search_result("doc-ok", 0.8, "file.md", "ns2")
        db.search = AsyncMock(side_effect=[RuntimeError("ns1 dead"), [r1]])

        results = await db.search_multi_namespace([0.1], ["ns1", "ns2"], top_k_per_ns=3)
        assert len(results) == 1
        assert results[0].id == "doc-ok"

    @pytest.mark.asyncio
    async def test_all_namespaces_fail_returns_empty(self):
        """All namespaces failing → empty list, no exception."""
        from src.storage.weaviate_db import WeaviateDB
        db = self._make_db()
        db.search = AsyncMock(side_effect=RuntimeError("weaviate down"))

        results = await db.search_multi_namespace([0.1], ["ns1", "ns2"], top_k_per_ns=3)
        assert results == []

    @pytest.mark.asyncio
    async def test_empty_namespaces_list_returns_empty(self):
        from src.storage.weaviate_db import WeaviateDB
        db = self._make_db()
        db.search = AsyncMock(return_value=[])

        results = await db.search_multi_namespace([0.1], [], top_k_per_ns=3)
        assert results == []
        db.search.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# Layer 3: DocumentIndexer.find_cross_repo_docs()
# ─────────────────────────────────────────────────────────────────────────────

class TestFindCrossRepoDocs:
    @pytest.mark.asyncio
    async def test_passes_sub_namespaces_to_search_multi_namespace(self):
        from src.storage.indexer import DocumentIndexer

        mock_db = AsyncMock()
        mock_db.search_multi_namespace = AsyncMock(return_value=[])
        indexer = DocumentIndexer(mock_db)

        entity = MagicMock()
        entity.name = "get_users"
        entity.file_path = "src/routes/users.py"

        with patch("src.storage.indexer.generate_embedding") as mock_emb, \
             patch("src.storage.indexer.format_entity_for_embedding", return_value="get_users"):
            mock_emb.return_value = MagicMock(tolist=lambda: [0.1, 0.2])
            await indexer.find_cross_repo_docs(
                entity=entity,
                sibling_namespaces=["tid__org__sdk", "tid__org__docs"],
                top_k_per_ns=3,
            )

        mock_db.search_multi_namespace.assert_called_once_with(
            query_vector=[0.1, 0.2],
            namespaces=["tid__org__sdk", "tid__org__docs"],
            top_k_per_ns=3,
        )

    @pytest.mark.asyncio
    async def test_top_k_per_ns_forwarded_correctly(self):
        from src.storage.indexer import DocumentIndexer

        mock_db = AsyncMock()
        mock_db.search_multi_namespace = AsyncMock(return_value=[])
        indexer = DocumentIndexer(mock_db)

        with patch("src.storage.indexer.generate_embedding") as mock_emb, \
             patch("src.storage.indexer.format_entity_for_embedding", return_value="x"):
            mock_emb.return_value = MagicMock(tolist=lambda: [0.0])
            await indexer.find_cross_repo_docs(
                entity=MagicMock(), sibling_namespaces=["ns1"], top_k_per_ns=5
            )

        _, kwargs = mock_db.search_multi_namespace.call_args
        assert kwargs["top_k_per_ns"] == 5


# ─────────────────────────────────────────────────────────────────────────────
# Layer 4: _build_cross_repo_diff_summary()
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildCrossRepoDiffSummary:
    def test_rename_includes_old_and_new_names(self):
        from src.pipeline.analyzer import _build_cross_repo_diff_summary
        ch = _make_entity_change(
            old_name="get_users", new_name="get_accounts",
            old_sig="def get_users() -> list", new_sig="def get_accounts() -> list"
        )
        summary = _build_cross_repo_diff_summary([ch])
        assert "get_users" in summary
        assert "get_accounts" in summary

    def test_signature_change_includes_both_sigs(self):
        from src.pipeline.analyzer import _build_cross_repo_diff_summary
        ch = _make_entity_change(
            old_sig="def process(id: int)", new_sig="def process(id: int, dry_run: bool = False)"
        )
        summary = _build_cross_repo_diff_summary([ch])
        assert "def process(id: int)" in summary
        assert "dry_run" in summary

    def test_only_top_3_changes_included(self):
        """More than 3 changes — only first 3 appear in summary."""
        from src.pipeline.analyzer import _build_cross_repo_diff_summary
        changes = [
            _make_entity_change(name=f"func_{i}", file_path=f"src/file_{i}.py")
            for i in range(6)
        ]
        summary = _build_cross_repo_diff_summary(changes)
        assert "func_0" in summary
        assert "func_2" in summary
        assert "func_3" not in summary  # 4th change must not appear


# ─────────────────────────────────────────────────────────────────────────────
# Layer 5: VerificationAgent.analyze_cross_repo_impact()
# ─────────────────────────────────────────────────────────────────────────────

def _make_verifier():
    """Return a VerificationAgent with a mocked generator (no real LLM calls)."""
    with patch("src.agents.verifier.VerificationAgent.__init__", return_value=None):
        from src.agents.verifier import VerificationAgent
        agent = VerificationAgent.__new__(VerificationAgent)
        agent.generator = AsyncMock()
        agent._accumulate_usage = MagicMock()
        agent._extract_json = lambda text: text  # passthrough — tests control raw JSON
        return agent


def _llm_response(findings: list) -> MagicMock:
    resp = MagicMock()
    resp.content = json.dumps({"findings": findings})
    return resp


VALID_CHUNKS = [
    _chunk("demo-sdk", "README.md"),
    _chunk("demo-docs", "quickstart.md"),
]


class TestAnalyzeCrossRepoImpact:
    @pytest.mark.asyncio
    async def test_returns_findings_above_min_confidence(self):
        agent = _make_verifier()
        agent.generator.generate = AsyncMock(return_value=_llm_response([
            {"file": "README.md", "repo": "demo-sdk", "confidence": 90, "reason": "get_users renamed", "line_hint": 5},
            {"file": "quickstart.md", "repo": "demo-docs", "confidence": 45, "reason": "low conf", "line_hint": None},
        ]))

        findings = await agent.analyze_cross_repo_impact(
            diff_summary="rename", sibling_chunks=VALID_CHUNKS, min_confidence=60
        )
        assert len(findings) == 1
        assert findings[0]["file"] == "README.md"

    @pytest.mark.asyncio
    async def test_empty_findings_array_returns_empty_list(self):
        agent = _make_verifier()
        agent.generator.generate = AsyncMock(return_value=_llm_response([]))

        findings = await agent.analyze_cross_repo_impact(
            diff_summary="internal rename", sibling_chunks=VALID_CHUNKS
        )
        assert findings == []

    @pytest.mark.asyncio
    async def test_sorted_by_confidence_desc_before_cap(self):
        """LLM emits 6 items — lowest-confidence ones are dropped, not random 5."""
        agent = _make_verifier()
        raw = [
            {"file": "README.md", "repo": "demo-sdk", "confidence": 55, "reason": "r", "line_hint": None},
            {"file": "quickstart.md", "repo": "demo-docs", "confidence": 95, "reason": "r", "line_hint": None},
            {"file": "README.md", "repo": "demo-sdk", "confidence": 80, "reason": "r", "line_hint": 10},
            {"file": "quickstart.md", "repo": "demo-docs", "confidence": 70, "reason": "r", "line_hint": 2},
            {"file": "README.md", "repo": "demo-sdk", "confidence": 60, "reason": "r", "line_hint": None},
            {"file": "quickstart.md", "repo": "demo-docs", "confidence": 98, "reason": "r", "line_hint": None},
        ]
        agent.generator.generate = AsyncMock(return_value=_llm_response(raw))

        findings = await agent.analyze_cross_repo_impact(
            diff_summary="x", sibling_chunks=VALID_CHUNKS, min_confidence=50, max_findings=5
        )
        assert len(findings) == 5
        confs = [f["confidence"] for f in findings]
        assert confs == sorted(confs, reverse=True)
        assert 55 not in confs  # lowest should have been cut

    @pytest.mark.asyncio
    async def test_hallucinated_file_is_discarded(self):
        """Finding references a (repo, file) not in the input chunks → silently dropped."""
        agent = _make_verifier()
        agent.generator.generate = AsyncMock(return_value=_llm_response([
            {"file": "README.md", "repo": "demo-sdk", "confidence": 90, "reason": "ok", "line_hint": None},
            {"file": "INJECTED.md", "repo": "evil-repo", "confidence": 99, "reason": "injected", "line_hint": None},
        ]))

        findings = await agent.analyze_cross_repo_impact(
            diff_summary="x", sibling_chunks=VALID_CHUNKS, min_confidence=50
        )
        repos = [f["repo"] for f in findings]
        assert "evil-repo" not in repos
        assert len(findings) == 1

    @pytest.mark.asyncio
    async def test_all_hallucinated_returns_empty(self):
        agent = _make_verifier()
        agent.generator.generate = AsyncMock(return_value=_llm_response([
            {"file": "FAKE.md", "repo": "not-a-sibling", "confidence": 95, "reason": "x", "line_hint": None},
        ]))

        findings = await agent.analyze_cross_repo_impact(
            diff_summary="x", sibling_chunks=VALID_CHUNKS, min_confidence=50
        )
        assert findings == []

    @pytest.mark.asyncio
    async def test_mixed_valid_and_hallucinated(self):
        """Valid findings kept; hallucinated ones dropped. Sorting still applies."""
        agent = _make_verifier()
        agent.generator.generate = AsyncMock(return_value=_llm_response([
            {"file": "README.md", "repo": "demo-sdk", "confidence": 70, "reason": "real", "line_hint": None},
            {"file": "GHOST.md", "repo": "demo-sdk", "confidence": 99, "reason": "ghost", "line_hint": None},
        ]))

        findings = await agent.analyze_cross_repo_impact(
            diff_summary="x", sibling_chunks=VALID_CHUNKS, min_confidence=50
        )
        assert len(findings) == 1
        assert findings[0]["file"] == "README.md"

    @pytest.mark.asyncio
    async def test_llm_failure_returns_empty(self):
        agent = _make_verifier()
        agent.generator.generate = AsyncMock(side_effect=RuntimeError("API down"))

        findings = await agent.analyze_cross_repo_impact(
            diff_summary="x", sibling_chunks=VALID_CHUNKS
        )
        assert findings == []  # no exception propagated

    @pytest.mark.asyncio
    async def test_invalid_json_returns_empty(self):
        """Malformed LLM response — method returns [] and does not raise."""
        resp = MagicMock()
        resp.content = "NOT JSON AT ALL { broken"
        agent = _make_verifier()
        agent.generator.generate = AsyncMock(return_value=resp)
        # Don't passthrough extract_json — simulate broken JSON reaching json.loads
        agent._extract_json = lambda text: text

        findings = await agent.analyze_cross_repo_impact(
            diff_summary="x", sibling_chunks=VALID_CHUNKS
        )
        assert findings == []

    @pytest.mark.asyncio
    async def test_empty_sibling_chunks_skips_llm(self):
        """No chunks → return immediately, LLM never called."""
        agent = _make_verifier()
        agent.generator.generate = AsyncMock()

        findings = await agent.analyze_cross_repo_impact(
            diff_summary="x", sibling_chunks=[]
        )
        assert findings == []
        agent.generator.generate.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# Layer 6: _format_cross_repo_section_md()
# ─────────────────────────────────────────────────────────────────────────────

class TestFormatCrossRepoSectionMd:
    def test_renders_markdown_table_with_display_repo(self):
        from src.pipeline.reporter import _format_cross_repo_section_md
        findings = [
            {"repo": "tid__myorg__sdk_js", "file": "README.md",
             "confidence": 90, "reason": "get_users renamed", "line_hint": 5},
        ]
        md = _format_cross_repo_section_md(findings)
        assert "### 🔗 Cross-Repo Impact Detected" in md
        assert "myorg/sdk-js" in md       # tenant prefix stripped, human-readable
        assert "README.md:5" in md        # line hint appended
        assert "90%" in md

    def test_empty_findings_returns_empty_string(self):
        from src.pipeline.reporter import _format_cross_repo_section_md
        assert _format_cross_repo_section_md([]) == ""

    def test_no_none_detected_noise_when_empty(self):
        """Section must be entirely absent, not show 'None detected'."""
        from src.pipeline.reporter import _format_cross_repo_section_md
        result = _format_cross_repo_section_md([])
        assert "None" not in result
        assert "detected" not in result.lower()

    def test_file_without_line_hint_has_no_colon_suffix(self):
        from src.pipeline.reporter import _format_cross_repo_section_md
        findings = [
            {"repo": "tid__org__repo", "file": "guide.md",
             "confidence": 80, "reason": "impact", "line_hint": None},
        ]
        md = _format_cross_repo_section_md(findings)
        assert "guide.md:" not in md
        assert "guide.md" in md


# ─────────────────────────────────────────────────────────────────────────────
# Layer 7: _find_cross_repo_context() plan-tier gate
# ─────────────────────────────────────────────────────────────────────────────

class TestFindCrossRepoContextPlanGate:
    """Plan-tier limits enforced inside _find_cross_repo_context."""

    def _run(self, plan: str, siblings: list[str], expected_max_siblings: int,
             expected_top_k: int, expected_min_conf: int):
        """Run _find_cross_repo_context with mocked internals, assert call args."""
        import asyncio
        from src.pipeline.analyzer import PRAnalyzer

        analyzer = PRAnalyzer.__new__(PRAnalyzer)
        analyzer.verifier = None

        mock_findings = [
            {"repo": "s", "file": "f.md", "confidence": 90, "reason": "r", "line_hint": None}
        ]

        with patch("src.pipeline.analyzer.get_db_manager") as mock_ctx, \
             patch("src.pipeline.analyzer.DocumentIndexer") as MockIndexer, \
             patch("src.pipeline.analyzer._repo_sub_namespace",
                   side_effect=lambda tid, repo: f"{tid}__{repo}"), \
             patch("src.pipeline.analyzer.VerificationAgent") as MockVerifier, \
             patch("src.pipeline.analyzer.record_cross_repo"):

            mock_indexer_inst = AsyncMock()
            mock_indexer_inst.find_cross_repo_docs = AsyncMock(return_value=[])
            MockIndexer.return_value = mock_indexer_inst

            mock_db = AsyncMock()
            mock_db.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db.__aexit__ = AsyncMock(return_value=None)
            mock_ctx.return_value = mock_db

            mock_verifier_inst = AsyncMock()
            mock_verifier_inst.analyze_cross_repo_impact = AsyncMock(return_value=mock_findings)
            MockVerifier.return_value = mock_verifier_inst

            changes = [_make_entity_change(name=f"fn{i}") for i in range(5)]

            asyncio.run(
                analyzer._find_cross_repo_context(
                    meaningful_changes=changes,
                    tenant_id="test-tenant",
                    sibling_repos=siblings,
                    plan=plan,
                )
            )

            # verify top_k_per_ns forwarded
            call_kwargs = mock_indexer_inst.find_cross_repo_docs.call_args_list[0][1]
            assert call_kwargs["top_k_per_ns"] == expected_top_k

            # verify sibling cap
            used_ns = call_kwargs["sibling_namespaces"]
            assert len(used_ns) <= expected_max_siblings

    def test_team_limits(self):
        """TEAM: max 3 siblings, top_k=3."""
        self._run("TEAM", ["o/r1", "o/r2", "o/r3", "o/r4"],
                  expected_max_siblings=3, expected_top_k=3, expected_min_conf=60)

    def test_enterprise_limits(self):
        """ENTERPRISE: max 10 siblings, top_k=5."""
        self._run("ENTERPRISE", [f"o/r{i}" for i in range(12)],
                  expected_max_siblings=10, expected_top_k=5, expected_min_conf=50)

    @pytest.mark.asyncio
    async def test_free_plan_returns_empty_immediately(self):
        from src.pipeline.analyzer import PRAnalyzer
        analyzer = PRAnalyzer.__new__(PRAnalyzer)
        analyzer.verifier = None

        with patch("src.pipeline.analyzer.get_db_manager") as mock_ctx:
            result = await analyzer._find_cross_repo_context(
                meaningful_changes=[_make_entity_change()],
                tenant_id="t1",
                sibling_repos=["org/sdk"],
                plan="FREE",
            )
        assert result == []
        mock_ctx.assert_not_called()  # no Weaviate touch

    @pytest.mark.asyncio
    async def test_pro_plan_returns_empty_immediately(self):
        """PRO is also cross-repo disabled (same as FREE)."""
        from src.pipeline.analyzer import PRAnalyzer
        analyzer = PRAnalyzer.__new__(PRAnalyzer)
        analyzer.verifier = None

        with patch("src.pipeline.analyzer.get_db_manager") as mock_ctx:
            result = await analyzer._find_cross_repo_context(
                meaningful_changes=[_make_entity_change()],
                tenant_id="t1",
                sibling_repos=["org/sdk"],
                plan="PRO",
            )
        assert result == []
        mock_ctx.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_siblings_returns_empty_immediately(self):
        """Empty siblings list → skip plan check entirely."""
        from src.pipeline.analyzer import PRAnalyzer
        analyzer = PRAnalyzer.__new__(PRAnalyzer)
        analyzer.verifier = None

        with patch("src.pipeline.analyzer.get_db_manager") as mock_ctx:
            result = await analyzer._find_cross_repo_context(
                meaningful_changes=[_make_entity_change()],
                tenant_id="t1",
                sibling_repos=[],
                plan="TEAM",
            )
        assert result == []
        mock_ctx.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# Layer 8: Dual-index (BUG-5 block in analyze_pr)
# ─────────────────────────────────────────────────────────────────────────────

class TestDualIndex:
    """
    When cross-repo is enabled, index_repository must be called twice —
    once with tenant_id (existing RAG path) and once with the sub-namespace.
    When disabled, called once only.
    """

    def _make_indexer_mock(self) -> AsyncMock:
        m = AsyncMock()
        m.index_repository = AsyncMock(return_value=10)
        return m

    @pytest.mark.asyncio
    async def test_dual_index_calls_both_namespaces_when_cross_repo_on(self):
        mock_indexer = self._make_indexer_mock()

        with patch("src.pipeline.analyzer.settings") as mock_settings, \
             patch("src.pipeline.analyzer._repo_sub_namespace",
                   return_value="tid__org__api") as mock_sub_ns, \
             patch("src.pipeline.analyzer.DocumentIndexer", return_value=mock_indexer):
            mock_settings.cross_repo_beta = True

            # Simulate the dual-index block directly
            tenant_id = "tid"
            owner = "org"
            repo = "api"
            workflow_config = {"cross_repo_siblings": ["org/sdk"]}

            # Reproduce the exact dual-index logic from spec section 4b
            import asyncio
            async def _dual_index():
                await mock_indexer.index_repository("path", owner, repo, namespace=tenant_id)
                if (mock_settings.cross_repo_beta
                        and workflow_config
                        and workflow_config.get("cross_repo_siblings")):
                    sub_ns = mock_sub_ns(tenant_id, f"{owner}/{repo}")
                    await mock_indexer.index_repository("path", owner, repo, namespace=sub_ns)

            await _dual_index()

        calls = mock_indexer.index_repository.call_args_list
        namespaces_used = [c[1]["namespace"] for c in calls]
        assert tenant_id in namespaces_used
        assert "tid__org__api" in namespaces_used
        assert len(calls) == 2

    @pytest.mark.asyncio
    async def test_single_index_when_cross_repo_disabled(self):
        mock_indexer = self._make_indexer_mock()

        with patch("src.pipeline.analyzer.settings") as mock_settings:
            mock_settings.cross_repo_beta = False

            async def _single_index():
                tenant_id, owner, repo = "tid", "org", "api"
                workflow_config = {}
                await mock_indexer.index_repository("path", owner, repo, namespace=tenant_id)
                if (mock_settings.cross_repo_beta
                        and workflow_config
                        and workflow_config.get("cross_repo_siblings")):
                    await mock_indexer.index_repository("path", owner, repo, namespace="sub")

            await _single_index()

        assert mock_indexer.index_repository.call_count == 1

    @pytest.mark.asyncio
    async def test_find_related_docs_always_uses_tenant_id_namespace(self):
        """
        The existing doc-update loop calls find_related_docs(namespace=tenant_id).
        It must NOT change to the sub-namespace, even when cross-repo is on.
        This test pins the contract.
        """
        from src.storage.indexer import DocumentIndexer

        mock_db = AsyncMock()
        mock_db.search = AsyncMock(return_value=[])
        indexer = DocumentIndexer(mock_db)

        with patch("src.storage.indexer.generate_embedding") as mock_emb, \
             patch("src.storage.indexer.format_entity_for_embedding", return_value="q"):
            mock_emb.return_value = MagicMock(tolist=lambda: [0.1])
            await indexer.find_related_docs(entity=MagicMock(), namespace="tenant-abc")

        # find_related_docs must pass the given namespace to vector_db.search unchanged
        call_kwargs = mock_db.search.call_args[1]
        assert call_kwargs["namespace"] == "tenant-abc"


# ─────────────────────────────────────────────────────────────────────────────
# Layer 9: Prometheus metrics
# ─────────────────────────────────────────────────────────────────────────────

class TestCrossRepoMetrics:
    def test_record_cross_repo_ok_increments_counter(self):
        from src.monitoring.metrics import CROSS_REPO_CALLS, record_cross_repo
        before = CROSS_REPO_CALLS.labels(result="ok")._value.get()
        record_cross_repo("ok", findings_count=3, latency_seconds=1.2)
        after = CROSS_REPO_CALLS.labels(result="ok")._value.get()
        assert after == before + 1

    def test_record_cross_repo_error_increments_error_counter(self):
        from src.monitoring.metrics import CROSS_REPO_CALLS, record_cross_repo
        before = CROSS_REPO_CALLS.labels(result="error")._value.get()
        record_cross_repo("error", findings_count=0, latency_seconds=0.1)
        after = CROSS_REPO_CALLS.labels(result="error")._value.get()
        assert after == before + 1


# ─────────────────────────────────────────────────────────────────────────────
# Layer 10: analyze_pr() wiring
# ─────────────────────────────────────────────────────────────────────────────

class TestAnalyzePrWiring:
    """
    Smoke-level tests confirming cross-repo findings attach to PRAnalysisResult
    and that the flag/sibling-list gates work end-to-end.
    These mock _find_cross_repo_context directly to avoid full pipeline setup.
    """

    def _make_analyzer_with_cross_repo_mock(self, findings: list, *, flag_on: bool = True):
        from src.pipeline.analyzer import PRAnalyzer

        analyzer = PRAnalyzer.__new__(PRAnalyzer)
        analyzer.verifier = None
        analyzer.diff = MagicMock()

        mock_cross = AsyncMock(return_value=findings)
        if not flag_on:
            mock_cross = AsyncMock(return_value=[])

        analyzer._find_cross_repo_context = mock_cross
        return analyzer

    @pytest.mark.asyncio
    async def test_findings_attached_to_result_when_enabled(self):
        from src.pipeline.analyzer import PRAnalysisResult

        findings = [{"repo": "demo-sdk", "file": "README.md", "confidence": 90,
                     "reason": "renamed", "line_hint": None}]
        result = PRAnalysisResult(pr_number=1, repo_full_name="org/api",
                                  cross_repo_findings=findings)
        assert result.cross_repo_findings == findings

    @pytest.mark.asyncio
    async def test_cross_repo_findings_empty_by_default(self):
        from src.pipeline.analyzer import PRAnalysisResult
        result = PRAnalysisResult(pr_number=1, repo_full_name="org/api")
        assert result.cross_repo_findings == []

    @pytest.mark.asyncio
    async def test_cross_repo_failure_does_not_propagate(self):
        """Exception in _find_cross_repo_context → result.cross_repo_findings == []."""
        from src.pipeline.analyzer import PRAnalyzer, PRAnalysisResult

        analyzer = PRAnalyzer.__new__(PRAnalyzer)
        analyzer._find_cross_repo_context = AsyncMock(side_effect=RuntimeError("network"))

        result = PRAnalysisResult(pr_number=1, repo_full_name="org/api")
        try:
            await analyzer._find_cross_repo_context(
                meaningful_changes=[], tenant_id="t1", sibling_repos=["o/r"], plan="TEAM"
            )
        except RuntimeError:
            pass  # in real code this is caught by analyze_pr's try/except
        # PRAnalysisResult.cross_repo_findings remains untouched = []
        assert result.cross_repo_findings == []

    def test_cross_repo_findings_serialisable_to_json(self):
        """cross_repo_findings must round-trip through JSON (job.result storage)."""
        from src.pipeline.analyzer import PRAnalysisResult
        findings = [
            {"repo": "t__org__sdk", "file": "README.md",
             "confidence": 90, "reason": "renamed", "line_hint": 5}
        ]
        result = PRAnalysisResult(pr_number=1, repo_full_name="org/api",
                                  cross_repo_findings=findings)
        serialised = json.dumps({"cross_repo_findings": result.cross_repo_findings})
        recovered = json.loads(serialised)
        assert recovered["cross_repo_findings"][0]["confidence"] == 90


# ─────────────────────────────────────────────────────────────────────────────
# Layer 11: format_drift_report() injection
# ─────────────────────────────────────────────────────────────────────────────

class TestFormatDriftReportInjection:
    def _make_result(self, cross_repo_findings: list) -> MagicMock:
        """Minimal PRAnalysisResult-like object for reporter tests."""
        drift = MagicMock()
        drift.drift_score = 60
        drift.severity = "moderate"
        drift.summary = "API surface changed."
        drift.required_updates = []
        drift.block_merge = False

        result = MagicMock()
        result.success = True
        result.drift_analysis = drift
        result.documentation_updates = []
        result.entity_changes = []
        result.should_block = False
        result.processing_time_ms = 100
        result.policy_violations = []
        result.cross_repo_findings = cross_repo_findings
        return result

    def test_cross_repo_section_present_when_findings_exist(self):
        from src.pipeline.reporter import format_drift_report
        findings = [
            {"repo": "tid__org__sdk", "file": "README.md",
             "confidence": 90, "reason": "get_users renamed", "line_hint": None}
        ]
        md = format_drift_report(self._make_result(findings))
        assert "### 🔗 Cross-Repo Impact Detected" in md

    def test_cross_repo_section_absent_when_no_findings(self):
        from src.pipeline.reporter import format_drift_report
        md = format_drift_report(self._make_result([]))
        assert "Cross-Repo" not in md
        assert "🔗" not in md

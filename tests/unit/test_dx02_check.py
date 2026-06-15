"""
DX-02: /check endpoint unit tests.

Coverage:
1. Valid request with semantic changes → DriftAnalysis returned
2. Valid request, no semantic changes → severity=none, no LLM call
3. Missing Authorization header → 401
4. Wrong API key → 401
5. No tenant matches the API key → 401
6. Multiple files → all entity changes collected and returned
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.agents.verifier import DriftAnalysis
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity
from src.main import app
from src.pipeline.job_manager import get_db

# ── Helpers ───────────────────────────────────────────────────────────────────

VALID_KEY = "dg_" + "a" * 48
TENANT_ID = "tenant-test-001"


def _make_tenant(workflow_config: dict | None = None) -> MagicMock:
    tenant = MagicMock()
    tenant.id = TENANT_ID
    tenant.workflowConfig = workflow_config
    tenant.llmConfig = None
    tenant.billingConfig = None
    return tenant


def _make_entity_change(
    name: str = "my_func", change_type: ChangeType = ChangeType.LOGIC_MODIFIED
) -> EntityChange:
    entity = CodeEntity(
        name=name,
        entity_type="function",
        file_path="src/utils.py",
        start_line=1,
        end_line=10,
        content="def my_func(): pass",
    )
    return EntityChange(entity=entity, change_type=change_type)


def _make_drift_analysis(severity: str = "moderate", score: int = 55) -> DriftAnalysis:
    return DriftAnalysis(
        drift_score=score,
        severity=severity,
        required_updates=[{"file": "docs/utils.md", "action": "update"}],
        block_merge=False,
        summary="Function logic changed, docs may be stale.",
    )


def _db_override(tenant: MagicMock):
    """Build a get_db dependency override.
    _get_tenant_by_api_key calls .filter().all() to scan tenants by API key.
    """

    def _override():
        session = MagicMock()
        session.query.return_value.filter.return_value.all.return_value = [tenant]
        yield session

    return _override


def _empty_db_override():
    """get_db override that finds no tenant with a matching API key → 401."""

    def _override():
        session = MagicMock()
        session.query.return_value.filter.return_value.all.return_value = []
        yield session

    return _override


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _allow_check_rate_limit():
    """SEC-COST-01 Layer 2: these tests aren't about rate limiting — allow by default
    (also avoids any real Redis call). Tests that exercise the 429 path re-patch it."""
    with patch("src.api.check.check_rate_limit", return_value=(True, "")):
        yield


@pytest.mark.asyncio
async def test_check_returns_drift_result_for_valid_request():
    """Valid API key + staged changes → returns severity and entity_changes."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    changes = [_make_entity_change()]
    drift = _make_drift_analysis(severity="moderate")

    app.dependency_overrides[get_db] = _db_override(tenant)
    try:
        with (
            patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
            patch(
                "src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/check",
                    json={
                        "files": [
                            {"path": "src/utils.py", "old_content": "old", "new_content": "new"}
                        ]
                    },
                    headers={"Authorization": f"Bearer {VALID_KEY}"},
                )
    finally:
        del app.dependency_overrides[get_db]

    assert res.status_code == 200
    data = res.json()
    assert data["severity"] == "moderate"
    assert data["drift_score"] == 55
    assert data["files_analyzed"] == 1
    assert len(data["entity_changes"]) == 1
    assert data["entity_changes"][0]["entity"] == "my_func"
    assert data["entity_changes"][0]["change_type"] == "logic_modified"


@pytest.mark.asyncio
async def test_check_returns_none_when_no_semantic_changes():
    """No entity changes detected → returns severity=none without calling LLM."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})

    app.dependency_overrides[get_db] = _db_override(tenant)
    try:
        with (
            patch("src.api.check.SemanticDiff.diff_files", return_value=[]),
            patch("src.api.check.VerificationAgent") as mock_agent_cls,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/check",
                    json={
                        "files": [{"path": "src/utils.py", "old_content": "x", "new_content": "x"}]
                    },
                    headers={"Authorization": f"Bearer {VALID_KEY}"},
                )
    finally:
        del app.dependency_overrides[get_db]

    assert res.status_code == 200
    data = res.json()
    assert data["severity"] == "none"
    assert data["drift_score"] == 0
    assert data["entity_changes"] == []
    # VerificationAgent should not have been instantiated
    mock_agent_cls.assert_not_called()


@pytest.mark.asyncio
async def test_check_rejects_missing_authorization():
    """Missing Authorization header → 401."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})

    app.dependency_overrides[get_db] = _db_override(tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(
                "/check",
                json={"files": []},
            )
    finally:
        del app.dependency_overrides[get_db]

    assert res.status_code == 401


@pytest.mark.asyncio
async def test_check_rejects_wrong_api_key():
    """Wrong API key → no matching tenant → 401."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})

    app.dependency_overrides[get_db] = _db_override(tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(
                "/check",
                json={"files": []},
                headers={"Authorization": "Bearer dg_wrongkeyvalue"},
            )
    finally:
        del app.dependency_overrides[get_db]

    assert res.status_code == 401


@pytest.mark.asyncio
async def test_check_returns_401_when_no_tenant_has_matching_key():
    """No tenant in DB has the provided API key → 401 (was 404 in old flow)."""
    app.dependency_overrides[get_db] = _empty_db_override()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(
                "/check",
                json={"files": []},
                headers={"Authorization": f"Bearer {VALID_KEY}"},
            )
    finally:
        del app.dependency_overrides[get_db]

    assert res.status_code == 401


@pytest.mark.asyncio
async def test_check_aggregates_changes_across_multiple_files():
    """Multiple files → all entity changes from all files are returned."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    changes_file1 = [_make_entity_change("func_a")]
    changes_file2 = [_make_entity_change("func_b"), _make_entity_change("func_c")]
    drift = _make_drift_analysis(severity="significant", score=75)

    def _diff_files_side_effect(old_c: str, new_c: str, file_path: str):
        if "file1" in file_path:
            return changes_file1
        return changes_file2

    app.dependency_overrides[get_db] = _db_override(tenant)
    try:
        with (
            patch("src.api.check.SemanticDiff.diff_files", side_effect=_diff_files_side_effect),
            patch(
                "src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/check",
                    json={
                        "files": [
                            {"path": "src/file1.py", "old_content": "old", "new_content": "new"},
                            {"path": "src/file2.py", "old_content": "old", "new_content": "new"},
                        ]
                    },
                    headers={"Authorization": f"Bearer {VALID_KEY}"},
                )
    finally:
        del app.dependency_overrides[get_db]

    assert res.status_code == 200
    data = res.json()
    assert data["files_analyzed"] == 2
    entities = {c["entity"] for c in data["entity_changes"]}
    assert entities == {"func_a", "func_b", "func_c"}


# ── SEC-COST-01 Layer 2: per-tenant rate limit ────────────────────────────────


@pytest.mark.asyncio
async def test_check_returns_429_when_rate_limited():
    """Rate-limited tenant → 429 + 'Plugin check rejected' log with status=rate_limited."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    tenant.plan = "FREE"

    app.dependency_overrides[get_db] = _db_override(tenant)
    try:
        with (
            patch(
                "src.api.check.check_rate_limit",
                return_value=(False, "Daily check limit reached (100/day on the Free plan)."),
            ),
            patch("src.api.check.logger") as mock_log,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/check",
                    json={"files": [{"path": "a.py", "old_content": "x", "new_content": "y"}]},
                    headers={"Authorization": f"Bearer {VALID_KEY}"},
                )
            assert res.status_code == 429
            assert "limit" in res.json()["detail"].lower()
            assert any(
                c.args[:1] == ("Plugin check rejected",) and c.kwargs.get("status") == "rate_limited"
                for c in mock_log.warning.call_args_list
            ), f"expected rate_limited rejection log, got {mock_log.warning.call_args_list}"
    finally:
        del app.dependency_overrides[get_db]


# ── Observability: structured log line per call (tenant_id + status) ───────────


@pytest.mark.asyncio
async def test_check_logs_rejection_on_invalid_key():
    """A 401 emits a 'Plugin check rejected' warning with status=unauthorized (no key material)."""
    app.dependency_overrides[get_db] = _empty_db_override()
    try:
        with patch("src.api.check.logger") as mock_log:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/check",
                    json={"files": []},
                    headers={"Authorization": f"Bearer {VALID_KEY}"},
                )
            assert res.status_code == 401
            assert any(
                c.args[:1] == ("Plugin check rejected",)
                and c.kwargs.get("status") == "unauthorized"
                and c.kwargs.get("reason") == "invalid_key"
                for c in mock_log.warning.call_args_list
            ), f"expected rejection log, got {mock_log.warning.call_args_list}"
            # Ensure no key material is ever logged
            for c in mock_log.warning.call_args_list:
                assert VALID_KEY not in str(c)
    finally:
        del app.dependency_overrides[get_db]


@pytest.mark.asyncio
async def test_check_logs_completion_with_tenant_and_status():
    """A successful call emits 'Plugin check complete' with tenant_id + status=ok."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    changes = [_make_entity_change()]
    drift = _make_drift_analysis()

    app.dependency_overrides[get_db] = _db_override(tenant)
    try:
        with (
            patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
            patch(
                "src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)
            ),
            patch("src.api.check.logger") as mock_log,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/check",
                    json={
                        "files": [{"path": "src/utils.py", "old_content": "o", "new_content": "n"}]
                    },
                    headers={"Authorization": f"Bearer {VALID_KEY}"},
                )
            assert res.status_code == 200
            assert any(
                c.args[:1] == ("Plugin check complete",)
                and c.kwargs.get("status") == "ok"
                and c.kwargs.get("tenant_id") == TENANT_ID
                for c in mock_log.info.call_args_list
            ), f"expected completion log, got {mock_log.info.call_args_list}"
    finally:
        del app.dependency_overrides[get_db]

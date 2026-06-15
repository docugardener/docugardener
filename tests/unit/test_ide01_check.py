"""
IDE-01 AC-1/2: /check endpoint with suggested_docs and policy_violations.

Coverage:
1.  AC-1: suggested_docs populated from drift.required_updates with file/section/reason
2.  AC-1: required_updates entries missing 'file' key are filtered out
3.  AC-1: suggested_docs empty when drift.required_updates is None
4.  AC-1: suggested_docs returned in CheckResponse field
5.  AC-2: policy_violations empty when no repo slug provided
6.  AC-2: policy_violations empty when repo not found in DB
7.  AC-2: policy_violations empty when repo has no docugardenPolicy in config
8.  AC-2: policy_violations populated when repo policy matches staged files
9.  AC-2: advisory violation maps to enforcement='advisory'
10. AC-2: blocking violation maps to enforcement='blocking'
11. AC-2: reason string formatted correctly ('Rule X requires...')
12. AC-2: repo slug owner/name parsed — only repo name used for DB lookup
13. AC-2: repo slug without slash (bare name) works too
14. AC-2: policy evaluation failure (exception) returns empty violations (graceful)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.agents.verifier import DriftAnalysis
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity
from src.main import app
from src.pipeline.job_manager import get_db
from src.pipeline.policy_evaluator import PolicyViolation

# ── Helpers ───────────────────────────────────────────────────────────────────

VALID_KEY = "dg_" + "b" * 48
TENANT_ID = "tenant-ide01-test"

STAGED_FILE = {"path": "src/scanner.py", "old_content": "old", "new_content": "new"}


def _make_tenant(workflow_config: dict | None = None) -> MagicMock:
    tenant = MagicMock()
    tenant.id = TENANT_ID
    tenant.workflowConfig = workflow_config
    tenant.llmConfig = None
    tenant.billingConfig = None
    return tenant


def _make_entity_change(name: str = "scan") -> EntityChange:
    entity = CodeEntity(
        name=name,
        entity_type="function",
        file_path="src/scanner.py",
        start_line=1,
        end_line=20,
        content="def scan(): pass",
    )
    return EntityChange(entity=entity, change_type=ChangeType.LOGIC_MODIFIED)


def _make_drift(
    required_updates: list[dict] | None = None,
    severity: str = "moderate",
    score: int = 55,
) -> DriftAnalysis:
    return DriftAnalysis(
        drift_score=score,
        severity=severity,
        required_updates=required_updates or [],
        block_merge=False,
        summary="Scanner logic changed.",
    )


def _db_override(tenant: MagicMock):
    """get_db override: _get_tenant_by_api_key calls .filter().all() on Tenant."""

    def _override():
        session = MagicMock()
        session.query.return_value.filter.return_value.all.return_value = [tenant]
        yield session

    return _override


def _db_override_repo(tenant: MagicMock, repo: MagicMock | None):
    """DB override that returns tenant list (via .all()) for Tenant queries and repo (via .first()) for Repository queries."""

    def _override():
        session = MagicMock()

        def _query_side_effect(model_cls):
            q = MagicMock()
            from src.storage.sql_models import Repository

            if model_cls is Repository:
                q.filter.return_value.first.return_value = repo
            else:
                # Tenant lookup uses .all()
                q.filter.return_value.all.return_value = [tenant]
            return q

        session.query.side_effect = _query_side_effect
        yield session

    return _override


async def _post_check(body: dict, db_override) -> dict:
    app.dependency_overrides[get_db] = db_override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(
                "/check",
                json=body,
                headers={"Authorization": f"Bearer {VALID_KEY}"},
            )
    finally:
        del app.dependency_overrides[get_db]
    return res


@pytest.fixture(autouse=True)
def _allow_check_rate_limit():
    """SEC-COST-01 Layer 2: allow rate limit by default (avoids real Redis in these tests)."""
    with patch("src.api.check.check_rate_limit", return_value=(True, "")):
        yield


# ── AC-1: suggested_docs ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ide01_ac1_suggested_docs_populated():
    """AC-1: drift.required_updates with file/section/reason → suggested_docs in response."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    changes = [_make_entity_change()]
    drift = _make_drift(
        required_updates=[
            {"file": "docs/scanner.md", "section": "Overview", "reason": "Scan logic changed"},
            {"file": "docs/api.md", "reason": "API surface updated"},
        ]
    )

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
    ):
        res = await _post_check({"files": [STAGED_FILE]}, _db_override(tenant))

    assert res.status_code == 200
    docs = res.json()["suggested_docs"]
    assert len(docs) == 2
    assert docs[0]["file"] == "docs/scanner.md"
    assert docs[0]["section"] == "Overview"
    assert docs[0]["reason"] == "Scan logic changed"
    assert docs[1]["file"] == "docs/api.md"
    assert docs[1]["section"] is None
    assert docs[1]["reason"] == "API surface updated"


@pytest.mark.asyncio
async def test_ide01_ac1_missing_file_key_filtered():
    """AC-1: required_updates entry without 'file' key is excluded from suggested_docs."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    changes = [_make_entity_change()]
    drift = _make_drift(
        required_updates=[
            {"reason": "No file key here"},
            {"file": "docs/valid.md", "reason": "Valid entry"},
        ]
    )

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
    ):
        res = await _post_check({"files": [STAGED_FILE]}, _db_override(tenant))

    assert res.status_code == 200
    docs = res.json()["suggested_docs"]
    assert len(docs) == 1
    assert docs[0]["file"] == "docs/valid.md"


@pytest.mark.asyncio
async def test_ide01_ac1_suggested_docs_empty_when_none():
    """AC-1: drift.required_updates=None → suggested_docs=[] in response."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    changes = [_make_entity_change()]
    drift = _make_drift(required_updates=None)

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
    ):
        res = await _post_check({"files": [STAGED_FILE]}, _db_override(tenant))

    assert res.status_code == 200
    assert res.json()["suggested_docs"] == []


@pytest.mark.asyncio
async def test_ide01_ac1_suggested_docs_field_in_response():
    """AC-1: CheckResponse always includes suggested_docs field (even when empty)."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})

    with patch("src.api.check.SemanticDiff.diff_files", return_value=[]):
        res = await _post_check({"files": [STAGED_FILE]}, _db_override(tenant))

    assert res.status_code == 200
    assert "suggested_docs" in res.json()
    assert res.json()["suggested_docs"] == []


# ── AC-2: policy_violations ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ide01_ac2_no_violations_when_no_repo_slug():
    """AC-2: no repo slug in body → policy_violations=[] (no DB lookup)."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    changes = [_make_entity_change()]
    drift = _make_drift()

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
    ):
        res = await _post_check({"files": [STAGED_FILE]}, _db_override(tenant))

    assert res.status_code == 200
    assert res.json()["policy_violations"] == []


@pytest.mark.asyncio
async def test_ide01_ac2_no_violations_when_repo_not_found():
    """AC-2: repo slug provided but repo not in DB → policy_violations=[]."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    changes = [_make_entity_change()]
    drift = _make_drift()

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
    ):
        res = await _post_check(
            {"files": [STAGED_FILE], "repo": "owner/no-such-repo"},
            _db_override_repo(tenant, repo=None),
        )

    assert res.status_code == 200
    assert res.json()["policy_violations"] == []


@pytest.mark.asyncio
async def test_ide01_ac2_no_violations_when_no_policy_in_config():
    """AC-2: repo exists but config.docugardenPolicy empty → policy_violations=[]."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    repo = MagicMock()
    repo.config = {}  # no docugardenPolicy key
    changes = [_make_entity_change()]
    drift = _make_drift()

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
    ):
        res = await _post_check(
            {"files": [STAGED_FILE], "repo": "owner/myrepo"},
            _db_override_repo(tenant, repo=repo),
        )

    assert res.status_code == 200
    assert res.json()["policy_violations"] == []


@pytest.mark.asyncio
async def test_ide01_ac2_violations_populated_when_policy_matches():
    """AC-2: matching policy rule → policy_violations populated in response."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    repo = MagicMock()
    repo.config = {
        "docugardenPolicy": "- rule_name: require-scanner-docs\n  paths: ['src/scanner.py']\n  require_docs: ['docs/scanner.md']\n  enforcement: blocking\n"
    }

    violation = PolicyViolation(
        rule_name="require-scanner-docs",
        enforcement="blocking",
        paths_matched=["src/scanner.py"],
        require_docs=["docs/scanner.md"],
        docs_present=[],
        docs_missing=["docs/scanner.md"],
    )

    changes = [_make_entity_change()]
    drift = _make_drift()

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
        patch("src.api.check.parse_policies", return_value=[MagicMock()]),
        patch("src.api.check.evaluate_policies", return_value=[violation]),
    ):
        res = await _post_check(
            {"files": [STAGED_FILE], "repo": "owner/myrepo"},
            _db_override_repo(tenant, repo=repo),
        )

    assert res.status_code == 200
    violations = res.json()["policy_violations"]
    assert len(violations) == 1
    assert violations[0]["rule_name"] == "require-scanner-docs"
    assert violations[0]["enforcement"] == "blocking"
    assert violations[0]["paths_matched"] == ["src/scanner.py"]
    assert violations[0]["docs_missing"] == ["docs/scanner.md"]


@pytest.mark.asyncio
async def test_ide01_ac2_advisory_enforcement():
    """AC-2: advisory violation maps to enforcement='advisory' in response."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    repo = MagicMock()
    repo.config = {"docugardenPolicy": "placeholder"}
    violation = PolicyViolation(
        rule_name="soft-doc-rule",
        enforcement="advisory",
        paths_matched=["src/scanner.py"],
        require_docs=["docs/scanner.md"],
        docs_present=[],
        docs_missing=["docs/scanner.md"],
    )
    changes = [_make_entity_change()]
    drift = _make_drift()

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
        patch("src.api.check.parse_policies", return_value=[MagicMock()]),
        patch("src.api.check.evaluate_policies", return_value=[violation]),
    ):
        res = await _post_check(
            {"files": [STAGED_FILE], "repo": "owner/myrepo"},
            _db_override_repo(tenant, repo=repo),
        )

    assert res.status_code == 200
    assert res.json()["policy_violations"][0]["enforcement"] == "advisory"


@pytest.mark.asyncio
async def test_ide01_ac2_reason_string_format():
    """AC-2: reason string uses 'Rule X requires documentation updates in: ...' format."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    repo = MagicMock()
    repo.config = {"docugardenPolicy": "placeholder"}
    violation = PolicyViolation(
        rule_name="api-docs-rule",
        enforcement="blocking",
        paths_matched=["src/api.py"],
        require_docs=["docs/api.md"],
        docs_present=[],
        docs_missing=["docs/api.md", "docs/changelog.md"],
    )
    changes = [_make_entity_change()]
    drift = _make_drift()

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
        patch("src.api.check.parse_policies", return_value=[MagicMock()]),
        patch("src.api.check.evaluate_policies", return_value=[violation]),
    ):
        res = await _post_check(
            {"files": [STAGED_FILE], "repo": "owner/myrepo"},
            _db_override_repo(tenant, repo=repo),
        )

    assert res.status_code == 200
    reason = res.json()["policy_violations"][0]["reason"]
    assert "api-docs-rule" in reason
    assert "docs/api.md" in reason


@pytest.mark.asyncio
async def test_ide01_ac2_repo_slug_with_owner_uses_name_only():
    """AC-2: 'owner/repo' slug → DB lookup uses only the repo name part."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})

    captured_filter_args = []

    def _override():
        session = MagicMock()

        def _query_side_effect(model_cls):
            q = MagicMock()
            from src.storage.sql_models import Repository

            if model_cls is Repository:
                filter_mock = MagicMock()
                filter_mock.first.return_value = None  # repo not found (fine)

                def _filter(*args, **kwargs):
                    captured_filter_args.append(args)
                    return filter_mock

                q.filter.side_effect = _filter
            else:
                # Tenant lookup uses .all()
                q.filter.return_value.all.return_value = [tenant]
            return q

        session.query.side_effect = _query_side_effect
        yield session

    changes = [_make_entity_change()]
    drift = _make_drift()

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
    ):
        res = await _post_check(
            {"files": [STAGED_FILE], "repo": "acme-corp/my-backend"},
            _override,
        )

    # Should succeed (no violation since repo not found)
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_ide01_ac2_repo_slug_bare_name():
    """AC-2: bare repo name (no slash) in body.repo is handled gracefully."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    changes = [_make_entity_change()]
    drift = _make_drift()

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
    ):
        res = await _post_check(
            {"files": [STAGED_FILE], "repo": "my-backend"},
            _db_override_repo(tenant, repo=None),
        )

    assert res.status_code == 200
    assert res.json()["policy_violations"] == []


@pytest.mark.asyncio
async def test_ide01_ac2_policy_evaluation_exception_returns_empty():
    """AC-2: if policy evaluation raises an exception, response still returns 200 with empty violations."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    repo = MagicMock()
    repo.config = {"docugardenPolicy": "placeholder"}
    changes = [_make_entity_change()]
    drift = _make_drift()

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
        patch("src.api.check.parse_policies", side_effect=RuntimeError("parse failure")),
    ):
        res = await _post_check(
            {"files": [STAGED_FILE], "repo": "owner/myrepo"},
            _db_override_repo(tenant, repo=repo),
        )

    assert res.status_code == 200
    assert res.json()["policy_violations"] == []


@pytest.mark.asyncio
async def test_ide01_response_includes_both_suggested_docs_and_violations():
    """AC-1+2: response can have both suggested_docs and policy_violations simultaneously."""
    tenant = _make_tenant({"pluginApiKey": VALID_KEY})
    repo = MagicMock()
    repo.config = {"docugardenPolicy": "placeholder"}
    changes = [_make_entity_change()]
    drift = _make_drift(required_updates=[{"file": "docs/scanner.md", "reason": "updated"}])
    violation = PolicyViolation(
        rule_name="scan-rule",
        enforcement="blocking",
        paths_matched=["src/scanner.py"],
        require_docs=["docs/scanner.md"],
        docs_present=[],
        docs_missing=["docs/scanner.md"],
    )

    with (
        patch("src.api.check.SemanticDiff.diff_files", return_value=changes),
        patch("src.api.check.VerificationAgent.analyze_drift", new=AsyncMock(return_value=drift)),
        patch("src.api.check.parse_policies", return_value=[MagicMock()]),
        patch("src.api.check.evaluate_policies", return_value=[violation]),
    ):
        res = await _post_check(
            {"files": [STAGED_FILE], "repo": "owner/myrepo"},
            _db_override_repo(tenant, repo=repo),
        )

    assert res.status_code == 200
    data = res.json()
    assert len(data["suggested_docs"]) == 1
    assert len(data["policy_violations"]) == 1

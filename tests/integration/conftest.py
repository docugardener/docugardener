"""
Shared fixtures and helpers for all E2E integration tests.

Architecture:
  - In-memory SQLite replaces PostgreSQL for every test.
  - Both `src.pipeline.job_manager.SessionLocal` and
    `src.worker.context.SessionLocal` are patched with the testing factory
    so that every DB-touching path (webhook handler, pipeline, job_manager)
    reads from and writes to the same isolated in-memory database.
  - `job_manager._session_factory` is also redirected to the same factory
    because the JobManager object captures the session factory at import
    time (before the patch can take effect at module level).
  - The RQ queue (`get_queue`) is always mocked — no Redis required.
  - GitHub API, LLM, and external HTTP calls are never made to real servers.
"""

import hashlib
import hmac
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.main import app
from src.pipeline.analyzer import DocumentationDraft, DriftAnalysis, PRAnalysisResult
from src.storage.sql_models import Base, Tenant

# ── In-memory SQLite ──────────────────────────────────────────────────────────

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def fresh_schema():
    """Recreate all tables before each test and drop them after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


# ── Tenant seed ───────────────────────────────────────────────────────────────

INSTALLATION_ID = 99999
TENANT_ID = "tenant-e2e"
REPO_NAME = "myrepo"
REPO_FULL_NAME = "org/myrepo"


@pytest.fixture()
def seed_tenant():
    """
    Create a minimal Tenant with full credentials in the test DB.
    Returns the tenant_id string.
    """
    db = TestingSessionLocal()
    try:
        tenant = Tenant(
            id=TENANT_ID,
            name="E2E Org",
            githubOrgId="11111",
            installationId=str(INSTALLATION_ID),
            appId="777",
            privateKey="enc_pk",
            workflowConfig={},
        )
        db.add(tenant)
        db.commit()
        tenant_id = tenant.id
    finally:
        db.close()
    return tenant_id


@pytest.fixture()
def seed_tenant_with_slack(seed_tenant):
    """Extend the seeded tenant with a Slack webhookUrl config and PRO plan.
    Slack is a PRO+ feature; the plan must be non-FREE for the feature gate to pass."""
    db = TestingSessionLocal()
    try:
        t = db.query(Tenant).filter(Tenant.id == seed_tenant).first()
        t.plan = "PRO"
        t.workflowConfig = {"slack": {"webhookUrl": "enc_slack_url"}}
        db.commit()
    finally:
        db.close()
    return seed_tenant


# ── HMAC helper ───────────────────────────────────────────────────────────────

WEBHOOK_SECRET = "test-webhook-secret"


def make_signature(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    """Return a valid `sha256=<hex>` HMAC signature for a payload."""
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


# ── Mock result factory ───────────────────────────────────────────────────────


def make_analysis_result(
    pr_number: int = 42,
    score: int = 60,
    severity: str = "moderate",
    block_merge: bool = False,
    doc_updates: int = 1,
) -> PRAnalysisResult:
    """Build a realistic PRAnalysisResult for use in pipeline mocks."""
    drift = DriftAnalysis(
        drift_score=score,
        severity=severity,
        required_updates=[{"section": "process()", "reason": "signature changed"}],
        block_merge=block_merge,
        summary="API surface changed.",
    )
    updates = [
        DocumentationDraft(
            entity_name="TestEntity",
            file_path="docs/api.md",
            content="# Updated",
        )
        for _ in range(doc_updates)
    ]
    return PRAnalysisResult(
        pr_number=pr_number,
        repo_full_name=REPO_FULL_NAME,
        drift_analysis=drift,
        documentation_updates=updates,
        processing_time_ms=120,
    )


# ── Standard pipeline patch stack ─────────────────────────────────────────────


def pipeline_patch_stack(analysis_result: PRAnalysisResult | None = None):
    """
    Return a list of active patch objects that cover all external dependencies
    of `process_pull_request`. Callers use them as a context manager stack:

        with ExitStack() as stack:
            for p in pipeline_patch_stack(result):
                stack.enter_context(p)

    The caller is responsible for redirecting job_manager._session_factory
    separately (patch.object cannot be done inside a list of context managers
    without an ExitStack).
    """
    if analysis_result is None:
        analysis_result = make_analysis_result()

    mock_analyzer = MagicMock()
    mock_analyzer.analyze_pr = AsyncMock(return_value=analysis_result)

    mock_reporter = MagicMock()
    mock_reporter.report_to_pr = AsyncMock()

    mock_queue = MagicMock()
    mock_queue.enqueue = MagicMock(return_value=MagicMock(id="rq-job-id"))

    return [
        patch("src.worker.context.SessionLocal", TestingSessionLocal),
        patch("src.worker.context.decrypt_credential", return_value="fake-private-key"),
        patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal),
        patch("src.pipeline.handler.get_installation_token", return_value="fake-gh-token"),
        patch("src.pipeline.handler.create_initial_check_run", new=AsyncMock(return_value=42)),
        patch("src.pipeline.handler.load_repo_config", return_value={}),
        patch("src.pipeline.handler.PRAnalyzer", return_value=mock_analyzer),
        patch("src.pipeline.handler.GitHubReporter", return_value=mock_reporter),
        patch("src.worker.queue.get_queue", return_value=mock_queue),
    ]


# ── HTTP client ───────────────────────────────────────────────────────────────


@pytest.fixture()
async def http_client():
    """AsyncClient wired to the real FastAPI app."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


# ── Webhook payload builders ──────────────────────────────────────────────────


def pr_opened_payload(
    pr_number: int = 42,
    sender: str = "dev-user",
    branch: str = "feature/my-feature",
    installation_id: int = INSTALLATION_ID,
) -> dict:
    return {
        "action": "opened",
        "pull_request": {
            "number": pr_number,
            "title": "My feature",
            "body": "Some description",
            "head": {"ref": branch, "sha": "deadbeef"},
            "base": {"ref": "main", "sha": "cafebabe"},
        },
        "repository": {
            "full_name": REPO_FULL_NAME,
            "name": REPO_NAME,
            "owner": {"login": "org"},
        },
        "sender": {"login": sender},
        "installation": {"id": installation_id},
    }


def pr_merged_payload(
    head_ref: str = "docugardener-fix-42-abc123",
    installation_id: int = INSTALLATION_ID,
) -> dict:
    return {
        "action": "closed",
        "pull_request": {
            "number": 99,
            "title": "DocuGardener fix",
            "body": "",
            "merged": True,
            "head": {"ref": head_ref, "sha": "aabbcc"},
            "base": {"ref": "main", "sha": "001122"},
        },
        "repository": {
            "full_name": REPO_FULL_NAME,
            "name": REPO_NAME,
            "owner": {"login": "org"},
        },
        "sender": {"login": "docugardener[bot]"},
        "installation": {"id": installation_id},
    }


def _webhook_headers(
    event: str = "pull_request",
    delivery_id: str | None = None,
    signature: str | None = None,
) -> dict:
    import uuid as _uuid

    # Use a unique delivery ID per call so Redis dedup (24-h TTL) never rejects
    # a later test that reuses the same payload. Callers can still pin a specific
    # ID when the test explicitly exercises dedup behaviour.
    if delivery_id is None:
        delivery_id = f"delivery-{_uuid.uuid4()}"
    headers = {
        "X-GitHub-Event": event,
        "X-GitHub-Delivery": delivery_id,
    }
    if signature:
        headers["X-Hub-Signature-256"] = signature
    return headers

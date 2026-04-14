"""
RULES-01: Agent Rules Compiler — FastAPI endpoints.

Three endpoints under /repos/{repo_id}/rules:
  GET  /repos/{repo_id}/rules           — list RulesArtifact records for this repo
  POST /repos/{repo_id}/rules/preview   — compile + return rendered content
  POST /repos/{repo_id}/rules/generate  — compile + open GitHub PR if changed

All endpoints require X-Tenant-ID header (standard TenantContextMiddleware).
Plan gating: Free tier is limited to 1 artifact total. PRO+ has no limits.
"""

from __future__ import annotations

import base64
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from github import GithubException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.middleware import get_tenant_id
from src.core.logging import get_logger
from src.github.app import get_github_client, GitHubAppError
from src.pipeline.job_manager import get_db
from src.pipeline.policy_parser import parse_policies
from src.pipeline.repo_config import load_repo_config
from src.rules.compiler import CompileTarget, RulesCompiler, SUPPORTED_FORMATS
from src.rules.sync import is_stale
from src.storage.sql_models import Repository, RulesArtifact, Tenant

logger = get_logger(__name__)

router = APIRouter(prefix="/repos", tags=["Rules"])

_compiler = RulesCompiler()

# Free tier: max artifacts per tenant (1 repo × 1 format)
_FREE_ARTIFACT_LIMIT = 1


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ArtifactOut(BaseModel):
    id: str
    repoId: str
    targetFormat: str
    outputPath: str
    lastHash: str | None
    lastGeneratedAt: datetime | None
    lastPrUrl: str | None
    isStale: bool
    updatedAt: datetime


class PreviewRequest(BaseModel):
    formats: list[str]  # ["agents_md", "copilot_instructions"]


class PreviewItem(BaseModel):
    format: str
    output_path: str
    content: str
    content_hash: str
    is_stale_vs_current: bool
    current_content: str | None = None


class PreviewResponse(BaseModel):
    items: list[PreviewItem]


class GenerateRequest(BaseModel):
    format: str  # one format per request


class GenerateResponse(BaseModel):
    status: str          # "in_sync" | "pr_opened" | "upgrade_required"
    pr_url: str | None = None
    artifact: ArtifactOut | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_repo_for_tenant(repo_id: str, tenant_id: str, db: Session) -> Repository:
    repo = db.query(Repository).filter_by(id=repo_id, tenantId=tenant_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


def _get_tenant(tenant_id: str, db: Session) -> Tenant:
    tenant = db.query(Tenant).filter_by(id=tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


def _fetch_file_content(gh_repo: Any, path: str) -> str | None:
    """Fetch a file from GitHub and return decoded UTF-8 content, or None if missing."""
    try:
        file_obj = gh_repo.get_contents(path)
        return base64.b64decode(file_obj.content).decode("utf-8")
    except GithubException as e:
        if e.status == 404:
            return None
        raise


def _create_branch_from_default(gh_repo: Any, branch_name: str) -> None:
    """Create a new branch from the repo's default branch HEAD."""
    default_branch = gh_repo.default_branch
    ref = gh_repo.get_git_ref(f"heads/{default_branch}")
    gh_repo.create_git_ref(f"refs/heads/{branch_name}", ref.object.sha)


def _artifact_out(artifact: RulesArtifact) -> ArtifactOut:
    return ArtifactOut(
        id=artifact.id,
        repoId=artifact.repoId,
        targetFormat=artifact.targetFormat,
        outputPath=artifact.outputPath,
        lastHash=artifact.lastHash,
        lastGeneratedAt=artifact.lastGeneratedAt,
        lastPrUrl=artifact.lastPrUrl,
        isStale=artifact.isStale,
        updatedAt=artifact.updatedAt,
    )


def _get_gh_repo(
    installation_id: int,
    repo: Repository,
    app_id: int | None = None,
    private_key: str | None = None,
) -> Any:
    """
    Return a PyGithub Repository object for the given DB repo record.
    Resolves via numeric githubRepoId so it works regardless of whether
    repo.name is stored as 'short-name' or 'owner/short-name'.
    Pass app_id/private_key to use tenant-level GitHub App credentials instead
    of the global env-var defaults.
    """
    try:
        numeric_id = int(repo.githubRepoId)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Repository '{repo.name}' has no valid GitHub ID "
                f"(got {repo.githubRepoId!r}). Re-connect it via the GitHub App."
            ),
        )
    gh = get_github_client(installation_id, app_id=app_id, private_key=private_key)
    return gh.get_repo(numeric_id)


# ---------------------------------------------------------------------------
# GET /repos/{repo_id}/rules
# ---------------------------------------------------------------------------

@router.get("/{repo_id}/rules", response_model=list[ArtifactOut])
def list_rules_artifacts(
    repo_id: str,
    db: Session = Depends(get_db),
) -> list[ArtifactOut]:
    """List all RulesArtifact records for the given repo."""
    tenant_id = get_tenant_id()
    _get_repo_for_tenant(repo_id, tenant_id, db)  # ownership check

    artifacts = (
        db.query(RulesArtifact)
        .filter_by(tenantId=tenant_id, repoId=repo_id)
        .all()
    )
    return [_artifact_out(a) for a in artifacts]


# ---------------------------------------------------------------------------
# POST /repos/{repo_id}/rules/preview
# ---------------------------------------------------------------------------

@router.post("/{repo_id}/rules/preview", response_model=PreviewResponse)
def preview_rules(
    repo_id: str,
    body: PreviewRequest,
    db: Session = Depends(get_db),
) -> PreviewResponse:
    """
    Compile policy rules and return rendered content for each requested format.
    Does not write to DB or GitHub.
    """
    tenant_id = get_tenant_id()
    repo = _get_repo_for_tenant(repo_id, tenant_id, db)
    tenant = _get_tenant(tenant_id, db)

    # Validate requested formats
    for fmt in body.formats:
        if fmt not in SUPPORTED_FORMATS:
            raise HTTPException(400, detail=f"Unsupported format: {fmt!r}")

    installation_id = int(tenant.installationId) if tenant.installationId else None
    if not installation_id:
        raise HTTPException(400, detail="Tenant has no GitHub App installation configured")

    # Resolve tenant-level GitHub App credentials (may be None → fall back to env vars)
    from src.security.encryption import decrypt_credential
    tenant_app_id = int(tenant.appId) if tenant.appId else None
    tenant_private_key = decrypt_credential(tenant.privateKey) if tenant.privateKey else None

    try:
        gh_repo = _get_gh_repo(installation_id, repo, app_id=tenant_app_id, private_key=tenant_private_key)
    except (GithubException, GitHubAppError) as e:
        logger.error("RULES-01: failed to resolve GitHub repo", repo=repo.name, error=str(e))
        raise HTTPException(
            status_code=502,
            detail=f"Could not access GitHub repository '{repo.name}'. "
                   f"Check that the GitHub App installation is still active.",
        )
    owner, repo_name = gh_repo.full_name.split("/", 1)

    try:
        token = _get_installation_token_for_tenant(tenant, installation_id)
    except Exception as e:
        logger.error("RULES-01: failed to get installation token", error=str(e))
        raise HTTPException(
            status_code=502,
            detail="Could not obtain a GitHub installation token. "
                   "Check the GitHub App credentials in Settings.",
        )

    repo_config = load_repo_config(owner, repo_name, token)
    rules = parse_policies(repo_config, tenant_plan=tenant.plan)

    # Compile each format and fetch current file content for diff
    items: list[PreviewItem] = []
    for fmt in body.formats:
        target = CompileTarget.for_format(fmt)
        result = _compiler.compile(rules, target)
        try:
            current = _fetch_file_content(gh_repo, target.output_path)
        except GithubException as e:
            logger.warning(
                "RULES-01: could not fetch current file",
                path=target.output_path,
                status=e.status,
            )
            current = None  # treat as missing — preview still works
        items.append(PreviewItem(
            format=fmt,
            output_path=target.output_path,
            content=result.content,
            content_hash=result.content_hash,
            is_stale_vs_current=is_stale(current, result.content_hash),
            current_content=current,
        ))

    return PreviewResponse(items=items)


# ---------------------------------------------------------------------------
# POST /repos/{repo_id}/rules/generate
# ---------------------------------------------------------------------------

@router.post("/{repo_id}/rules/generate", response_model=GenerateResponse)
def generate_rules(
    repo_id: str,
    body: GenerateRequest,
    db: Session = Depends(get_db),
) -> GenerateResponse:
    """
    Compile policy rules and open a GitHub PR to update the instruction file
    if the content has changed.  Upserts a RulesArtifact record.
    """
    tenant_id = get_tenant_id()
    repo = _get_repo_for_tenant(repo_id, tenant_id, db)
    tenant = _get_tenant(tenant_id, db)

    if body.format not in SUPPORTED_FORMATS:
        raise HTTPException(400, detail=f"Unsupported format: {body.format!r}")

    # Plan gate: Free tier — max 1 artifact per tenant
    if tenant.plan == "FREE":
        existing_count = db.query(RulesArtifact).filter_by(tenantId=tenant_id).count()
        # Check if this specific artifact already exists (update is fine)
        this_artifact = (
            db.query(RulesArtifact)
            .filter_by(tenantId=tenant_id, repoId=repo_id, targetFormat=body.format)
            .first()
        )
        if this_artifact is None and existing_count >= _FREE_ARTIFACT_LIMIT:
            return GenerateResponse(status="upgrade_required")

    installation_id = int(tenant.installationId) if tenant.installationId else None
    if not installation_id:
        raise HTTPException(400, detail="Tenant has no GitHub App installation configured")

    # Resolve tenant-level GitHub App credentials (may be None → fall back to env vars)
    from src.security.encryption import decrypt_credential
    tenant_app_id = int(tenant.appId) if tenant.appId else None
    tenant_private_key = decrypt_credential(tenant.privateKey) if tenant.privateKey else None

    gh_repo = _get_gh_repo(installation_id, repo, app_id=tenant_app_id, private_key=tenant_private_key)
    owner, repo_name = gh_repo.full_name.split("/", 1)

    token = _get_installation_token_for_tenant(tenant, installation_id)
    repo_config = load_repo_config(owner, repo_name, token)
    rules = parse_policies(repo_config, tenant_plan=tenant.plan)

    target = CompileTarget.for_format(body.format)
    result = _compiler.compile(rules, target)

    current_content = _fetch_file_content(gh_repo, target.output_path)

    # Upsert artifact record
    artifact = (
        db.query(RulesArtifact)
        .filter_by(tenantId=tenant_id, repoId=repo_id, targetFormat=body.format)
        .first()
    )
    if artifact is None:
        artifact = RulesArtifact(
            id=f"rart_{uuid.uuid4().hex}",
            tenantId=tenant_id,
            repoId=repo_id,
            targetFormat=body.format,
            outputPath=target.output_path,
        )
        db.add(artifact)

    # If content is already in sync, just mark it and return
    if not is_stale(current_content, result.content_hash):
        artifact.isStale = False
        artifact.lastHash = result.content_hash
        artifact.updatedAt = datetime.utcnow()
        db.commit()
        db.refresh(artifact)
        logger.info("RULES-01: artifact already in sync", repo=repo.name, format=body.format)
        return GenerateResponse(status="in_sync", artifact=_artifact_out(artifact))

    # Create branch and PR
    branch_name = f"docugardener/rules-{body.format.replace('_', '-')}-{uuid.uuid4().hex[:6]}"
    try:
        _create_branch_from_default(gh_repo, branch_name)
    except GithubException as e:
        logger.error("RULES-01: failed to create branch", error=str(e))
        raise HTTPException(500, detail=f"Failed to create GitHub branch: {e.data}")

    commit_msg = f"docs: update {target.output_path} from DocuGardener policy"
    try:
        if current_content is None:
            gh_repo.create_file(
                path=target.output_path,
                message=commit_msg,
                content=result.content,
                branch=branch_name,
            )
        else:
            existing = gh_repo.get_contents(target.output_path)
            gh_repo.update_file(
                path=target.output_path,
                message=commit_msg,
                content=result.content,
                sha=existing.sha,
                branch=branch_name,
            )
    except GithubException as e:
        logger.error("RULES-01: failed to write file to branch", error=str(e))
        raise HTTPException(500, detail=f"Failed to write file: {e.data}")

    # Open PR
    pr_title = f"docs: update {target.output_path} (DocuGardener policy sync)"
    pr_body = (
        f"## DocuGardener Agent Rules Update\n\n"
        f"This PR was automatically generated to keep `{target.output_path}` in sync "
        f"with the current DOCPOL-01 policy configuration.\n\n"
        f"| Field | Value |\n"
        f"|---|---|\n"
        f"| Format | `{body.format}` |\n"
        f"| Policy rules | {len(rules)} |\n"
        f"| Content hash | `{result.content_hash[:8]}` |\n\n"
        f"---\n"
        f"*Generated by [DocuGardener](https://github.com/apps/docugardener)*"
    )
    try:
        pr = gh_repo.create_pull(
            title=pr_title,
            body=pr_body,
            head=branch_name,
            base=gh_repo.default_branch,
        )
        pr_url = pr.html_url
    except GithubException as e:
        logger.error("RULES-01: failed to create PR", error=str(e))
        raise HTTPException(500, detail=f"Failed to create PR: {e.data}")

    # Update artifact record
    artifact.lastHash = result.content_hash
    artifact.lastGeneratedAt = datetime.utcnow()
    artifact.lastPrUrl = pr_url
    artifact.isStale = False
    artifact.outputPath = target.output_path
    artifact.updatedAt = datetime.utcnow()
    db.commit()
    db.refresh(artifact)

    logger.info("RULES-01: PR opened", repo=repo.name, format=body.format, pr_url=pr_url)
    return GenerateResponse(status="pr_opened", pr_url=pr_url, artifact=_artifact_out(artifact))


# ---------------------------------------------------------------------------
# Internal helper — token acquisition
# ---------------------------------------------------------------------------

def _get_installation_token_for_tenant(tenant: Tenant, installation_id: int) -> str:
    """Get a GitHub installation token, using the tenant's custom App if configured."""
    from src.github.app import get_installation_token
    from src.security.encryption import decrypt_credential
    app_id = int(tenant.appId) if tenant.appId else None
    private_key = decrypt_credential(tenant.privateKey) if tenant.privateKey else None
    return get_installation_token(installation_id, app_id=app_id, private_key=private_key)

"""Plugin API — pre-flight drift check endpoint (DX-02 / IDE-01)."""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from src.agents.verifier import VerificationAgent
from src.analysis.diff import SemanticDiff
from src.api.middleware import set_tenant_id
from src.pipeline.job_manager import get_db
from src.pipeline.policy_evaluator import evaluate_policies
from src.pipeline.policy_parser import parse_policies
from src.storage.sql_models import Repository, Tenant
from src.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/check", tags=["Plugin"])


class FileInput(BaseModel):
    path: str
    old_content: str
    new_content: str


class CheckRequest(BaseModel):
    files: list[FileInput]
    # IDE-01 AC-2: optional repo slug (owner/name) for policy context
    repo: Optional[str] = None


class EntityChangeSummary(BaseModel):
    entity: str
    change_type: str
    file: str


# IDE-01 AC-1: suggested doc to update
class SuggestedDoc(BaseModel):
    file: str
    section: Optional[str] = None
    reason: str


# IDE-01 AC-2: policy violation returned to the extension
class PluginPolicyViolation(BaseModel):
    rule_name: str
    enforcement: str
    paths_matched: list[str]
    docs_missing: list[str]
    reason: str


class CheckResponse(BaseModel):
    severity: str
    drift_score: int
    block_merge: bool
    summary: str
    files_analyzed: int
    entity_changes: list[EntityChangeSummary]
    # IDE-01 AC-1: suggested documentation files to update
    suggested_docs: list[SuggestedDoc] = []
    # IDE-01 AC-2: policy violations from repository policy
    policy_violations: list[PluginPolicyViolation] = []


def _get_tenant_by_api_key(authorization: Optional[str], db: Session) -> Tenant:
    """
    Look up the tenant whose pluginApiKey matches the Bearer token.

    This removes the need for the client to send X-Tenant-ID — the key
    uniquely identifies the tenant.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    provided_key = authorization.removeprefix("Bearer ").strip()

    # Fetch all tenants that have a workflowConfig (cheaper than full scan)
    # and do timing-safe comparison in Python so we never leak key length via SQL timing.
    # For large deployments this should be replaced with a hashed-key index.
    tenants = db.query(Tenant).filter(Tenant.workflowConfig.isnot(None)).all()
    for tenant in tenants:
        stored_key = (dict(tenant.workflowConfig or {})).get("pluginApiKey", "")
        if stored_key and secrets.compare_digest(provided_key, stored_key):
            return tenant

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key",
    )


def _get_policy_violations(
    repo_slug: str,
    changed_paths: list[str],
    tenant_id: str,
    db: Session,
) -> list[PluginPolicyViolation]:
    """
    IDE-01 AC-2: look up repo policy and evaluate against staged file paths.
    Returns an empty list if repo not found or policy not configured.
    """
    try:
        # repo_slug is "owner/name" — match by name substring
        repo_name = repo_slug.split("/")[-1] if "/" in repo_slug else repo_slug
        repo = (
            db.query(Repository)
            .filter(Repository.tenantId == tenant_id, Repository.name == repo_name)
            .first()
        )
        if not repo:
            return []

        repo_config = dict(repo.config or {}) if hasattr(repo, "config") else {}
        policy_yaml = repo_config.get("docugardenPolicy") or ""
        if not policy_yaml:
            return []

        rules = parse_policies(policy_yaml)
        if not rules:
            return []

        violations = evaluate_policies(rules, changed_paths, docs_present=[])

        result = []
        for v in violations:
            result.append(PluginPolicyViolation(
                rule_name=v.rule_name,
                enforcement=v.enforcement,
                paths_matched=v.paths_matched,
                docs_missing=v.docs_missing,
                reason=f"Rule '{v.rule_name}' requires documentation updates in: {', '.join(v.docs_missing)}",
            ))
        return result
    except Exception as exc:
        logger.warning("IDE-01: policy evaluation failed", error=str(exc))
        return []


@router.post("", response_model=CheckResponse)
async def check_drift(
    body: CheckRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Pre-flight drift check for VS Code plugin (DX-02 / IDE-01).

    Accepts file old/new content pairs, runs semantic diff + LLM drift analysis,
    and returns a severity result with suggested docs and policy violations.
    No Job record is created — stateless read-only call for low-latency feedback.

    Required headers:
      Authorization: Bearer <plugin-api-key>

    The API key uniquely identifies the tenant — no X-Tenant-ID needed.

    Optional body fields:
      repo: "owner/name"  — enables policy context (IDE-01 AC-2)
    """
    tenant = _get_tenant_by_api_key(authorization, db)
    # Make tenant ID available to downstream services (e.g. VerificationAgent)
    set_tenant_id(tenant.id)

    # Compute semantic entity changes for every supplied file pair
    differ = SemanticDiff()
    all_changes = []
    for f in body.files:
        changes = differ.diff_files(f.old_content, f.new_content, f.path)
        all_changes.extend(changes)

    if not all_changes:
        return CheckResponse(
            severity="none",
            drift_score=0,
            block_merge=False,
            summary="No semantic changes detected.",
            files_analyzed=len(body.files),
            entity_changes=[],
            suggested_docs=[],
            policy_violations=[],
        )

    # VerificationAgent reads tenant_id from context (already set by TenantContextMiddleware)
    agent = VerificationAgent()
    drift = await agent.analyze_drift(all_changes)

    entity_changes = [
        EntityChangeSummary(
            entity=c.entity.qualified_name,
            change_type=c.change_type.value,
            file=c.entity.file_path,
        )
        for c in all_changes
        if c.is_meaningful
    ]

    # IDE-01 AC-1: build suggested_docs from LLM-returned required_updates
    suggested_docs = [
        SuggestedDoc(
            file=u.get("file", ""),
            section=u.get("section") or None,
            reason=u.get("reason", "Documentation update required"),
        )
        for u in (drift.required_updates or [])
        if u.get("file")
    ]

    # IDE-01 AC-2: evaluate repo policy if repo slug provided
    policy_violations: list[PluginPolicyViolation] = []
    if body.repo:
        changed_paths = [f.path for f in body.files]
        policy_violations = _get_policy_violations(body.repo, changed_paths, tenant.id, db)

    logger.info(
        "Plugin check complete",
        tenant_id=tenant.id,
        files=len(body.files),
        total_changes=len(all_changes),
        severity=drift.severity,
        drift_score=drift.drift_score,
        suggested_docs=len(suggested_docs),
        policy_violations=len(policy_violations),
    )

    return CheckResponse(
        severity=drift.severity,
        drift_score=drift.drift_score,
        block_merge=drift.block_merge,
        summary=drift.summary,
        files_analyzed=len(body.files),
        entity_changes=entity_changes,
        suggested_docs=suggested_docs,
        policy_violations=policy_violations,
    )

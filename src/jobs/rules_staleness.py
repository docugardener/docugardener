# SPDX-License-Identifier: AGPL-3.0-or-later
"""
RULES-01: Daily staleness check for generated rule artifacts.

Runs at 03:00 UTC.  For every RulesArtifact that has a recorded lastHash,
fetches the current on-disk file from GitHub and compares the SHA-256 of
its content against lastHash.  Updates the isStale flag accordingly.

This surfaces stale artifacts in the Settings UI so platform engineers
know when policy has diverged from the generated instruction files without
needing to wait for a PR to trigger the issue.
"""

from __future__ import annotations

import base64
from datetime import datetime

from github import GithubException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.config import settings
from src.core.logging import get_logger
from src.github.app import get_github_client
from src.pipeline.policy_parser import parse_policies
from src.pipeline.repo_config import load_repo_config
from src.rules.compiler import CompileTarget, RulesCompiler
from src.rules.sync import is_stale
from src.storage.sql_models import Repository, RulesArtifact, Tenant

logger = get_logger(__name__)

engine = create_engine(settings.sql_database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

_compiler = RulesCompiler()


def run_rules_staleness_check() -> None:
    """
    Entry point for the APScheduler cron job.

    Checks all RulesArtifact records that have been generated at least once
    (lastHash is not None) and updates their isStale flag.
    """
    db = SessionLocal()
    try:
        artifacts = (
            db.query(RulesArtifact)
            .filter(RulesArtifact.lastHash.isnot(None))
            .all()
        )

        if not artifacts:
            logger.info("RULES-01 staleness: no artifacts to check")
            return

        logger.info("RULES-01 staleness: checking artifacts", count=len(artifacts))
        checked = stale_count = error_count = 0

        for artifact in artifacts:
            try:
                _check_artifact(artifact, db)
                checked += 1
                if artifact.isStale:
                    stale_count += 1
            except Exception as exc:
                error_count += 1
                logger.warning(
                    "RULES-01 staleness: error checking artifact",
                    artifact_id=artifact.id,
                    error=str(exc),
                )

        db.commit()
        logger.info(
            "RULES-01 staleness: complete",
            checked=checked,
            stale=stale_count,
            errors=error_count,
        )
    finally:
        db.close()


def _check_artifact(artifact: RulesArtifact, db: object) -> None:
    """
    Check a single artifact against the current on-disk file and policy hash.
    Updates artifact.isStale in place (caller commits the session).
    """
    # Load repo and tenant
    repo: Repository | None = db.query(Repository).filter_by(id=artifact.repoId).first()
    tenant: Tenant | None = db.query(Tenant).filter_by(id=artifact.tenantId).first()

    if not repo or not tenant:
        logger.warning("RULES-01 staleness: repo or tenant missing", artifact_id=artifact.id)
        return

    installation_id = int(tenant.installationId) if tenant.installationId else None
    if not installation_id:
        return  # No GitHub App — can't check

    # Fetch current file from GitHub
    try:
        app_id = int(tenant.appId) if tenant.appId else None
        private_key = tenant.privateKey or None
        from src.github.app import get_installation_token
        token = get_installation_token(installation_id, app_id=app_id, private_key=private_key)

        # Resolve by numeric ID — repo.name may be short name without owner
        gh = get_github_client(installation_id)
        gh_repo = gh.get_repo(int(repo.githubRepoId))
        owner, repo_name = gh_repo.full_name.split("/", 1)

        try:
            file_obj = gh_repo.get_contents(artifact.outputPath)
            current_content: str | None = base64.b64decode(file_obj.content).decode("utf-8")
        except GithubException as e:
            if e.status == 404:
                current_content = None  # File was deleted — definitely stale
            else:
                raise

        # Compute expected hash from current policy
        repo_config = load_repo_config(owner, repo_name, token)
        rules = parse_policies(repo_config, tenant_plan=tenant.plan)
        target = CompileTarget.for_format(artifact.targetFormat)
        expected_hash = _compiler.compute_expected_hash(rules, target)

        new_stale = is_stale(current_content, expected_hash)
        if new_stale != artifact.isStale:
            logger.info(
                "RULES-01 staleness: flag updated",
                artifact_id=artifact.id,
                repo=repo.name,
                format=artifact.targetFormat,
                is_stale=new_stale,
            )
        artifact.isStale = new_stale
        artifact.updatedAt = datetime.utcnow()

    except GithubException as e:
        logger.warning(
            "RULES-01 staleness: GitHub API error",
            artifact_id=artifact.id,
            status=e.status,
            error=str(e.data),
        )

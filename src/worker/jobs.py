# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Background job definitions.

Wraps async pipeline functions to be compatible with synchronous RQ workers.
"""

import asyncio
from typing import Any

from src.core.logging import get_logger
from src.monitoring.metrics import JOBS_COMPLETED
from src.pipeline.job_manager import job_manager

logger = get_logger(__name__)


def _on_job_failure(job, connection, exc_type, exc_value, traceback) -> None:
    """
    RQ on_failure callback — called synchronously when a job is killed by timeout
    or crashes in a way RQ catches before our own except block.

    Provides 0-lag SQL state transition to FAILED (vs the 60-second sweeper which
    handles worker-crash scenarios where this callback never fires).

    For analyze_pr_job (which doesn't carry a job_id kwarg) this is a no-op —
    that job manages its own DB state internally.
    """
    job_id = (job.kwargs or {}).get("job_id") or (job.args[0] if job.args else None)
    if not job_id:
        logger.warning(
            "on_failure: no job_id extractable, skipping DB fail_job",
            rq_job_id=job.id,
            exc=str(exc_value),
        )
        return

    try:
        job_manager.fail_job(job_id, f"Worker failure: {exc_type.__name__}: {exc_value}")
        logger.info("on_failure: marked job as FAILED in DB", job_id=job_id, rq_job_id=job.id)
    except Exception as e:
        logger.error("on_failure: fail_job raised", job_id=job_id, error=str(e))


def analyze_pr_job(
    installation_id: int,
    owner: str,
    repo: str,
    pr_number: int,
    action: str,
    base_sha: str,
    head_sha: str,
    changed_files: list[dict[str, Any]],
    base_ref: str | None = None,
    jira_ticket_key: str | None = None,
    ai_authored: bool = False,
    ai_signal: str = "",
    sender_type: str = "human",
) -> dict[str, Any]:
    """
    Background job to analyze a Pull Request.
    
    This is a synchronous wrapper around the async `process_pull_request`
    handler, suitable for execution by RQ workers.
    
    Args:
        installation_id: GitHub App installation ID
        owner: Repository owner
        repo: Repository name
        pr_number: PR number
        action: PR action
        base_sha: Base branch SHA
        head_sha: Head branch SHA
        changed_files: List of changed file metadata
        
    Returns:
        Analysis result summary
    """
    logger.info(
        "Starting PR analysis job",
        repo=f"{owner}/{repo}",
        pr=pr_number,
        action=action,
    )
    
    try:
        # Run async handler in a new event loop
        from src.pipeline.handler import process_pull_request
        result = asyncio.run(process_pull_request(
            installation_id=installation_id,
            owner=owner,
            repo=repo,
            pr_number=pr_number,
            action=action,
            base_sha=base_sha,
            head_sha=head_sha,
            changed_files=changed_files,
            base_ref=base_ref,
            jira_ticket_key=jira_ticket_key,
            ai_authored=ai_authored,
            ai_signal=ai_signal,
        ))
        
        JOBS_COMPLETED.labels(status="success").inc()
        return {
            "status": "success",
            "repo": result.repo_full_name,
            "pr": result.pr_number,
            "drift_score": result.drift_score,
            "sender_type": sender_type,  # SCALE-03: "bot" | "ai" | "human"
            "head_sha": head_sha,   # Stored so the Inbox UI can fetch live code
            "owner": owner,         # Repo owner for LiveCodeBlock
            "updates_generated": len(result.documentation_updates),
            "processing_time_ms": result.processing_time_ms,
            "drift_analysis": {
                "severity": result.drift_analysis.severity if result.drift_analysis else "none",
                "summary": result.drift_analysis.summary if result.drift_analysis else "",
                "reasons": [
                    {
                        "score": r.get("score") if isinstance(r, dict) else getattr(r, "score", 0),
                        "reason": r.get("reason") if isinstance(r, dict) else getattr(r, "reason", "Unknown"),
                        "entity": r.get("entity_name") if isinstance(r, dict) else getattr(r, "entity_name", "Unknown")
                    } for r in (result.drift_analysis.required_updates if result.drift_analysis else [])
                ],
                "items": [
                    {
                        "file_path": item.get("file_path", "") if isinstance(item, dict) else getattr(item, "file_path", ""),
                        "severity": item.get("severity", "low") if isinstance(item, dict) else getattr(item, "severity", "low"),
                        "current_content": item.get("current_content", "") if isinstance(item, dict) else getattr(item, "current_content", ""),
                        "semantic_change": item.get("semantic_change", "") if isinstance(item, dict) else getattr(item, "semantic_change", ""),
                        "reasoning": item.get("reasoning", "") if isinstance(item, dict) else getattr(item, "reasoning", ""),
                    } for item in (result.drift_analysis.items if result.drift_analysis and hasattr(result.drift_analysis, 'items') else [])
                ]
            }
        }
        
    except Exception as e:
        JOBS_COMPLETED.labels(status="failed").inc()
        logger.error(
            "PR analysis job failed",
            repo=f"{owner}/{repo}",
            pr=pr_number,
            error=str(e),
        )
        raise  # Re-raise to mark job as failed in RQ


def ignore_drift_job(job_id: str) -> dict[str, Any]:
    """
    Background job to update the GitHub Check Run to 'neutral' when a drift is ignored.
    This unblocks the developer's PR review without generating a fix.
    """
    logger.info("Processing Ignore action — updating Check Run", job_id=job_id)

    try:
        from src.pipeline.job_manager import get_db
        from src.storage.sql_models import Job, Tenant
        from src.github.app import get_github_client
        from src.security.encryption import decrypt_credential

        db = next(get_db())
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or not isinstance(job.result, dict):
            logger.warning("ignore_drift_job: job or result missing", job_id=job_id)
            return {"status": "skipped", "reason": "no job/result"}

        check_run_id = job.result.get("check_run_id")
        installation_id = job.result.get("installation_id")
        repo_full_name = job.result.get("repo_full_name")
        head_sha = job.result.get("head_sha")

        if not check_run_id or not installation_id or not repo_full_name:
            logger.warning(
                "ignore_drift_job: missing check_run_id/installation_id/repo",
                job_id=job_id,
            )
            return {"status": "skipped", "reason": "missing context in result"}

        tenant = db.query(Tenant).filter(Tenant.id == job.tenantId).first()
        if not tenant:
            logger.error("ignore_drift_job: tenant not found", job_id=job_id)
            return {"status": "error", "reason": "tenant not found"}

        _app_id = int(tenant.appId)
        _private_key = decrypt_credential(tenant.privateKey)

        client = get_github_client(int(installation_id), app_id=_app_id, private_key=_private_key)
        github_repo = client.get_repo(repo_full_name)
        dismiss_reason = job.result.get("dismiss_reason")
        reason_suffix = f"\n\n**Reason:** {dismiss_reason}" if dismiss_reason else ""

        check_run = github_repo.get_check_run(int(check_run_id))
        check_run.edit(
            name="DocuGardener",
            status="completed",
            conclusion="neutral",
            output={
                "title": "Documentation drift acknowledged",
                "summary": (
                    "The documentation drift detected for this PR has been reviewed and "
                    f"acknowledged by the documentation team. No changes are required.{reason_suffix}"
                ),
            },
        )
        logger.info("Check Run updated to neutral/acknowledged", job_id=job_id, check_run_id=check_run_id)

        # Post Jira comment if a ticket was linked to the original PR
        jira_ticket_key = job.result.get("jira_ticket_key")
        if jira_ticket_key:
            try:
                from src.notifications.dispatcher import NotificationDispatcher
                pr_number = job.prNumber
                comment = (
                    f"ℹ️ *DocuGardener — No Documentation Update Required*\n\n"
                    f"The documentation drift detected for PR #{pr_number} was reviewed "
                    f"and marked as *No Update Required*. No documentation changes will be made."
                )
                if tenant and tenant.workflowConfig:
                    from src.security.encryption import decrypt_credential
                    dispatcher = NotificationDispatcher(
                        workflow_config=dict(tenant.workflowConfig),
                        tenant_plan=getattr(tenant, "plan", "FREE"),
                        github_app_id=tenant.appId,
                        github_private_key=decrypt_credential(tenant.privateKey) if tenant.privateKey else None,
                        installation_id=tenant.installationId,
                    )
                    asyncio.run(dispatcher.post_jira_lifecycle_comment(jira_ticket_key, comment))
            except Exception as e:
                logger.warning("Failed to post Jira ignore comment", ticket=jira_ticket_key, error=str(e))

        return {"status": "success", "job_id": job_id}

    except Exception as e:
        logger.error("ignore_drift_job failed", job_id=job_id, error=str(e))
        raise


def create_fix_pr_job(job_id: str, auto_merge: bool = False) -> dict[str, Any]:
    """
    Background job to execute Auto-PR logic when a drift is accepted.

    Args:
        job_id: The DB Job ID with analysis results.
        auto_merge: If True, attempt to auto-merge the fix PR after CI passes.
                    Used by EPIC-05 AI Author Mode. Default False (human reviews).
    """
    logger.info("Starting Auto-PR fix job", job_id=job_id, auto_merge=auto_merge)

    try:
        from src.pipeline.handler import process_fix_pr
        asyncio.run(process_fix_pr(job_id, auto_merge=auto_merge))
        return {"status": "success", "job_id": job_id}
    except Exception as e:
        logger.error("Auto-PR fix job failed", job_id=job_id, error=str(e))
        raise

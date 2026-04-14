# SPDX-License-Identifier: AGPL-3.0-or-later
"""
GitHub reporter for posting analysis results.

Handles formatting and posting of drift analysis results
to GitHub PRs via comments and Check Runs.
"""

from dataclasses import dataclass
from typing import Any

from github import Github
from github.PullRequest import PullRequest
from github.Repository import Repository

from src.core.config import settings
from src.core.logging import get_logger
from src.github.app import get_installation_client
from src.pipeline.analyzer import PRAnalysisResult
from src.pipeline.feedback import build_feedback_urls

logger = get_logger(__name__)


# Emoji indicators for drift severity
SEVERITY_EMOJI = {
    "none": "✅",
    "minor": "📝",
    "moderate": "⚠️",
    "significant": "🔶",
    "critical": "🚨",
}

# Status for Check Runs
CHECK_RUN_CONCLUSION = {
    "none": "success",
    "minor": "success",
    "moderate": "neutral",
    "significant": "failure",
    "critical": "failure",
}


def _format_policy_violations_md(violations: list) -> str:
    """
    DOCPOL-01: Format policy violations as a Markdown section for PR comments.
    Returns an empty string when there are no violations.
    """
    if not violations:
        return ""

    lines = [
        "### 🛡️ Policy Violations",
        "",
        "| Rule | Enforcement | Missing Documentation |",
        "|------|-------------|----------------------|",
    ]
    for v in violations:
        # Support both dataclass objects (PolicyViolation) and plain dicts
        _enf = v.enforcement if hasattr(v, "enforcement") else v.get("enforcement", "advisory")
        _rule = v.rule_name if hasattr(v, "rule_name") else v.get("rule_name", "?")
        _missing_list = v.docs_missing if hasattr(v, "docs_missing") else v.get("docs_missing", [])
        enforcement_label = {
            "blocking": "🔴 Blocking",
            "blocking-with-reason": "🟠 Blocking (reason required)",
            "advisory": "🟡 Advisory",
        }.get(_enf, _enf)
        missing = ", ".join(f"`{d}`" for d in _missing_list)
        lines.append(f"| `{_rule}` | {enforcement_label} | {missing} |")

    lines.append("")

    # Extra callout for blocking-with-reason
    def _get_enf(v: any) -> str:
        return v.enforcement if hasattr(v, "enforcement") else v.get("enforcement", "advisory")
    bwr_rules = [v for v in violations if _get_enf(v) == "blocking-with-reason"]
    if bwr_rules:
        lines.extend([
            "> ⚠️ **Merge is blocked by policy.** A written reason is required to dismiss this alert in the DocuGardener inbox.",
            "",
        ])

    return "\n".join(lines)


def format_drift_report(
    result: PRAnalysisResult,
    template: str | None = None,
    job_id: str | None = None,
    tenant_id: str | None = None,
) -> str:
    """
    Format a drift analysis result as Markdown for PR comments.

    Args:
        result:    The analysis result.
        template:  Optional custom template string.
        job_id:    Job CUID — used to build FEED-01 feedback links.
        tenant_id: Tenant CUID — used to build FEED-01 feedback links.

    Returns:
        Formatted Markdown string.
    """
    if not result.success:
        return f"""## 🌱 DocuGardener Analysis

❌ **Analysis Failed**

```
{result.error}
```

Please check the logs for more details.
"""

    drift = result.drift_analysis
    if drift is None:
        return "## 🌱 DocuGardener Analysis\n\nNo drift analysis available."

    # Parse variables for template
    files_list_str = ""
    if drift.required_updates:
        for update in drift.required_updates:
            reason = f" - {update['reason']}" if update.get('reason') else ""
            files_list_str += f"- **{update.get('file', 'Unknown')}** → {update.get('section', 'Section')}{reason}\n"

    drafts_str = ""
    if result.documentation_updates:
        for i, draft in enumerate(result.documentation_updates, 1):
            status = '✅ Verified' if draft.is_verified else '⚠️ Unverified'
            drafts_str += f"<details>\n<summary><strong>{i}. {draft.entity_name}</strong> {status}</summary>\n\n{draft.content}\n\n</details>\n\n"

    # FEED-01: build feedback footer (appended after template OR default report)
    feedback_footer = ""
    if job_id and tenant_id and result.success:
        up_url, down_url = build_feedback_urls(job_id, tenant_id)
        if up_url and down_url:
            feedback_footer = (
                "\n\n---\n"
                f"*Was this analysis helpful?* "
                f"[✅ Looks accurate]({up_url}) · [⚠️ Report false positive]({down_url})"
            )

    # Use Custom Template if provided
    if template and template.strip():
        report = template
        report = report.replace("{{drift_score}}", str(drift.drift_score))
        report = report.replace("{{summary}}", drift.summary)
        report = report.replace("{{files_list}}", files_list_str if files_list_str else "(No required updates)")
        report = report.replace("{{drafts}}", drafts_str if drafts_str else "(No drafts generated)")
        return report + feedback_footer

    # Fallback to Default Format
    emoji = SEVERITY_EMOJI.get(drift.severity, "❓")

    # Build the report
    lines = [
        "## 🌱 DocuGardener Analysis",
        "",
    ]

    # DOCPOL-01: prepend policy violations section when present
    raw_violations = getattr(result, "policy_violations", None) or []
    policy_md = _format_policy_violations_md(raw_violations)
    if policy_md:
        lines.append(policy_md)

    lines.extend([
        f"### {emoji} Documentation Drift: **{drift.severity.upper()}** ({drift.drift_score}/100)",
        "",
        f"> {drift.summary}",
        "",
    ])

    # Add required updates if any
    if drift.required_updates:
        lines.extend([
            "### 📋 Required Documentation Updates",
            "",
            files_list_str
        ])

    # Add generated documentation suggestions
    if result.documentation_updates:
        lines.extend([
            "### 📝 Suggested Documentation Updates",
            "",
            drafts_str
        ])

    # Add entity changes summary
    if result.entity_changes:
        lines.extend([
            "### 📊 Code Changes Analyzed",
            "",
            "| Entity | Type | Change |",
            "|--------|------|--------|",
        ])
        for change in result.entity_changes[:10]:  # Limit display
            lines.append(
                f"| `{change.entity.qualified_name}` | {change.entity.entity_type} | {change.change_type.value} |"
            )

        if len(result.entity_changes) > 10:
            lines.append(f"| ... | ... | _{len(result.entity_changes) - 10} more changes_ |")
        lines.append("")

    # Add blocking notice if applicable
    if result.should_block:
        lines.extend([
            "---",
            "",
            "⛔ **This PR is blocked due to high documentation drift.**",
            "",
            "Please update the documentation before merging.",
            "",
        ])

    # Add footer
    lines.extend([
        "---",
        f"_Analysis completed in {result.processing_time_ms}ms_",
    ])

    return "\n".join(lines) + feedback_footer


def format_check_run_output(result: PRAnalysisResult) -> dict[str, Any]:
    """
    Format analysis result for GitHub Check Run API.
    
    Args:
        result: The analysis result
        
    Returns:
        Dictionary for Check Run output
    """
    drift = result.drift_analysis
    
    if not result.success:
        return {
            "title": "Analysis Failed",
            "summary": f"Error: {result.error}",
            "conclusion": "failure",
        }
    
    if drift is None:
        return {
            "title": "No Analysis",
            "summary": "No drift analysis performed",
            "conclusion": "neutral",
        }
    
    conclusion = CHECK_RUN_CONCLUSION.get(drift.severity, "neutral")

    # DOCPOL-01: blocking policy violations override the conclusion
    raw_violations = getattr(result, "policy_violations", None) or []
    blocking_violations = [
        v for v in raw_violations
        if v.get("enforcement") in ("blocking", "blocking-with-reason")
    ]
    if blocking_violations:
        conclusion = "failure"

    # Build title: prepend policy rule names when blocking
    if blocking_violations:
        rule_names = ", ".join(v.get("rule_name", "?") for v in blocking_violations)
        title = f"Policy Violation: {rule_names} | Drift Score: {drift.drift_score}/100 ({drift.severity})"
    else:
        title = f"Drift Score: {drift.drift_score}/100 ({drift.severity})"

    # Build summary: append policy table when violations exist
    summary = drift.summary
    if raw_violations:
        policy_lines = [
            "",
            "### Policy Violations",
            "",
            "| Rule | Enforcement | Missing Docs |",
            "|------|-------------|--------------|",
        ]
        for v in raw_violations:
            enforcement = v.get("enforcement", "advisory")
            missing = ", ".join(v.get("docs_missing", []))
            policy_lines.append(f"| {v.get('rule_name', '?')} | {enforcement} | {missing} |")
        summary = summary + "\n" + "\n".join(policy_lines)

    return {
        "title": title,
        "summary": summary,
        "conclusion": conclusion,
        "details": {
            "drift_score": drift.drift_score,
            "severity": drift.severity,
            "block_merge": drift.block_merge,
            "required_updates_count": len(drift.required_updates),
            "doc_updates_generated": len(result.documentation_updates),
            "entity_changes": len(result.entity_changes),
            "policy_violations_count": len(raw_violations),
            "policy_blocks_merge": bool(blocking_violations),
        },
    }


class GitHubReporter:
    """
    Reports analysis results to GitHub.
    
    Posts comments and updates Check Runs for PRs.
    """
    
    def __init__(
        self,
        installation_id: int,
        notification_config: dict | None = None,
        app_id: int | None = None,
        private_key: str | None = None,
    ):
        """
        Initialize the reporter.

        Args:
            installation_id: GitHub App installation ID
            notification_config: Optional tenant notification configuration
            app_id: Per-tenant GitHub App ID (overrides global .env value)
            private_key: Per-tenant private key (overrides global secrets/ file)
        """
        self.installation_id = installation_id
        self.notification_config = notification_config
        self._app_id = app_id
        self._private_key = private_key
        self._client: Github | None = None

    async def _get_client(self) -> Github:
        """Get GitHub client for the installation."""
        if self._client is None:
            from src.github.app import get_github_client
            self._client = get_github_client(
                self.installation_id,
                app_id=self._app_id,
                private_key=self._private_key,
            )
        return self._client
    
    async def report_to_pr(
        self,
        result: PRAnalysisResult,
        post_comment: bool = True,
        update_check_run: bool = True,
        check_run_id: int | None = None,
        job_id: str | None = None,
        tenant_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Report analysis results to a Pull Request.

        Args:
            result:          Analysis result.
            post_comment:    Whether to post a comment.
            update_check_run: Whether to update Check Run.
            check_run_id:    Existing Check Run ID to update.
            job_id:          FEED-01: Job CUID for feedback links in PR comment.
            tenant_id:       FEED-01: Tenant CUID for feedback links in PR comment.

        Returns:
            Report metadata (comment_id, check_run_id, etc.)
        """
        client = await self._get_client()
        repo = client.get_repo(result.repo_full_name)
        pr = repo.get_pull(result.pr_number)

        report_result: dict[str, Any] = {
            "pr_number": result.pr_number,
            "repo": result.repo_full_name,
        }

        # Post comment
        if post_comment:
            comment = await self._post_comment(pr, result, job_id=job_id, tenant_id=tenant_id)
            report_result["comment_id"] = comment.id
            report_result["comment_url"] = comment.html_url
        
        # Update Check Run
        if update_check_run:
            check_output = format_check_run_output(result)
            
            if check_run_id:
                check_run = await self._update_check_run(
                    repo=repo,
                    check_run_id=check_run_id,
                    **check_output,
                )
            else:
                check_run = await self._create_check_run(
                    repo=repo,
                    head_sha=pr.head.sha,
                    **check_output,
                )
            
            report_result["check_run_id"] = check_run.id
            report_result["check_run_url"] = check_run.html_url
        
        logger.info(
            "Reported to GitHub",
            pr=result.pr_number,
            comment=report_result.get("comment_id"),
            check_run=report_result.get("check_run_id"),
        )
        
        return report_result
    
    async def _post_comment(
        self,
        pr: PullRequest,
        result: PRAnalysisResult,
        job_id: str | None = None,
        tenant_id: str | None = None,
    ) -> Any:
        """Post or update the DocuGardener comment on a PR."""
        # Check for existing DocuGardener comment to update (re-run path)
        existing_comment = None
        for comment in pr.get_issue_comments():
            if "## 🌱 DocuGardener Analysis" in comment.body:
                existing_comment = comment
                break

        template = None
        if self.notification_config:
            template = self.notification_config.get("prTemplate")

        report_content = format_drift_report(
            result,
            template=template,
            job_id=job_id,
            tenant_id=tenant_id,
        )

        if existing_comment:
            existing_comment.edit(report_content)
            return existing_comment
        else:
            return pr.create_issue_comment(report_content)
    
    async def _create_check_run(
        self,
        repo: Repository,
        head_sha: str,
        title: str,
        summary: str,
        conclusion: str,
        **kwargs,
    ) -> Any:
        """Create a new Check Run."""
        return repo.create_check_run(
            name="DocuGardener",
            head_sha=head_sha,
            status="completed",
            conclusion=conclusion,
            output={
                "title": title,
                "summary": summary,
            },
        )
    
    async def _update_check_run(
        self,
        repo: Repository,
        check_run_id: int,
        title: str,
        summary: str,
        conclusion: str,
        **kwargs,
    ) -> Any:
        """Update an existing Check Run."""
        check_run = repo.get_check_run(check_run_id)
        check_run.edit(
            status="completed",
            conclusion=conclusion,
            output={
                "title": title,
                "summary": summary,
            },
        )
        return check_run

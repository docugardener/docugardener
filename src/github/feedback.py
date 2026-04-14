# SPDX-License-Identifier: AGPL-3.0-or-later
"""
GitHub PR feedback mechanisms.

Handles posting comments to PRs and managing Check Runs
for documentation drift reporting.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any

from github import Github
from github.CheckRun import CheckRun
from github.PullRequestComment import PullRequestComment

from src.core.logging import get_logger

logger = get_logger(__name__)


class DriftSeverity(Enum):
    """Severity levels for documentation drift."""
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class DriftReport:
    """
    Report of documentation drift for a PR.
    
    Attributes:
        score: Drift score (0-100, higher = more drift)
        severity: Categorized severity level
        entities: List of entities with detected drift
        suggestions: Suggested documentation updates
    """
    score: int
    severity: DriftSeverity
    entities: list[dict[str, Any]]
    suggestions: list[str]
    
    @property
    def should_block(self) -> bool:
        """Whether this drift level should block the merge."""
        return self.severity in [DriftSeverity.HIGH, DriftSeverity.CRITICAL]


def create_check_run(
    client: Github,
    repo_full_name: str,
    head_sha: str,
    name: str = "DocuGardener / Documentation Drift",
) -> CheckRun:
    """
    Create a new Check Run for a commit.
    
    Args:
        client: Authenticated GitHub client
        repo_full_name: Repository in "owner/repo" format
        head_sha: Commit SHA to associate check with
        name: Check run name
        
    Returns:
        Created CheckRun object
    """
    repo = client.get_repo(repo_full_name)
    
    check_run = repo.create_check_run(
        name=name,
        head_sha=head_sha,
        status="in_progress",
    )
    
    logger.info(
        "Created check run",
        repo=repo_full_name,
        check_run_id=check_run.id,
        head_sha=head_sha[:8],
    )
    
    return check_run


def complete_check_run(
    client: Github,
    repo_full_name: str,
    check_run_id: int,
    report: DriftReport,
) -> None:
    """
    Complete a Check Run with drift analysis results.
    
    Args:
        client: Authenticated GitHub client
        repo_full_name: Repository in "owner/repo" format
        check_run_id: ID of the check run to update
        report: Drift analysis report
    """
    repo = client.get_repo(repo_full_name)
    check_run = repo.get_check_run(check_run_id)
    
    # Determine conclusion based on drift
    if report.severity == DriftSeverity.NONE:
        conclusion = "success"
        title = "✅ Documentation is in sync"
        summary = "No documentation drift detected."
    elif report.should_block:
        conclusion = "failure"
        title = f"❌ Documentation drift detected (Score: {report.score})"
        summary = "High documentation drift detected. Please update documentation before merging."
    else:
        conclusion = "neutral"
        title = f"⚠️ Minor documentation drift (Score: {report.score})"
        summary = "Some documentation may need updates."
    
    # Build detailed output
    text_parts = [summary, "", "## Affected Entities"]
    for entity in report.entities:
        text_parts.append(f"- `{entity.get('name')}` in `{entity.get('file')}`")
    
    if report.suggestions:
        text_parts.extend(["", "## Suggested Updates"])
        for suggestion in report.suggestions:
            text_parts.append(f"- {suggestion}")
    
    check_run.edit(
        status="completed",
        conclusion=conclusion,
        output={
            "title": title,
            "summary": summary,
            "text": "\n".join(text_parts),
        },
    )
    
    logger.info(
        "Completed check run",
        repo=repo_full_name,
        check_run_id=check_run_id,
        conclusion=conclusion,
        drift_score=report.score,
    )


def post_pr_comment(
    client: Github,
    repo_full_name: str,
    pr_number: int,
    body: str,
) -> PullRequestComment:
    """
    Post a comment on a Pull Request.
    
    Args:
        client: Authenticated GitHub client
        repo_full_name: Repository in "owner/repo" format
        pr_number: Pull request number
        body: Comment body (Markdown supported)
        
    Returns:
        Created comment object
    """
    repo = client.get_repo(repo_full_name)
    pr = repo.get_pull(pr_number)
    
    comment = pr.create_issue_comment(body)
    
    logger.info(
        "Posted PR comment",
        repo=repo_full_name,
        pr_number=pr_number,
        comment_id=comment.id,
    )
    
    return comment


def format_drift_comment(report: DriftReport) -> str:
    """
    Format a drift report as a PR comment.
    
    Args:
        report: Drift analysis report
        
    Returns:
        Formatted Markdown comment body
    """
    severity_emoji = {
        DriftSeverity.NONE: "✅",
        DriftSeverity.LOW: "📝",
        DriftSeverity.MEDIUM: "⚠️",
        DriftSeverity.HIGH: "🚨",
        DriftSeverity.CRITICAL: "❌",
    }
    
    emoji = severity_emoji.get(report.severity, "📋")
    
    lines = [
        f"## {emoji} DocuGardener Analysis",
        "",
        f"**Drift Score:** {report.score}/100",
        f"**Severity:** {report.severity.value.title()}",
        "",
    ]
    
    if report.entities:
        lines.append("### Entities Requiring Documentation Update")
        lines.append("")
        for entity in report.entities:
            lines.append(f"- `{entity.get('name')}` in `{entity.get('file')}`")
            if entity.get("reason"):
                lines.append(f"  - {entity.get('reason')}")
        lines.append("")
    
    if report.suggestions:
        lines.append("### Suggested Documentation Updates")
        lines.append("")
        for i, suggestion in enumerate(report.suggestions, 1):
            lines.append(f"{i}. {suggestion}")
        lines.append("")
    
    lines.extend([
        "---",
        "_Generated by [DocuGardener](https://github.com/your-org/docugardener)_",
    ])
    
    return "\n".join(lines)

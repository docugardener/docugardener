# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Notification Dispatcher for integrating DocuGardener Drift Alerts
with external workflows: Slack, Jira, Linear, GitHub Issues.
"""

from typing import Any

import httpx

from src.core.logging import get_logger
from src.security.crypto import decrypt

logger = get_logger(__name__)


class NotificationDispatcher:
    """Dispatches drift notifications to configured integrations."""

    def __init__(
        self,
        workflow_config: dict[str, Any] | None,
        tenant_plan: str = "FREE",
        github_app_id: str | None = None,
        github_private_key: str | None = None,
        installation_id: str | None = None,
        granted_features: list[str] | None = None,
    ):
        self.config = workflow_config or {}
        self.tenant_plan = (tenant_plan or "FREE").upper()
        self.github_app_id = github_app_id
        self.github_private_key = github_private_key
        self.installation_id = installation_id
        # When granted_features is None, fall back to plan-based access.
        # When it is a list (including empty), it is authoritative.
        self._granted_features = granted_features

    def _has_feature(self, key: str) -> bool:
        """Return True if the named integration feature is accessible.

        If granted_features was provided (non-None), only features explicitly
        listed are allowed — the plan string is ignored.
        If granted_features is None, fall back to plan-rank check (PRO != FREE).
        """
        if self._granted_features is not None:
            return key in self._granted_features
        # Fallback: plan-based access (PRO or TEAM)
        return self.tenant_plan != "FREE"

    async def dispatch_drift_alert(
        self, drift_record: Any, jira_ticket_key: str | None = None
    ) -> None:
        """Dispatch a drift alert to all configured integrations."""
        if not self.config:
            logger.debug("No workflow configuration found, skipping dispatch.")
            return

        owner = getattr(drift_record, "owner", "unknown")
        repo = getattr(drift_record, "repo", "unknown")
        pr_number = getattr(drift_record, "pr_number", 0)
        drift_score = getattr(drift_record, "drift_score", 0)
        severity = getattr(drift_record, "severity", "medium")
        summary = getattr(drift_record, "summary", "")
        pr_url = f"https://github.com/{owner}/{repo}/pull/{pr_number}"

        # ── Slack (PRO+) ──────────────────────────────────────────────────
        if self._has_feature("slack_integration"):
            slack_config = self.config.get("slack")
            if slack_config and slack_config.get("webhookUrl"):
                try:
                    await self._send_slack_alert(drift_record, decrypt(slack_config["webhookUrl"]))
                except Exception as e:
                    logger.error("Failed to send Slack alert", error=str(e))

        # ── Jira (PRO+) — comment on existing linked ticket ───────────────
        if self._has_feature("integrations_jira"):
            if jira_ticket_key:
                jira_config = self.config.get("jira")
                if (
                    jira_config
                    and jira_config.get("host")
                    and jira_config.get("email")
                    and jira_config.get("apiToken")
                ):
                    try:
                        comment = (
                            f"⚠️ *DocuGardener — Documentation Drift Detected*\n\n"
                            f"PR [#{pr_number}|{pr_url}] introduced semantic changes that may require documentation updates.\n\n"
                            f"*Drift Score:* {drift_score}/100 | *Severity:* {severity.upper()}\n"
                            f"*Summary:* {summary}\n\n"
                            f"Review and action required in the DocuGardener Inbox."
                        )
                        await self.post_jira_lifecycle_comment(jira_ticket_key, comment)
                    except Exception as e:
                        logger.error(
                            "Failed to post Jira drift comment",
                            ticket=jira_ticket_key,
                            error=str(e),
                        )
            else:
                logger.debug("No Jira ticket key found in PR — skipping Jira notification")

        # ── Linear (PRO+) — create issue ──────────────────────────────────
        if self._has_feature("integrations_linear"):
            linear_config = self.config.get("linear")
            if linear_config and linear_config.get("apiToken"):
                try:
                    _linear_issue_id = await self._create_linear_issue(
                        api_token=decrypt(linear_config["apiToken"]),
                        team_id=linear_config.get("teamId"),
                        title=f"Docs drift detected: {owner}/{repo} PR #{pr_number}",
                        description=(
                            f"**Documentation drift detected** in [{owner}/{repo} PR #{pr_number}]({pr_url})\n\n"
                            f"**Drift Score:** {drift_score}/100  \n"
                            f"**Severity:** {severity.upper()}  \n\n"
                            f"**Summary:** {summary}\n\n"
                            f"Review and resolve in the [DocuGardener Inbox]."
                        ),
                        severity=severity,
                    )
                    if _linear_issue_id:
                        try:
                            drift_record.linear_issue_id = _linear_issue_id
                        except Exception:
                            pass
                except Exception as e:
                    logger.error("Failed to create Linear issue", error=str(e))

        # ── GitHub Issues (all plans) — create issue ───────────────────────
        gh_issues_config = self.config.get("githubIssues")
        if gh_issues_config and gh_issues_config.get("enabled"):
            try:
                target_repo = gh_issues_config.get("repo") or f"{owner}/{repo}"
                issue_number = await self._create_github_issue(
                    repo=target_repo,
                    title=f"Docs drift detected: PR #{pr_number} ({severity.upper()})",
                    body=(
                        f"## Documentation Drift Detected\n\n"
                        f"**PR:** [{owner}/{repo}#{pr_number}]({pr_url})  \n"
                        f"**Drift Score:** {drift_score}/100  \n"
                        f"**Severity:** {severity.upper()}  \n\n"
                        f"### Summary\n{summary}\n\n"
                        f"---\n*Opened automatically by [DocuGardener](https://github.com/apps/docugardener)*"
                    ),
                    labels=["documentation", "drift"],
                )
                if issue_number:
                    # Store issue number on the drift record for later close
                    try:
                        drift_record.github_issue_number = issue_number
                        drift_record.github_issue_repo = target_repo
                    except Exception:
                        pass
            except Exception as e:
                logger.error("Failed to create GitHub issue", error=str(e))

    async def _send_slack_alert(self, drift_record: Any, webhook_url: str) -> None:
        """Send a formatted Block Kit message to Slack."""
        owner = getattr(drift_record, "owner", "unknown")
        repo = getattr(drift_record, "repo", "unknown")
        pr_number = getattr(drift_record, "pr_number", 0)
        head_sha = getattr(drift_record, "head_sha", "")
        drift_score = getattr(drift_record, "drift_score", 0)
        severity = getattr(drift_record, "severity", "medium")
        summary = getattr(drift_record, "summary", "Documentation drift detected.")
        entities = getattr(drift_record, "entities", [])

        pr_url = f"https://github.com/{owner}/{repo}/pull/{pr_number}"
        repo_url = f"https://github.com/{owner}/{repo}"
        short_sha = head_sha[:7] if head_sha else "unknown"

        severity_upper = severity.upper()
        color = {
            "high": "#ef4444",
            "critical": "#ef4444",
            "low": "#3b82f6",
            "minor": "#3b82f6",
            "medium": "#eab308",
            "moderate": "#eab308",
        }.get(severity.lower(), "#eab308")

        severity_emoji = {
            "high": "🔴",
            "critical": "🔴",
            "medium": "🟡",
            "moderate": "🟡",
            "low": "🔵",
            "minor": "🔵",
        }.get(severity.lower(), "🟡")

        entities_text = (
            "\n".join(f"• `{e}`" for e in entities)
            if entities
            else "_No specific entities identified_"
        )

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "⚠️ Documentation Drift Detected",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Repository:*\n<{repo_url}|{owner}/{repo}>"},
                    {"type": "mrkdwn", "text": f"*Pull Request:*\n<{pr_url}|#{pr_number}>"},
                    {"type": "mrkdwn", "text": f"*Drift Score:*\n`{drift_score}/100`"},
                    {"type": "mrkdwn", "text": f"*Severity:*\n{severity_emoji} {severity_upper}"},
                ],
            },
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*Summary:*\n{summary}"}},
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Affected Entities:*\n{entities_text}"},
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"Commit `{short_sha}` · <{pr_url}|View PR on GitHub>",
                    }
                ],
            },
        ]

        payload = {
            "attachments": [
                {
                    "color": color,
                    "blocks": blocks,
                }
            ]
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(webhook_url, json=payload, timeout=10.0)
            response.raise_for_status()
            logger.info(
                "Slack alert sent",
                repo=f"{owner}/{repo}",
                pr=pr_number,
                severity=severity,
                drift_score=drift_score,
            )

    async def post_jira_lifecycle_comment(self, ticket_key: str, comment_body: str) -> None:
        """
        Post a comment on an existing Jira ticket.
        No-op if Jira is not configured in workflowConfig.

        Args:
            ticket_key: Jira issue key, e.g. "BUG-123".
            comment_body: Plain text / Jira wiki markup comment body.
        """
        jira_config = self.config.get("jira")
        if not jira_config or not all(k in jira_config for k in ["host", "email", "apiToken"]):
            logger.debug("Jira not configured — skipping lifecycle comment", ticket=ticket_key)
            return

        host = jira_config["host"]
        email = jira_config["email"]
        api_token = decrypt(jira_config["apiToken"])

        url = f"{host.rstrip('/')}/rest/api/2/issue/{ticket_key}/comment"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={"body": comment_body},
                auth=(email, api_token),
                timeout=10.0,
            )
            if response.status_code not in (200, 201):
                logger.error(
                    "Failed to post Jira comment",
                    ticket=ticket_key,
                    status=response.status_code,
                    body=response.text,
                )
                response.raise_for_status()
            logger.info("Jira comment posted", ticket=ticket_key)

    async def _create_linear_issue(
        self,
        api_token: str,
        team_id: str | None,
        title: str,
        description: str,
        severity: str = "medium",
    ) -> str | None:
        """Create a Linear issue and return its ID."""
        priority_map = {"critical": 1, "high": 2, "medium": 3, "low": 4}
        priority = priority_map.get(severity.lower(), 3)

        # Resolve team ID if not provided — use the first team on the account
        if not team_id:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.linear.app/graphql",
                    json={"query": "{ teams { nodes { id name } } }"},
                    headers={"Authorization": api_token, "Content-Type": "application/json"},
                    timeout=10.0,
                )
                resp.raise_for_status()
                teams = resp.json().get("data", {}).get("teams", {}).get("nodes", [])
                if not teams:
                    logger.warning("Linear: no teams found, cannot create issue")
                    return None
                team_id = teams[0]["id"]

        mutation = """
        mutation CreateIssue($title: String!, $description: String!, $teamId: String!, $priority: Int!) {
            issueCreate(input: { title: $title, description: $description, teamId: $teamId, priority: $priority }) {
                success
                issue { id identifier url }
            }
        }
        """
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.linear.app/graphql",
                json={
                    "query": mutation,
                    "variables": {
                        "title": title,
                        "description": description,
                        "teamId": team_id,
                        "priority": priority,
                    },
                },
                headers={"Authorization": api_token, "Content-Type": "application/json"},
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {}).get("issueCreate", {})
            if data.get("success"):
                issue = data.get("issue", {})
                logger.info(
                    "Linear issue created", id=issue.get("identifier"), url=issue.get("url")
                )
                return issue.get("id")
            logger.error("Linear issue creation failed", response=resp.json())
            return None

    async def _create_github_issue(
        self, repo: str, title: str, body: str, labels: list[str] | None = None
    ) -> int | None:
        """Create a GitHub issue using the App installation token. Returns issue number."""
        if not self.github_app_id or not self.github_private_key or not self.installation_id:
            logger.debug("GitHub Issues: app credentials not available, skipping")
            return None
        try:
            from src.github.app import get_github_client

            client = get_github_client(
                int(self.installation_id),
                app_id=self.github_app_id,
                private_key=self.github_private_key,
            )
            parts = repo.split("/", 1)
            if len(parts) != 2:
                logger.warning("GitHub Issues: invalid repo format", repo=repo)
                return None
            owner, repo_name = parts
            gh_repo = client.get_repo(f"{owner}/{repo_name}")
            issue = gh_repo.create_issue(title=title, body=body, labels=labels or [])
            logger.info("GitHub issue created", repo=repo, number=issue.number, url=issue.html_url)
            return issue.number
        except Exception as e:
            logger.error("GitHub issue creation failed", repo=repo, error=str(e))
            return None

    async def resolve_linear_issue(self, issue_id: str) -> None:
        """Mark a Linear issue as Done (non-fatal — exceptions are swallowed).

        Mirrors the GitHub Issue close lifecycle for GAP-INT-5.
        No-op when integrations_linear is not granted or Linear is not configured.
        """
        if not self._has_feature("integrations_linear"):
            logger.debug("resolve_linear_issue: integrations_linear not granted, skipping")
            return
        linear_config = self.config.get("linear")
        if not linear_config or not linear_config.get("apiToken"):
            logger.debug("resolve_linear_issue: Linear not configured, skipping")
            return
        try:
            api_token = decrypt(linear_config["apiToken"])
            team_id = linear_config.get("teamId", "")
            headers = {"Authorization": api_token, "Content-Type": "application/json"}
            states_query = """
                query($teamId: String!) {
                    workflowStates(filter: { team: { id: { eq: $teamId } }, type: { eq: "completed" } }) {
                        nodes { id name }
                    }
                }
            """
            async with httpx.AsyncClient() as client:
                states_resp = await client.post(
                    "https://api.linear.app/graphql",
                    json={"query": states_query, "variables": {"teamId": team_id}},
                    headers=headers,
                    timeout=10.0,
                )
                states_resp.raise_for_status()
                nodes = (
                    states_resp.json().get("data", {}).get("workflowStates", {}).get("nodes", [])
                )
                if not nodes:
                    logger.warning(
                        "resolve_linear_issue: no completed workflow state found", team_id=team_id
                    )
                    return
                state_id = nodes[0]["id"]

                update_mutation = """
                    mutation($issueId: String!, $stateId: String!) {
                        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
                            success
                        }
                    }
                """
                update_resp = await client.post(
                    "https://api.linear.app/graphql",
                    json={
                        "query": update_mutation,
                        "variables": {"issueId": issue_id, "stateId": state_id},
                    },
                    headers=headers,
                    timeout=10.0,
                )
                update_resp.raise_for_status()
                success = (
                    update_resp.json().get("data", {}).get("issueUpdate", {}).get("success", False)
                )
                if success:
                    logger.info("Linear issue resolved", issue_id=issue_id)
                else:
                    logger.warning("Linear issue update returned success=false", issue_id=issue_id)
        except Exception as e:
            logger.error("resolve_linear_issue failed (non-fatal)", issue_id=issue_id, error=str(e))

    async def close_github_issue(
        self, repo: str, issue_number: int, comment: str | None = None
    ) -> None:
        """Close a GitHub issue when the fix PR merges."""
        if not self.github_app_id or not self.github_private_key or not self.installation_id:
            return
        try:
            from src.github.app import get_github_client

            client = get_github_client(
                int(self.installation_id),
                app_id=self.github_app_id,
                private_key=self.github_private_key,
            )
            parts = repo.split("/", 1)
            gh_repo = client.get_repo(f"{parts[0]}/{parts[1]}")
            issue = gh_repo.get_issue(issue_number)
            if comment:
                try:
                    issue.create_comment(comment)
                except Exception as _ce:
                    logger.warning(
                        "Failed to post close comment on GitHub issue",
                        repo=repo,
                        number=issue_number,
                        error=str(_ce),
                    )
            issue.edit(state="closed")
            logger.info("GitHub issue closed", repo=repo, number=issue_number)
        except Exception as e:
            logger.error(
                "Failed to close GitHub issue", repo=repo, number=issue_number, error=str(e)
            )

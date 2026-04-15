# SPDX-License-Identifier: AGPL-3.0-or-later
"""DG-CAT-01: Python feature catalog — mirrors web/lib/features.ts and web/lib/billing.ts.

This is the server-side source of truth for:
- Feature definitions (key, label, description, group, gate, min_tier)
- Quota dimensions (pr_analyses_monthly, repos, seats)
- Plan quota limits (FREE / PRO / TEAM)

Used by DG-MAN-01 (manifest serializer) and DG-LPP-04 (pending changes).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

TierType = Literal["FREE", "PRO", "TEAM"]
GateType = Literal["tier", "flag"]
QuotaValueType = Literal["number", "boolean"]


@dataclass(frozen=True)
class Feature:
    key: str
    label: str
    description: str
    group: str
    gate: GateType
    min_tier: TierType
    trial_eligible: bool = False


@dataclass(frozen=True)
class QuotaDimension:
    key: str
    label: str
    type: QuotaValueType


# ── Quota dimensions — mirror billing.ts ─────────────────────────────────────

QUOTA_DIMENSIONS: list[QuotaDimension] = [
    QuotaDimension(key="pr_analyses_monthly", label="PR Analyses / Month", type="number"),
    QuotaDimension(key="repos", label="Repositories", type="number"),
    QuotaDimension(key="seats", label="Team Seats", type="number"),
]

# Plan quota limits — mirror PLAN_LIMITS in billing.ts / quota.py
# -1 = unlimited
PLAN_QUOTAS: dict[str, dict[str, int]] = {
    "FREE": {"pr_analyses_monthly": 50, "repos": 1, "seats": 1},
    "PRO": {"pr_analyses_monthly": 500, "repos": 5, "seats": 10},
    "TEAM": {"pr_analyses_monthly": -1, "repos": 9999, "seats": 100},
}


# ── Feature catalog — mirror FEATURES in features.ts ─────────────────────────

FEATURES: list[Feature] = [
    # ── Analytics & Reporting ─────────────────────────────────────────────────
    Feature(
        key="audit_log",
        label="Audit Log",
        description="Track all security and governance events with tamper-evident SHA-256 hash chain.",
        group="Analytics & Reporting",
        gate="tier",
        min_tier="PRO",
    ),
    Feature(
        key="audit_log_export",
        label="Audit Log Export",
        description="Export audit trail to CSV or via API for SIEM integration.",
        group="Analytics & Reporting",
        gate="tier",
        min_tier="TEAM",
    ),
    Feature(
        key="risk_map",
        label="Documentation Risk Map",
        description="Heatmap of repositories ordered by cumulative drift score.",
        group="Analytics & Reporting",
        gate="tier",
        min_tier="PRO",
    ),
    Feature(
        key="analytics",
        label="Analytics Dashboard",
        description="Trend charts, drift over time, and team-level reporting.",
        group="Analytics & Reporting",
        gate="tier",
        min_tier="PRO",
    ),
    # ── AI / LLM ──────────────────────────────────────────────────────────────
    Feature(
        key="holistic_scoring",
        label="Advanced Drift Scoring",
        description="Semantic scoring model weighing API contracts, breaking changes, and audience impact.",
        group="AI & LLM",
        gate="tier",
        min_tier="PRO",
    ),
    Feature(
        key="prompt_customization",
        label="Prompt Customization",
        description="Override system prompts for drift analysis and documentation generation.",
        group="AI & LLM",
        gate="tier",
        min_tier="PRO",
        trial_eligible=True,
    ),
    Feature(
        key="llm_config",
        label="LLM Configuration",
        description="Configure model provider and API keys for documentation generation.",
        group="AI & LLM",
        gate="tier",
        min_tier="FREE",
    ),
    Feature(
        key="ai_author_mode",
        label="AI Author Mode",
        description="Zero-touch documentation for AI-authored PRs (Copilot, Cursor, Devin, Claude Code).",
        group="AI & LLM",
        gate="tier",
        min_tier="FREE",
    ),
    # ── Integrations ──────────────────────────────────────────────────────────
    Feature(
        key="slack_integration",
        label="Slack Integration",
        description="Post drift alerts and fix notifications to Slack channels.",
        group="Integrations",
        gate="tier",
        min_tier="PRO",
    ),
    Feature(
        key="integrations_jira",
        label="Jira Integration",
        description="Post lifecycle comments on linked Jira tickets when drift is detected, fixed, or dismissed.",
        group="Integrations",
        gate="tier",
        min_tier="PRO",
    ),
    Feature(
        key="integrations_linear",
        label="Linear Integration",
        description="Auto-create Linear issues for critical drift findings.",
        group="Integrations",
        gate="tier",
        min_tier="PRO",
    ),
    Feature(
        key="integrations_github_issues",
        label="GitHub Issues Integration",
        description="Open GitHub issues for documentation drift on any supported repository.",
        group="Integrations",
        gate="tier",
        min_tier="FREE",
    ),
    # ── Enterprise / Security ─────────────────────────────────────────────────
    Feature(
        key="sso_saml",
        label="Single Sign-On (SSO)",
        description="SAML 2.0 authentication via Okta, Microsoft Entra ID, or Google Workspace.",
        group="Enterprise & Security",
        gate="tier",
        min_tier="TEAM",
    ),
    Feature(
        key="scim",
        label="SCIM 2.0 Provisioning",
        description="Automated user provisioning and deprovisioning via any SCIM-compatible IdP.",
        group="Enterprise & Security",
        gate="tier",
        min_tier="TEAM",
    ),
    Feature(
        key="environment_profile",
        label="Environment Profiles",
        description="Separate configuration profiles for staging and production environments.",
        group="Enterprise & Security",
        gate="tier",
        min_tier="TEAM",
    ),
    # ── RBAC Roles ────────────────────────────────────────────────────────────
    Feature(
        key="role_auditor",
        label="Auditor Role",
        description="Read-only access to audit log and compliance reports without admin privileges.",
        group="RBAC Roles",
        gate="tier",
        min_tier="PRO",
    ),
    Feature(
        key="role_billing_admin",
        label="Billing Admin Role",
        description="Manage subscription, invoices, and plan upgrades without full admin access.",
        group="RBAC Roles",
        gate="tier",
        min_tier="PRO",
    ),
    # ── Repositories ──────────────────────────────────────────────────────────
    Feature(
        key="private_repos",
        label="Private Repository Support",
        description="Monitor private GitHub repositories for documentation drift.",
        group="Repositories",
        gate="tier",
        min_tier="PRO",
    ),
    Feature(
        key="agent_rules",
        label="Agent Rules",
        # DG-SAAS-05: access is FREE; quota (3 rule sets on Free) enforced in quota.py
        description="Deploy agent governance rules. Free plan: up to 3 rule sets. Pro/Team: unlimited.",
        group="Repositories",
        gate="tier",
        min_tier="FREE",
    ),
    Feature(
        key="compliance_templates",
        label="Compliance Templates",
        description="Pre-built documentation templates for SOC 2, ISO 27001, and HIPAA compliance.",
        group="Enterprise & Security",
        gate="tier",
        min_tier="TEAM",
    ),
]

# ── Index for fast lookup ─────────────────────────────────────────────────────

_FEATURE_INDEX: dict[str, Feature] = {f.key: f for f in FEATURES}


def get_feature(key: str) -> Feature:
    """Return the Feature for the given key, or raise KeyError."""
    try:
        return _FEATURE_INDEX[key]
    except KeyError:
        raise KeyError(f"Unknown feature key: {key!r}")

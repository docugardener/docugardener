// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * LIC-02: Feature Catalog — single source of truth for plan-gated features.
 *
 * Usage:
 *   import { canAccess } from "@/lib/features"
 *   if (!canAccess(tenant.plan, "audit_log")) return 403
 *
 * Plan hierarchy: FREE < PRO < TEAM < ENTERPRISE
 * trialEligible: feature unlocks at PRO level during an active PRO trial
 */

export type PlanTier = "FREE" | "PRO" | "TEAM" | "ENTERPRISE"

const PLAN_RANK: Record<PlanTier, number> = {
    FREE:       0,
    PRO:        1,
    TEAM:       2,
    ENTERPRISE: 3,
}

interface FeatureDef {
    minPlan: PlanTier
    trialEligible: boolean
}

export const FEATURES = {
    // ── Analytics & Reporting ──────────────────────────────────────────────
    audit_log:           { minPlan: "PRO",  trialEligible: false } as FeatureDef,
    audit_log_export:    { minPlan: "TEAM", trialEligible: false } as FeatureDef,
    risk_map:            { minPlan: "PRO",  trialEligible: false } as FeatureDef,
    analytics:           { minPlan: "PRO",  trialEligible: false } as FeatureDef,

    // ── AI / LLM ──────────────────────────────────────────────────────────
    holistic_scoring:    { minPlan: "PRO",  trialEligible: false } as FeatureDef,
    prompt_customization:{ minPlan: "PRO",  trialEligible: true  } as FeatureDef,
    llm_config:          { minPlan: "FREE", trialEligible: false } as FeatureDef,
    ai_author_mode:      { minPlan: "FREE", trialEligible: false } as FeatureDef,

    // ── Integrations ──────────────────────────────────────────────────────
    slack_integration:         { minPlan: "PRO",  trialEligible: false } as FeatureDef,
    integrations_jira:         { minPlan: "PRO",  trialEligible: false } as FeatureDef,
    integrations_linear:       { minPlan: "PRO",  trialEligible: false } as FeatureDef,
    integrations_github_issues:{ minPlan: "FREE", trialEligible: false } as FeatureDef,

    // ── Enterprise / Security ─────────────────────────────────────────────
    sso_saml:            { minPlan: "TEAM", trialEligible: false } as FeatureDef,
    scim:                { minPlan: "TEAM", trialEligible: false } as FeatureDef,
    environment_profile: { minPlan: "TEAM", trialEligible: false } as FeatureDef,
    compliance_templates:{ minPlan: "TEAM", trialEligible: false } as FeatureDef,

    // ── RBAC Roles ────────────────────────────────────────────────────────
    role_auditor:        { minPlan: "PRO",  trialEligible: false } as FeatureDef,
    role_billing_admin:  { minPlan: "PRO",  trialEligible: false } as FeatureDef,

    // ── Repositories ──────────────────────────────────────────────────────
    private_repos:       { minPlan: "PRO",  trialEligible: false } as FeatureDef,
    // DG-SAAS-05: agent_rules access is FREE; quota (3 rule sets) enforced separately
    agent_rules:         { minPlan: "FREE", trialEligible: false } as FeatureDef,
} as const

export type FeatureKey = keyof typeof FEATURES

/**
 * Maps legacy PlatformCloud feature key names → current DG canonical names.
 * The Python backend may write PC-era keys into workflowConfig.grantedFeatures;
 * this map lets canAccess() accept either form without updating every caller.
 */
const PC_NAME_ALIASES: Record<string, FeatureKey> = {
    slack_notifications:  "slack_integration",
    jira_integration:     "integrations_jira",
    linear_integration:   "integrations_linear",
    auditor_role:         "role_auditor",
    billing_admin_role:   "role_billing_admin",
    github_issues:        "integrations_github_issues",
    agent_rules_unlimited:"agent_rules",
}

/** Normalize a PC-era name to its DG canonical equivalent (or return as-is). */
function normalizeFeatureKey(key: string): string {
    return PC_NAME_ALIASES[key] ?? key
}

/**
 * Returns true if the given plan (and optional trial state) can access the feature.
 *
 * DG-LPP-06: When `grantedFeatures` is a non-empty array (sourced from the
 * PlatformCloud validation response), it is authoritative — the feature must
 * appear in that list regardless of what the plan rank would normally allow.
 * An empty / absent `grantedFeatures` means no cloud override: fall back to
 * the standard plan-rank logic (SaaS mode or old PlatformCloud).
 *
 * @param plan            Tenant plan string (null/undefined treated as FREE)
 * @param feature         Feature key from the catalog
 * @param trialActive     Whether the tenant has an active PRO trial
 * @param grantedFeatures Explicit feature list from PlatformCloud (LPP-06)
 */
export function canAccess(
    plan: string | null | undefined,
    feature: FeatureKey,
    trialActive = false,
    grantedFeatures?: string[] | null,
): boolean {
    // DG-LPP-06: cloud override — PlatformCloud is authoritative when present.
    // Normalize PC-era names to DG canonical before checking.
    if (grantedFeatures && grantedFeatures.length > 0) {
        const normalized = grantedFeatures.map(normalizeFeatureKey)
        return normalized.includes(feature)
    }
    // Fallback: standard plan-rank logic
    const f = FEATURES[feature]
    const resolved = (trialActive && f.trialEligible) ? "PRO" : (plan ?? "FREE")
    const effectiveRank = PLAN_RANK[resolved as PlanTier] ?? 0
    return effectiveRank >= PLAN_RANK[f.minPlan]
}

/**
 * DG-LPP-06: Convenience wrapper — reads grantedFeatures from workflowConfig
 * automatically. Use this in API routes and server components that have a
 * full tenant object loaded from Prisma.
 *
 * @param tenant      Object with at least { plan, workflowConfig }
 * @param feature     Feature key from the catalog
 * @param trialActive Whether the tenant has an active PRO trial
 */
export function canAccessTenant(
    tenant: { plan: string | null | undefined; workflowConfig?: any },
    feature: FeatureKey,
    trialActive = false,
): boolean {
    const grantedFeatures = (tenant.workflowConfig as any)?.grantedFeatures as string[] | undefined
    return canAccess(tenant.plan, feature, trialActive, grantedFeatures)
}

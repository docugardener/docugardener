/**
 * LIC-02: Feature Catalog tests.
 *
 * Covers:
 *   A. FEATURES catalog shape — all keys present with expected minPlan
 *   B. canAccess() — plan hierarchy logic
 *   C. canAccess() — trial eligibility
 *   D. canAccess() — edge cases (null/undefined plan, unknown plan)
 */

import { describe, it, expect } from 'vitest'
import { FEATURES, canAccess, type FeatureKey, type PlanTier } from '@/lib/features'

// ── A. Catalog shape ──────────────────────────────────────────────────────────

describe('FEATURES catalog', () => {
    it('contains audit_log at PRO', () => {
        expect(FEATURES.audit_log.minPlan).toBe('PRO')
    })

    it('contains audit_log_export at TEAM', () => {
        expect(FEATURES.audit_log_export.minPlan).toBe('TEAM')
    })

    it('contains risk_map at PRO', () => {
        expect(FEATURES.risk_map.minPlan).toBe('PRO')
    })

    it('contains analytics at PRO', () => {
        expect(FEATURES.analytics.minPlan).toBe('PRO')
    })

    it('contains holistic_scoring at PRO', () => {
        expect(FEATURES.holistic_scoring.minPlan).toBe('PRO')
    })

    it('contains prompt_customization at PRO and is trial-eligible', () => {
        expect(FEATURES.prompt_customization.minPlan).toBe('PRO')
        expect(FEATURES.prompt_customization.trialEligible).toBe(true)
    })

    it('contains llm_config at FREE (PKG-02: BYOK available on all plans)', () => {
        expect(FEATURES.llm_config.minPlan).toBe('FREE')
    })

    it('contains ai_author_mode at FREE (PKG-02: AI Author Mode available on all plans)', () => {
        expect(FEATURES.ai_author_mode.minPlan).toBe('FREE')
    })

    it('contains slack_integration at PRO', () => {
        expect(FEATURES.slack_integration.minPlan).toBe('PRO')
    })

    it('contains integrations_jira at PRO', () => {
        expect(FEATURES.integrations_jira.minPlan).toBe('PRO')
    })

    it('contains integrations_linear at PRO', () => {
        expect(FEATURES.integrations_linear.minPlan).toBe('PRO')
    })

    it('contains integrations_github_issues at FREE', () => {
        expect(FEATURES.integrations_github_issues.minPlan).toBe('FREE')
    })

    it('contains sso_saml at TEAM', () => {
        expect(FEATURES.sso_saml.minPlan).toBe('TEAM')
    })

    it('contains compliance_templates at TEAM', () => {
        expect(FEATURES.compliance_templates.minPlan).toBe('TEAM')
    })

    it('contains scim at TEAM', () => {
        expect(FEATURES.scim.minPlan).toBe('TEAM')
    })

    it('contains environment_profile at TEAM', () => {
        expect(FEATURES.environment_profile.minPlan).toBe('TEAM')
    })

    it('contains role_auditor at PRO', () => {
        expect(FEATURES.role_auditor.minPlan).toBe('PRO')
    })

    it('contains role_billing_admin at PRO', () => {
        expect(FEATURES.role_billing_admin.minPlan).toBe('PRO')
    })

    it('contains private_repos at PRO', () => {
        expect(FEATURES.private_repos.minPlan).toBe('PRO')
    })

    it('contains agent_rules at FREE (quota enforced separately, not as a gate)', () => {
        expect(FEATURES.agent_rules.minPlan).toBe('FREE')
    })

    it('only prompt_customization is trial-eligible', () => {
        const trialEligibleKeys = (Object.keys(FEATURES) as FeatureKey[]).filter(
            k => FEATURES[k].trialEligible
        )
        expect(trialEligibleKeys).toEqual(['prompt_customization'])
    })
})

// ── B. canAccess — plan hierarchy ─────────────────────────────────────────────

describe('canAccess — plan hierarchy', () => {
    // FREE features
    it('FREE can access integrations_github_issues', () => {
        expect(canAccess('FREE', 'integrations_github_issues')).toBe(true)
    })

    it('PRO can access integrations_github_issues', () => {
        expect(canAccess('PRO', 'integrations_github_issues')).toBe(true)
    })

    it('TEAM can access integrations_github_issues', () => {
        expect(canAccess('TEAM', 'integrations_github_issues')).toBe(true)
    })

    // PRO features
    it('FREE cannot access audit_log', () => {
        expect(canAccess('FREE', 'audit_log')).toBe(false)
    })

    it('PRO can access audit_log', () => {
        expect(canAccess('PRO', 'audit_log')).toBe(true)
    })

    it('TEAM can access audit_log', () => {
        expect(canAccess('TEAM', 'audit_log')).toBe(true)
    })

    it('FREE cannot access risk_map', () => {
        expect(canAccess('FREE', 'risk_map')).toBe(false)
    })

    it('PRO can access risk_map', () => {
        expect(canAccess('PRO', 'risk_map')).toBe(true)
    })

    it('FREE cannot access analytics', () => {
        expect(canAccess('FREE', 'analytics')).toBe(false)
    })

    it('FREE cannot access holistic_scoring', () => {
        expect(canAccess('FREE', 'holistic_scoring')).toBe(false)
    })

    it('FREE cannot access slack_integration', () => {
        expect(canAccess('FREE', 'slack_integration')).toBe(false)
    })

    it('PRO can access slack_integration', () => {
        expect(canAccess('PRO', 'slack_integration')).toBe(true)
    })

    it('FREE cannot access role_auditor', () => {
        expect(canAccess('FREE', 'role_auditor')).toBe(false)
    })

    it('PRO can access role_auditor', () => {
        expect(canAccess('PRO', 'role_auditor')).toBe(true)
    })

    // TEAM-only features
    it('FREE cannot access sso', () => {
        expect(canAccess('FREE', 'sso_saml')).toBe(false)
    })

    it('PRO cannot access sso', () => {
        expect(canAccess('PRO', 'sso_saml')).toBe(false)
    })

    it('TEAM can access sso', () => {
        expect(canAccess('TEAM', 'sso_saml')).toBe(true)
    })

    it('FREE cannot access audit_log_export', () => {
        expect(canAccess('FREE', 'audit_log_export')).toBe(false)
    })

    it('PRO cannot access audit_log_export', () => {
        expect(canAccess('PRO', 'audit_log_export')).toBe(false)
    })

    it('TEAM can access audit_log_export', () => {
        expect(canAccess('TEAM', 'audit_log_export')).toBe(true)
    })

    it('PRO cannot access environment_profile', () => {
        expect(canAccess('PRO', 'environment_profile')).toBe(false)
    })

    it('TEAM can access environment_profile', () => {
        expect(canAccess('TEAM', 'environment_profile')).toBe(true)
    })

    it('FREE cannot access compliance_templates', () => {
        expect(canAccess('FREE', 'compliance_templates')).toBe(false)
    })

    it('PRO cannot access compliance_templates', () => {
        expect(canAccess('PRO', 'compliance_templates')).toBe(false)
    })

    it('TEAM can access compliance_templates', () => {
        expect(canAccess('TEAM', 'compliance_templates')).toBe(true)
    })
})

// ── C. canAccess — trial eligibility ─────────────────────────────────────────

describe('canAccess — trial eligibility', () => {
    it('FREE + active trial can access prompt_customization', () => {
        expect(canAccess('FREE', 'prompt_customization', true)).toBe(true)
    })

    it('FREE + no trial cannot access prompt_customization', () => {
        expect(canAccess('FREE', 'prompt_customization', false)).toBe(false)
    })

    it('FREE + active trial cannot access audit_log (not trial-eligible)', () => {
        expect(canAccess('FREE', 'audit_log', true)).toBe(false)
    })

    it('FREE + active trial cannot access sso (not trial-eligible, TEAM-only)', () => {
        expect(canAccess('FREE', 'sso_saml', true)).toBe(false)
    })

    it('PRO + active trial can access prompt_customization', () => {
        expect(canAccess('PRO', 'prompt_customization', true)).toBe(true)
    })

    it('TEAM + no trial can access prompt_customization (already above minPlan)', () => {
        expect(canAccess('TEAM', 'prompt_customization', false)).toBe(true)
    })
})

// ── D. canAccess — edge cases ─────────────────────────────────────────────────

describe('canAccess — edge cases', () => {
    it('null plan treated as FREE', () => {
        expect(canAccess(null, 'audit_log')).toBe(false)
        expect(canAccess(null, 'integrations_github_issues')).toBe(true)
    })

    it('undefined plan treated as FREE', () => {
        expect(canAccess(undefined, 'audit_log')).toBe(false)
        expect(canAccess(undefined, 'integrations_github_issues')).toBe(true)
    })

    it('unknown plan treated as FREE', () => {
        expect(canAccess('LEGACY', 'audit_log')).toBe(false)
        expect(canAccess('ENTERPRISE_PLUS', 'sso_saml')).toBe(false)
    })

    it('trialActive defaults to false', () => {
        // calling without third arg same as trialActive=false
        expect(canAccess('FREE', 'prompt_customization')).toBe(false)
    })
})

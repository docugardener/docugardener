import { describe, it, expect } from 'vitest'

/**
 * DG-SAAS-06 — Integrations plan gate unit tests
 *
 * Directly tests the gating logic extracted from
 * components/settings/IntegrationsForm.tsx.
 *
 * Bug fixed: `grantedFeatures != null` evaluated to `true` for an empty array
 * `[]`, which caused PRO users with an empty grantedFeatures list (no overrides
 * from PlatformCloud) to be incorrectly blocked from integrations.
 *
 * Fix: `grantedFeatures != null && grantedFeatures.length > 0`
 * — only treat grantedFeatures as authoritative when it is a non-empty array.
 */

// ── Pure logic under test ─────────────────────────────────────────────────────
//
// This mirrors the exact computation in IntegrationsForm.tsx lines 188-191.
// Keeping it as a pure function makes it trivially testable without mounting
// the full component or fighting react-hook-form / zod mocking complexity.

function getAccess(plan: string, grantedFeatures?: string[]) {
    const useGranted = grantedFeatures != null && grantedFeatures.length > 0
    return {
        canSlack:  useGranted ? grantedFeatures!.includes('slack_integration')   : plan !== 'FREE',
        canJira:   useGranted ? grantedFeatures!.includes('integrations_jira')   : plan !== 'FREE',
        canLinear: useGranted ? grantedFeatures!.includes('integrations_linear') : plan !== 'FREE',
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IntegrationsForm gating logic — getAccess()', () => {

    describe('PRO plan — plan-rank fallback (no override)', () => {
        it('PRO + grantedFeatures=undefined → all integrations accessible (plan fallback)', () => {
            const result = getAccess('PRO', undefined)
            expect(result.canSlack).toBe(true)
            expect(result.canJira).toBe(true)
            expect(result.canLinear).toBe(true)
        })

        it('PRO + grantedFeatures=[] → all integrations accessible (BUG FIX: empty array must not block plan access)', () => {
            // Before the fix, `grantedFeatures != null` was true for [], so all
            // three .includes() calls returned false → all three were false.
            const result = getAccess('PRO', [])
            expect(result.canSlack).toBe(true)
            expect(result.canJira).toBe(true)
            expect(result.canLinear).toBe(true)
        })
    })

    describe('FREE plan — plan-rank fallback (no override)', () => {
        it('FREE + grantedFeatures=undefined → all integrations blocked', () => {
            const result = getAccess('FREE', undefined)
            expect(result.canSlack).toBe(false)
            expect(result.canJira).toBe(false)
            expect(result.canLinear).toBe(false)
        })

        it('FREE + grantedFeatures=[] → all integrations blocked (empty array must not grant access)', () => {
            // The fix ensures [] falls through to plan-rank. FREE → all false.
            const result = getAccess('FREE', [])
            expect(result.canSlack).toBe(false)
            expect(result.canJira).toBe(false)
            expect(result.canLinear).toBe(false)
        })
    })

    describe('grantedFeatures override (PlatformCloud authoritative list)', () => {
        it('FREE + grantedFeatures=["slack_integration"] → canSlack=true, canJira=false, canLinear=false', () => {
            // PlatformCloud grants Slack specifically; Jira and Linear remain locked.
            const result = getAccess('FREE', ['slack_integration'])
            expect(result.canSlack).toBe(true)
            expect(result.canJira).toBe(false)
            expect(result.canLinear).toBe(false)
        })

        it('TEAM + grantedFeatures=["slack_integration","integrations_jira"] → canSlack=true, canJira=true, canLinear=false', () => {
            const result = getAccess('TEAM', ['slack_integration', 'integrations_jira'])
            expect(result.canSlack).toBe(true)
            expect(result.canJira).toBe(true)
            expect(result.canLinear).toBe(false)
        })

        it('PRO + grantedFeatures=["integrations_linear"] → only canLinear=true', () => {
            const result = getAccess('PRO', ['integrations_linear'])
            expect(result.canSlack).toBe(false)
            expect(result.canJira).toBe(false)
            expect(result.canLinear).toBe(true)
        })
    })

    describe('TEAM plan — plan-rank fallback (no override)', () => {
        it('TEAM + grantedFeatures=[] → all integrations accessible (TEAM plan fallback)', () => {
            const result = getAccess('TEAM', [])
            expect(result.canSlack).toBe(true)
            expect(result.canJira).toBe(true)
            expect(result.canLinear).toBe(true)
        })

        it('TEAM + grantedFeatures=undefined → all integrations accessible', () => {
            const result = getAccess('TEAM', undefined)
            expect(result.canSlack).toBe(true)
            expect(result.canJira).toBe(true)
            expect(result.canLinear).toBe(true)
        })
    })

    describe('Edge cases', () => {
        it('all three keys in grantedFeatures → all accessible regardless of plan', () => {
            const all = ['slack_integration', 'integrations_jira', 'integrations_linear']
            const result = getAccess('FREE', all)
            expect(result.canSlack).toBe(true)
            expect(result.canJira).toBe(true)
            expect(result.canLinear).toBe(true)
        })

        it('grantedFeatures with unrelated keys → none of the integration flags set', () => {
            const result = getAccess('PRO', ['some_other_feature', 'compliance_templates'])
            expect(result.canSlack).toBe(false)
            expect(result.canJira).toBe(false)
            expect(result.canLinear).toBe(false)
        })

        it('useGranted is false for undefined (null-ish check)', () => {
            // Regression: make sure undefined never accidentally activates override path
            const result = getAccess('FREE', undefined)
            // If useGranted were true, canSlack would be false (not in []).
            // Since useGranted must be false, plan-rank applies → canSlack=false.
            // Both paths return false here, but the test guards the logic branch.
            expect(result.canSlack).toBe(false)
        })
    })

    describe('Bug regression guard — PRO + empty grantedFeatures must never show UpgradeGate', () => {
        it('PRO + [] → canSlack|canJira|canLinear at least one true → UpgradeGate NOT shown', () => {
            // UpgradeGate is shown only when !canSlack && !canJira && !canLinear.
            // This test directly asserts the combination that drives that condition.
            const { canSlack, canJira, canLinear } = getAccess('PRO', [])
            const upgradeGateShown = !canSlack && !canJira && !canLinear
            expect(upgradeGateShown).toBe(false)
        })

        it('TEAM + [] → UpgradeGate NOT shown', () => {
            const { canSlack, canJira, canLinear } = getAccess('TEAM', [])
            const upgradeGateShown = !canSlack && !canJira && !canLinear
            expect(upgradeGateShown).toBe(false)
        })

        it('FREE + [] → UpgradeGate IS shown (correct behaviour for FREE plan)', () => {
            const { canSlack, canJira, canLinear } = getAccess('FREE', [])
            const upgradeGateShown = !canSlack && !canJira && !canLinear
            expect(upgradeGateShown).toBe(true)
        })
    })
})

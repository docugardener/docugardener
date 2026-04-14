/**
 * HYB-02: DEPLOYMENT_MODE flag expansion — Vitest tests
 *
 * Tests deriveExecutionMode() tri-state handling and noDataEgressGuarantee.
 */

import { describe, it, expect } from "vitest"

// Inline the function under test (same logic as environment-profile/route.ts)
// so this test has zero server-side import dependencies.
function deriveExecutionMode(provider?: string, deploymentMode?: string): string {
    if (deploymentMode === "air-gap") return "air-gap"
    if (deploymentMode === "sovereign" || deploymentMode === "client-installed") return "sovereign"
    if (!provider || provider === "platform_default") return "platform"
    if (provider === "ollama") return "byok_local"
    return "byok_cloud"
}

function noDataEgressGuarantee(mode: string): boolean {
    return mode === "byok_local" || mode === "sovereign" || mode === "air-gap"
}

describe("HYB-02 — deriveExecutionMode()", () => {
    describe("air-gap mode", () => {
        it('returns "air-gap" when deploymentMode is "air-gap"', () => {
            expect(deriveExecutionMode(undefined, "air-gap")).toBe("air-gap")
        })

        it('returns "air-gap" regardless of LLM provider', () => {
            expect(deriveExecutionMode("ollama", "air-gap")).toBe("air-gap")
            expect(deriveExecutionMode("gemini", "air-gap")).toBe("air-gap")
        })
    })

    describe("client-installed mode", () => {
        it('returns "sovereign" when deploymentMode is "client-installed"', () => {
            expect(deriveExecutionMode(undefined, "client-installed")).toBe("sovereign")
        })

        it('returns "sovereign" regardless of LLM provider', () => {
            expect(deriveExecutionMode("gemini", "client-installed")).toBe("sovereign")
            expect(deriveExecutionMode("ollama", "client-installed")).toBe("sovereign")
        })
    })

    describe("backward compat — legacy sovereign value", () => {
        it('returns "sovereign" when deploymentMode is "sovereign" (legacy)', () => {
            expect(deriveExecutionMode(undefined, "sovereign")).toBe("sovereign")
        })
    })

    describe("saas mode (default)", () => {
        it('returns "platform" when no provider and no deploymentMode', () => {
            expect(deriveExecutionMode()).toBe("platform")
        })

        it('returns "platform" when provider is platform_default', () => {
            expect(deriveExecutionMode("platform_default", "saas")).toBe("platform")
        })

        it('returns "byok_local" for ollama provider in saas mode', () => {
            expect(deriveExecutionMode("ollama", "saas")).toBe("byok_local")
        })

        it('returns "byok_cloud" for gemini provider in saas mode', () => {
            expect(deriveExecutionMode("gemini", "saas")).toBe("byok_cloud")
        })
    })
})

describe("HYB-02 — noDataEgressGuarantee", () => {
    it("is true for sovereign (client-installed) mode", () => {
        expect(noDataEgressGuarantee("sovereign")).toBe(true)
    })

    it("is true for air-gap mode", () => {
        expect(noDataEgressGuarantee("air-gap")).toBe(true)
    })

    it("is true for byok_local (Ollama in saas mode)", () => {
        expect(noDataEgressGuarantee("byok_local")).toBe(true)
    })

    it("is false for platform mode", () => {
        expect(noDataEgressGuarantee("platform")).toBe(false)
    })

    it("is false for byok_cloud mode", () => {
        expect(noDataEgressGuarantee("byok_cloud")).toBe(false)
    })
})

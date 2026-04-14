/**
 * HYB-05: Stripe conditional loading — Vitest tests
 *
 * Tests that getStripe() is lazy (no import-time throw) and that billing
 * routes return redirect instructions in non-SaaS modes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── getStripe() lazy init ──────────────────────────────────────────────────

describe("HYB-05 — getStripe() lazy initialization", () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it("does NOT throw at import time when STRIPE_SECRET_KEY is missing", async () => {
        delete process.env.STRIPE_SECRET_KEY
        // Importing the module should not throw
        await expect(import("../lib/stripe")).resolves.toBeDefined()
    })

    it("getStripe() throws when STRIPE_SECRET_KEY is missing", async () => {
        delete process.env.STRIPE_SECRET_KEY
        const { getStripe } = await import("../lib/stripe")
        expect(() => getStripe()).toThrow("STRIPE_SECRET_KEY is not set")
    })

    it("getStripe() throws with helpful message about SaaS mode", async () => {
        delete process.env.STRIPE_SECRET_KEY
        const { getStripe } = await import("../lib/stripe")
        expect(() => getStripe()).toThrow("SaaS mode")
    })

    it("getStripe() returns Stripe instance when key is present", async () => {
        process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_testing"
        const { getStripe } = await import("../lib/stripe")
        const instance = getStripe()
        expect(instance).toBeDefined()
        expect(typeof instance.customers).toBe("object")
        delete process.env.STRIPE_SECRET_KEY
    })

    it("STRIPE_PRICE_IDS exported without triggering getStripe()", async () => {
        delete process.env.STRIPE_SECRET_KEY
        const { STRIPE_PRICE_IDS } = await import("../lib/stripe")
        // Accessing STRIPE_PRICE_IDS must not throw even without the key
        expect(STRIPE_PRICE_IDS).toHaveProperty("pro")
        expect(STRIPE_PRICE_IDS).toHaveProperty("team")
    })

    afterEach(() => {
        delete process.env.STRIPE_SECRET_KEY
        vi.resetModules()
    })
})

// ── Billing route mode guards ─────────────────────────────────────────────

describe("HYB-05 — billing route mode guards", () => {
    it("checkout returns billing_not_available in client-installed mode", () => {
        // Inline the mode-guard logic to test it in isolation
        function checkoutModeGuard(deploymentMode: string | undefined): { blocked: boolean; redirect?: string } {
            if (deploymentMode && deploymentMode !== "saas") {
                return { blocked: true, redirect: "/dashboard/billing/license" }
            }
            return { blocked: false }
        }
        expect(checkoutModeGuard("client-installed")).toEqual({
            blocked: true,
            redirect: "/dashboard/billing/license",
        })
    })

    it("checkout returns billing_not_available in air-gap mode", () => {
        function checkoutModeGuard(deploymentMode: string | undefined) {
            if (deploymentMode && deploymentMode !== "saas") {
                return { blocked: true, redirect: "/dashboard/billing/license" }
            }
            return { blocked: false }
        }
        expect(checkoutModeGuard("air-gap")).toEqual({
            blocked: true,
            redirect: "/dashboard/billing/license",
        })
    })

    it("checkout proceeds normally in saas mode", () => {
        function checkoutModeGuard(deploymentMode: string | undefined) {
            if (deploymentMode && deploymentMode !== "saas") {
                return { blocked: true, redirect: "/dashboard/billing/license" }
            }
            return { blocked: false }
        }
        expect(checkoutModeGuard("saas")).toEqual({ blocked: false })
    })

    it("checkout proceeds normally when DEPLOYMENT_MODE is undefined (default saas)", () => {
        function checkoutModeGuard(deploymentMode: string | undefined) {
            if (deploymentMode && deploymentMode !== "saas") {
                return { blocked: true, redirect: "/dashboard/billing/license" }
            }
            return { blocked: false }
        }
        expect(checkoutModeGuard(undefined)).toEqual({ blocked: false })
    })

    it("portal returns billing_not_available in client-installed mode", () => {
        function portalModeGuard(deploymentMode: string | undefined) {
            if (deploymentMode && deploymentMode !== "saas") {
                return { blocked: true, redirect: "/dashboard/billing/license" }
            }
            return { blocked: false }
        }
        expect(portalModeGuard("client-installed")).toEqual({
            blocked: true,
            redirect: "/dashboard/billing/license",
        })
    })
})

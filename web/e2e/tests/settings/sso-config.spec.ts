/**
 * SPEC-SSO-01 — ADMIN (TEAM plan): SSO card is visible, can fill and save config
 * SPEC-SSO-02 — ADMIN (TEAM plan): SSO card shows certificate saved indicator
 * SPEC-SSO-03 — ADMIN (TEAM plan): SSO card accepts idle timeout minutes
 * SPEC-SSO-04 — FREE plan: SSO card is absent
 *
 * All specs mock the /api/settings/sso GET/POST to avoid real DB mutations.
 * Tenant plan gating (TEAM vs FREE) is enforced server-side; the SSO card
 * is rendered conditionally based on the settings page GET response.
 */
import { test, expect } from "@playwright/test"
import { SsoSettingsPage } from "../../pages/SsoSettingsPage"
import { storageStatePath } from "../../fixtures/auth"
import { mockSsoConfig, SsoConfigFixture } from "../../fixtures/routes"
import { getTenantSsoSnapshot, restoreTenantSsoSnapshot, setTenantPlan } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

// ── SPEC-SSO-01: TEAM plan — can save SSO config ──────────────────────────────

test("SPEC-SSO-01: ADMIN on TEAM plan sees SSO card and can save config", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let snapshot: any = null

    try {
        snapshot = await getTenantSsoSnapshot(E2E_TENANT)
        await setTenantPlan(E2E_TENANT, "TEAM")

        // Mock SSO API — returns empty config (no cert saved)
        await mockSsoConfig(page)

        const sso = new SsoSettingsPage(page)
        await sso.goto()
        await sso.assertSsoCardVisible()

        await sso.enableSso()
        await sso.fillIdpEntityId("https://idp.example.com/saml2/metadata")
        await sso.fillIdpSsoUrl("https://idp.example.com/saml2/sso")
        await sso.fillCertificate("-----BEGIN CERTIFICATE-----\nMIIDfake...\n-----END CERTIFICATE-----")

        await sso.clickSave()
        await sso.assertSaveSuccess()
    } finally {
        if (snapshot) await restoreTenantSsoSnapshot(E2E_TENANT, snapshot)
        await ctx.close()
    }
})

// ── SPEC-SSO-02: Certificate saved indicator ──────────────────────────────────

test("SPEC-SSO-02: SSO card shows 'certificate saved' when hasCertificate=true", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let snapshot: any = null

    try {
        snapshot = await getTenantSsoSnapshot(E2E_TENANT)
        await setTenantPlan(E2E_TENANT, "TEAM")

        await mockSsoConfig(page, {
            ssoEnabled: true,
            ssoProvider: "okta",
            samlIdpEntityId: "https://idp.example.com",
            samlIdpSsoUrl: "https://idp.example.com/sso",
            hasCertificate: true,   // cert already saved
            samlAttrEmail: "email",
            samlAttrRole: "groups",
            samlRoleMapAdmin: "docugardener-admin",
            sessionIdleTimeoutMinutes: 60,
        })

        const sso = new SsoSettingsPage(page)
        await sso.goto()
        await sso.assertSsoCardVisible()

        // "certificate saved" indicator should appear
        await expect(page.getByText(/certificate saved/i)).toBeVisible({ timeout: 8_000 })
    } finally {
        if (snapshot) await restoreTenantSsoSnapshot(E2E_TENANT, snapshot)
        await ctx.close()
    }
})

// ── SPEC-SSO-03: Session idle timeout field ───────────────────────────────────

test("SPEC-SSO-03: ADMIN can set session idle timeout and save", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let snapshot: any = null

    try {
        snapshot = await getTenantSsoSnapshot(E2E_TENANT)
        await setTenantPlan(E2E_TENANT, "TEAM")

        await mockSsoConfig(page)

        const sso = new SsoSettingsPage(page)
        await sso.goto()
        await sso.assertSsoCardVisible()

        await sso.fillIdleTimeout(120)
        await sso.clickSave()
        await sso.assertSaveSuccess()
    } finally {
        if (snapshot) await restoreTenantSsoSnapshot(E2E_TENANT, snapshot)
        await ctx.close()
    }
})

// ── SPEC-SSO-04: FREE plan — SSO card absent ──────────────────────────────────

test("SPEC-SSO-04: FREE plan tenant does not show SSO settings card", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let snapshot: any = null

    try {
        snapshot = await getTenantSsoSnapshot(E2E_TENANT)
        await setTenantPlan(E2E_TENANT, "FREE")

        // Do NOT mock the SSO API — the card should not render at all for FREE plan
        const sso = new SsoSettingsPage(page)
        await sso.goto()
        // Settings page loads but SSO card absent (server renders it only for TEAM plan)
        await expect(page.getByText(/control plane|settings/i).first()).toBeVisible({ timeout: 8_000 })
        await sso.assertSsoCardAbsent()
    } finally {
        if (snapshot) await restoreTenantSsoSnapshot(E2E_TENANT, snapshot)
        await ctx.close()
    }
})

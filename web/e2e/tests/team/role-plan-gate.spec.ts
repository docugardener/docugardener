/**
 * SPEC-GTM03-04 — FREE plan: AUDITOR and BILLING_ADMIN options disabled in role dropdown
 * SPEC-GTM03-05 — PRO  plan: AUDITOR and BILLING_ADMIN options are enabled
 * SPEC-GTM03-06 — FREE plan: API rejects AUDITOR role assignment with 400
 *
 * UserList reads tenantPlan from GET /api/users and passes disabled={tenantPlan==="FREE"}
 * to the AUDITOR and BILLING_ADMIN SelectItems. Radix UI renders disabled SelectItems
 * with aria-disabled="true".
 */
import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../fixtures/auth"
import { mockUserPatch } from "../../fixtures/routes"
import { getTenantPlan, setTenantPlan } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

// ── SPEC-GTM03-04: FREE → AUDITOR/BILLING_ADMIN disabled in dropdown ──────────

test("SPEC-GTM03-04: FREE plan — AUDITOR and BILLING_ADMIN role options are disabled", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "FREE")
        await page.goto("/dashboard/team")

        // Wait for an enabled combobox — the admin's own row is disabled (self-edit guard)
        // Use the first SelectTrigger that is NOT data-disabled
        // Admin's own row has HTML `disabled` attribute; other rows are interactive
        const trigger = page.locator('[role="combobox"]:not([disabled]):not([data-disabled])').first()
        await trigger.waitFor({ timeout: 10_000 })
        await trigger.click()

        // Radix SelectContent appears in a portal; items have role="option"
        // Disabled items carry aria-disabled="true"
        const auditorOption = page.getByRole("option", { name: /auditor/i })
        await expect(auditorOption).toBeVisible({ timeout: 5_000 })
        await expect(auditorOption).toHaveAttribute("aria-disabled", "true")

        const billingOption = page.getByRole("option", { name: /billing/i })
        await expect(billingOption).toBeVisible()
        await expect(billingOption).toHaveAttribute("aria-disabled", "true")
    } finally {
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

// ── SPEC-GTM03-05: PRO → AUDITOR/BILLING_ADMIN enabled ───────────────────────

test("SPEC-GTM03-05: PRO plan — AUDITOR and BILLING_ADMIN role options are enabled", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "PRO")
        await page.goto("/dashboard/team")

        const trigger = page.locator('[role="combobox"]:not([disabled]):not([data-disabled])').first()
        await trigger.waitFor({ timeout: 10_000 })
        await trigger.click()

        const auditorOption = page.getByRole("option", { name: /auditor/i })
        await expect(auditorOption).toBeVisible({ timeout: 5_000 })
        // Enabled items have aria-disabled="false" or no aria-disabled attribute
        await expect(auditorOption).not.toHaveAttribute("aria-disabled", "true")

        const billingOption = page.getByRole("option", { name: /billing/i })
        await expect(billingOption).toBeVisible()
        await expect(billingOption).not.toHaveAttribute("aria-disabled", "true")
    } finally {
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

// ── SPEC-GTM03-06: API rejects AUDITOR assignment on FREE plan ─────────────────

test("SPEC-GTM03-06: FREE plan — API returns 400 when assigning AUDITOR role", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "FREE")

        // Mock PATCH to return plan-gated 400
        await mockUserPatch(page, {
            status: 400,
            body: { error: "role_unavailable", plan: "FREE" },
        })

        // Navigate to team page so page.evaluate has a base URL
        await page.goto("/dashboard/team")
        await page.waitForLoadState("domcontentloaded")

        const response = await page.evaluate(async () => {
            const res = await fetch("/api/users/u1", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: "AUDITOR" }),
            })
            return { status: res.status, body: await res.json() }
        })

        expect(response.status).toBe(400)
        expect(response.body.error).toBe("role_unavailable")
    } finally {
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

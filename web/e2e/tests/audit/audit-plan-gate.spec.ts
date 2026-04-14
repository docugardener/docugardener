/**
 * SPEC-GTM03-01 — FREE plan: Audit page shows upgrade CTA, not the log
 * SPEC-GTM03-02 — PRO  plan: Audit page shows the log; no export button
 * SPEC-GTM03-03 — TEAM plan: Audit page shows the log + Export button with date inputs (GTM-04)
 *
 * Plan is switched in DB before each test and restored in finally.
 * An AuditLog row is seeded for PRO/TEAM tests so the log is not empty.
 */
import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../fixtures/auth"
import { getTenantPlan, setTenantPlan, insertAuditLog, deleteAuditLog } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

// ── SPEC-GTM03-01: FREE → upgrade CTA ─────────────────────────────────────────

test("SPEC-GTM03-01: FREE plan — audit page shows upgrade CTA, not the log", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "FREE")
        await page.goto("/dashboard/audit")

        // Upgrade CTA must appear
        await expect(
            page.getByText(/upgrade|pro feature|audit log.*available/i).first()
        ).toBeVisible({ timeout: 10_000 })

        // Actual log table / entries must NOT be visible
        await expect(page.getByText(/User Login/i)).not.toBeVisible()
        await expect(page.getByRole("button", { name: /^CSV$/i })).not.toBeVisible()
        await expect(page.getByRole("button", { name: /^JSON$/i })).not.toBeVisible()
    } finally {
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

// ── SPEC-GTM03-02: PRO → log visible, no export ───────────────────────────────

test("SPEC-GTM03-02: PRO plan — audit log visible, export button absent", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)
    let auditId: string | null = null

    try {
        await setTenantPlan(E2E_TENANT, "PRO")
        const entry = await insertAuditLog(E2E_TENANT, "USER_LOGIN", "e2e-admin@test.local")
        auditId = entry.id

        await page.goto("/dashboard/audit")

        // Log must render
        await expect(page.getByText(/audit log/i).first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText(/User Login/i).first()).toBeVisible()

        // Export CSV/JSON buttons must NOT be present for PRO
        await expect(page.getByRole("button", { name: /^CSV$/i })).not.toBeVisible()
        await expect(page.getByRole("button", { name: /^JSON$/i })).not.toBeVisible()
    } finally {
        if (auditId) await deleteAuditLog(auditId)
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

// ── SPEC-GTM03-03 / SPEC-GTM04-01: TEAM → log + export with date inputs ───────

test("SPEC-GTM03-03: TEAM plan — audit log visible with Export button and date range inputs", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)
    let auditId: string | null = null

    try {
        await setTenantPlan(E2E_TENANT, "TEAM")
        const entry = await insertAuditLog(E2E_TENANT, "USER_LOGIN", "e2e-admin@test.local")
        auditId = entry.id

        await page.goto("/dashboard/audit")

        // Log must render
        await expect(page.getByText(/audit log/i).first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText(/User Login/i).first()).toBeVisible()

        // Export buttons (CSV / JSON) must be present for TEAM
        await expect(page.getByRole("button", { name: /^CSV$/i })).toBeVisible()
        await expect(page.getByRole("button", { name: /^JSON$/i })).toBeVisible()

        // Date range inputs (From / To) must be present (GTM-04)
        await expect(page.locator('input[type="date"]').first()).toBeVisible()
        await expect(page.locator('input[type="date"]').nth(1)).toBeVisible()
    } finally {
        if (auditId) await deleteAuditLog(auditId)
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

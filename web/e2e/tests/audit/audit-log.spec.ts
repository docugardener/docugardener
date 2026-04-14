/**
 * SPEC-AUDIT-01 — Audit log page loads entries for AUDITOR
 */
import { test, expect } from "@playwright/test"
import { AuditPage } from "../../pages/AuditPage"
import { storageStatePath } from "../../fixtures/auth"
import { insertAuditLog, deleteAuditLog } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

test("SPEC-AUDIT-01: AUDITOR can view audit log entries", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("AUDITOR") })
    const page = await ctx.newPage()
    let auditId: string | null = null

    try {
        const entry = await insertAuditLog(E2E_TENANT, "USER_LOGIN", "e2e-auditor@test.local")
        auditId = entry.id

        const audit = new AuditPage(page)
        await audit.goto()
        await audit.assertAuditLogLoaded()
        // Log entry for USER_LOGIN renders as "User Login" badge
        await audit.assertEventVisible("User Login")
    } finally {
        if (auditId) await deleteAuditLog(auditId)
        await ctx.close()
    }
})

/**
 * SPEC-REPORTS-01 — Reports page role-based UI elements
 */
import { test, expect } from "@playwright/test"
import { ReportsPage } from "../../pages/ReportsPage"
import { storageStatePath } from "../../fixtures/auth"
import { mockBillingApi } from "../../fixtures/routes"

test("SPEC-REPORTS-01: Reports page shows correct elements per role", async ({ browser }) => {
    // ADMIN: Control Plane button visible
    {
        const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
        const page = await ctx.newPage()
        await mockBillingApi(page)
        const reports = new ReportsPage(page)
        await reports.goto()
        await reports.assertControlPlaneButtonVisible()
        await ctx.close()
    }

    // VIEWER: Review All Zones visible, Control Plane absent
    {
        const ctx = await browser.newContext({ storageState: storageStatePath("VIEWER") })
        const page = await ctx.newPage()
        const reports = new ReportsPage(page)
        await reports.goto()
        await reports.assertControlPlaneButtonAbsent()
        await reports.assertReviewAllZonesVisible()
        await ctx.close()
    }

    // AUDITOR: both buttons absent
    {
        const ctx = await browser.newContext({ storageState: storageStatePath("AUDITOR") })
        const page = await ctx.newPage()
        const reports = new ReportsPage(page)
        await reports.goto()
        await reports.assertControlPlaneButtonAbsent()
        await reports.assertReviewAllZonesAbsent()
        await ctx.close()
    }
})

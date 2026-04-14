/**
 * EVID-01 / FIX-01: Governance tab KPI E2E regression
 *
 * SPEC-GOV-01  Governance tab shows Evidence Coverage KPI tile
 * SPEC-GOV-02  Governance tab shows Auto-Fix Success Rate KPI tile
 * SPEC-GOV-03  Reports Overview tab shows Dismiss Rate by Severity in Dismiss Signals
 */
import { test, expect } from "@playwright/test"
import { ReportsPage } from "../../pages/ReportsPage"
import { storageStatePath } from "../../fixtures/auth"
import { mockBillingApi } from "../../fixtures/routes"

test("SPEC-GOV-01: Governance tab shows Evidence Coverage KPI", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    try {
        await mockBillingApi(page)
        const reports = new ReportsPage(page)
        await reports.goto()
        await reports.goToGovernanceTab()
        await reports.assertEvidenceCoverageKpiVisible()
    } finally {
        await ctx.close()
    }
})

test("SPEC-GOV-02: Governance tab shows Auto-Fix Success Rate KPI", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    try {
        await mockBillingApi(page)
        const reports = new ReportsPage(page)
        await reports.goto()
        await reports.goToGovernanceTab()
        await reports.assertAutoFixSuccessRateVisible()
    } finally {
        await ctx.close()
    }
})

test("SPEC-GOV-03: Overview tab Dismiss Signals shows Dismiss Rate by Severity", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    try {
        await mockBillingApi(page)
        const reports = new ReportsPage(page)
        await reports.goto()
        // Dismiss Signals is in Overview tab (default), visible for PRO+ — e2e tenant is TEAM
        await reports.assertDismissRateBySeverityVisible()
    } finally {
        await ctx.close()
    }
})

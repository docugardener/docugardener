/**
 * MODE-01: Execution Mode card E2E regression
 *
 * SPEC-MODE01-E2E-1  Intelligence tab shows Execution Mode card with mode badge
 * SPEC-MODE01-E2E-2  Export Profile button visible for TEAM plan ADMIN
 * SPEC-MODE01-E2E-3  Export Profile button absent for non-TEAM plan
 */
import { test, expect } from "@playwright/test"
import { SettingsPage } from "../../pages/SettingsPage"
import { storageStatePath } from "../../fixtures/auth"

const E2E_TENANT = "e2e-tenant-fixed" // TEAM plan in seed

test("SPEC-MODE01-E2E-1: Intelligence tab shows Execution Mode card", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    try {
        const settings = new SettingsPage(page)
        await settings.goto()
        await settings.goToIntelligenceTab()
        await settings.assertExecutionModeCardVisible()
        // e2e tenant has no llmConfig set → Platform Mode
        await settings.assertExecutionModeBadgeVisible("Platform Mode")
    } finally {
        await ctx.close()
    }
})

test("SPEC-MODE01-E2E-2: Export Profile button visible for TEAM plan ADMIN", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    try {
        const settings = new SettingsPage(page)
        await settings.goto()
        await settings.goToIntelligenceTab()
        await settings.assertExportProfileButtonVisible()
    } finally {
        await ctx.close()
    }
})

test("SPEC-MODE01-E2E-3: Export Profile button absent for VIEWER role", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("VIEWER") })
    const page = await ctx.newPage()
    try {
        const settings = new SettingsPage(page)
        await settings.goto()
        // VIEWER sees Intelligence tab but has no TEAM-gated export button
        await settings.goToIntelligenceTab()
        await settings.assertExportProfileButtonAbsent()
    } finally {
        await ctx.close()
    }
})

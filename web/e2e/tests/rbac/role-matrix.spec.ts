/**
 * SPEC-RBAC-01 — ADMIN: Full Navigation Access
 * SPEC-RBAC-02 — AUDITOR: Restricted Navigation
 * SPEC-RBAC-03 — BILLING_ADMIN: Finance Access Only
 * SPEC-RBAC-04 — VIEWER: Read-Only Inbox
 *
 * Each test uses its role's cached storageState (created in setup.ts).
 * No mutations — navigation only, except VIEWER which uses a fixture job.
 */
import { test, expect } from "@playwright/test"
import { SidebarComponent } from "../../pages/SidebarComponent"
import { InboxPage } from "../../pages/InboxPage"
import { ReportsPage } from "../../pages/ReportsPage"
import { storageStatePath } from "../../fixtures/auth"
import { mockBillingApi, mockInboxList } from "../../fixtures/routes"
import { createFixtureJob, deleteJob } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

// ── SPEC-RBAC-01 — ADMIN ──────────────────────────────────────────────────────
test("SPEC-RBAC-01: ADMIN has full navigation", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    await mockBillingApi(page)

    const sidebar = new SidebarComponent(page)
    const reports = new ReportsPage(page)

    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/dashboard\/inbox/)

    await sidebar.assertNavItems("ADMIN")

    // Verify all protected pages load without redirect
    for (const route of ["/dashboard/settings", "/dashboard/audit", "/dashboard/billing", "/dashboard/team"]) {
        await page.goto(route)
        await expect(page).toHaveURL(new RegExp(route))
    }

    // Control Plane button on reports (ADMIN only)
    await reports.goto()
    await reports.assertControlPlaneButtonVisible()

    await ctx.close()
})

// ── SPEC-RBAC-02 — AUDITOR ───────────────────────────────────────────────────
test("SPEC-RBAC-02: AUDITOR has restricted navigation", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("AUDITOR") })
    const page = await ctx.newPage()

    const sidebar = new SidebarComponent(page)
    const reports = new ReportsPage(page)

    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/dashboard\/audit/)

    await sidebar.assertNavItems("AUDITOR")
    await sidebar.assertNavAbsent("AUDITOR")

    // Blocked routes redirect away
    for (const route of ["/dashboard/settings", "/dashboard/billing", "/dashboard/team"]) {
        await page.goto(route)
        await expect(page).not.toHaveURL(new RegExp(route.replace("/", "\\/")))
    }

    // Reports page — admin-only buttons absent
    await reports.goto()
    await reports.assertControlPlaneButtonAbsent()
    await reports.assertReviewAllZonesAbsent()

    await ctx.close()
})

// ── SPEC-RBAC-03 — BILLING_ADMIN ─────────────────────────────────────────────
test("SPEC-RBAC-03: BILLING_ADMIN has finance access only", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("BILLING_ADMIN") })
    const page = await ctx.newPage()
    await mockBillingApi(page)

    const sidebar = new SidebarComponent(page)
    const reports = new ReportsPage(page)

    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/dashboard\/billing/, { timeout: 10_000 })
    await page.waitForLoadState("networkidle")

    await sidebar.assertNavItems("BILLING_ADMIN")
    await sidebar.assertNavAbsent("BILLING_ADMIN")

    // Blocked routes redirect away
    for (const route of ["/dashboard/settings", "/dashboard/audit"]) {
        await page.goto(route)
        await expect(page).not.toHaveURL(new RegExp(route.replace("/", "\\/")))
    }

    // Reports — no admin buttons
    await reports.goto()
    await reports.assertControlPlaneButtonAbsent()
    await reports.assertReviewAllZonesAbsent()

    await ctx.close()
})

// ── SPEC-RBAC-04 — VIEWER ────────────────────────────────────────────────────
test("SPEC-RBAC-04: VIEWER sees read-only inbox", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("VIEWER") })
    const page = await ctx.newPage()

    let jobId: string | null = null

    let repositoryId: string | null = null

    try {
        const job = await createFixtureJob({
            tenantId: E2E_TENANT,
            repoName: "e2e-test-repo",
            triageStatus: "PENDING",
            driftScore: 45,
        })
        jobId = job.id
        repositoryId = job.repositoryId

        await mockInboxList(page, jobId, "e2e-test-repo")

        const sidebar = new SidebarComponent(page)
        const inbox = new InboxPage(page)
        const reports = new ReportsPage(page)

        await page.goto("/dashboard")
        await expect(page).toHaveURL(/\/dashboard\/inbox/, { timeout: 10_000 })
        await page.waitForLoadState("networkidle")

        await sidebar.assertNavItems("VIEWER")
        await sidebar.assertNavAbsent("VIEWER")

        // Select fixture alert and verify read-only UI
        await inbox.goto()
        await inbox.selectAlertByRepoName("e2e-test-repo")
        await inbox.assertAcceptButtonAbsent()
        await inbox.assertIgnoreButtonAbsent()
        await inbox.assertReadOnlyLabel()

        // Getting Started banner hidden for VIEWER
        await inbox.assertGettingStartedAbsent()

        // Reports — Review All Zones IS visible for VIEWER
        await reports.goto()
        await reports.assertReviewAllZonesVisible()
    } finally {
        if (jobId) await deleteJob(jobId, repositoryId ?? undefined)
        await ctx.close()
    }
})

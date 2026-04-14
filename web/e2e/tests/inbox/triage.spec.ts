/**
 * SPEC-INBOX-01 — Accept drift (ADMIN, mocked GitHub)
 * SPEC-INBOX-02 — Dismiss: significant severity requires typed reason
 * SPEC-INBOX-03 — VIEWER: inbox is read-only (no triage buttons)
 */
import { test, expect } from "@playwright/test"
import { InboxPage } from "../../pages/InboxPage"
import { storageStatePath } from "../../fixtures/auth"
import { mockInboxTriage } from "../../fixtures/routes"
import { createFixtureJob, deleteJob } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

// SPEC-INBOX-01 — ADMIN, Accept
test("SPEC-INBOX-01: ADMIN can accept drift (mocked)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let jobId: string | null = null
    let repositoryId: string | null = null

    try {
        const job = await createFixtureJob({
            tenantId: E2E_TENANT,
            repoName: "e2e-accept-repo",
            triageStatus: "PENDING",
            driftScore: 72,
            severity: "significant",
        })
        jobId = job.id
        repositoryId = job.repositoryId

        await mockInboxTriage(page, jobId)
        const inbox = new InboxPage(page)
        await inbox.goto()
        await inbox.selectAlertByRepoName("e2e-accept-repo")
        await inbox.assertAcceptButtonVisible()
        await inbox.clickAccept()
        await inbox.assertSuccessToast()
    } finally {
        if (jobId) await deleteJob(jobId, repositoryId ?? undefined)
        await ctx.close()
    }
})

// SPEC-INBOX-02 — Dismiss: significant requires reason
test("SPEC-INBOX-02: significant alert requires dismiss reason", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let jobId: string | null = null
    let repositoryId: string | null = null

    try {
        const job = await createFixtureJob({
            tenantId: E2E_TENANT,
            repoName: "e2e-dismiss-repo",
            triageStatus: "PENDING",
            driftScore: 80,
            severity: "significant",
        })
        jobId = job.id
        repositoryId = job.repositoryId

        await mockInboxTriage(page, jobId)
        await page.goto("/dashboard/inbox")

        await page.getByText("e2e-dismiss-repo").first().click()

        // Click dismiss — should open reason textarea (not fire immediately)
        await page.getByRole("button", { name: /no update required/i }).click()
        await expect(page.getByPlaceholder(/explain why/i)).toBeVisible()

        // Confirm button disabled until reason typed
        const confirm = page.getByRole("button", { name: /confirm/i })
        await expect(confirm).toBeDisabled()

        await page.getByPlaceholder(/explain why/i).fill("Covered by inline code comments instead.")
        await expect(confirm).toBeEnabled()
        await confirm.click()

        // Alert leaves list
        await expect(page.getByText("e2e-dismiss-repo").first()).not.toBeVisible({ timeout: 5_000 })
    } finally {
        if (jobId) await deleteJob(jobId, repositoryId ?? undefined)
        await ctx.close()
    }
})

// SPEC-INBOX-03 — VIEWER read-only
test("SPEC-INBOX-03: VIEWER sees read-only inbox", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("VIEWER") })
    const page = await ctx.newPage()
    let jobId: string | null = null
    let repositoryId: string | null = null

    try {
        const job = await createFixtureJob({
            tenantId: E2E_TENANT,
            repoName: "e2e-viewer-repo",
            triageStatus: "PENDING",
            driftScore: 35,
        })
        jobId = job.id
        repositoryId = job.repositoryId

        const inbox = new InboxPage(page)
        await inbox.goto()
        await inbox.selectAlertByRepoName("e2e-viewer-repo")
        await inbox.assertAcceptButtonAbsent()
        await inbox.assertIgnoreButtonAbsent()
        await inbox.assertReadOnlyLabel()
    } finally {
        if (jobId) await deleteJob(jobId, repositoryId ?? undefined)
        await ctx.close()
    }
})

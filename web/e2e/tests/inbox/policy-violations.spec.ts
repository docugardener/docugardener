/**
 * DOCPOL-01: Policy-as-Code — E2E tests for inbox UI
 *
 * SPEC-DOCPOL01-01  Inbox list shows POLICY badge when job has a policy violation
 * SPEC-DOCPOL01-02  SemanticDiffViewer shows policy panel with rule name and missing docs
 * SPEC-DOCPOL01-03  Dismissing a blocking-with-reason violation requires a typed reason
 */
import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../fixtures/auth"
import { mockInboxTriage } from "../../fixtures/routes"
import { createFixtureJobWithPolicy, deleteJob } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

test("SPEC-DOCPOL01-01: inbox list shows POLICY badge for policy violation job", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let jobId: string | null = null
    let repositoryId: string | null = null

    try {
        const job = await createFixtureJobWithPolicy({
            tenantId: E2E_TENANT,
            repoName: "e2e-policy-badge-repo",
            triageStatus: "PENDING",
            driftScore: 60,
            severity: "moderate",
            policyEnforcement: "blocking",
            policyRuleName: "api-docs-required",
        })
        jobId = job.id
        repositoryId = job.repositoryId

        await page.goto("/dashboard/inbox")
        await page.waitForSelector("text=e2e-policy-badge-repo", { timeout: 10_000 })

        // The policy indicator is rendered as 🛡️ emoji for inbox list items
        const listItem = page.getByText("e2e-policy-badge-repo").first().locator("..").locator("..")
        await expect(listItem.getByText("🛡️")).toBeVisible()
    } finally {
        if (jobId) await deleteJob(jobId, repositoryId ?? undefined)
        await ctx.close()
    }
})

test("SPEC-DOCPOL01-02: detail view shows policy violations panel with rule name and missing docs", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let jobId: string | null = null
    let repositoryId: string | null = null

    try {
        const job = await createFixtureJobWithPolicy({
            tenantId: E2E_TENANT,
            repoName: "e2e-policy-panel-repo",
            triageStatus: "PENDING",
            driftScore: 70,
            severity: "significant",
            policyEnforcement: "blocking",
            policyRuleName: "api-docs-required",
        })
        jobId = job.id
        repositoryId = job.repositoryId

        await page.goto("/dashboard/inbox")
        await page.getByText("e2e-policy-panel-repo").first().click()

        // Policy collapsible summary — shows "N policy violation(s)"
        const policySummary = page.getByText(/policy violation/i).first()
        await expect(policySummary).toBeVisible({ timeout: 8_000 })

        // Expand the <details> to see rule name and missing docs
        await policySummary.click()

        // Rule name shown
        await expect(page.getByText("api-docs-required")).toBeVisible({ timeout: 5_000 })

        // Missing docs shown
        await expect(page.getByText("docs/api/**")).toBeVisible()
    } finally {
        if (jobId) await deleteJob(jobId, repositoryId ?? undefined)
        await ctx.close()
    }
})

test("SPEC-DOCPOL01-03: dismissing blocking-with-reason violation requires typed reason", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let jobId: string | null = null
    let repositoryId: string | null = null

    try {
        const job = await createFixtureJobWithPolicy({
            tenantId: E2E_TENANT,
            repoName: "e2e-policy-reason-repo",
            triageStatus: "PENDING",
            driftScore: 50,
            severity: "moderate",
            policyEnforcement: "blocking-with-reason",
            policyRuleName: "sec-policy",
        })
        jobId = job.id
        repositoryId = job.repositoryId

        await mockInboxTriage(page, jobId)
        await page.goto("/dashboard/inbox")
        await page.getByText("e2e-policy-reason-repo").first().click()

        // Click "No Update Required" — should open reason textarea
        await page.getByRole("button", { name: /no update required/i }).click()
        await expect(page.getByPlaceholder(/explain why/i)).toBeVisible()

        // Confirm is disabled until reason is typed
        const confirm = page.getByRole("button", { name: /confirm/i })
        await expect(confirm).toBeDisabled()

        await page.getByPlaceholder(/explain why/i).fill("Policy exception: covered by ADR-42")
        await expect(confirm).toBeEnabled()
        await confirm.click()

        // Alert leaves the list
        await expect(page.getByText("e2e-policy-reason-repo").first()).not.toBeVisible({ timeout: 5_000 })
    } finally {
        if (jobId) await deleteJob(jobId, repositoryId ?? undefined)
        await ctx.close()
    }
})

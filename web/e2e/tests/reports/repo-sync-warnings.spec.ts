/**
 * SPEC-GAPE-01 — FREE plan: Sync Repositories shows toast.warning for each warning
 *                returned by POST /api/repos
 * SPEC-GAPE-02 — PRO  plan: Sync Repositories with no warnings → no toast fires
 *
 * POST /api/repos is mocked via page.route() so tests are independent of
 * the actual GitHub App installation.
 *
 * The "Sync Repositories" button lives inside RepoListCard, which is embedded
 * in the Settings page (/dashboard/settings).
 */
import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../fixtures/auth"
import { mockReposSync } from "../../fixtures/routes"
import { getTenantPlan, setTenantPlan } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

const PRIVATE_REPO_WARNING =
    "1 private repo(s) were skipped — private repositories require a Pro or Team plan."
const LIMIT_WARNING =
    "Only 1 public repo is monitored on the Free plan. Upgrade for more."

// ── SPEC-GAPE-01: warnings → toast.warning fires for each ─────────────────────

test("SPEC-GAPE-01: FREE plan — sync warnings appear as toast notifications", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "FREE")

        // Mock POST /api/repos to return two warnings
        await mockReposSync(page, [PRIVATE_REPO_WARNING, LIMIT_WARNING])

        // RepoListCard (with Sync Repositories button) is in Settings, not Reports
        await page.goto("/dashboard/settings")
        await page.waitForLoadState("networkidle")

        // Wait for the Sync button inside RepoListCard
        const syncBtn = page.getByRole("button", { name: /sync repositories/i })
        await syncBtn.waitFor({ timeout: 10_000 })
        await syncBtn.click()

        // Both warning toasts must appear (Sonner renders them in the DOM)
        await expect(
            page.getByText(PRIVATE_REPO_WARNING)
        ).toBeVisible({ timeout: 10_000 })

        await expect(
            page.getByText(LIMIT_WARNING)
        ).toBeVisible({ timeout: 5_000 })
    } finally {
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

// ── SPEC-GAPE-02: no warnings → no toast ──────────────────────────────────────

test("SPEC-GAPE-02: PRO plan — sync with no warnings shows no warning toast", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "PRO")

        // Mock POST /api/repos to return no warnings
        await mockReposSync(page, [])

        await page.goto("/dashboard/settings")
        await page.waitForLoadState("networkidle")

        const syncBtn = page.getByRole("button", { name: /sync repositories/i })
        await syncBtn.waitFor({ timeout: 10_000 })
        await syncBtn.click()

        // Wait briefly then assert no warning toast appeared
        await page.waitForTimeout(2_000)
        await expect(page.getByText(/private repo.*skipped|only.*public repo/i)).not.toBeVisible()
    } finally {
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

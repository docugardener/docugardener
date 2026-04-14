/**
 * MAP-01: Documentation Coverage & Risk Map — E2E tests
 *
 * SPEC-MAP01-01  Repositories tab shows Risk Map card for PRO tenant
 * SPEC-MAP01-02  Risk zones table renders with repo name, risk score, and severity badge
 * SPEC-MAP01-03  Time-range filter triggers a new API request
 * SPEC-MAP01-04  FREE tenant sees upgrade prompt instead of risk map
 * SPEC-MAP01-05  "View Risk Map" button on Vitality Index navigates to Repositories tab
 * SPEC-MAP01-06  Direct ?tab=repositories URL activates Repositories tab without clicking
 */
import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../fixtures/auth"
import { createFixtureJob, deleteJob, setTenantPlan, getTenantPlan } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

const RISK_ZONES_FIXTURE = {
    zones: [
        {
            repoId: "r1",
            repoName: "e2e-risk-repo",
            riskScore: 72,
            severity: "high",
            unresolvedCount: 2,
            recentEvents: [{ severity: "significant", createdAt: new Date().toISOString(), prNumber: 42 }],
            topPaths: ["src/api/routes.py"],
            policyViolationCount: 0,
        },
    ],
}

test("SPEC-MAP01-01: Repositories tab shows Documentation Risk Map card for PRO tenant", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const prevPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "PRO")

        // Mock the risk-zones API
        await page.route("**/api/reports/risk-zones**", (route) => {
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RISK_ZONES_FIXTURE) })
        })

        await page.goto("/dashboard/reports")
        await page.getByRole("button", { name: "Repositories" }).click()

        // The card header should be visible
        await expect(page.getByText("Documentation Risk Map")).toBeVisible({ timeout: 8_000 })
    } finally {
        // @ts-ignore plan type
        await setTenantPlan(E2E_TENANT, prevPlan as any)
        await ctx.close()
    }
})

test("SPEC-MAP01-02: risk zones table renders repo name, score, and severity badge", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const prevPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "PRO")

        await page.route("**/api/reports/risk-zones**", (route) => {
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RISK_ZONES_FIXTURE) })
        })

        await page.goto("/dashboard/reports")
        await page.getByRole("button", { name: "Repositories" }).click()

        // Wait for table
        await expect(page.locator("[data-testid='risk-zones-table']")).toBeVisible({ timeout: 10_000 })

        // Repo name
        await expect(page.getByText("e2e-risk-repo")).toBeVisible()

        // Score — 72 should appear somewhere in the row
        await expect(page.getByText("72")).toBeVisible()

        // Severity badge
        await expect(page.getByText("high")).toBeVisible()
    } finally {
        // @ts-ignore
        await setTenantPlan(E2E_TENANT, prevPlan as any)
        await ctx.close()
    }
})

test("SPEC-MAP01-03: changing time-range filter triggers a new API request", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const prevPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "PRO")

        const requests: string[] = []
        await page.route("**/api/reports/risk-zones**", (route) => {
            requests.push(route.request().url())
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RISK_ZONES_FIXTURE) })
        })

        await page.goto("/dashboard/reports")
        await page.getByRole("button", { name: "Repositories" }).click()

        // Wait for initial load
        await expect(page.locator("[data-testid='risk-zones-table']")).toBeVisible({ timeout: 10_000 })
        const initialCount = requests.length

        // Change time range
        await page.getByLabel("Time range").selectOption("7d")
        await page.getByRole("button", { name: /apply/i }).click()

        // Should have fired another request
        await page.waitForTimeout(500)
        expect(requests.length).toBeGreaterThan(initialCount)
        expect(requests[requests.length - 1]).toContain("timeRange=7d")
    } finally {
        // @ts-ignore
        await setTenantPlan(E2E_TENANT, prevPlan as any)
        await ctx.close()
    }
})

test("SPEC-MAP01-04: FREE tenant sees upgrade prompt instead of risk map", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const prevPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "FREE")

        await page.goto("/dashboard/reports")
        await page.getByRole("button", { name: "Repositories" }).click()

        // Upgrade prompt visible, risk map table not present
        await expect(page.getByText("Documentation Risk Map — Pro Feature")).toBeVisible({ timeout: 8_000 })
        await expect(page.locator("[data-testid='risk-zones-table']")).not.toBeVisible()
    } finally {
        // @ts-ignore
        await setTenantPlan(E2E_TENANT, prevPlan as any)
        await ctx.close()
    }
})

test("SPEC-MAP01-05: View Risk Map button on Vitality Index navigates to Repositories tab", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const prevPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "PRO")

        await page.route("**/api/reports/risk-zones**", (route) => {
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RISK_ZONES_FIXTURE) })
        })

        await page.goto("/dashboard/reports")

        // "View Risk Map" button lives in the Overview tab (default) on the Vitality Index card
        await page.getByRole("button", { name: /view risk map/i }).click()

        // Should now be on Repositories tab — risk map card visible
        await expect(page.getByText("Documentation Risk Map")).toBeVisible({ timeout: 8_000 })
        // URL should reflect the tab change
        await expect(page).toHaveURL(/tab=repositories/)
    } finally {
        // @ts-ignore
        await setTenantPlan(E2E_TENANT, prevPlan as any)
        await ctx.close()
    }
})

test("SPEC-MAP01-06: direct ?tab=repositories URL activates Repositories tab without clicking", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const prevPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "PRO")

        await page.route("**/api/reports/risk-zones**", (route) => {
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RISK_ZONES_FIXTURE) })
        })

        // Navigate directly with ?tab=repositories — no click required
        await page.goto("/dashboard/reports?tab=repositories")

        // Repositories tab content should be active immediately
        await expect(page.getByText("Documentation Risk Map")).toBeVisible({ timeout: 8_000 })

        // Overview-only content (e.g. Vitality Index heading) should not be visible
        await expect(page.getByText("Vitality Index")).not.toBeVisible()
    } finally {
        // @ts-ignore
        await setTenantPlan(E2E_TENANT, prevPlan as any)
        await ctx.close()
    }
})

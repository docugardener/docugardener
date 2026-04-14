/**
 * SPEC-GTM02-01 — FREE plan: Workflow Integrations section shows upgrade CTA (locked)
 * SPEC-GTM02-02 — PRO  plan: Workflow Integrations section shows the Slack/Jira form
 * SPEC-GTM02-03 — TEAM plan: Workflow Integrations section shows the Slack/Jira form
 *
 * IntegrationsForm is rendered on /dashboard/settings under "Workflow Integrations".
 * Plan is read server-side from the Tenant row; plan is switched in DB before each test
 * and restored in finally.
 */
import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../fixtures/auth"
import { mockSettingsApi } from "../../fixtures/routes"
import { getTenantPlan, setTenantPlan } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

// ── SPEC-GTM02-01: FREE → locked upgrade CTA ─────────────────────────────────

test("SPEC-GTM02-01: FREE plan — IntegrationsForm shows upgrade CTA, not the form", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "FREE")
        await mockSettingsApi(page)

        await page.goto("/dashboard/settings")
        await page.getByRole("button", { name: "Integrations" }).click()

        // Upgrade CTA must be present
        await expect(page.getByText(/Pro Feature/i)).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText(/Upgrade to Pro/i)).toBeVisible()

        // The actual Slack/Jira inputs must NOT be present
        await expect(page.locator('input[name="slackWebhook"]')).not.toBeVisible()
        await expect(page.locator('input[name="jiraHost"]')).not.toBeVisible()
    } finally {
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

// ── SPEC-GTM02-02: PRO → form is accessible ───────────────────────────────────

test("SPEC-GTM02-02: PRO plan — IntegrationsForm shows Slack/Jira fields", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "PRO")
        await mockSettingsApi(page)

        await page.goto("/dashboard/settings")
        await page.getByRole("button", { name: "Integrations" }).click()

        // The "Workflow Integrations" section heading must be visible
        await expect(page.getByText(/Workflow Integrations/i)).toBeVisible({ timeout: 10_000 })

        // Upgrade CTA must NOT appear
        await expect(page.getByText(/Pro Feature/i)).not.toBeVisible()

        // Slack input must be present
        await expect(page.locator('input[name="slackWebhook"]')).toBeVisible()
    } finally {
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

// ── SPEC-GTM02-03: TEAM → form is accessible ──────────────────────────────────

test("SPEC-GTM02-03: TEAM plan — IntegrationsForm shows Slack/Jira fields", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    const originalPlan = await getTenantPlan(E2E_TENANT)

    try {
        await setTenantPlan(E2E_TENANT, "TEAM")
        await mockSettingsApi(page)

        await page.goto("/dashboard/settings")
        await page.getByRole("button", { name: "Integrations" }).click()

        await expect(page.getByText(/Workflow Integrations/i)).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText(/Pro Feature/i)).not.toBeVisible()
        await expect(page.locator('input[name="slackWebhook"]')).toBeVisible()
    } finally {
        await setTenantPlan(E2E_TENANT, originalPlan)
        await ctx.close()
    }
})

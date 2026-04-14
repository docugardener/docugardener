/**
 * SPEC-TEAM-01 — ADMIN: "Revoke All Sessions" button is present on Team page
 * SPEC-TEAM-02 — ADMIN: Revoke dialog appears on click, success toast on confirm
 *
 * API call is mocked — revoke is destructive and would invalidate the test user's own session.
 */
import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../fixtures/auth"
import { mockRevokeSessionsApi } from "../../fixtures/routes"

// ── SPEC-TEAM-01: Revoke button visible for ADMIN ────────────────────────────

test("SPEC-TEAM-01: ADMIN sees Revoke All Sessions button on Team page", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        await page.goto("/dashboard/team")
        await expect(page.getByRole("button", { name: /revoke all sessions/i })).toBeVisible({ timeout: 8_000 })
    } finally {
        await ctx.close()
    }
})

// ── SPEC-TEAM-02: Revoke confirmation dialog and success toast ────────────────

test("SPEC-TEAM-02: Revoke All Sessions shows dialog and completes with success", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        // Mock the POST so we don't actually revoke the test session
        await mockRevokeSessionsApi(page)

        await page.goto("/dashboard/team")

        const revokeBtn = page.getByRole("button", { name: /revoke all sessions/i })
        await revokeBtn.click()

        // Confirmation dialog should appear
        await expect(page.getByText(/revoke all/i).first()).toBeVisible({ timeout: 5_000 })

        // Click the confirm button in the dialog
        const confirmBtn = page.getByRole("button", { name: /revoke/i }).last()
        await confirmBtn.click()

        // Success feedback (toast or inline text)
        await expect(page.getByText(/revoked|sessions.*revoked|all sessions.*signed out/i).first()).toBeVisible({ timeout: 8_000 })
    } finally {
        await ctx.close()
    }
})

/**
 * D-4: Cold Onboarding Smoke Test
 *
 * Validates the complete first-user experience:
 *   - A new user (signed in but no tenant) is gated at /onboarding
 *   - The onboarding page renders both wizard and manual modes
 *   - An unauthenticated visitor is redirected to sign-in (not onboarding)
 *
 * SPEC-ONBOARD-01 — Authenticated user with no tenant → /onboarding
 * SPEC-ONBOARD-02 — Onboarding page renders wizard + manual modes
 * SPEC-ONBOARD-03 — Unauthenticated visitor to /dashboard → sign-in redirect
 */
import { test, expect } from "@playwright/test"

const NEW_USER_EMAIL = "e2e-newuser@test.local"

/**
 * Signs in as the cold-path user (no tenant) and returns the page.
 * Uses a fresh browser context so no cached session bleeds in.
 */
async function signInAsNewUser(browser: import("@playwright/test").Browser) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    await page.goto("/api/auth/signin")
    await page.getByPlaceholder("user@test.local").fill(NEW_USER_EMAIL)
    await page.getByRole("button", { name: /dev login/i }).click()

    return { ctx, page }
}

// ── SPEC-ONBOARD-01 ───────────────────────────────────────────────────────────

test("SPEC-ONBOARD-01: signed-in user with no tenant is redirected to /onboarding", async ({ browser }) => {
    const { ctx, page } = await signInAsNewUser(browser)

    try {
        // Wait for the redirect after sign-in — should land on /onboarding, not /dashboard
        await page.waitForURL(/\/onboarding/, { timeout: 15_000 })
        await expect(page).toHaveURL(/\/onboarding/)

        // Navigating to a protected dashboard page must redirect back to /onboarding
        await page.goto("/dashboard/inbox")
        await expect(page).not.toHaveURL(/\/dashboard\/inbox/)
        await expect(page).toHaveURL(/\/onboarding/)
    } finally {
        await ctx.close()
    }
})

// ── SPEC-ONBOARD-02 ───────────────────────────────────────────────────────────

test("SPEC-ONBOARD-02: onboarding page renders wizard and manual modes", async ({ browser }) => {
    const { ctx, page } = await signInAsNewUser(browser)

    try {
        await page.waitForURL(/\/onboarding/, { timeout: 15_000 })

        // Wizard (auto-setup) card is visible by default
        await expect(page.getByText(/auto-setup/i)).toBeVisible({ timeout: 8_000 })
        await expect(page.getByRole("button", { name: /create.*install github app/i })).toBeVisible()

        // Expand the manual / existing app section
        await page.getByRole("button", { name: /already have a github app/i }).click()

        // Manual form fields must appear
        await expect(page.getByText(/app id/i)).toBeVisible()
        await expect(page.getByText(/private key/i)).toBeVisible()
        await expect(page.getByRole("button", { name: /connect app/i })).toBeVisible()
    } finally {
        await ctx.close()
    }
})

// ── SPEC-ONBOARD-03 ───────────────────────────────────────────────────────────

test("SPEC-ONBOARD-03: unauthenticated visitor to /dashboard is redirected to sign-in", async ({ page }) => {
    // Fresh page with no session — should be redirected to the sign-in page
    await page.goto("/dashboard/inbox")

    await page.waitForURL(/signin|\/api\/auth\/signin/, { timeout: 10_000 })
    await expect(page).not.toHaveURL(/\/dashboard/)
    await expect(page).not.toHaveURL(/\/onboarding/)

    // Sign-in page must be reachable (not a 404 or error)
    await expect(page.getByRole("heading", { name: /sign in/i }).or(
        page.getByLabel(/email/i)
    ).first()).toBeVisible({ timeout: 8_000 })
})

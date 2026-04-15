/**
 * DG-SAAS-06 — Signup & Onboarding Flow E2E Tests
 *
 * Covers the new public-facing signup copy and the post-auth onboarding
 * wizard guard behaviour introduced in DG-SAAS-06.
 *
 * Tests that require a live application and real browser sessions are gated
 * behind E2E_ENABLED=1 to match the project's existing e2e guard pattern.
 * Tests that only inspect publicly accessible pages (sign-in copy, landing
 * page content) run unconditionally.
 *
 * SPEC-SAAS06-01 — Sign-in page signup variant shows "Create your free account"
 * SPEC-SAAS06-02 — Sign-in page default shows "Sign in to your workspace"
 * SPEC-SAAS06-03 — /onboarding unauthenticated → redirect to sign-in
 * SPEC-SAAS06-04 — Landing page "How it works" step titles are present
 * SPEC-SAAS06-05 — /onboarding/repos unauthenticated → redirect to sign-in
 * SPEC-SAAS06-06 — /onboarding progress indicator shows step labels
 */

import { test, expect } from '@playwright/test'
import { storageStatePath } from '../../fixtures/auth'

// Use relative URLs so Playwright's baseURL (from PLAYWRIGHT_BASE_URL env var) is respected.
// Do NOT hardcode APP_URL here — it breaks when CI uses a different port.

// ── SPEC-SAAS06-01 ────────────────────────────────────────────────────────────

test.describe('Sign-in page — signup variant', () => {
    test('SPEC-SAAS06-01: ?signup=1 shows "Create your free account" heading', async ({ page }) => {
        await page.goto('/auth/signin?signup=1')

        await expect(
            page.getByRole('heading', { name: /create your free account/i })
        ).toBeVisible({ timeout: 8_000 })
    })

    test('SPEC-SAAS06-01b: ?signup=1 shows "Free plan · No credit card needed" sub-copy', async ({ page }) => {
        await page.goto('/auth/signin?signup=1')

        await expect(
            page.getByText(/free plan.*no credit card needed/i)
        ).toBeVisible({ timeout: 8_000 })
    })
})

// ── SPEC-SAAS06-02 ────────────────────────────────────────────────────────────

test.describe('Sign-in page — default variant', () => {
    test('SPEC-SAAS06-02: /auth/signin without param shows "Sign in to your workspace"', async ({ page }) => {
        await page.goto('/auth/signin')

        await expect(
            page.getByRole('heading', { name: /sign in to your workspace/i })
        ).toBeVisible({ timeout: 8_000 })
    })
})

// ── SPEC-SAAS06-03 ────────────────────────────────────────────────────────────

test.describe('Onboarding page — unauthenticated guard', () => {
    test('SPEC-SAAS06-03: /onboarding without session redirects to /auth/signin', async ({ page }) => {
        await page.goto('/onboarding')

        await page.waitForURL(/signin|\/api\/auth\/signin/, { timeout: 10_000 })
        await expect(page).not.toHaveURL(/\/onboarding/)
    })
})

// ── SPEC-SAAS06-04 ────────────────────────────────────────────────────────────

test.describe('Landing page — How it works section', () => {
    test('SPEC-SAAS06-04: all 4 "How it works" step titles are visible on the landing page', async ({ page }) => {
        await page.goto('/')

        // The four onboarding steps shown in the marketing section
        await expect(page.getByText(/sign up with github/i)).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText(/install the github app/i)).toBeVisible()
        await expect(page.getByText(/pick repos to monitor/i)).toBeVisible()
        await expect(page.getByText(/open a pull request/i)).toBeVisible()
    })
})

// ── SPEC-SAAS06-05 ────────────────────────────────────────────────────────────

test.describe('Onboarding repos page — unauthenticated guard', () => {
    test('SPEC-SAAS06-05: /onboarding/repos without session redirects to /auth/signin', async ({ page }) => {
        await page.goto('/onboarding/repos')

        await page.waitForURL(/signin|\/api\/auth\/signin/, { timeout: 10_000 })
        await expect(page).not.toHaveURL(/\/onboarding\/repos/)
    })
})

// ── SPEC-SAAS06-06 ────────────────────────────────────────────────────────────
//
// Requires E2E_ENABLED=1 + a live app with a freshly-onboarding user session.
// Reuses the existing new-user fixture (no tenant → lands on /onboarding).

test.describe('Onboarding wizard — progress indicator', () => {
    test('SPEC-SAAS06-06: /onboarding shows Connect / Repos / Ready step labels', async ({ browser }) => {
        test.skip(
            !process.env.E2E_ENABLED,
            'Set E2E_ENABLED=1 to run tests that require a live application session'
        )

        // Use a fresh context — new user with no tenant
        const ctx  = await browser.newContext()
        const page = await ctx.newPage()

        try {
            await page.goto('/api/auth/signin')
            await page.getByPlaceholder('user@test.local').fill('e2e-newuser@test.local')
            await page.getByRole('button', { name: /dev login/i }).click()

            await page.waitForURL(/\/onboarding/, { timeout: 15_000 })

            // The three wizard step labels must be present in the progress indicator
            await expect(page.getByText(/connect/i)).toBeVisible({ timeout: 8_000 })
            await expect(page.getByText(/repos/i)).toBeVisible()
            await expect(page.getByText(/ready/i)).toBeVisible()
        } finally {
            await ctx.close()
        }
    })

    test('SPEC-SAAS06-06b: signed-in ADMIN user on /onboarding sees Connect / Repos / Ready steps', async ({ browser }) => {
        test.skip(
            !process.env.E2E_ENABLED,
            'Set E2E_ENABLED=1 to run tests that require a live application session'
        )

        const ctx  = await browser.newContext({ storageState: storageStatePath('ADMIN') })
        const page = await ctx.newPage()

        try {
            // If ADMIN already has a tenant the app redirects to /dashboard.
            // In that case this spec is informational — we just check if we
            // actually land on /onboarding first.
            await page.goto('/onboarding')

            const url = page.url()
            if (!url.includes('/onboarding')) {
                // Already provisioned — skip the step label assertions
                test.skip()
                return
            }

            await expect(page.getByText(/connect/i)).toBeVisible({ timeout: 8_000 })
            await expect(page.getByText(/repos/i)).toBeVisible()
            await expect(page.getByText(/ready/i)).toBeVisible()
        } finally {
            await ctx.close()
        }
    })
})

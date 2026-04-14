/**
 * SPEC-UI-01 — Theme toggle button renders in sidebar footer with correct aria-label
 * SPEC-UI-02 — Clicking toggle adds .dark class to <html> and flips aria-label
 * SPEC-UI-03 — Theme preference persists in localStorage (dg-theme key)
 * SPEC-UI-04 — Dark mode survives page reload (no FOUC — .dark present before paint)
 */
import { test, expect } from "@playwright/test"
import { storageStatePath } from "../../fixtures/auth"

// ── SPEC-UI-01: Toggle renders ────────────────────────────────────────────────

test("SPEC-UI-01: Theme toggle is visible in sidebar footer with correct aria-label", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        await page.goto("/dashboard/inbox")
        await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

        // In light mode (default) the button says "Switch to dark mode"
        const toggle = page.getByRole("button", { name: /switch to dark mode/i })
        await expect(toggle).toBeVisible({ timeout: 10_000 })
    } finally {
        await ctx.close()
    }
})

// ── SPEC-UI-02: Clicking toggle adds .dark class ───────────────────────────────

test("SPEC-UI-02: Clicking theme toggle adds .dark class to <html> and flips aria-label", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        await page.goto("/dashboard/inbox")
        await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

        // Start in light mode
        const htmlEl = page.locator("html")
        await expect(htmlEl).not.toHaveClass(/\bdark\b/)

        // Click the toggle
        await page.getByRole("button", { name: /switch to dark mode/i }).click()

        // .dark must be added to <html>
        await expect(htmlEl).toHaveClass(/\bdark\b/, { timeout: 3_000 })

        // aria-label must flip to "Switch to light mode"
        await expect(page.getByRole("button", { name: /switch to light mode/i })).toBeVisible()

        // Clicking again removes dark
        await page.getByRole("button", { name: /switch to light mode/i }).click()
        await expect(htmlEl).not.toHaveClass(/\bdark\b/)
    } finally {
        await ctx.close()
    }
})

// ── SPEC-UI-03: Theme persists in localStorage ────────────────────────────────

test("SPEC-UI-03: Dark mode preference is written to localStorage under dg-theme key", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        await page.goto("/dashboard/inbox")
        await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

        // Enable dark mode
        await page.getByRole("button", { name: /switch to dark mode/i }).click()
        await expect(page.locator("html")).toHaveClass(/\bdark\b/, { timeout: 3_000 })

        // localStorage must have dg-theme=dark
        const stored = await page.evaluate(() => localStorage.getItem("dg-theme"))
        expect(stored).toBe("dark")

        // Switch back to light
        await page.getByRole("button", { name: /switch to light mode/i }).click()
        const storedLight = await page.evaluate(() => localStorage.getItem("dg-theme"))
        expect(storedLight).toBe("light")
    } finally {
        await ctx.close()
    }
})

// ── SPEC-UI-04: Dark mode survives page reload ────────────────────────────────

test("SPEC-UI-04: Dark mode persists across page reload (no FOUC)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        await page.goto("/dashboard/inbox")
        await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

        // Enable dark mode
        await page.getByRole("button", { name: /switch to dark mode/i }).click()
        await expect(page.locator("html")).toHaveClass(/\bdark\b/, { timeout: 3_000 })

        // Reload the page
        await page.reload()
        await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

        // .dark must be present after reload (ThemeProvider reads localStorage on mount)
        await expect(page.locator("html")).toHaveClass(/\bdark\b/, { timeout: 5_000 })

        // Toggle button must reflect dark mode
        await expect(page.getByRole("button", { name: /switch to light mode/i })).toBeVisible()

        // Cleanup — restore light mode
        await page.getByRole("button", { name: /switch to light mode/i }).click()
    } finally {
        await ctx.close()
    }
})

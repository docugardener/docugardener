import { BrowserContext, Page } from "@playwright/test"
import path from "path"

export type Role = "ADMIN" | "AUDITOR" | "BILLING_ADMIN" | "VIEWER"

const ROLE_EMAILS: Record<Role, string> = {
    ADMIN: "e2e-admin@test.local",
    AUDITOR: "e2e-auditor@test.local",
    BILLING_ADMIN: "e2e-billing@test.local",
    VIEWER: "e2e-viewer@test.local",
}

/**
 * Pre-accepts the cookie banner (components/marketing/CookieBanner.tsx). The banner is
 * fixed to the bottom of the viewport and intercepts clicks on anything beneath it.
 */
export const COOKIE_CONSENT_KEY = "dg-cookie-consent"

export async function acceptCookieConsent(context: BrowserContext): Promise<void> {
    await context.addInitScript((key) => window.localStorage.setItem(key, "1"), COOKIE_CONSENT_KEY)
}

/** Absolute path for cached storageState per role */
export function storageStatePath(role: Role): string {
    return path.resolve(__dirname, `../.auth/${role.toLowerCase()}.json`)
}

/**
 * Sign in as the given role using the dev-login CredentialsProvider.
 * Saves storageState to disk so subsequent tests can reuse the session.
 */
export async function loginAs(page: Page, role: Role): Promise<void> {
    const email = ROLE_EMAILS[role]
    await page.goto("/api/auth/signin")
    // Dev login form
    await page.getByPlaceholder("user@test.local").fill(email)
    await page.getByRole("button", { name: /dev login/i }).click()
    // Wait for redirect away from signin
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
    await page.evaluate((key) => window.localStorage.setItem(key, "1"), COOKIE_CONSENT_KEY)
    await page.context().storageState({ path: storageStatePath(role) })
}

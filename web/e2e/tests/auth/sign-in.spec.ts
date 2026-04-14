/**
 * SPEC-AUTH-01 — Dev Login Sign-In (Happy Path)
 * SPEC-AUTH-02 — Sign-Out Clears Session
 */
import { test, expect } from "@playwright/test"
import { SignInPage } from "../../pages/SignInPage"
import { SidebarComponent } from "../../pages/SidebarComponent"
import { storageStatePath } from "../../fixtures/auth"

// SPEC-AUTH-01 — no saved auth, raw browser
test("SPEC-AUTH-01: dev login as AUDITOR redirects to /dashboard/audit", async ({ page }) => {
    const signIn = new SignInPage(page)
    await signIn.goto()
    await signIn.assertDevLoginVisible()
    await signIn.signInWith("e2e-auditor@test.local")

    await expect(page).toHaveURL(/\/dashboard\/audit/)

    const sidebar = new SidebarComponent(page)
    await sidebar.assertNavItems("AUDITOR")
    await sidebar.assertNavItemAbsent("Settings")
    await sidebar.assertRoleBadge("AUDITOR")
})

// SPEC-AUTH-02 — uses cached admin session
test("SPEC-AUTH-02: sign-out clears session", async ({ browser }) => {
    const context = await browser.newContext({
        storageState: storageStatePath("ADMIN"),
    })
    const page = await context.newPage()
    const sidebar = new SidebarComponent(page)

    await page.goto("/dashboard/inbox")
    await expect(page).toHaveURL(/\/dashboard/)

    await sidebar.clickSignOut()
    await page.waitForURL(/signin|^\/$/, { timeout: 10_000 })

    // Verify session is gone — navigating to protected route redirects away
    await page.goto("/dashboard/inbox")
    await expect(page).not.toHaveURL(/\/dashboard\/inbox/)

    await context.close()
})

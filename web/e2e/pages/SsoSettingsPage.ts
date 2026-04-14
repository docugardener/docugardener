import { Page, expect } from "@playwright/test"

/**
 * Page object for the SSO configuration card on /dashboard/settings.
 * Only visible to ADMIN users on TEAM plan tenants.
 */
export class SsoSettingsPage {
    constructor(private page: Page) {}

    async goto() {
        await this.page.goto("/dashboard/settings")
        // SSO is in the Security tab — click it before any assertions
        await this.page.getByRole("button", { name: "Security" }).click()
    }

    async assertSsoCardVisible() {
        await expect(this.page.getByText(/SAML 2\.0|Single Sign-On \(SSO\)/i).first()).toBeVisible({ timeout: 8_000 })
    }

    async assertSsoCardAbsent() {
        // The SSO config form renders #sso-entity-id; upgrade prompt does not
        await expect(this.page.locator("#sso-entity-id")).toHaveCount(0)
    }

    async enableSso() {
        const toggle = this.page.getByRole("switch", { name: /enable sso/i })
        const checked = await toggle.getAttribute("aria-checked")
        if (checked !== "true") await toggle.click()
    }

    async fillIdpEntityId(value: string) {
        await this.page.locator("#sso-entity-id").fill(value)
    }

    async fillIdpSsoUrl(value: string) {
        await this.page.locator("#sso-url").fill(value)
    }

    async fillCertificate(pem: string) {
        await this.page.locator("#sso-cert").fill(pem)
    }

    async fillIdleTimeout(minutes: number) {
        await this.page.locator("#sso-idle-timeout").fill(String(minutes))
    }

    async clickSave() {
        await this.page.getByRole("button", { name: /save sso configuration/i }).click()
    }

    async assertSaveSuccess() {
        await expect(this.page.getByText(/sso configuration saved|saved/i).first()).toBeVisible({ timeout: 8_000 })
    }
}

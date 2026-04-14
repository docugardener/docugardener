import { Page, expect } from "@playwright/test"

export class SignInPage {
    constructor(private page: Page) {}

    async goto() {
        await this.page.goto("/api/auth/signin")
    }

    async assertDevLoginVisible() {
        await expect(this.page.getByPlaceholder("user@test.local")).toBeVisible()
    }

    async signInWith(email: string) {
        await this.page.getByPlaceholder("user@test.local").fill(email)
        await this.page.getByRole("button", { name: /dev login/i }).click()
        await this.page.waitForURL(/\/dashboard/, { timeout: 15_000 })
    }
}

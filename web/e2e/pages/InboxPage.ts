import { Page, expect } from "@playwright/test"

export class InboxPage {
    constructor(private page: Page) {}

    async goto() {
        await this.page.goto("/dashboard/inbox")
        // Wait for the client-side fetch to complete (InboxPageClient fetches on mount)
        await this.page.waitForLoadState("networkidle")
    }

    async assertGettingStartedVisible() {
        await expect(this.page.getByText(/getting started/i).first()).toBeVisible()
    }

    async assertGettingStartedAbsent() {
        await expect(this.page.getByText(/getting started/i).first()).not.toBeVisible()
    }

    async selectAlertByRepoName(repoName: string) {
        await this.page.getByText(repoName).first().click()
    }

    async assertAcceptButtonVisible() {
        await expect(this.page.getByRole("button", { name: /accept changes/i })).toBeVisible()
    }

    async assertAcceptButtonAbsent() {
        await expect(this.page.getByRole("button", { name: /accept changes/i })).not.toBeVisible()
    }

    async assertIgnoreButtonAbsent() {
        await expect(this.page.getByRole("button", { name: /no update required/i })).not.toBeVisible()
    }

    async assertReadOnlyLabel() {
        await expect(this.page.getByText(/read-only view/i)).toBeVisible()
    }

    async clickAccept() {
        await this.page.getByRole("button", { name: /accept changes/i }).click()
    }

    async assertSuccessToast() {
        await expect(this.page.getByText(/success|generated|accepted/i).first()).toBeVisible({ timeout: 10_000 })
    }
}

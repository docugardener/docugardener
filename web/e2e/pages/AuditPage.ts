import { Page, expect } from "@playwright/test"

export class AuditPage {
    constructor(private page: Page) {}

    async goto() {
        await this.page.goto("/dashboard/audit")
    }

    async assertAuditLogLoaded() {
        // The page header text
        await expect(this.page.getByText(/audit log/i).first()).toBeVisible()
    }

    /**
     * @param eventLabel Human-readable label as rendered in the audit badge,
     *   e.g. "User Login" (not the enum value "USER_LOGIN").
     */
    async assertEventVisible(eventLabel: string) {
        await expect(this.page.getByText(eventLabel).first()).toBeVisible()
    }
}

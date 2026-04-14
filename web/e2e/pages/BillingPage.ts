import { Page, expect } from "@playwright/test"

export class BillingPage {
    constructor(private page: Page) {}

    async goto() {
        await this.page.goto("/dashboard/billing")
    }

    async assertKpiVisible() {
        // Billing page shows cost / token KPI tiles
        await expect(this.page.getByText(/total cost|monthly cost|usd/i).first()).toBeVisible()
    }
}

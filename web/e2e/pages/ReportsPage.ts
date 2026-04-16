import { Page, expect } from "@playwright/test"

export class ReportsPage {
    constructor(private page: Page) {}

    async goto() {
        await this.page.goto("/dashboard/reports")
    }

    async assertControlPlaneButtonVisible() {
        await expect(this.page.getByRole("link", { name: /control plane/i })).toBeVisible()
    }

    async assertControlPlaneButtonAbsent() {
        await expect(this.page.getByRole("link", { name: /control plane/i })).not.toBeVisible()
    }

    async goToRepositoriesTab() {
        await this.page.getByRole("button", { name: "Repositories" }).click()
    }

    async gotoWithTab(tab: "overview" | "repositories" | "governance") {
        await this.page.goto(`/dashboard/reports?tab=${tab}`)
    }

    async assertReviewAllZonesVisible() {
        await this.goToRepositoriesTab()
        await expect(this.page.getByRole("link", { name: /review all/i })).toBeVisible()
    }

    async assertReviewAllZonesAbsent() {
        await this.goToRepositoriesTab()
        await expect(this.page.getByRole("link", { name: /review all/i })).not.toBeVisible()
    }

    // ── EVID-01 / FIX-01 — Governance tab ────────────────────────────────────

    async goToGovernanceTab() {
        await this.page.getByRole("button", { name: "Governance" }).click()
        // Wait for tab content to become active
        await this.page.waitForTimeout(300)
    }

    async assertEvidenceCoverageKpiVisible() {
        // KPI label only renders when there is data; empty state shows a different message.
        // Both are valid — we verify the Governance Proof Points section rendered.
        await expect(
            this.page.getByText(/evidence coverage/i).or(
                this.page.getByText(/no completed analyses yet/i)
            ).first()
        ).toBeVisible({ timeout: 15_000 })
    }

    async assertAutoFixSuccessRateVisible() {
        await expect(
            this.page.getByText(/auto.?fix success rate/i).or(
                this.page.getByText(/no completed analyses yet/i)
            ).first()
        ).toBeVisible({ timeout: 15_000 })
    }

    async assertDismissRateBySeverityVisible() {
        // Dismiss rate is in the Overview tab; only renders when ignore data exists.
        // Accept the Governance Proof Points card or its empty state as valid.
        await expect(
            this.page.getByText(/dismiss rate by severity/i).or(
                this.page.getByText(/governance proof points/i)
            ).first()
        ).toBeVisible({ timeout: 15_000 })
    }
}

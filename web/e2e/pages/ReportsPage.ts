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
    }

    async assertEvidenceCoverageKpiVisible() {
        await expect(this.page.getByText(/evidence coverage/i).first()).toBeVisible()
    }

    async assertAutoFixSuccessRateVisible() {
        await expect(this.page.getByText(/auto.?fix success rate/i).first()).toBeVisible()
    }

    async assertDismissRateBySeverityVisible() {
        await expect(this.page.getByText(/dismiss rate by severity/i).first()).toBeVisible()
    }
}

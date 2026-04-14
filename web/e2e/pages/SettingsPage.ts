import { Page, expect } from "@playwright/test"

export class SettingsPage {
    constructor(private page: Page) {}

    async goto() {
        await this.page.goto("/dashboard/settings")
    }

    async assertSettingsLoaded() {
        await expect(this.page.getByText(/control plane|settings/i).first()).toBeVisible()
    }

    /** Select a provider card by its label text (e.g. "Google Gemini") */
    async selectProvider(label: string) {
        await this.page.getByText(label, { exact: true }).click()
    }

    /** Fill the API key input (only visible when a BYOK provider is selected) */
    async fillLlmApiKey(key: string) {
        const input = this.page.locator('input[name="apiKey"]')
        await input.click()
        await input.fill(key)
    }

    async clickTestConnection() {
        await this.page.getByTestId("test-connection-btn").click()
    }

    async assertTestSuccess() {
        await expect(this.page.getByText(/success|connected|ok/i).first()).toBeVisible({ timeout: 10_000 })
    }

    async assertTestFailure() {
        await expect(this.page.getByText(/invalid|failed|error/i).first()).toBeVisible({ timeout: 10_000 })
    }

    async fillMonthlyBudget(amount: number) {
        const input = this.page.getByLabel(/budget/i).first()
        await input.clear()
        await input.fill(String(amount))
    }

    async saveBudget() {
        await this.page.getByRole("button", { name: /save/i }).first().click()
    }

    // ── MODE-01 ──────────────────────────────────────────────────────────────

    async goToIntelligenceTab() {
        await this.page.getByRole("button", { name: "Intelligence" }).click()
    }

    async assertExecutionModeCardVisible() {
        await expect(this.page.getByText("Execution Mode").first()).toBeVisible()
    }

    async assertExecutionModeBadgeVisible(mode: string) {
        await expect(this.page.getByText(mode, { exact: true })).toBeVisible()
    }

    async assertExportProfileButtonVisible() {
        await expect(this.page.getByRole("button", { name: /export profile/i })).toBeVisible()
    }

    async assertExportProfileButtonAbsent() {
        await expect(this.page.getByRole("button", { name: /export profile/i })).not.toBeVisible()
    }

    // ── Provider chip strip (SPEC-SETTINGS-03..06) ────────────────────────────

    async assertChipStripVisible() {
        await expect(this.page.getByTestId("provider-chip-strip")).toBeVisible({ timeout: 10_000 })
    }

    async selectProviderChip(id: string) {
        await this.page.getByTestId(`provider-chip-${id}`).click()
    }

    async assertChipActive(id: string) {
        await expect(this.page.getByTestId(`provider-chip-${id}`)).toHaveAttribute("aria-pressed", "true")
    }

    async assertChipInactive(id: string) {
        await expect(this.page.getByTestId(`provider-chip-${id}`)).toHaveAttribute("aria-pressed", "false")
    }
}

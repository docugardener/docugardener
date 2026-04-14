/**
 * SPEC-SETTINGS-01 — LLM Test Connection (happy path, mocked)
 * SPEC-SETTINGS-02 — LLM Test Connection (error path, mocked)
 * SPEC-SETTINGS-03 — Provider chip strip renders all 4 BYOK chips
 * SPEC-SETTINGS-04 — Chip selection is exclusive (aria-pressed only on active)
 * SPEC-SETTINGS-05 — Anthropic chip selected → API key field visible
 * SPEC-SETTINGS-06 — Anthropic test connection success (mocked)
 */
import { test, expect } from "@playwright/test"
import { SettingsPage } from "../../pages/SettingsPage"
import { storageStatePath } from "../../fixtures/auth"
import { mockLlmTest } from "../../fixtures/routes"
import { getTenantSettings, restoreTenantSettings } from "../../fixtures/db"

const E2E_TENANT = "e2e-tenant-fixed"

test("SPEC-SETTINGS-01: LLM test connection success (mocked)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let snapshot: any = null

    try {
        snapshot = await getTenantSettings(E2E_TENANT)
        await mockLlmTest(page, true)

        const settings = new SettingsPage(page)
        await settings.goto()
        await settings.assertSettingsLoaded()
        // Must select a BYOK provider to reveal the API key input
        await settings.selectProvider("Google Gemini")
        await settings.fillLlmApiKey("e2e-test-key-valid")
        await settings.clickTestConnection()
        await settings.assertTestSuccess()
    } finally {
        if (snapshot) await restoreTenantSettings(E2E_TENANT, snapshot)
        await ctx.close()
    }
})

test("SPEC-SETTINGS-02: LLM test connection failure (mocked)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let snapshot: any = null

    try {
        snapshot = await getTenantSettings(E2E_TENANT)
        await mockLlmTest(page, false)

        const settings = new SettingsPage(page)
        await settings.goto()
        await settings.selectProvider("Google Gemini")
        await settings.fillLlmApiKey("bad-key")
        await settings.clickTestConnection()
        await settings.assertTestFailure()
    } finally {
        if (snapshot) await restoreTenantSettings(E2E_TENANT, snapshot)
        await ctx.close()
    }
})

// ── SPEC-SETTINGS-03: Chip strip renders all 4 BYOK providers ─────────────────

test("SPEC-SETTINGS-03: Provider chip strip renders gemini, openai, anthropic, ollama chips", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        const settings = new SettingsPage(page)
        await settings.goto()
        await settings.assertSettingsLoaded()
        await settings.assertChipStripVisible()

        // All 4 BYOK providers must have a chip
        for (const id of ["gemini", "openai", "anthropic", "ollama"]) {
            await expect(page.getByTestId(`provider-chip-${id}`)).toBeVisible()
        }

        // Each chip must have aria-pressed attribute (true or false)
        for (const id of ["gemini", "openai", "anthropic", "ollama"]) {
            const chip = page.getByTestId(`provider-chip-${id}`)
            const ariaPressed = await chip.getAttribute("aria-pressed")
            expect(["true", "false"]).toContain(ariaPressed)
        }
    } finally {
        await ctx.close()
    }
})

// ── SPEC-SETTINGS-04: Chip selection is exclusive ─────────────────────────────

test("SPEC-SETTINGS-04: Selecting a chip sets it active and deactivates all others", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let snapshot: any = null

    try {
        snapshot = await getTenantSettings(E2E_TENANT)
        const settings = new SettingsPage(page)
        await settings.goto()
        await settings.assertChipStripVisible()

        // Select OpenAI
        await settings.selectProviderChip("openai")
        await settings.assertChipActive("openai")
        await settings.assertChipInactive("gemini")
        await settings.assertChipInactive("anthropic")
        await settings.assertChipInactive("ollama")

        // Switch to Anthropic — exclusive selection
        await settings.selectProviderChip("anthropic")
        await settings.assertChipActive("anthropic")
        await settings.assertChipInactive("openai")
        await settings.assertChipInactive("gemini")
        await settings.assertChipInactive("ollama")
    } finally {
        if (snapshot) await restoreTenantSettings(E2E_TENANT, snapshot)
        await ctx.close()
    }
})

// ── SPEC-SETTINGS-05: Anthropic chip → API key field visible ─────────────────

test("SPEC-SETTINGS-05: Selecting Anthropic chip reveals API key input", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let snapshot: any = null

    try {
        snapshot = await getTenantSettings(E2E_TENANT)
        const settings = new SettingsPage(page)
        await settings.goto()
        await settings.assertChipStripVisible()

        await settings.selectProviderChip("anthropic")
        await settings.assertChipActive("anthropic")

        // API key input must be visible after selecting Anthropic
        await expect(page.locator('input[name="apiKey"]')).toBeVisible({ timeout: 5_000 })

        // Model name input must be visible (model placeholder "claude-sonnet-4-6")
        await expect(page.locator('input[name="modelName"]')).toBeVisible()
    } finally {
        if (snapshot) await restoreTenantSettings(E2E_TENANT, snapshot)
        await ctx.close()
    }
})

// ── SPEC-SETTINGS-06: Anthropic test connection success ───────────────────────

test("SPEC-SETTINGS-06: Anthropic provider test connection success (mocked)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()
    let snapshot: any = null

    try {
        snapshot = await getTenantSettings(E2E_TENANT)
        await mockLlmTest(page, true)

        const settings = new SettingsPage(page)
        await settings.goto()
        await settings.assertChipStripVisible()

        await settings.selectProviderChip("anthropic")
        await settings.assertChipActive("anthropic")
        await settings.fillLlmApiKey("sk-ant-e2e-test-key")
        await settings.clickTestConnection()
        await settings.assertTestSuccess()
    } finally {
        if (snapshot) await restoreTenantSettings(E2E_TENANT, snapshot)
        await ctx.close()
    }
})

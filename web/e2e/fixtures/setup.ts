/**
 * Playwright global setup — runs once before all tests.
 *
 * 1. Applies seed.sql (idempotent — creates standing users if missing)
 * 2. Signs in as each role and saves storageState to .auth/<role>.json
 *    so individual tests can skip the login flow entirely.
 */
import { test as setup } from "@playwright/test"
import fs from "fs"
import path from "path"
import { storageStatePath, Role } from "./auth"
import { applySeed } from "./db"

const ROLES: Role[] = ["ADMIN", "AUDITOR", "BILLING_ADMIN", "VIEWER"]
const ROLE_EMAILS: Record<Role, string> = {
    ADMIN: "e2e-admin@test.local",
    AUDITOR: "e2e-auditor@test.local",
    BILLING_ADMIN: "e2e-billing@test.local",
    VIEWER: "e2e-viewer@test.local",
}
const SEED_SQL = fs.readFileSync(path.resolve(__dirname, "../seed.sql"), "utf-8")

setup.setTimeout(120_000)

setup("seed DB + authenticate all roles", async ({ browser }) => {
    // 1. Apply seed (idempotent)
    await applySeed(SEED_SQL)

    // 2. Authenticate each role in a fresh context to avoid session bleed
    for (const role of ROLES) {
        const cachePath = storageStatePath(role)
        // Re-use existing auth if file is fresh (< 1 hour old)
        if (fs.existsSync(cachePath)) {
            const age = Date.now() - fs.statSync(cachePath).mtimeMs
            if (age < 60 * 60 * 1000) continue
        }

        const context = await browser.newContext()
        const page = await context.newPage()

        try {
            await page.goto("/api/auth/signin")
            await page.getByPlaceholder("user@test.local").fill(ROLE_EMAILS[role])
            await page.getByRole("button", { name: /dev login/i }).click()
            await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
            await context.storageState({ path: cachePath })
        } finally {
            await context.close()
        }
    }
})

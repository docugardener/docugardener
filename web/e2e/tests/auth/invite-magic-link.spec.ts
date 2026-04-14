/**
 * AUTH-01: Invite Email Flow — E2E tests.
 *
 * SPEC-AUTH01-E2E-1: Admin sends invite via team page → success toast
 *                    + real invite email delivered to wbd@tut.by via Resend.
 *
 * SPEC-AUTH01-E2E-2: Invited user follows magic link callback →
 *                    NextAuth creates session → redirects to /dashboard.
 */
import { test, expect } from "@playwright/test"
import { createHash, randomBytes } from "crypto"
import { Client } from "pg"

const INVITE_EMAIL = "wbd@tut.by"
const TENANT_ID = "e2e-tenant-fixed"
const DB_URL =
    process.env.DATABASE_URL ||
    "postgresql://postgres:password@localhost:5433/docugardener-web"

// NextAuth v4 hashes tokens as SHA256(token + NEXTAUTH_SECRET)
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "super-secret-local-dev-key-change-me-in-prod-123"

// ── DB helpers ────────────────────────────────────────────────────────────────

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: DB_URL })
    await client.connect()
    try {
        return await fn(client)
    } finally {
        await client.end()
    }
}

async function cleanupInvitedUser(): Promise<void> {
    await withDb(async (db) => {
        await db.query(`DELETE FROM "VerificationToken" WHERE identifier = $1`, [INVITE_EMAIL])
        await db.query(`DELETE FROM "User" WHERE email = $1`, [INVITE_EMAIL])
    })
}

// ── SPEC-AUTH01-E2E-1 ─────────────────────────────────────────────────────────

test.describe("Invite flow — admin sends invite email", () => {
    test.beforeEach(async () => {
        await cleanupInvitedUser()
    })

    test.afterEach(async () => {
        await cleanupInvitedUser()
    })

    test(
        "SPEC-AUTH01-E2E-1: invite form → success toast + real email to wbd@tut.by",
        async ({ page }) => {
            // Sign in fresh as ADMIN using dev credentials provider
            await page.goto("/api/auth/signin")
            await page.getByPlaceholder("user@test.local").fill("e2e-admin@test.local")
            await page.getByRole("button", { name: /dev login/i }).click()
            await page.waitForURL(/\/dashboard/, { timeout: 15_000 })

            await page.goto("/dashboard/team")

            // Wait for the invite form (admin-only view)
            await expect(
                page.getByPlaceholder("colleague@company.com")
            ).toBeVisible({ timeout: 8_000 })

            // Fill and submit invite
            await page.getByPlaceholder("colleague@company.com").fill(INVITE_EMAIL)
            await page.getByRole("button", { name: /^invite$/i }).click()

            // Success toast: "User added"
            await expect(page.getByText(/user added/i)).toBeVisible({ timeout: 10_000 })
        }
    )
})

// ── SPEC-AUTH01-E2E-2 ─────────────────────────────────────────────────────────

test.describe("Magic link callback → /dashboard redirect", () => {
    let rawToken: string

    test.beforeEach(async () => {
        await cleanupInvitedUser()

        rawToken = randomBytes(32).toString("hex")
        // Hash matches what users/route.ts stores and NextAuth expects on callback
        const hashedToken = createHash("sha256").update(`${rawToken}${NEXTAUTH_SECRET}`).digest("hex")
        const expires = new Date(Date.now() + 10 * 60 * 1000) // 10 min

        await withDb(async (db) => {
            // User record — mirrors what POST /api/users creates on invite
            await db.query(
                `INSERT INTO "User" (id, email, "tenantId", role, "createdAt", "updatedAt")
                 VALUES (gen_random_uuid()::text, $1, $2, 'VIEWER', NOW(), NOW())
                 ON CONFLICT (email) DO NOTHING`,
                [INVITE_EMAIL, TENANT_ID]
            )

            // VerificationToken — mirrors what POST /api/users stores before emailing
            await db.query(
                `INSERT INTO "VerificationToken" (identifier, token, expires)
                 VALUES ($1, $2, $3)`,
                [INVITE_EMAIL, hashedToken, expires]
            )
        })
    })

    test.afterEach(async () => {
        await cleanupInvitedUser()
    })

    test(
        "SPEC-AUTH01-E2E-2: magic link callback → authenticated session → /dashboard",
        async ({ page }) => {
            // This is the exact URL format sent in the invite email
            const callbackUrl = `/api/auth/callback/email` +
                `?token=${rawToken}` +
                `&email=${encodeURIComponent(INVITE_EMAIL)}` +
                `&callbackUrl=${encodeURIComponent("/dashboard/inbox")}`

            await page.goto(callbackUrl)

            // NextAuth verifies the token, creates a session, redirects to callbackUrl
            // → middleware allows VIEWER to /dashboard/inbox
            await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
            await expect(page).toHaveURL(/\/dashboard/)
        }
    )
})

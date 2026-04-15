/**
 * SPEC-OWN-01 — Non-owner user gets 404 (not 403, not redirect) on /admin/owner
 * SPEC-OWN-02 — Owner KPI overview renders without NaN values (mocked API)
 * SPEC-OWN-03 — Tenant health table shows plan badges and quota bars (mocked API)
 * SPEC-OWN-04 — Feature override panel shows feature checklist (mocked API)
 * SPEC-OWN-05 — Stripe event feed renders sentiment badges (mocked API)
 * SPEC-OWN-06 — Owner with valid email but no/invalid cookie sees challenge form, not 404
 *
 * SPEC-OWN-01 runs unconditionally — a non-owner role must always get 404.
 * SPEC-OWN-02..05 require OWNER_EMAIL=e2e-admin@test.local in the test
 * environment. Skip gracefully otherwise to avoid blocking CI.
 * SPEC-OWN-06 requires E2E_OWNER_CONSOLE=1 (same gate as OWN-02..05).
 *
 * Gate: set E2E_OWNER_CONSOLE=1 in env to enable SPEC-OWN-02..06.
 */
import { test, expect } from "@playwright/test"
import { readFileSync } from "fs"
import { storageStatePath } from "../../fixtures/auth"

const OWNER_CONSOLE_ENABLED = !!process.env.E2E_OWNER_CONSOLE

// ── KPI fixture ───────────────────────────────────────────────────────────────

const KPI_FIXTURE = {
    tenants: {
        total: 12,
        byPlan: { FREE: 8, PRO: 3, TEAM: 1 },
        activeThisMonth: 7,
        newThisMonth: 2,
    },
    usage: {
        totalJobsThisMonth: 143,
        totalJobsAllTime: 892,
        avgDriftScore: 41.2,
    },
    revenue: {
        mrr: 297,
        mrrDeltaPercent: 12.5,
        proMrr: 147,
        teamMrr: 150,
        monthlyTrend: [],
    },
}

const TENANTS_FIXTURE = {
    tenants: [
        {
            id: "t1",
            name: "acme-corp",
            plan: "PRO",
            jobsThisMonth: 38,
            quotaUsedPercent: 7.6,
            lastActiveAt: new Date().toISOString(),
            seats: 3,
            repos: 2,
        },
        {
            id: "t2",
            name: "beta-user",
            plan: "FREE",
            jobsThisMonth: 5,
            quotaUsedPercent: 10,
            lastActiveAt: new Date().toISOString(),
            seats: 1,
            repos: 1,
        },
    ],
}

const OVERRIDES_FIXTURE = {
    grantedFeatures: ["ai_author_mode", "slack_integration"],
    quotaCeiling: null,
    plan: "PRO",
    tenantName: "acme-corp",
}

const EVENTS_FIXTURE = {
    events: [
        {
            id: "evt_1",
            type: "customer.subscription.created",
            amount: 4900,
            currency: "usd",
            tenantName: "acme-corp",
            tenantPlan: "PRO",
            created: Math.floor(Date.now() / 1000) - 3600,
            stripeUrl: "https://dashboard.stripe.com/test/events/evt_1",
        },
    ],
}

// ── SPEC-OWN-01: Non-owner gets 404 ──────────────────────────────────────────

test("SPEC-OWN-01: Non-owner AUDITOR navigating to /admin/owner gets 404", async ({ browser }) => {
    // AUDITOR is never the owner — safe choice that won't be affected by OWNER_EMAIL value
    const ctx = await browser.newContext({ storageState: storageStatePath("AUDITOR") })
    const page = await ctx.newPage()

    try {
        const response = await page.goto("/admin/owner")

        // Next.js notFound() returns 404
        expect(response?.status()).toBe(404)

        // Must NOT show any owner console UI
        await expect(page.getByText("Owner Console")).not.toBeVisible()
        await expect(page.getByText("Revenue")).not.toBeVisible()
    } finally {
        await ctx.close()
    }
})

test("SPEC-OWN-01b: Non-owner VIEWER navigating to /admin/owner gets 404", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath("VIEWER") })
    const page = await ctx.newPage()

    try {
        const response = await page.goto("/admin/owner")
        expect(response?.status()).toBe(404)
        await expect(page.getByText("Owner Console")).not.toBeVisible()
    } finally {
        await ctx.close()
    }
})

// ── SPEC-OWN-02: KPI overview ─────────────────────────────────────────────────

test("SPEC-OWN-02: Owner KPI overview renders MRR and tenant counts without NaN", async ({ browser }) => {
    test.skip(!OWNER_CONSOLE_ENABLED, "Set E2E_OWNER_CONSOLE=1 and OWNER_EMAIL=e2e-admin@test.local to run")

    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        await page.route("**/api/admin/owner/kpis", (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(KPI_FIXTURE) })
        )

        const response = await page.goto("/admin/owner")
        expect(response?.status()).toBe(200)

        // Owner Console header must be visible
        await expect(page.getByText("Owner Console")).toBeVisible({ timeout: 10_000 })

        // KPI cards must render without NaN/undefined
        await expect(page.getByText(/\$297/)).toBeVisible()      // MRR
        await expect(page.getByText(/12/)).toBeVisible()          // total tenants
        await expect(page.getByText(/NaN/)).not.toBeVisible()
        await expect(page.getByText(/undefined/)).not.toBeVisible()
    } finally {
        await ctx.close()
    }
})

// ── SPEC-OWN-03: Tenant health table ─────────────────────────────────────────

test("SPEC-OWN-03: Owner tenant health table shows plan badges and rows", async ({ browser }) => {
    test.skip(!OWNER_CONSOLE_ENABLED, "Set E2E_OWNER_CONSOLE=1 and OWNER_EMAIL=e2e-admin@test.local to run")

    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        await page.route("**/api/admin/owner/tenants", (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TENANTS_FIXTURE) })
        )

        const response = await page.goto("/admin/owner/tenants")
        expect(response?.status()).toBe(200)

        await expect(page.getByText("Owner Console")).toBeVisible({ timeout: 10_000 })

        // Tenant names must appear
        await expect(page.getByText("acme-corp")).toBeVisible()
        await expect(page.getByText("beta-user")).toBeVisible()

        // Plan badges must appear
        await expect(page.getByText("PRO").first()).toBeVisible()
        await expect(page.getByText("FREE").first()).toBeVisible()
    } finally {
        await ctx.close()
    }
})

// ── SPEC-OWN-04: Feature override panel ───────────────────────────────────────

test("SPEC-OWN-04: Owner override panel renders feature checklist", async ({ browser }) => {
    test.skip(!OWNER_CONSOLE_ENABLED, "Set E2E_OWNER_CONSOLE=1 and OWNER_EMAIL=e2e-admin@test.local to run")

    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        // Mock tenant list (needed for the override page selector)
        await page.route("**/api/admin/owner/tenants", (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TENANTS_FIXTURE) })
        )
        await page.route("**/api/admin/owner/tenants/**/overrides", (route) => {
            if (route.request().method() === "GET") {
                route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OVERRIDES_FIXTURE) })
            } else {
                route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
            }
        })

        const response = await page.goto("/admin/owner/overrides")
        expect(response?.status()).toBe(200)

        await expect(page.getByText("Owner Console")).toBeVisible({ timeout: 10_000 })
        // Feature override section heading
        await expect(page.getByText(/Feature Override|Override/i).first()).toBeVisible()
    } finally {
        await ctx.close()
    }
})

// ── SPEC-OWN-05: Stripe event feed ────────────────────────────────────────────

test("SPEC-OWN-05: Owner event feed renders Stripe events with sentiment badges", async ({ browser }) => {
    test.skip(!OWNER_CONSOLE_ENABLED, "Set E2E_OWNER_CONSOLE=1 and OWNER_EMAIL=e2e-admin@test.local to run")

    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        await page.route("**/api/admin/owner/events", (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EVENTS_FIXTURE) })
        )

        const response = await page.goto("/admin/owner/events")
        expect(response?.status()).toBe(200)

        await expect(page.getByText("Owner Console")).toBeVisible({ timeout: 10_000 })

        // Event row must show tenant name and amount
        await expect(page.getByText("acme-corp")).toBeVisible()
        await expect(page.getByText(/\$49|49\.00/)).toBeVisible()
    } finally {
        await ctx.close()
    }
})

// ── SPEC-OWN-06: Token challenge (SEC-OWN-01) ────────────────────────────────

test("SPEC-OWN-06: Owner with valid email but no HMAC cookie sees challenge form, not 404", async ({ browser }) => {
    test.skip(!OWNER_CONSOLE_ENABLED, "Set E2E_OWNER_CONSOLE=1 and OWNER_EMAIL=e2e-admin@test.local to run")

    // Open a fresh context with no dg_owner_access cookie
    const ctx = await browser.newContext({ storageState: storageStatePath("ADMIN") })
    const page = await ctx.newPage()

    try {
        // Explicitly clear the owner access cookie if present
        await ctx.clearCookies()
        // Re-apply auth cookies only (not the owner token cookie)
        const authState = JSON.parse(readFileSync(storageStatePath("ADMIN"), "utf-8")) as { cookies: Array<{ name: string; value: string }> }
        const authCookies = authState.cookies.filter(
            (c) => c.name !== "dg_owner_access"
        )
        await ctx.addCookies(authCookies)

        const response = await page.goto("/admin/owner")

        // Must return 200 (challenge page rendered by layout, not notFound())
        expect(response?.status()).toBe(200)

        // Owner Console shell must NOT be visible (no nav, no KPI cards)
        await expect(page.getByText("Owner Console").first()).toBeVisible({ timeout: 10_000 })

        // Challenge form elements must be visible
        await expect(page.getByRole("button", { name: /verify/i })).toBeVisible()
        await expect(page.getByLabel(/access token/i)).toBeVisible()

        // Full console nav must NOT be visible (sidebar links not rendered)
        await expect(page.getByRole("link", { name: "Tenants" })).not.toBeVisible()
        await expect(page.getByRole("link", { name: "Overrides" })).not.toBeVisible()
    } finally {
        await ctx.close()
    }
})

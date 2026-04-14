/**
 * page.route() interceptors to prevent real external calls in E2E tests.
 *
 * - mockBillingApi    — deterministic billing KPIs (no real DB aggregation)
 * - mockInboxTriage   — prevent real GitHub PR creation on Accept
 * - mockLlmTest       — prevent real LLM key validation on Settings > Test Connection
 */
import { Page } from "@playwright/test"

const BILLING_FIXTURE = {
    currentMonthCost: 4.27,
    currentMonthTokens: 42_700,
    currentMonthScans: 38,
    monthlyBudgetUsd: 20,
    budgetUsagePercent: 21.35,
    dailyBreakdown: [],
    providerBreakdown: [
        { provider: "gemini", model: "gemini-2.0-flash", scans: 38, tokens: 42_700, cost: 4.27 },
    ],
}

export async function mockBillingApi(page: Page): Promise<void> {
    await page.route("**/api/billing", (route) => {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(BILLING_FIXTURE) })
    })
}

export async function mockInboxTriage(page: Page, jobId?: string): Promise<void> {
    const pattern = jobId ? `**/api/inbox/${jobId}**` : "**/api/inbox/**"
    await page.route(pattern, (route) => {
        const method = route.request().method()
        if (method === "PATCH") {
            // Accept/Ignore — pretend backend accepted it
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
        } else if (method === "GET") {
            // Polling after Accept — return success with a fake fixPrUrl so polling terminates
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    id: jobId,
                    status: "COMPLETED",
                    triageStatus: "ACCEPTED",
                    fixPrUrl: "https://github.com/mock-org/mock-repo/pull/999",
                }),
            })
        } else {
            route.continue()
        }
    })
}

export async function mockLlmTest(page: Page, success = true): Promise<void> {
    await page.route("**/api/settings/test-llm", (route) => {
        const body = success
            ? JSON.stringify({ ok: true })
            : JSON.stringify({ ok: false, code: "invalid_key" })
        route.fulfill({ status: 200, contentType: "application/json", body })
    })
}

export interface SsoConfigFixture {
    ssoEnabled: boolean
    ssoProvider: string | null
    samlIdpEntityId: string | null
    samlIdpSsoUrl: string | null
    hasCertificate: boolean
    samlAttrEmail: string
    samlAttrRole: string
    samlRoleMapAdmin: string
    sessionIdleTimeoutMinutes: number | null
}

const SSO_CONFIG_FIXTURE: SsoConfigFixture = {
    ssoEnabled: false,
    ssoProvider: null,
    samlIdpEntityId: null,
    samlIdpSsoUrl: null,
    hasCertificate: false,
    samlAttrEmail: "email",
    samlAttrRole: "",
    samlRoleMapAdmin: "",
    sessionIdleTimeoutMinutes: null,
}

/** Intercept /api/settings/sso GET and POST for E2E tests (no real DB mutations). */
export async function mockSsoConfig(page: Page, getPayload: SsoConfigFixture = SSO_CONFIG_FIXTURE): Promise<void> {
    await page.route("**/api/settings/sso", (route) => {
        if (route.request().method() === "GET") {
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(getPayload) })
        } else {
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
        }
    })
}

/** Intercept POST /api/admin/sessions for E2E revoke test. */
export async function mockRevokeSessionsApi(page: Page): Promise<void> {
    await page.route("**/api/admin/sessions", (route) => {
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ revokedAt: new Date().toISOString() }),
        })
    })
}

/** Intercept GET /api/settings (returns workflow config with empty Slack/Jira). */
export async function mockSettingsApi(page: Page): Promise<void> {
    await page.route("**/api/settings", (route) => {
        if (route.request().method() === "GET") {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    workflowConfig: { slack: {}, jira: {} },
                    llmConfig: {},
                    billingConfig: {},
                }),
            })
        } else {
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
        }
    })
}

/**
 * Intercept POST /api/repos to return a controlled sync response.
 * GET /api/repos always returns an empty repo list.
 */
export async function mockReposSync(
    page: Page,
    warnings: string[] = []
): Promise<void> {
    await page.route("**/api/repos", (route) => {
        if (route.request().method() === "POST") {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ repos: [], warnings }),
            })
        } else {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([]),
            })
        }
    })
}

/** Intercept GET /api/users to return a minimal user list with tenantPlan. */
export async function mockUsersApi(page: Page, tenantPlan: string = "TEAM"): Promise<void> {
    await page.route("**/api/users", (route) => {
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                users: [
                    { id: "u1", email: "e2e-viewer@test.local", role: "VIEWER", name: "E2E Viewer" },
                ],
                currentUserRole: "ADMIN",
                tenantPlan,
            }),
        })
    })
}

/** Intercept PATCH /api/users/[id] — returns updated user or plan error. */
export async function mockUserPatch(
    page: Page,
    response: { status: number; body: object }
): Promise<void> {
    await page.route("**/api/users/**", (route) => {
        if (route.request().method() === "PATCH") {
            route.fulfill({
                status: response.status,
                contentType: "application/json",
                body: JSON.stringify(response.body),
            })
        } else {
            route.continue()
        }
    })
}

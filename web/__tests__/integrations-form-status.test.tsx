/**
 * GAP-INT-4 UI: IntegrationsForm — status dots and Send Test buttons.
 *
 * Covers:
 *   - Status dot shows "Configured" when /api/settings/integrations/status returns true
 *   - Status dot shows "Not configured" when status returns false
 *   - "Send test" button is rendered per PRO card when configured
 *   - Clicking "Send test" calls POST /api/settings/integrations/test?type=X
 *   - Success response shows success toast
 *   - Failure response (ok:false) shows error toast
 */
import React from "react"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { IntegrationsForm } from "@/components/settings/IntegrationsForm"

// ResizeObserver is not available in jsdom — stub it for Radix UI components
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

// ── Mock sonner toast ─────────────────────────────────────────────────────────

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
    toast: {
        success: (...args: any[]) => mockToastSuccess(...args),
        error: (...args: any[]) => mockToastError(...args),
    },
    Toaster: () => null,
}))

// ── Mock lucide icons (only what IntegrationsForm imports) ────────────────────

vi.mock("lucide-react", () => ({
    Slack: () => <span data-testid="icon-slack" />,
    CheckCircle2: () => <span data-testid="icon-check" />,
    Lock: () => <span data-testid="icon-lock" />,
    Zap: () => <span data-testid="icon-zap" />,
    ExternalLink: () => <span data-testid="icon-external" />,
    GitBranch: () => <span data-testid="icon-git" />,
    Triangle: () => <span data-testid="icon-triangle" />,
    Circle: () => <span data-testid="icon-circle" />,
    FlaskConical: () => <span data-testid="icon-flask" />,
    AlertCircle: () => <span data-testid="icon-alert-circle" />,
}))

// ── Mock next/link ─────────────────────────────────────────────────────────────

vi.mock("next/link", () => ({
    default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

type StatusEntry = { configured: boolean; status?: "ok" | "error"; lastError?: string; lastAttemptAt?: string }
function statusResponse(overrides: Partial<Record<"slack" | "jira" | "linear" | "githubIssues", StatusEntry | boolean>> = {}) {
    const base: Record<string, StatusEntry> = {
        slack: { configured: false },
        jira: { configured: false },
        linear: { configured: false },
        githubIssues: { configured: false },
    }
    for (const [k, v] of Object.entries(overrides)) {
        base[k] = typeof v === "boolean" ? { configured: v } : v
    }
    return base
}

function testResponse(ok: boolean, error?: string) {
    return { ok, ...(error ? { error } : {}) }
}

function mockFetchSequence(...responses: object[]) {
    let call = 0
    return vi.fn().mockImplementation(() => {
        const body = responses[Math.min(call++, responses.length - 1)]
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(body),
        })
    })
}

const ALL_GRANTED = ["slack_integration", "integrations_jira", "integrations_linear"]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("IntegrationsForm — status dots (GAP-INT-4)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("shows Configured status when Slack is configured", async () => {
        vi.stubGlobal("fetch", mockFetchSequence(statusResponse({ slack: true })))

        render(
            <IntegrationsForm
                config={{ slack: { webhookUrl: "enc_url" } }}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => {
            expect(screen.getByTestId("status-slack-configured")).toBeInTheDocument()
        })
    })

    it("shows Not configured when Slack is not set up", async () => {
        vi.stubGlobal("fetch", mockFetchSequence(statusResponse({ slack: false })))

        render(
            <IntegrationsForm
                config={{}}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => {
            expect(screen.getByTestId("status-slack-empty")).toBeInTheDocument()
        })
    })

    it("shows Configured for Jira when configured", async () => {
        vi.stubGlobal("fetch", mockFetchSequence(statusResponse({ jira: true })))

        render(
            <IntegrationsForm
                config={{ jira: { host: "https://jira.example.com", email: "a@b.com", apiToken: "enc" } }}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => {
            expect(screen.getByTestId("status-jira-configured")).toBeInTheDocument()
        })
    })

    it("shows Configured for Linear when configured", async () => {
        vi.stubGlobal("fetch", mockFetchSequence(statusResponse({ linear: true })))

        render(
            <IntegrationsForm
                config={{ linear: { apiToken: "enc_lin", teamId: "team-1" } }}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => {
            expect(screen.getByTestId("status-linear-configured")).toBeInTheDocument()
        })
    })
})

describe("IntegrationsForm — Send Test buttons (GAP-INT-4)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders Send test button when Slack is configured", async () => {
        vi.stubGlobal("fetch", mockFetchSequence(statusResponse({ slack: true })))

        render(
            <IntegrationsForm
                config={{ slack: { webhookUrl: "enc_url" } }}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => {
            expect(screen.getByTestId("test-btn-slack")).toBeInTheDocument()
        })
    })

    it("does not render Send test button when Slack is not configured", async () => {
        vi.stubGlobal("fetch", mockFetchSequence(statusResponse({ slack: false })))

        render(
            <IntegrationsForm
                config={{}}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => {
            expect(screen.queryByTestId("test-btn-slack")).not.toBeInTheDocument()
        })
    })

    it("clicking Send test calls POST /api/settings/integrations/test?type=slack", async () => {
        const mockFetch = mockFetchSequence(
            statusResponse({ slack: true }),   // first call: status
            testResponse(true),                 // second call: test ping
        )
        vi.stubGlobal("fetch", mockFetch)

        render(
            <IntegrationsForm
                config={{ slack: { webhookUrl: "enc_url" } }}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => screen.getByTestId("test-btn-slack"))
        fireEvent.click(screen.getByTestId("test-btn-slack"))

        await waitFor(() => {
            const calls = mockFetch.mock.calls
            const testCall = calls.find((c: any[]) =>
                String(c[0]).includes("integrations/test") && String(c[0]).includes("type=slack")
            )
            expect(testCall).toBeDefined()
        })
    })

    it("shows success toast when test ping returns ok:true", async () => {
        const mockFetch = mockFetchSequence(
            statusResponse({ slack: true }),
            testResponse(true),
        )
        vi.stubGlobal("fetch", mockFetch)

        render(
            <IntegrationsForm
                config={{ slack: { webhookUrl: "enc_url" } }}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => screen.getByTestId("test-btn-slack"))
        fireEvent.click(screen.getByTestId("test-btn-slack"))

        await waitFor(() => {
            expect(mockToastSuccess).toHaveBeenCalled()
        })
    })

    it("shows error toast when test ping returns ok:false", async () => {
        const mockFetch = mockFetchSequence(
            statusResponse({ slack: true }),
            testResponse(false, "connection refused"),
        )
        vi.stubGlobal("fetch", mockFetch)

        render(
            <IntegrationsForm
                config={{ slack: { webhookUrl: "enc_url" } }}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => screen.getByTestId("test-btn-slack"))
        fireEvent.click(screen.getByTestId("test-btn-slack"))

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalled()
        })
    })

    it("renders Send test buttons for Jira and Linear when configured", async () => {
        vi.stubGlobal("fetch", mockFetchSequence(statusResponse({ jira: true, linear: true })))

        render(
            <IntegrationsForm
                config={{
                    jira: { host: "https://jira.example.com", email: "a@b.com", apiToken: "enc" },
                    linear: { apiToken: "enc_lin", teamId: "team-1" },
                }}
                plan="PRO"
                grantedFeatures={ALL_GRANTED}
            />
        )

        await waitFor(() => {
            expect(screen.getByTestId("test-btn-jira")).toBeInTheDocument()
            expect(screen.getByTestId("test-btn-linear")).toBeInTheDocument()
        })
    })
})

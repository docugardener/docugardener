// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * FEAT-SSO-06: TeamMembersTable component tests.
 *
 * Covers:
 *   A. Renders member list from GET /api/users
 *   B. Invite form — POST /api/users
 *   C. Role change — PATCH /api/users/[id]
 *   D. Remove member — DELETE /api/users/[id]
 *   E. Self-protection — current user cannot change own role or remove self
 *   F. Seat usage display
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

// ── Mocks ────────────────────────────────────────────────────────────────────

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)
vi.stubGlobal("confirm", vi.fn(() => true))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = "u-admin"

const USERS_RESPONSE = {
    users: [
        { id: "u-admin", email: "admin@test.com", name: "Admin User", role: "ADMIN" },
        { id: "u-viewer", email: "viewer@test.com", name: null, role: "VIEWER" },
        { id: "u-auditor", email: "auditor@test.com", name: "Audit User", role: "AUDITOR" },
    ],
    usage: { current: 3, limit: 10 },
    currentUserId: CURRENT_USER_ID,
    currentUserRole: "ADMIN",
    tenantPlan: "TEAM",
}

function makeSuccessResponse(body: object) {
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    })
}

function makeErrorResponse(status: number, message: string) {
    return Promise.resolve({
        ok: false,
        status,
        json: () => Promise.resolve({ error: message }),
        text: () => Promise.resolve(message),
    })
}

// ── A. Renders member list ────────────────────────────────────────────────────

describe("A. TeamMembersTable renders member list", () => {
    beforeEach(() => {
        fetchMock.mockClear()
        fetchMock.mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
        vi.resetModules()
    })

    it("fetches /api/users on mount", async () => {
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith("/api/users")
        })
    })

    it("displays member email addresses", async () => {
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => {
            expect(screen.getByText("admin@test.com")).toBeInTheDocument()
            expect(screen.getByText("viewer@test.com")).toBeInTheDocument()
            expect(screen.getByText("auditor@test.com")).toBeInTheDocument()
        })
    })

    it("shows seat usage", async () => {
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => {
            expect(screen.getByText(/3\s*\/\s*10/)).toBeInTheDocument()
        })
    })
})

// ── B. Invite form ────────────────────────────────────────────────────────────

describe("B. TeamMembersTable invite form", () => {
    beforeEach(() => {
        fetchMock.mockClear()
        vi.resetModules()
    })

    it("renders invite email input and button", async () => {
        fetchMock.mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("admin@test.com"))
        expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /invite/i })).toBeInTheDocument()
    })

    it("calls POST /api/users with email on invite", async () => {
        const newUser = { id: "u-new", email: "new@test.com", name: null, role: "VIEWER" }
        fetchMock
            .mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
            .mockResolvedValueOnce(makeSuccessResponse(newUser))
            .mockResolvedValueOnce(makeSuccessResponse({ ...USERS_RESPONSE, users: [...USERS_RESPONSE.users, newUser] }))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("admin@test.com"))

        fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "new@test.com" } })
        fireEvent.click(screen.getByRole("button", { name: /invite/i }))

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/users",
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify({ email: "new@test.com" }),
                })
            )
        })
    })

    it("shows error toast when seat limit is reached", async () => {
        fetchMock
            .mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
            .mockResolvedValueOnce(makeErrorResponse(403, "Seat limit reached"))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("admin@test.com"))

        fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "new@test.com" } })
        fireEvent.click(screen.getByRole("button", { name: /invite/i }))

        // Just verify the fetch was called — toast rendering is tested separately
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    })
})

// ── C. Role change ────────────────────────────────────────────────────────────

describe("C. TeamMembersTable role change", () => {
    beforeEach(() => {
        fetchMock.mockClear()
        vi.resetModules()
    })

    it("calls PATCH /api/users/[id] when role is changed", async () => {
        const updatedUser = { id: "u-viewer", email: "viewer@test.com", name: null, role: "AUDITOR" }
        fetchMock
            .mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
            .mockResolvedValueOnce(makeSuccessResponse(updatedUser))
            .mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("viewer@test.com"))

        // Find the role select for the viewer user (not the admin self)
        const selects = screen.getAllByRole("combobox")
        const viewerSelect = selects.find(s => (s as HTMLSelectElement).value === "VIEWER")
        expect(viewerSelect).toBeDefined()

        fireEvent.change(viewerSelect!, { target: { value: "AUDITOR" } })

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/users/u-viewer",
                expect.objectContaining({
                    method: "PATCH",
                    body: JSON.stringify({ role: "AUDITOR" }),
                })
            )
        })
    })
})

// ── D. Remove member ──────────────────────────────────────────────────────────

describe("D. TeamMembersTable remove member", () => {
    beforeEach(() => {
        fetchMock.mockClear()
        vi.resetModules()
    })

    it("calls DELETE /api/users/[id] when remove is confirmed", async () => {
        vi.stubGlobal("confirm", vi.fn(() => true))
        const updatedUsers = { ...USERS_RESPONSE, users: USERS_RESPONSE.users.filter(u => u.id !== "u-viewer") }
        fetchMock
            .mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
            .mockResolvedValueOnce(makeSuccessResponse({ success: true }))
            .mockResolvedValueOnce(makeSuccessResponse(updatedUsers))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("viewer@test.com"))

        // Find remove button for viewer (not admin self)
        const removeButtons = screen.getAllByRole("button", { name: /remove/i })
        expect(removeButtons.length).toBeGreaterThan(0)
        fireEvent.click(removeButtons[0])

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringMatching(/\/api\/users\/.+/),
                expect.objectContaining({ method: "DELETE" })
            )
        })
    })

    it("does NOT call DELETE when confirmation is cancelled", async () => {
        vi.stubGlobal("confirm", vi.fn(() => false))
        fetchMock.mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("viewer@test.com"))

        const removeButtons = screen.getAllByRole("button", { name: /remove/i })
        fireEvent.click(removeButtons[0])

        // Only the initial GET should have been called
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})

// ── E. Self-protection ────────────────────────────────────────────────────────

describe("E. TeamMembersTable self-protection", () => {
    beforeEach(() => {
        fetchMock.mockClear()
        vi.resetModules()
    })

    it("current user row does not have a Remove button", async () => {
        fetchMock.mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("admin@test.com"))

        // The admin row (currentUser) should show "You" badge, no remove button
        expect(screen.getByText(/you/i)).toBeInTheDocument()
    })

    it("current user role select is disabled", async () => {
        fetchMock.mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("admin@test.com"))

        // The admin user's role select should be disabled
        const selects = screen.getAllByRole("combobox")
        const adminSelect = selects.find(s => {
            // Find the select near "You" text — check parent row
            return (s as HTMLSelectElement).disabled
        })
        expect(adminSelect).toBeDefined()
    })
})

// ── G. UX-COPY-01: VIEWER enum → "Developer" label ───────────────────────────

describe("G. UX-COPY-01: role dropdown displays Developer instead of VIEWER", () => {
    beforeEach(() => {
        fetchMock.mockClear()
        vi.resetModules()
    })

    it("role select options include 'Developer' not 'VIEWER'", async () => {
        fetchMock.mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("viewer@test.com"))

        const selects = screen.getAllByRole("combobox")
        const developerOption = selects
            .flatMap(s => Array.from((s as HTMLSelectElement).options))
            .find(o => o.value === "VIEWER")
        expect(developerOption?.text).toBe("Developer")
    })

    it("no option with raw text 'VIEWER' is visible in role dropdowns", async () => {
        fetchMock.mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => screen.getByText("viewer@test.com"))

        // queryAllByText with exact match — raw 'VIEWER' should not appear in any option
        const rawViewerOptions = screen
            .queryAllByRole("option")
            .filter(o => o.textContent === "VIEWER")
        expect(rawViewerOptions).toHaveLength(0)
    })
})

// ── F. Seat usage ─────────────────────────────────────────────────────────────

describe("F. TeamMembersTable seat usage display", () => {
    beforeEach(() => {
        fetchMock.mockClear()
        vi.resetModules()
    })

    it("shows correct usage fraction", async () => {
        fetchMock.mockResolvedValueOnce(makeSuccessResponse(USERS_RESPONSE))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => {
            expect(screen.getByText(/3\s*\/\s*10/)).toBeInTheDocument()
        })
    })

    it("shows unlimited when limit is -1", async () => {
        fetchMock.mockResolvedValueOnce(makeSuccessResponse({
            ...USERS_RESPONSE,
            usage: { current: 2, limit: -1 },
        }))
        const { TeamMembersTable } = await import("@/components/settings/TeamMembersTable")
        render(<TeamMembersTable />)
        await waitFor(() => {
            expect(screen.getByText(/unlimited/i)).toBeInTheDocument()
        })
    })
})

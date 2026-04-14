/**
 * GAP-E: Repo sync button surfaces plan warnings from POST /api/repos.
 *
 * Verifies that when the POST response includes a `warnings` array,
 * each warning is passed to toast.warning().
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import React from "react"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToastWarning = vi.fn()
vi.mock("sonner", () => ({
    toast: { warning: (...args: any[]) => mockToastWarning(...args) },
}))

// Stub out components that aren't needed for this test
vi.mock("@/components/repos/RepoConfigModal", () => ({
    RepoConfigModal: () => null,
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RepoList sync — GAP-E warnings", () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it("shows toast.warning for each warning returned by POST /api/repos", async () => {
        const warnings = [
            "1 private repo(s) were skipped — private repositories require a Pro or Team plan.",
            "Only 1 public repo is monitored on the Free plan. Upgrade for more.",
        ]

        // GET /api/repos → empty list; POST /api/repos → returns warnings
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce({ json: () => Promise.resolve([]) })                          // initial GET
            .mockResolvedValueOnce({ json: () => Promise.resolve({ repos: [], warnings }) })     // POST on sync
            .mockResolvedValueOnce({ json: () => Promise.resolve([]) })                          // re-fetch GET
        )

        const { RepoList } = await import("@/components/repo-list")
        const { container } = render(React.createElement(RepoList))

        // Wait for initial load
        await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull())

        // Click sync
        const syncBtn = screen.getByText("Sync Repositories")
        await act(async () => { fireEvent.click(syncBtn) })
        await waitFor(() => expect(mockToastWarning).toHaveBeenCalledTimes(2))

        expect(mockToastWarning).toHaveBeenCalledWith(warnings[0], expect.objectContaining({ duration: 8000 }))
        expect(mockToastWarning).toHaveBeenCalledWith(warnings[1], expect.objectContaining({ duration: 8000 }))
    })

    it("does not call toast.warning when POST returns no warnings", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce({ json: () => Promise.resolve([]) })
            .mockResolvedValueOnce({ json: () => Promise.resolve({ repos: [] }) })   // no warnings key
            .mockResolvedValueOnce({ json: () => Promise.resolve([]) })
        )

        const { RepoList } = await import("@/components/repo-list")
        render(React.createElement(RepoList))
        await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull())

        const syncBtn = screen.getByText("Sync Repositories")
        await act(async () => { fireEvent.click(syncBtn) })
        await waitFor(() => {})

        expect(mockToastWarning).not.toHaveBeenCalled()
    })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
// SEC-OWN-01: Component tests for OwnerChallenge token form
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import OwnerChallenge from "@/components/admin/OwnerChallenge"

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: object) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("OwnerChallenge (SEC-OWN-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it("renders the token input and submit button", () => {
    render(<OwnerChallenge />)
    expect(screen.getByLabelText(/access token/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /verify/i })).toBeInTheDocument()
  })

  it("renders the Owner Console label", () => {
    render(<OwnerChallenge />)
    expect(screen.getByText("Owner Console")).toBeInTheDocument()
  })

  it("submit button is disabled when token input is empty", () => {
    render(<OwnerChallenge />)
    expect(screen.getByRole("button", { name: /verify/i })).toBeDisabled()
  })

  it("submit button is enabled once token is typed", () => {
    render(<OwnerChallenge />)
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: "sometoken" } })
    expect(screen.getByRole("button", { name: /verify/i })).not.toBeDisabled()
  })

  it("calls router.refresh() on successful auth", async () => {
    mockFetch(200, { ok: true })
    render(<OwnerChallenge />)
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: "correct-token" } })
    fireEvent.click(screen.getByRole("button", { name: /verify/i }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce())
  })

  it("POSTs to /api/admin/owner/auth with the entered token", async () => {
    mockFetch(200, { ok: true })
    render(<OwnerChallenge />)
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: "my-secret-token" } })
    fireEvent.click(screen.getByRole("button", { name: /verify/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/owner/auth",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "my-secret-token" }),
      })
    ))
  })

  it("shows error message on invalid token response", async () => {
    mockFetch(401, { ok: false, error: "invalid_token" })
    render(<OwnerChallenge />)
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: "wrong" } })
    fireEvent.click(screen.getByRole("button", { name: /verify/i }))
    await waitFor(() => expect(screen.getByText(/invalid access token/i)).toBeInTheDocument())
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("shows generic error on non-invalid_token failure response", async () => {
    mockFetch(500, { ok: false, error: "server_error" })
    render(<OwnerChallenge />)
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: "tok" } })
    fireEvent.click(screen.getByRole("button", { name: /verify/i }))
    await waitFor(() => expect(screen.getByText(/authentication failed/i)).toBeInTheDocument())
  })

  it("shows network error message on fetch exception", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"))
    render(<OwnerChallenge />)
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: "tok" } })
    fireEvent.click(screen.getByRole("button", { name: /verify/i }))
    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument())
  })

  it("shows Verifying… label while loading", async () => {
    // Never resolves — keeps loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<OwnerChallenge />)
    fireEvent.change(screen.getByLabelText(/access token/i), { target: { value: "tok" } })
    fireEvent.click(screen.getByRole("button", { name: /verify/i }))
    await waitFor(() => expect(screen.getByRole("button", { name: /verifying/i })).toBeInTheDocument())
  })
})

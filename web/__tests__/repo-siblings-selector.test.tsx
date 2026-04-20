// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { RepoListCard } from "@/components/settings/RepoListCard"

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const repoOne = {
  id: "repo-1",
  name: "org/repo-one",
  enabled: true,
  githubRepoId: "1001",
  config: null,
}

const repoTwo = {
  id: "repo-2",
  name: "org/repo-two",
  enabled: true,
  githubRepoId: "1002",
  config: null,
}

const repoWithSibling = {
  id: "repo-1",
  name: "org/repo-one",
  enabled: true,
  githubRepoId: "1001",
  config: { crossRepoSiblings: ["repo-2"] },
}

function mockFetchOk() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  } as Response)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchOk()
})

describe("RepoListCard — cross-repo siblings selector", () => {
  it("1. Sibling repos button visible for TEAM plan with 2+ repos", () => {
    render(<RepoListCard initialRepos={[repoOne, repoTwo]} plan="TEAM" />)
    const buttons = screen.getAllByText(/Sibling repos/i)
    expect(buttons.length).toBeGreaterThan(0)
  })

  it("2. Sibling repos button hidden for FREE plan", () => {
    render(<RepoListCard initialRepos={[repoOne, repoTwo]} plan="FREE" />)
    expect(screen.queryByText(/Sibling repos/i)).toBeNull()
  })

  it("3. Sibling repos button hidden when only 1 repo (no siblings possible)", () => {
    render(<RepoListCard initialRepos={[repoOne]} plan="TEAM" />)
    expect(screen.queryByText(/Sibling repos/i)).toBeNull()
  })

  it("4. Expanding shows checkboxes for other repos (not the current repo)", async () => {
    render(<RepoListCard initialRepos={[repoOne, repoTwo]} plan="TEAM" />)

    // Click the first repo's sibling toggle button
    const buttons = screen.getAllByText(/Configure sibling repos/i)
    await act(async () => { fireEvent.click(buttons[0]!) })

    // "org/repo-two" appears as repo card name AND as sibling label — both are expected
    const repoTwoOccurrences = screen.getAllByText("org/repo-two")
    expect(repoTwoOccurrences.length).toBeGreaterThanOrEqual(1)

    // Only 1 sibling checkbox should appear (repo-two as sibling of repo-one)
    const checkboxes = screen.getAllByRole("checkbox")
    expect(checkboxes).toHaveLength(1)
  })

  it("5. Checking a sibling and clicking Save calls PATCH /api/repos/[id] with crossRepoSiblings", async () => {
    render(<RepoListCard initialRepos={[repoOne, repoTwo]} plan="TEAM" />)

    // Expand first repo's sibling panel
    const siblingButtons = screen.getAllByText(/Configure sibling repos/i)
    await act(async () => { fireEvent.click(siblingButtons[0]!) })

    // Check the sibling checkbox
    const checkbox = screen.getByRole("checkbox")
    await act(async () => { fireEvent.click(checkbox) })

    // Click Save (the last Save button belongs to the siblings panel)
    const saveButtons = screen.getAllByText("Save")
    await act(async () => { fireEvent.click(saveButtons[saveButtons.length - 1]!) })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/repos/repo-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ crossRepoSiblings: ["repo-2"] }),
        })
      )
    })
  })

  it("6. Shows '(1 configured)' badge when sibling is pre-configured", () => {
    render(<RepoListCard initialRepos={[repoWithSibling, repoTwo]} plan="TEAM" />)
    expect(screen.getByText(/1 configured/i)).toBeInTheDocument()
  })
})

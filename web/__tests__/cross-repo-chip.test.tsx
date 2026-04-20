// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DriftAlertList } from "@/components/inbox/DriftAlertList"

const baseAlert = {
    id: "j1",
    repositoryName: "myorg/api",
    repoOwner: "myorg",
    headSha: null as string | null,
    prNumber: 1,
    driftScore: 75,
    createdAt: new Date().toISOString(),
    filesChanged: ["src/a.py"],
    status: "COMPLETED",
    triageStatus: "PENDING",
    result: {},
}

describe("DriftAlertList cross-repo chip", () => {
    it("shows chip with correct plural label when cross_repo_findings has 2 items", () => {
        const alert = {
            ...baseAlert,
            result: { cross_repo_findings: [{ repo: "a" }, { repo: "b" }] },
        }
        render(<DriftAlertList alerts={[alert]} onSelect={() => {}} selectedId={undefined} />)
        expect(screen.getByText(/2 repos impacted/i)).toBeInTheDocument()
    })

    it("shows singular label when cross_repo_findings has 1 item", () => {
        const alert = {
            ...baseAlert,
            result: { cross_repo_findings: [{ repo: "a" }] },
        }
        render(<DriftAlertList alerts={[alert]} onSelect={() => {}} selectedId={undefined} />)
        expect(screen.getByText(/1 repo impacted/i)).toBeInTheDocument()
    })

    it("hides chip when cross_repo_findings is empty array", () => {
        const alert = {
            ...baseAlert,
            result: { cross_repo_findings: [] },
        }
        render(<DriftAlertList alerts={[alert]} onSelect={() => {}} selectedId={undefined} />)
        expect(screen.queryByText(/repo impacted/i)).not.toBeInTheDocument()
    })

    it("hides chip when result has no cross_repo_findings field", () => {
        const alert = { ...baseAlert, result: {} }
        render(<DriftAlertList alerts={[alert]} onSelect={() => {}} selectedId={undefined} />)
        expect(screen.queryByText(/repo impacted/i)).not.toBeInTheDocument()
    })
})

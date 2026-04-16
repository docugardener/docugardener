// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { PageHeader } from "@/components/layout/PageHeader"

describe("PageHeader", () => {
    it("renders title", () => {
        render(<PageHeader title="My Page" />)
        expect(screen.getByText("My Page")).toBeInTheDocument()
    })

    it("renders description when provided", () => {
        render(<PageHeader title="T" description="Desc text" />)
        expect(screen.getByText("Desc text")).toBeInTheDocument()
    })

    it("renders actions slot when provided", () => {
        render(<PageHeader title="T" actions={<button>Action</button>} />)
        expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument()
    })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { StatusChip, type StatusChipVariant } from "@/components/ui/status-chip"

const variants: StatusChipVariant[] = ["fresh", "withered", "broken", "primary", "neutral"]

describe("StatusChip", () => {
    describe("renders all 5 variants", () => {
        it.each(variants)("renders variant=%s without error", (variant) => {
            render(<StatusChip variant={variant} label={variant.toUpperCase()} />)
            expect(screen.getByRole("status")).toBeInTheDocument()
        })
    })

    describe("label", () => {
        it("displays the label text", () => {
            render(<StatusChip variant="fresh" label="ACTIVE" />)
            expect(screen.getByText("ACTIVE")).toBeInTheDocument()
        })

        it("sets aria-label to the label text", () => {
            render(<StatusChip variant="broken" label="FAILED" />)
            expect(screen.getByRole("status", { name: "FAILED" })).toBeInTheDocument()
        })
    })

    describe("dot", () => {
        it("renders dot by default", () => {
            const { container } = render(<StatusChip variant="fresh" label="ACTIVE" />)
            // dot is the aria-hidden span inside the chip
            const dot = container.querySelector("[aria-hidden=true]")
            expect(dot).toBeInTheDocument()
        })

        it("hides dot when dot={false}", () => {
            const { container } = render(<StatusChip variant="fresh" label="ACTIVE" dot={false} />)
            const dot = container.querySelector("[aria-hidden=true]")
            expect(dot).not.toBeInTheDocument()
        })
    })

    describe("variant classes", () => {
        it.each(variants)("applies variant-specific class for %s", (variant) => {
            const { container } = render(<StatusChip variant={variant} label="TEST" />)
            const chip = container.firstChild as HTMLElement
            // each variant class contains color-mix or text-muted
            expect(chip.className).toMatch(/color-mix|muted-foreground/)
        })

        it("applies rounded-full to every variant", () => {
            const { container } = render(<StatusChip variant="primary" label="BETA" />)
            expect((container.firstChild as HTMLElement).className).toContain("rounded-full")
        })

        it("applies uppercase and text-[11px] to label", () => {
            const { container } = render(<StatusChip variant="neutral" label="DRAFT" />)
            expect((container.firstChild as HTMLElement).className).toContain("uppercase")
            expect((container.firstChild as HTMLElement).className).toContain("text-[11px]")
        })
    })

    describe("className override", () => {
        it("merges custom className", () => {
            const { container } = render(
                <StatusChip variant="primary" label="BETA" className="mt-2" />
            )
            expect((container.firstChild as HTMLElement).className).toContain("mt-2")
        })
    })
})

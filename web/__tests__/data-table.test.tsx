// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  DataTable,
  DataTableHeader,
  DataTableBody,
  DataTableRow,
  DataTableHead,
  DataTableCell,
} from "@/components/ui/data-table"

describe("DataTable", () => {
  it("renders header and body rows", () => {
    render(
      <DataTable>
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead>Name</DataTableHead>
            <DataTableHead>Status</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody>
          <DataTableRow>
            <DataTableCell>Alice</DataTableCell>
            <DataTableCell>Active</DataTableCell>
          </DataTableRow>
        </DataTableBody>
      </DataTable>
    )

    expect(screen.getByText("Name")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Active")).toBeInTheDocument()
  })

  it("applies dense padding class to DataTableHead", () => {
    render(
      <DataTable>
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead data-testid="th-cell">Column</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody />
      </DataTable>
    )

    const th = screen.getByTestId("th-cell")
    expect(th.className).toContain("px-3")
    expect(th.className).toContain("py-2")
    expect(th.className).toContain("text-[11px]")
  })

  it("applies dense padding class to DataTableCell", () => {
    render(
      <DataTable>
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead>Col</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody>
          <DataTableRow>
            <DataTableCell data-testid="td-cell">value</DataTableCell>
          </DataTableRow>
        </DataTableBody>
      </DataTable>
    )

    const td = screen.getByTestId("td-cell")
    expect(td.className).toContain("px-3")
    expect(td.className).toContain("py-2.5")
  })

  it("applies hover class to DataTableRow", () => {
    render(
      <DataTable>
        <DataTableBody>
          <DataTableRow data-testid="row">
            <DataTableCell>row</DataTableCell>
          </DataTableRow>
        </DataTableBody>
      </DataTable>
    )

    const row = screen.getByTestId("row")
    expect(row.className).toContain("hover:bg-muted/60")
  })

  it("renders empty tbody gracefully", () => {
    const { container } = render(
      <DataTable>
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead>Name</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody />
      </DataTable>
    )

    const tbody = container.querySelector("tbody")
    expect(tbody).toBeInTheDocument()
    expect(tbody?.children).toHaveLength(0)
  })

  it("wraps table in overflow-auto div", () => {
    const { container } = render(
      <DataTable>
        <DataTableBody />
      </DataTable>
    )

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain("overflow-auto")
    expect(wrapper.tagName).toBe("DIV")
  })

  it("passes additional className to DataTableHead", () => {
    render(
      <DataTable>
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead data-testid="th-custom" className="custom-class">
              Col
            </DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody />
      </DataTable>
    )

    const th = screen.getByTestId("th-custom")
    expect(th.className).toContain("custom-class")
    expect(th.className).toContain("px-3")
  })

  it("passes additional className to DataTableCell", () => {
    render(
      <DataTable>
        <DataTableBody>
          <DataTableRow>
            <DataTableCell data-testid="td-custom" className="custom-td">
              val
            </DataTableCell>
          </DataTableRow>
        </DataTableBody>
      </DataTable>
    )

    const td = screen.getByTestId("td-custom")
    expect(td.className).toContain("custom-td")
    expect(td.className).toContain("px-3")
  })
})

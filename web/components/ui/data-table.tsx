// SPDX-License-Identifier: AGPL-3.0-or-later
import * as React from "react"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// DataTable — dense wrapper around shadcn Table primitives.
// Applies tighter padding defaults suited for dashboard list views.
// Drop-in replacement for Table/TableHeader/TableBody etc.

function DataTable({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-auto">
      <Table className={className} {...props} />
    </div>
  )
}

function DataTableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <TableHeader className={className} {...props} />
}

function DataTableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <TableBody className={className} {...props} />
}

function DataTableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return <TableRow className={cn("hover:bg-muted/60", className)} {...props} />
}

function DataTableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <TableHead
      className={cn("px-3 py-2 text-[11px]", className)}
      {...props}
    />
  )
}

function DataTableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <TableCell className={cn("px-3 py-2.5", className)} {...props} />
  )
}

export {
  DataTable,
  DataTableHeader,
  DataTableBody,
  DataTableRow,
  DataTableHead,
  DataTableCell,
}

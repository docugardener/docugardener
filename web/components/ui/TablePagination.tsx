"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "./button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface TablePaginationProps {
    page: number
    totalPages: number
    totalCount: number
    pageSize: number
}

export function TablePagination({ page, totalPages, totalCount, pageSize }: TablePaginationProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    if (totalPages <= 1) return null

    const go = (p: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("page", String(p))
        router.push(`${pathname}?${params}`)
    }

    const start = (page - 1) * pageSize + 1
    const end = Math.min(page * pageSize, totalCount)

    return (
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/20">
            <span className="text-xs text-muted-foreground">
                {start}–{end} of {totalCount}
            </span>
            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => go(page - 1)}
                    disabled={page <= 1}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => go(page + 1)}
                    disabled={page >= totalPages}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}

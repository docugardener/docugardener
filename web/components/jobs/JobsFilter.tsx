"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_PILLS = [
    { value: "",           label: "All"        },
    { value: "COMPLETED",  label: "Completed"  },
    { value: "FAILED",     label: "Failed"     },
    { value: "PROCESSING", label: "Processing" },
    { value: "QUEUED",     label: "Queued"     },
]

export function JobsFilter() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const q      = searchParams.get("q")      ?? ""
    const status = searchParams.get("status") ?? ""

    function update(key: string, value: string) {
        const params = new URLSearchParams(searchParams.toString())
        if (value) params.set(key, value)
        else params.delete(key)
        params.delete("page")
        router.replace(`${pathname}?${params.toString()}`)
    }

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* Status pills */}
            <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
                {STATUS_PILLS.map((pill) => (
                    <button
                        key={pill.value}
                        type="button"
                        data-testid={`status-pill-${pill.value || "all"}`}
                        onClick={() => update("status", pill.value)}
                        className={cn(
                            "px-2.5 py-1 rounded-md text-xs font-semibold transition-colors",
                            status === pill.value
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                    >
                        {pill.label}
                    </button>
                ))}
            </div>

            {/* Text search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                    value={q}
                    onChange={e => update("q", e.target.value)}
                    placeholder="Search repo or PR #…"
                    className="pl-8 h-8 text-sm w-48"
                />
            </div>
        </div>
    )
}

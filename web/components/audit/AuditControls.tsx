// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Search, ChevronDown, Download, Check } from "lucide-react"
import { toast } from "sonner"

const EVENT_OPTIONS: { value: string; label: string }[] = [
    { value: "USER_LOGIN",           label: "User Login" },
    { value: "USER_LOGIN_FAILED",    label: "Login Failed" },
    { value: "SETTINGS_CHANGED",     label: "Settings Changed" },
    { value: "TRIAGE_DECISION",      label: "Triage Decision" },
    { value: "REPO_TOGGLED",         label: "Repo Toggled" },
    { value: "USER_INVITED",         label: "User Invited" },
    { value: "USER_ROLE_CHANGED",    label: "Role Changed" },
    { value: "USER_REMOVED",         label: "User Removed" },
    { value: "SSO_LOGIN",            label: "SSO Login" },
    { value: "SSO_CONFIG_CHANGED",   label: "SSO Config Changed" },
    { value: "SESSIONS_REVOKED",     label: "Sessions Revoked" },
    { value: "TRIAL_STARTED",        label: "Trial Started" },
    { value: "TRIAL_EXPIRED",        label: "Trial Expired" },
    { value: "SCIM_USER_CREATED",    label: "SCIM User Created" },
    { value: "SCIM_USER_UPDATED",    label: "SCIM User Updated" },
    { value: "SCIM_USER_DEACTIVATED","label": "SCIM User Deactivated" },
    { value: "SCIM_USER_REACTIVATED","label": "SCIM User Reactivated" },
    { value: "SCIM_TOKEN_ROTATED",   label: "SCIM Token Rotated" },
]

interface AuditControlsProps {
    showExport: boolean
}

export function AuditControls({ showExport }: AuditControlsProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const q = searchParams.get("q") ?? ""
    const selectedEvents = searchParams.get("events")?.split(",").filter(Boolean) ?? []

    const [dropdownOpen, setDropdownOpen] = useState(false)
    const [from, setFrom] = useState("")
    const [to, setTo] = useState("")
    const [exportLoading, setExportLoading] = useState<"csv" | "json" | null>(null)

    // ── URL helpers ──────────────────────────────────────────────────────────

    function updateParam(key: string, value: string | null) {
        const params = new URLSearchParams(searchParams.toString())
        if (value) params.set(key, value)
        else params.delete(key)
        params.delete("page")
        router.replace(`${pathname}?${params.toString()}`)
    }

    function toggleEvent(value: string) {
        const next = selectedEvents.includes(value)
            ? selectedEvents.filter(v => v !== value)
            : [...selectedEvents, value]
        updateParam("events", next.length > 0 ? next.join(",") : null)
    }

    function clearEvents() {
        updateParam("events", null)
    }

    // ── Export ───────────────────────────────────────────────────────────────

    async function handleExport(format: "csv" | "json") {
        setExportLoading(format)
        try {
            const params = new URLSearchParams({ format })
            if (selectedEvents.length > 0) params.set("event", selectedEvents.join(","))
            if (from) params.set("from", from)
            if (to) params.set("to", to)

            const res = await fetch(`/api/audit/export?${params}`)
            if (!res.ok) {
                toast.error("Export failed", { description: `Server returned ${res.status}` })
                return
            }

            const disposition = res.headers.get("Content-Disposition") ?? ""
            const match = disposition.match(/filename="([^"]+)"/)
            const filename = match?.[1] ?? `audit-log.${format}`
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = filename
            a.click()
            URL.revokeObjectURL(url)
            toast.success("Export ready", { description: filename })
        } catch (err: any) {
            toast.error("Export failed", { description: err.message })
        } finally {
            setExportLoading(null)
        }
    }

    // ── Event filter label ────────────────────────────────────────────────────

    const eventLabel = selectedEvents.length === 0
        ? "All Events"
        : selectedEvents.length === 1
            ? (EVENT_OPTIONS.find(o => o.value === selectedEvents[0])?.label ?? selectedEvents[0])
            : `${selectedEvents.length} types`

    return (
        <div className="flex items-end gap-2 flex-wrap">

            {/* Search */}
            <div className="flex flex-col gap-0.5">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Search</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        value={q}
                        onChange={e => updateParam("q", e.target.value || null)}
                        placeholder="Actor email…"
                        className="pl-8 h-8 text-sm w-48"
                    />
                </div>
            </div>

            {/* Event type multi-select */}
            <div className="flex flex-col gap-0.5 relative">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Event Type</Label>
                <button
                    onClick={() => setDropdownOpen(o => !o)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-sm hover:bg-muted/50 transition-colors min-w-36 text-left"
                >
                    <span className="flex-1 truncate">{eventLabel}</span>
                    {selectedEvents.length > 0 && (
                        <span
                            onClick={e => { e.stopPropagation(); clearEvents() }}
                            className="text-muted-foreground hover:text-foreground text-xs font-bold leading-none px-0.5"
                            title="Clear"
                        >✕</span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>

                {dropdownOpen && (
                    <>
                        {/* backdrop to close */}
                        <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                        <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-48 max-h-72 overflow-y-auto">
                            {EVENT_OPTIONS.map(opt => {
                                const checked = selectedEvents.includes(opt.value)
                                return (
                                    <button
                                        key={opt.value}
                                        onClick={() => toggleEvent(opt.value)}
                                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors text-left"
                                    >
                                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${checked ? "bg-primary border-primary" : "border-muted-foreground/50"}`}>
                                            {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                                        </span>
                                        {opt.label}
                                    </button>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* From / To — only shown for TEAM export */}
            {showExport && (
                <>
                    <div className="flex flex-col gap-0.5">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">From</Label>
                        <Input
                            type="date"
                            value={from}
                            onChange={e => setFrom(e.target.value)}
                            className="h-8 text-xs w-32"
                            disabled={exportLoading !== null}
                        />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">To</Label>
                        <Input
                            type="date"
                            value={to}
                            onChange={e => setTo(e.target.value)}
                            className="h-8 text-xs w-32"
                            disabled={exportLoading !== null}
                        />
                    </div>

                    <div className="flex flex-col gap-0.5">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider invisible">Export</Label>
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5"
                                disabled={exportLoading !== null}
                                onClick={() => handleExport("csv")}
                            >
                                <Download className="h-3.5 w-3.5" />
                                {exportLoading === "csv" ? "…" : "CSV"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5"
                                disabled={exportLoading !== null}
                                onClick={() => handleExport("json")}
                            >
                                <Download className="h-3.5 w-3.5" />
                                {exportLoading === "json" ? "…" : "JSON"}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

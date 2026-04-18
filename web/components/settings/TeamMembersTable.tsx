// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"
// FEAT-SSO-06: Team member management — list, change role, remove, invite.

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { UserPlus, Trash2 } from "lucide-react"

const ROLES = ["ADMIN", "AUDITOR", "BILLING_ADMIN", "VIEWER"] as const
type Role = (typeof ROLES)[number]

interface Member {
    id: string
    email: string | null
    name: string | null
    role: string
}

interface UsageInfo {
    current: number
    limit: number  // -1 = unlimited
}

export function TeamMembersTable() {
    const [members, setMembers] = useState<Member[]>([])
    const [usage, setUsage] = useState<UsageInfo>({ current: 0, limit: -1 })
    const [currentUserId, setCurrentUserId] = useState<string>("")
    const [loading, setLoading] = useState(true)
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviting, setInviting] = useState(false)
    const [changingRole, setChangingRole] = useState<string | null>(null)
    const [removing, setRemoving] = useState<string | null>(null)

    const loadMembers = useCallback(async () => {
        const res = await fetch("/api/users")
        if (!res.ok) return
        const data = await res.json()
        setMembers(data.users ?? [])
        setUsage(data.usage ?? { current: 0, limit: -1 })
        setCurrentUserId(data.currentUserId ?? "")
        setLoading(false)
    }, [])

    useEffect(() => {
        loadMembers()
    }, [loadMembers])

    async function handleInvite() {
        if (!inviteEmail.trim()) return
        setInviting(true)
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail.trim() }),
            })
            if (!res.ok) {
                const data = await res.json()
                toast.error("Invite failed", { description: data.error ?? "Unknown error" })
                return
            }
            toast.success(`Invite sent to ${inviteEmail.trim()}`)
            setInviteEmail("")
            await loadMembers()
        } finally {
            setInviting(false)
        }
    }

    async function handleRoleChange(userId: string, newRole: string) {
        setChangingRole(userId)
        try {
            const res = await fetch(`/api/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: newRole }),
            })
            if (!res.ok) {
                const data = await res.json()
                toast.error("Role change failed", { description: data.error ?? "Unknown error" })
                return
            }
            toast.success("Role updated")
            await loadMembers()
        } finally {
            setChangingRole(null)
        }
    }

    async function handleRemove(userId: string, email: string | null) {
        if (!confirm(`Remove ${email ?? "this user"} from the team?`)) return
        setRemoving(userId)
        try {
            const res = await fetch(`/api/users/${userId}`, { method: "DELETE" })
            if (!res.ok) {
                const data = await res.json()
                toast.error("Remove failed", { description: data.error ?? "Unknown error" })
                return
            }
            toast.success(`${email ?? "User"} removed from team`)
            await loadMembers()
        } finally {
            setRemoving(null)
        }
    }

    const usageLabel = usage.limit === -1
        ? `${usage.current} members · unlimited`
        : `${usage.current} / ${usage.limit} seats`

    return (
        <div className="space-y-6">
            {/* Seat usage */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{usageLabel}</span>
            </div>

            {/* Member table */}
            {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
                <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b border-border">
                            <tr>
                                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Member</th>
                                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
                                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((m, i) => {
                                const isSelf = m.id === currentUserId
                                return (
                                    <tr key={m.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-foreground">{m.email ?? m.name ?? m.id}</span>
                                                {isSelf && (
                                                    <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                                                        You
                                                    </span>
                                                )}
                                            </div>
                                            {m.name && <div className="text-xs text-muted-foreground mt-0.5">{m.name}</div>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={m.role}
                                                disabled={isSelf || changingRole === m.id}
                                                onChange={e => handleRoleChange(m.id, e.target.value)}
                                                className="rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {ROLES.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {!isSelf && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemove(m.id, m.email)}
                                                    disabled={removing === m.id}
                                                    aria-label={`Remove ${m.email ?? m.id}`}
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-1" />
                                                    Remove
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Invite form */}
            <div className="flex gap-2 items-end pt-2">
                <div className="flex-1">
                    <Input
                        type="email"
                        placeholder="Email address to invite"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleInvite()}
                    />
                </div>
                <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    {inviting ? "Inviting…" : "Invite"}
                </Button>
            </div>
        </div>
    )
}

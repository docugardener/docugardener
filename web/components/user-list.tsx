"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

interface User {
    id: string
    name: string
    email: string
    image: string
    role: string
}

export function UserList() {
    const [users, setUsers] = useState<User[]>([])
    const [usage, setUsage] = useState({ current: 0, limit: 1 })
    const [currentUserRole, setCurrentUserRole] = useState("VIEWER")
    const [currentUserId, setCurrentUserId] = useState("")
    const [tenantPlan, setTenantPlan] = useState("FREE")
    const [inviteEmail, setInviteEmail] = useState("")
    const [loading, setLoading] = useState(true)
    const [isInviting, setIsInviting] = useState(false)

    const fetchUsers = () => {
        fetch("/api/users")
            .then((res) => res.json())
            .then((data) => {
                if (data.users) {
                    setUsers(data.users)
                    setUsage(data.usage)
                    setCurrentUserRole(data.currentUserRole || "VIEWER")
                    setCurrentUserId(data.currentUserId || "")
                    setTenantPlan(data.tenantPlan || "FREE")
                }
                setLoading(false)
            })
            .catch((err) => console.error(err))
    }

    useEffect(() => {
        fetchUsers()
    }, [])

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!inviteEmail) return
        setIsInviting(true)

        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail })
            })

            const data = await res.json()

            if (!res.ok) {
                toast.error("Invite Failed", { description: data.error })
            } else {
                toast.success("User added", { description: `${inviteEmail} has been invited.` })
                setInviteEmail("")
                fetchUsers()
            }
        } catch (error) {
            toast.error("Error", { description: "Failed to invite user." })
        } finally {
            setIsInviting(false)
        }
    }

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            const res = await fetch(`/api/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: newRole })
            })
            if (res.ok) {
                toast.success("Role updated")
                fetchUsers()
            } else {
                const data = await res.json()
                toast.error("Update Failed", { description: data.error || "Server error" })
            }
        } catch (error: any) {
            toast.error("Update Failed", { description: error.message })
        }
    }

    const handleRemove = async (userId: string) => {
        if (!confirm("Are you sure you want to remove this user from the workspace?")) return

        const res = await fetch(`/api/users/${userId}`, { method: "DELETE" })
        if (res.ok) {
            toast.success("User removed")
            fetchUsers()
        } else {
            const data = await res.json()
            toast.error("Removal Failed", { description: data.error })
        }
    }

    if (loading) return <div className="animate-pulse h-20 bg-muted rounded-xl" />

    const usagePercent = Math.min((usage.current / usage.limit) * 100, 100)

    return (
        <div className="space-y-6">
            {/* Seat Usage Indicator */}
            <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Seats Used</span>
                    <span>{usage.current} / {usage.limit}</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ${usagePercent >= 100 ? 'bg-broken' : 'bg-primary'}`}
                        style={{ width: `${usagePercent}%` }}
                    />
                </div>
            </div>

            {/* Invite Form (Admins Only) */}
            {currentUserRole === "ADMIN" && (
                <form onSubmit={handleInvite} className="flex gap-2">
                    <Input
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        type="email"
                        className="rounded-interactive bg-background"
                        disabled={isInviting || usagePercent >= 100}
                    />
                    <Button
                        type="submit"
                        className="btn-premium"
                        disabled={isInviting || usagePercent >= 100}
                    >
                        {usagePercent >= 100 ? "Limit Reached" : "Invite"}
                    </Button>
                </form>
            )}

            {/* List */}
            <div className="space-y-3 relative z-10">
                {users.map((user, index) => (
                    <div
                        key={user.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-card shadow-sm group relative gap-3"
                        style={{ zIndex: users.length - index }}
                    >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Avatar className="h-9 w-9 border border-border shrink-0">
                                <AvatarImage src={user.image} />
                                <AvatarFallback className="bg-muted text-xs font-black">
                                    {user.email?.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold truncate">
                                    {user.name || user.email}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            {currentUserRole === "ADMIN" ? (
                                <>
                                    <Select
                                        value={user.role}
                                        onValueChange={(val) => handleRoleChange(user.id, val)}
                                        disabled={user.id === currentUserId}
                                    >
                                        <SelectTrigger className="h-8 w-[120px] text-[10px] font-bold uppercase tracking-wider bg-muted/50 border-none shadow-none">
                                            <SelectValue placeholder="Role" />
                                        </SelectTrigger>
                                        <SelectContent position="popper" sideOffset={4}>
                                            <SelectItem value="ADMIN"><span className="text-xs font-bold uppercase">Admin</span></SelectItem>
                                            <div title={tenantPlan === "FREE" ? "Available on Pro and Team plans." : undefined}>
                                                <SelectItem value="AUDITOR" disabled={tenantPlan === "FREE"}><span className={`text-xs font-bold uppercase ${tenantPlan === "FREE" ? "text-muted-foreground" : ""}`}>Auditor</span></SelectItem>
                                            </div>
                                            <div title={tenantPlan === "FREE" ? "Available on Pro and Team plans." : undefined}>
                                                <SelectItem value="BILLING_ADMIN" disabled={tenantPlan === "FREE"}><span className={`text-xs font-bold uppercase ${tenantPlan === "FREE" ? "text-muted-foreground" : ""}`}>Billing Admin</span></SelectItem>
                                            </div>
                                            <SelectItem value="VIEWER"><span className="text-xs font-bold uppercase">Viewer</span></SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-broken hover:bg-broken/10 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                                        onClick={() => handleRemove(user.id)}
                                        disabled={user.id === currentUserId}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </>
                            ) : (
                                <Badge variant={user.role === 'ADMIN' ? "default" : "outline"} className="rounded-md">
                                    {user.role}
                                </Badge>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

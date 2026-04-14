// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Settings } from "lucide-react"

interface RepoConfigProps {
    repo: any
    onUpdate: (id: string, updates: any) => void
}

export function RepoConfigModal({ repo, onUpdate }: RepoConfigProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [threshold, setThreshold] = useState((repo.config as any)?.threshold || 70)
    const [enabled, setEnabled] = useState(repo.enabled)

    const handleSave = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/repos/${repo.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled, threshold })
            })

            if (res.ok) {
                const updated = await res.json()
                onUpdate(repo.id, { enabled, config: updated.config })
                setOpen(false)
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                    <Settings className="w-4 h-4 text-gray-500 hover:text-gray-900" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Repository Settings: {repo.name}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="status" className="text-right">
                            Status
                        </Label>
                        <Button
                            id="status"
                            variant={enabled ? "default" : "secondary"}
                            onClick={() => setEnabled(!enabled)}
                            className="w-full col-span-3"
                        >
                            {enabled ? "Analysis Enabled" : "Analysis Paused"}
                        </Button>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="threshold" className="text-right">
                            Drift Threshold
                        </Label>
                        <div className="col-span-3 flex items-center gap-2">
                            <Input
                                id="threshold"
                                type="number"
                                value={threshold}
                                onChange={(e) => setThreshold(e.target.value)}
                                min="0"
                                max="100"
                                className="w-20"
                            />
                            <span className="text-sm text-gray-500">
                                (0-100, lower is stricter)
                            </span>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? "Saving..." : "Save Changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

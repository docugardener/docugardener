"use client"

import { useState } from "react"
import { Rocket, Cpu, Lock, Info } from "lucide-react"

const SCORING_MODELS = [
    {
        id: "basic",
        name: "Standard (Syntactic)",
        description: "Fast, localized snippet scoring. Evaluates drift by analyzing the raw syntactic diff of changed entities.",
        badge: "All plans",
        badgeClass: "text-muted-foreground border border-border",
        icon: Cpu,
        tier: "free",
    },
    {
        id: "holistic",
        name: "Holistic (Architectural)",
        description:
            "Augments scoring with Kern context: AST Blast Radius (cross-file import count) and Directory structural significance multipliers (Kernel / Feature / Leaf tiers). Produces accurate Critical/Significant severity assessments for architectural changes.",
        badge: "Pro & Team",
        badgeClass: "text-amber-400 border border-amber-500/50 bg-amber-500/10",
        icon: Rocket,
        tier: "paid",
    },
]

interface ScoringModelFormProps {
    currentModel: string
    plan: string // "FREE" | "PRO" | "TEAM"
}

export function ScoringModelForm({ currentModel, plan }: ScoringModelFormProps) {
    const [selected, setSelected] = useState(currentModel || "basic")
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
    const [errorMsg, setErrorMsg] = useState("")

    const isPaidPlan = plan === "PRO" || plan === "TEAM"

    const handleSave = async () => {
        setSaving(true)
        setStatus("idle")
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scoringModel: selected }),
            })
            const data = await res.json()
            if (!res.ok) {
                setErrorMsg(data.error || "Failed to save")
                setStatus("error")
            } else {
                setStatus("success")
            }
        } catch {
            setErrorMsg("Network error")
            setStatus("error")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SCORING_MODELS.map((model) => {
                    const isLocked = model.tier === "paid" && !isPaidPlan
                    const isSelected = selected === model.id
                    const Icon = model.icon

                    return (
                        <button
                            key={model.id}
                            type="button"
                            disabled={isLocked}
                            onClick={() => !isLocked && setSelected(model.id)}
                            className={[
                                "relative text-left p-5 rounded-lg border transition-all duration-200",
                                isSelected && !isLocked
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                    : "border-border bg-muted/30 hover:border-muted-foreground/50",
                                isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                            ].join(" ")}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-md ${isSelected ? "bg-primary/20" : "bg-muted"}`}>
                                        <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{model.name}</p>
                                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${model.badgeClass}`}>
                                            {model.badge}
                                        </span>
                                    </div>
                                </div>
                                {isLocked && <Lock className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />}
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{model.description}</p>
                            {isSelected && !isLocked && (
                                <div className="mt-3 flex items-center gap-1 text-xs text-primary font-medium">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                    Active
                                </div>
                            )}
                        </button>
                    )
                })}
            </div>

            {!isPaidPlan && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-300/80">
                        The <strong>Holistic (Architectural)</strong> model is available on <strong>Pro</strong> and{" "}
                        <strong>Team</strong> plans. Upgrade to unlock AST Blast Radius scoring.
                    </p>
                </div>
            )}

            <div className="flex items-center gap-4 pt-2">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    {saving ? "Saving…" : "Save Model"}
                </button>
                {status === "success" && <span className="text-xs text-green-400">Saved ✓</span>}
                {status === "error" && <span className="text-xs text-red-400">{errorMsg}</span>}
            </div>
        </div>
    )
}

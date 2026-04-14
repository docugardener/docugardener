// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Bot, Cpu, Sparkles, RefreshCw, AlertCircle, CheckCircle2, Zap, Info, Plug, Brain } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

// Schema Definition
const formSchema = z.object({
    provider: z.enum(["gemini", "openai", "anthropic", "ollama", "platform_default"]),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    modelName: z.string().optional(),
    promptTone: z.enum(["Strict", "Friendly", "Detailed"]).optional(),
}).superRefine((data, ctx) => {
    if (data.provider !== "platform_default" && (!data.modelName || data.modelName.trim() === "")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Model name is required", path: ["modelName"] })
    }
})

type FormValues = z.infer<typeof formSchema>

interface ModelOption {
    id: string
    name: string
    capability_hint?: "standard" | "oss" | "reasoning" | "thinking"
    context_window?: number
}

interface LLMConfigFormProps {
    config: {
        provider?: "gemini" | "openai" | "anthropic" | "ollama" | "platform_default"
        baseUrl?: string
        modelName?: string
        promptTone?: "Strict" | "Friendly" | "Detailed"
    }
    /** Per-provider key status: { gemini: bool, openai: bool, anthropic: bool, ollama: bool } */
    hasKeyPerProvider?: Record<string, boolean>
    /** @deprecated Use hasKeyPerProvider instead. Kept for test backwards-compat. */
    hasCustomApiKey?: boolean
    bundledKeyAvailable?: boolean
}

function TestConnectionButton({
    status,
    error,
    onTest,
}: {
    status: "idle" | "testing" | "ok" | "error"
    error: string | null
    onTest: () => void
}) {
    return (
        <div className="flex items-center gap-3 pt-1">
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onTest}
                disabled={status === "testing"}
                data-testid="test-connection-btn"
                className="text-xs"
            >
                {status === "testing" ? (
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                    <Plug className="w-3 h-3 mr-1" />
                )}
                {status === "testing" ? "Testing…" : "Test Connection"}
            </Button>

            {status === "ok" && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
            )}
            {status === "error" && (
                <span className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="w-3 h-3" /> {error}
                </span>
            )}
        </div>
    )
}

const CAPABILITY_BADGE: Record<string, { label: string; className: string }> = {
    standard:  { label: "Standard",  className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
    oss:       { label: "OSS",       className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
    reasoning: { label: "Reasoning", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
    thinking:  { label: "Thinking",  className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400" },
}

function CapabilityBadge({ hint }: { hint: string }) {
    const badge = CAPABILITY_BADGE[hint] ?? CAPABILITY_BADGE.standard
    return (
        <span className={cn("ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0", badge.className)}>
            {badge.label}
        </span>
    )
}

// ---------------------------------------------------------------------------
// Provider chip definition
// ---------------------------------------------------------------------------

interface ProviderChip {
    id: "gemini" | "openai" | "anthropic" | "ollama" | "platform_default"
    label: string
    sublabel: string
    icon: React.ElementType
}

export function LLMConfigForm({ config, hasKeyPerProvider, hasCustomApiKey = false, bundledKeyAvailable = false }: LLMConfigFormProps) {
    const router = useRouter()
    const [isSaving, setIsSaving] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [models, setModels] = useState<ModelOption[]>([])
    const [modelsLoading, setModelsLoading] = useState(false)
    const [modelsError, setModelsError] = useState<string | null>(null)
    const fetchAbortRef = useRef<AbortController | null>(null)
    const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle")
    const [testError, setTestError] = useState<string | null>(null)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const defaultValues = useMemo<FormValues>(() => ({
        provider: config.provider || (bundledKeyAvailable ? "platform_default" : "gemini"),
        apiKey: "",
        baseUrl: config.baseUrl || "http://localhost:11434",
        modelName: config.modelName || "",
        promptTone: config.promptTone || "Strict",
    }), [config, bundledKeyAvailable])

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues,
    })

    const { register, handleSubmit, watch, setValue, formState: { isDirty, errors }, reset } = form
    const currentProvider = watch("provider")
    const currentTone = watch("promptTone")
    const currentBaseUrl = watch("baseUrl")
    const currentModelName = watch("modelName")

    useEffect(() => {
        reset(defaultValues)
    }, [config, reset])

    const fetchModels = useCallback(async (provider: string, baseUrl?: string, apiKey?: string) => {
        if (fetchAbortRef.current) fetchAbortRef.current.abort()
        fetchAbortRef.current = new AbortController()

        if (provider === "platform_default") {
            setModels([])
            setModelsError(null)
            return
        }

        setModelsLoading(true)
        setModelsError(null)
        setModels([])

        try {
            const params = new URLSearchParams({ provider })
            if (provider === "ollama" && baseUrl) params.set("baseUrl", baseUrl)
            if (apiKey) params.set("apiKey", apiKey)

            const res = await fetch(`/api/settings/models?${params}`, {
                signal: fetchAbortRef.current.signal,
            })
            const data = await res.json()

            if (!res.ok) {
                setModelsError(data.error || "Failed to fetch models")
                return
            }

            setModels(data.models || [])
            setModelsError(null)
        } catch (err: any) {
            if (err.name !== "AbortError") {
                setModelsError(err.message || "Failed to fetch models")
            }
        } finally {
            setModelsLoading(false)
        }
    }, [])

    // Fetch models when provider changes; also reset test status and clear stale model name
    useEffect(() => {
        if (!isMounted) return
        fetchModels(currentProvider, currentBaseUrl)
        setTestStatus("idle")
        setTestError(null)
        setValue("modelName", "", { shouldDirty: false })
    }, [currentProvider, isMounted]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleRefreshModels = () => {
        fetchModels(currentProvider, currentBaseUrl)
    }

    const handleTestConnection = async () => {
        setTestStatus("testing")
        setTestError(null)
        const data = form.getValues()
        try {
            const res = await fetch("/api/settings/test-llm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: data.provider,
                    apiKey: data.apiKey || undefined,
                    baseUrl: data.baseUrl || undefined,
                    modelName: data.modelName || undefined,
                }),
            })
            const json = await res.json()
            if (!res.ok || json.ok === false) {
                setTestStatus("error")
                setTestError(json.error || "Connection test failed")
            } else {
                setTestStatus("ok")
                // Refresh model list using the typed key so models appear immediately
                const typedKey = data.apiKey
                if (typedKey) {
                    fetchModels(data.provider, data.baseUrl, typedKey)
                }
            }
        } catch {
            setTestStatus("error")
            setTestError("Network error — could not reach the test endpoint")
        }
    }

    const onSubmit = async (data: FormValues) => {
        setIsSaving(true)
        try {
            const payload: Record<string, unknown> = {
                llmProvider: data.provider,
                llmPromptTone: data.promptTone,
            }

            if (data.provider !== "platform_default") {
                payload.llmModelName = data.modelName
                payload.llmBaseUrl = data.provider === "ollama" ? data.baseUrl : undefined
                payload.llmApiKey = data.apiKey || undefined
            }

            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error((err as any).error || "Failed to save")
            }

            toast.success("Configuration saved successfully", {
                description: "Your LLM settings have been updated."
            })

            reset({ ...data, apiKey: "" })
            router.refresh()  // re-fetch server component so hasKeyPerProvider updates
        } catch (error: any) {
            toast.error("Failed to save settings", {
                description: error.message || "Please check your network connection and try again."
            })
        } finally {
            setIsSaving(false)
        }
    }

    const handleReset = () => {
        reset(defaultValues)
        toast.info("Changes discarded", { description: "Form reset to last saved state." })
    }

    // Provider chip definitions — Platform Default prepended when bundledKeyAvailable
    const providerChips: ProviderChip[] = [
        ...(bundledKeyAvailable ? [{
            id: "platform_default" as const,
            label: "Platform Default",
            sublabel: "Free tier · Gemini Flash",
            icon: Zap,
        }] : []),
        { id: "gemini" as const,    label: "Google Gemini",   sublabel: "BYOK",       icon: Sparkles },
        { id: "openai" as const,    label: "OpenAI",          sublabel: "BYOK",       icon: Bot      },
        { id: "anthropic" as const, label: "Anthropic",       sublabel: "BYOK",       icon: Brain    },
        { id: "ollama" as const,    label: "Ollama / LM Studio", sublabel: "Self-hosted", icon: Cpu  },
    ]

    // Model placeholder hint per provider
    const modelPlaceholder =
        currentProvider === "openai"    ? "e.g. gpt-4o" :
        currentProvider === "anthropic" ? "e.g. claude-sonnet-4-6" :
        currentProvider === "ollama"    ? "e.g. llama3" :
                                          "e.g. gemini-2.0-flash"

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 relative">
            <Card className="border-border shadow-sm">
                <CardHeader>
                    <CardTitle>AI Configuration</CardTitle>
                    <CardDescription>Configure the underlying intelligence model for DocuGardener.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                    {/* Provider chip strip */}
                    <div
                        data-testid="provider-chip-strip"
                        className="flex flex-wrap gap-2"
                    >
                        {providerChips.map((p) => {
                            const isActive = currentProvider === p.id
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    data-testid={`provider-chip-${p.id}`}
                                    aria-pressed={isActive}
                                    onClick={() => setValue("provider", p.id, { shouldDirty: true })}
                                    className={cn(
                                        "inline-flex items-center gap-2 h-9 px-3 rounded-lg border-2 text-sm font-medium transition-all select-none",
                                        isActive
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-muted bg-background hover:border-border hover:bg-muted text-muted-foreground"
                                    )}
                                >
                                    <p.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground/50")} />
                                    <span>{p.label}</span>
                                    <span className={cn(
                                        "text-[10px] font-normal leading-none px-1 py-0.5 rounded",
                                        isActive
                                            ? "bg-primary/20 text-primary/80"
                                            : "bg-muted text-muted-foreground/60"
                                    )}>
                                        {p.sublabel}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {/* Platform Default info banner */}
                    {currentProvider === "platform_default" && (
                        <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                            <div className="text-sm">
                                <p className="font-semibold text-foreground">Using the platform bundled key</p>
                                <p className="text-muted-foreground mt-0.5">
                                    DocuGardener is running on a shared Gemini Flash key (free tier). Rate limits apply.
                                    Select Google Gemini or OpenAI above and add your own key for higher throughput.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Dynamic Fields — hidden for Platform Default */}
                    {currentProvider !== "platform_default" && (
                        <div className="grid gap-4 py-4">
                            {currentProvider === "ollama" && (
                                <div className="space-y-2">
                                    <Label>Base URL</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            {...register("baseUrl")}
                                            placeholder="http://localhost:11434"
                                            autoComplete="off"
                                            className="flex-1"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleRefreshModels}
                                            disabled={modelsLoading}
                                            className="shrink-0"
                                        >
                                            <RefreshCw className={cn("w-4 h-4", modelsLoading && "animate-spin")} />
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Network address for your local Ollama or LM Studio instance.
                                    </p>
                                    <TestConnectionButton
                                        status={testStatus}
                                        error={testError}
                                        onTest={handleTestConnection}
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {currentProvider !== "ollama" && (
                                    <div className="space-y-2">
                                        <Label>API Key</Label>
                                        {(() => {
                                            const hasKey = hasKeyPerProvider
                                                ? !!(hasKeyPerProvider[currentProvider])
                                                : hasCustomApiKey
                                            return (<>
                                                <Input
                                                    {...register("apiKey")}
                                                    type="password"
                                                    placeholder={hasKey ? "•••••••••••• (Key Saved)" : "••••••••••••"}
                                                    className={cn("font-mono placeholder:tracking-widest", hasKey && !watch("apiKey") && "bg-muted/30 border-green-500/30 text-green-600")}
                                                    autoComplete="new-password"
                                                />
                                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                    {hasKey ? (
                                                        <>
                                                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                                                            <span className="text-green-600">Key stored for {currentProvider}.</span> Leave blank to keep unchanged.
                                                        </>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-amber-600">
                                                            <AlertCircle className="w-3 h-3" />
                                                            No key saved for {currentProvider}. Enter your API key above.
                                                        </span>
                                                    )}
                                                </p>
                                            </>)
                                        })()}

                                        <TestConnectionButton
                                            status={testStatus}
                                            error={testError}
                                            onTest={handleTestConnection}
                                        />
                                    </div>
                                )}

                                {/* Dynamic Model Field */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Model</Label>
                                        <button
                                            type="button"
                                            onClick={handleRefreshModels}
                                            className="text-xs text-primary hover:underline flex items-center gap-1"
                                            disabled={modelsLoading}
                                        >
                                            <RefreshCw className={cn("w-3 h-3", modelsLoading && "animate-spin")} />
                                            {modelsLoading ? "Loading…" : "Refresh"}
                                        </button>
                                    </div>

                                    {/* Error banner */}
                                    {modelsError && (
                                        <div className="flex items-start gap-2 p-3 rounded-lg bg-broken/10 border border-broken/20 text-broken text-sm">
                                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="font-medium">Could not load models</p>
                                                <p className="text-xs mt-0.5 opacity-80">{modelsError}</p>
                                            </div>
                                        </div>
                                    )}

                                    {models.length > 0 ? (
                                        <div className="space-y-1">
                                            <Select
                                                value={currentModelName}
                                                onValueChange={(v) => setValue("modelName", v, { shouldDirty: true })}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Select a model..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {models.map((m) => (
                                                        <SelectItem key={m.id} value={m.id}>
                                                            <span className="flex items-center gap-2 w-full">
                                                                <span className="truncate">{m.name}</span>
                                                                {m.capability_hint && m.capability_hint !== "standard" && (
                                                                    <CapabilityBadge hint={m.capability_hint} />
                                                                )}
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-fresh flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" />
                                                {models.length} model{models.length !== 1 ? "s" : ""} available
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <Input
                                                {...register("modelName")}
                                                placeholder={modelsLoading ? "Fetching models…" : modelPlaceholder}
                                                autoComplete="off"
                                                disabled={modelsLoading}
                                            />
                                            {modelsLoading && (
                                                <RefreshCw className="absolute right-3 top-3 w-4 h-4 text-muted-foreground animate-spin" />
                                            )}
                                        </div>
                                    )}

                                    {errors.modelName && (
                                        <p className="text-xs text-broken">{errors.modelName.message}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Prompt Tone — always visible */}
                    <div className="space-y-2">
                        <Label>Bot Personality (Tone)</Label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { id: "Strict", label: "Strict", desc: "Concise & factual. Best for CI/CD.", icon: Cpu },
                                { id: "Detailed", label: "Detailed", desc: "Educational. Explains 'why'.", icon: Bot },
                                { id: "Friendly", label: "Friendly", desc: "Encouraging with emojis.", icon: Sparkles },
                            ].map((t) => (
                                <div
                                    key={t.id}
                                    onClick={() => setValue("promptTone", t.id as any, { shouldDirty: true })}
                                    className={cn(
                                        "cursor-pointer flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all text-center h-full",
                                        currentTone === t.id
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-muted hover:border-border hover:bg-muted text-muted-foreground"
                                    )}
                                >
                                    <t.icon className={cn("w-6 h-6 mb-2", currentTone === t.id ? "text-primary" : "text-muted-foreground/40")} />
                                    <span className="font-semibold block mb-1">{t.label}</span>
                                    <span className="text-xs opacity-80">{t.desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </CardContent>
            </Card>

            <div className="flex justify-end gap-3 pt-6 border-t border-border mt-6">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleReset}
                    disabled={!isDirty || isSaving}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                    Reset
                </Button>
                <Button
                    type="submit"
                    disabled={!isDirty || isSaving}
                    className="btn-premium bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
                >
                    {isSaving ? "Saving..." : "Save Changes"}
                </Button>
            </div>
        </form>
    )
}

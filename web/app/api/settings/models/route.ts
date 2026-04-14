import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { getModelMeta, isOpenAIChatModel } from "@/lib/model-registry"

// ---------------------------------------------------------------------------
// LLM-04: Gemini model list cache (module-level TTL cache, 5 min)
// Prevents redundant upstream calls for every Settings page load.
// Keyed by the first 8 chars of the API key so different keys don't collide.
// ---------------------------------------------------------------------------

interface ModelCacheEntry {
    models: any[]
    expiresAt: number
}

const _geminiModelCache = new Map<string, ModelCacheEntry>()
const GEMINI_CACHE_TTL_MS = 5 * 60 * 1_000  // 5 minutes

function _cacheKey(apiKey: string): string {
    return apiKey.slice(0, 8)
}

function _getCachedModels(apiKey: string): any[] | null {
    const entry = _geminiModelCache.get(_cacheKey(apiKey))
    if (!entry || Date.now() > entry.expiresAt) {
        _geminiModelCache.delete(_cacheKey(apiKey))
        return null
    }
    return entry.models
}

function _setCachedModels(apiKey: string, models: any[]): void {
    _geminiModelCache.set(_cacheKey(apiKey), { models, expiresAt: Date.now() + GEMINI_CACHE_TTL_MS })
}

/** Clear all cached Gemini model lists. Exported for use in test suites only. */
export function _clearGeminiModelCacheForTest(): void {
    _geminiModelCache.clear()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the stored API key for a given provider.
 * Supports both the new per-provider shape { keys: { gemini, openai, ... } }
 * and the legacy single-key shape { apiKey, provider } for silent migration.
 */
function resolveKey(llmConfig: any, provider: string): string | undefined {
    // New per-provider shape (LLM-09)
    const perProviderKey = llmConfig?.keys?.[provider]
    if (perProviderKey) return decrypt(perProviderKey)

    // Legacy single-key shape — only use if it belongs to this provider
    if (llmConfig?.apiKey && (!llmConfig.provider || llmConfig.provider === provider)) {
        return decrypt(llmConfig.apiKey)
    }

    return undefined
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any).tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const provider = searchParams.get("provider")  // "gemini" | "openai" | "anthropic" | "ollama"
    const baseUrl = searchParams.get("baseUrl")    // for ollama / lm-studio
    const apiKeyOverride = searchParams.get("apiKey") || undefined  // typed key, not yet saved

    try {
        if (provider === "gemini") {
            return await handleGemini((session.user as any).tenantId, apiKeyOverride)
        } else if (provider === "openai") {
            return await handleOpenAI((session.user as any).tenantId, apiKeyOverride)
        } else if (provider === "anthropic") {
            return await handleAnthropic((session.user as any).tenantId, apiKeyOverride)
        } else if (provider === "ollama") {
            return await handleOllama(baseUrl)
        } else {
            return NextResponse.json(
                { error: "Invalid provider. Use 'gemini', 'openai', 'anthropic', or 'ollama'." },
                { status: 400 }
            )
        }
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to fetch models" }, { status: 500 })
    }
}

// ---------------------------------------------------------------------------
// Provider handlers
// ---------------------------------------------------------------------------

async function handleGemini(tenantId: string, apiKeyOverride?: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    const llmConfig = (tenant?.llmConfig as any) || {}

    const storedKey = resolveKey(llmConfig, "gemini")
    const apiKey = apiKeyOverride || storedKey || process.env.GEMINI_API_KEY
    if (!apiKey) {
        return NextResponse.json(
            { error: "Gemini API key not configured. Please add your API key first." },
            { status: 400 }
        )
    }

    // LLM-04: serve from cache if not expired
    const cached = _getCachedModels(apiKey)
    if (cached) {
        return NextResponse.json({ models: cached, cached: true })
    }

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    )
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return NextResponse.json(
            { error: `Gemini API error (${res.status}): ${errData?.error?.message || res.statusText}` },
            { status: res.status }
        )
    }

    const data = await res.json()
    const models = (data.models || [])
        .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: any) => {
            const id = m.name.replace("models/", "")
            const meta = getModelMeta(id)
            return {
                id,
                name: m.displayName || id,
                capability_hint: meta.capability_hint,
                context_window: meta.context_window,
            }
        })

    _setCachedModels(apiKey, models)
    return NextResponse.json({ models })
}

async function handleOpenAI(tenantId: string, apiKeyOverride?: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    const llmConfig = (tenant?.llmConfig as any) || {}

    const storedKey = resolveKey(llmConfig, "openai")
    const apiKey = apiKeyOverride || storedKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
        return NextResponse.json(
            { error: "OpenAI API key not configured. Please add your API key first." },
            { status: 400 }
        )
    }

    const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 300 },
    })
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return NextResponse.json(
            { error: `OpenAI API error (${res.status}): ${errData?.error?.message || res.statusText}` },
            { status: res.status }
        )
    }

    const data = await res.json()
    const models = (data.data || [])
        .filter((m: any) => isOpenAIChatModel(m.id))
        .sort((a: any, b: any) => a.id.localeCompare(b.id))
        .map((m: any) => {
            const meta = getModelMeta(m.id)
            return {
                id: m.id,
                name: m.id,
                capability_hint: meta.capability_hint,
                context_window: meta.context_window,
            }
        })

    return NextResponse.json({ models })
}

async function handleAnthropic(tenantId: string, apiKeyOverride?: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    const llmConfig = (tenant?.llmConfig as any) || {}

    const apiKey = apiKeyOverride || resolveKey(llmConfig, "anthropic") || process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
        return NextResponse.json(
            { error: "Anthropic API key not configured. Please add your API key first." },
            { status: 400 }
        )
    }

    const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        },
    })
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return NextResponse.json(
            { error: `Anthropic API error (${res.status}): ${errData?.error?.message || res.statusText}` },
            { status: res.status }
        )
    }

    const data = await res.json()
    const models = (data.data || [])
        .filter((m: any) => m.type === "model")
        .sort((a: any, b: any) => a.id.localeCompare(b.id))
        .map((m: any) => {
            const meta = getModelMeta(m.id)
            return {
                id: m.id,
                name: m.display_name || m.id,
                capability_hint: meta.capability_hint,
                context_window: meta.context_window,
            }
        })

    return NextResponse.json({ models })
}

async function handleOllama(baseUrl: string | null) {
    const serverUrl = (baseUrl || "http://localhost:11434").replace(/\/$/, "")

    // Try OpenAI-compatible /v1/models first (LM Studio, vLLM, etc.)
    try {
        const res = await fetch(`${serverUrl}/v1/models`, {
            signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
            const data = await res.json()
            const models = (data.data || []).map((m: any) => {
                const meta = getModelMeta(m.id)
                return {
                    id: m.id,
                    name: m.id,
                    capability_hint: meta.capability_hint,
                    context_window: meta.context_window,
                }
            })
            return NextResponse.json({ models, format: "openai" })
        }
    } catch { /* fall through to native */ }

    // Fallback: Ollama native /api/tags
    try {
        const res = await fetch(`${serverUrl}/api/tags`, {
            signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
            const data = await res.json()
            const models = (data.models || []).map((m: any) => {
                const meta = getModelMeta(m.name)
                return {
                    id: m.name,
                    name: m.name,
                    capability_hint: meta.capability_hint,
                    context_window: meta.context_window,
                }
            })
            return NextResponse.json({ models, format: "ollama" })
        }
    } catch { /* fall through */ }

    return NextResponse.json(
        { error: `Cannot connect to local LLM server at ${serverUrl}. Make sure it is running and accessible.` },
        { status: 503 }
    )
}

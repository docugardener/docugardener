/**
 * GAP-05: POST /api/settings/test-llm
 *
 * Tests connectivity to the configured LLM provider WITHOUT saving anything.
 * Used by the "Test Connection" button in Settings → Intelligence Config.
 *
 * Body: { provider, apiKey?, baseUrl?, modelName? }
 *   - apiKey is optional: falls back to the stored (decrypted) tenant key.
 *   - Does not write to the database.
 *
 * Response:
 *   200  { ok: true }
 *   200  { ok: false, error: string, code: ErrorCode }
 *   400  invalid body
 *   401  not authenticated
 *   403  not ADMIN
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { migrateLlmConfig } from "@/lib/llm-config"

type ErrorCode =
    | "missing_key"
    | "invalid_key"
    | "model_not_found"
    | "connection_error"
    | "timeout"
    | "unknown"

function fail(error: string, code: ErrorCode) {
    return NextResponse.json({ ok: false, error, code }, { status: 200 })
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    // @ts-ignore
    if (session.user.role !== "ADMIN") {
        return new NextResponse("Forbidden", { status: 403 })
    }

    // @ts-ignore
    const tenantId: string = session.user.tenantId

    let body: { provider?: string; apiKey?: string; baseUrl?: string; modelName?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { provider, modelName } = body
    if (!provider) {
        return NextResponse.json({ error: "provider is required" }, { status: 400 })
    }

    // Resolve API key: prefer body, fall back to stored encrypted key.
    let apiKey = body.apiKey || undefined
    const baseUrl = body.baseUrl || undefined

    if (!apiKey && provider !== "ollama" && provider !== "platform_default") {
        try {
            const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
            // Migrate to new shape so both old and new configs work transparently
            const config = migrateLlmConfig((tenant?.llmConfig as any) || {})
            const storedEncrypted = config.keys?.[provider]
            if (storedEncrypted) apiKey = decrypt(storedEncrypted)
        } catch {
            // If decrypt fails, continue without key — will return missing_key below.
        }
    }

    if (provider === "platform_default") {
        // Nothing to test — the platform key is managed internally.
        return NextResponse.json({ ok: true })
    }

    if (provider === "gemini") {
        if (!apiKey) return fail("API key is required for Gemini", "missing_key")
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
                { signal: AbortSignal.timeout(8000) }
            )
            if (res.status === 400 || res.status === 403) {
                return fail("Invalid Gemini API key", "invalid_key")
            }
            if (!res.ok) {
                return fail(`Gemini API returned HTTP ${res.status}`, "connection_error")
            }
            if (modelName) {
                const data = await res.json()
                const found = (data.models || []).some(
                    (m: any) => m.name === `models/${modelName}` || m.name === modelName
                )
                if (!found) return fail(`Model "${modelName}" not found`, "model_not_found")
            }
            return NextResponse.json({ ok: true })
        } catch (e: any) {
            if (e?.name === "TimeoutError" || e?.code === "UND_ERR_CONNECT_TIMEOUT") {
                return fail("Connection to Gemini timed out", "timeout")
            }
            return fail("Failed to connect to Gemini API", "connection_error")
        }
    }

    if (provider === "openai") {
        if (!apiKey) return fail("API key is required for OpenAI", "missing_key")
        try {
            const res = await fetch("https://api.openai.com/v1/models", {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(8000),
            })
            if (res.status === 401) return fail("Invalid OpenAI API key", "invalid_key")
            if (!res.ok) return fail(`OpenAI API returned HTTP ${res.status}`, "connection_error")
            if (modelName) {
                const data = await res.json()
                const found = (data.data || []).some((m: any) => m.id === modelName)
                if (!found) return fail(`Model "${modelName}" not found or not accessible`, "model_not_found")
            }
            return NextResponse.json({ ok: true })
        } catch (e: any) {
            if (e?.name === "TimeoutError" || e?.code === "UND_ERR_CONNECT_TIMEOUT") {
                return fail("Connection to OpenAI timed out", "timeout")
            }
            return fail("Failed to connect to OpenAI API", "connection_error")
        }
    }

    if (provider === "anthropic") {
        if (!apiKey) return fail("API key is required for Anthropic", "missing_key")
        try {
            const res = await fetch("https://api.anthropic.com/v1/models", {
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                },
                signal: AbortSignal.timeout(8000),
            })
            if (res.status === 401) return fail("Invalid Anthropic API key", "invalid_key")
            if (!res.ok) return fail(`Anthropic API returned HTTP ${res.status}`, "connection_error")
            return NextResponse.json({ ok: true })
        } catch (e: any) {
            if (e?.name === "TimeoutError" || e?.code === "UND_ERR_CONNECT_TIMEOUT") {
                return fail("Connection to Anthropic timed out", "timeout")
            }
            return fail("Failed to connect to Anthropic API", "connection_error")
        }
    }

    if (provider === "ollama") {
        const serverUrl = (baseUrl || "http://localhost:11434").replace(/\/$/, "")
        let connected = false
        try {
            const r1 = await fetch(`${serverUrl}/v1/models`, { signal: AbortSignal.timeout(5000) })
            if (r1.ok) connected = true
        } catch { }
        if (!connected) {
            try {
                const r2 = await fetch(`${serverUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
                if (r2.ok) connected = true
            } catch { }
        }
        if (!connected) {
            return fail(`Cannot reach Ollama server at ${serverUrl}`, "connection_error")
        }
        return NextResponse.json({ ok: true })
    }

    return fail(`Unsupported provider: ${provider}`, "unknown")
}

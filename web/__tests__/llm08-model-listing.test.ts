/**
 * LLM-08: Dynamic model listing with capability hints.
 *
 * Groups:
 *   A. model-registry.ts — getModelMeta / isOpenAIChatModel
 *   B. GET /api/settings/models?provider=gemini — key resolution, enrichment, API errors
 *   C. GET /api/settings/models?provider=openai — key resolution, enrichment, filtering
 *   D. GET /api/settings/models?provider=ollama — native + openai-compat fallback
 *   E. GET /api/settings/models — unknown provider → 400
 *   F. Auth guard — 401 when not authenticated
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
    getModelMeta,
    isOpenAIChatModel,
} from "@/lib/model-registry"

// ── Shared mocks ─────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
const mockGetServerSession = vi.fn()
const mockFetch = vi.fn()

vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: (...a: any[]) => mockFindUnique(...a) },
    },
}))

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

vi.mock("next-auth", () => ({
    getServerSession: (...a: any[]) => mockGetServerSession(...a),
}))

vi.mock("@/lib/encryption", () => ({
    encrypt: (v: string) => `enc:${v}`,
    decrypt: (v: string) => v.replace(/^enc:/, ""),
}))

vi.stubGlobal("fetch", mockFetch)

// Helper that builds a minimal NextRequest-like object
function makeReq(params: Record<string, string>): Request {
    const url = new URL("http://localhost/api/settings/models")
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    return new Request(url.toString())
}

// ── A. model-registry.ts ─────────────────────────────────────────────────────

describe("A. getModelMeta — exact IDs", () => {
    it("gemini-2.0-flash → standard", () => {
        const m = getModelMeta("gemini-2.0-flash")
        expect(m.capability_hint).toBe("standard")
        expect(m.context_window).toBe(1_048_576)
    })

    it("gemini-2.0-flash-thinking-exp → thinking", () => {
        expect(getModelMeta("gemini-2.0-flash-thinking-exp").capability_hint).toBe("thinking")
    })

    it("gemma-3-27b-it → oss", () => {
        const m = getModelMeta("gemma-3-27b-it")
        expect(m.capability_hint).toBe("oss")
        expect(m.context_window).toBe(131_072)
    })

    it("gpt-4o → standard", () => {
        const m = getModelMeta("gpt-4o")
        expect(m.capability_hint).toBe("standard")
        expect(m.context_window).toBe(128_000)
    })

    it("o1 → reasoning", () => {
        expect(getModelMeta("o1").capability_hint).toBe("reasoning")
    })

    it("o3-mini → reasoning", () => {
        expect(getModelMeta("o3-mini").capability_hint).toBe("reasoning")
    })
})

describe("A. getModelMeta — prefix / versioned IDs", () => {
    it("gpt-4o-2024-11-20 → standard (prefix match)", () => {
        expect(getModelMeta("gpt-4o-2024-11-20").capability_hint).toBe("standard")
    })

    it("gemma-3-unknown-variant → oss (prefix match)", () => {
        expect(getModelMeta("gemma-3-unknown-variant").capability_hint).toBe("oss")
    })

    it("o3-mini-2025-01-31 → reasoning (prefix match)", () => {
        expect(getModelMeta("o3-mini-2025-01-31").capability_hint).toBe("reasoning")
    })

    it("unknown-model-xyz → standard (fallback)", () => {
        expect(getModelMeta("unknown-model-xyz").capability_hint).toBe("standard")
    })
})

describe("A. isOpenAIChatModel", () => {
    it.each([
        ["gpt-4o", true],
        ["gpt-4o-mini", true],
        ["gpt-4-turbo", true],
        ["gpt-4o-2024-11-20", true],
        ["o1", true],
        ["o1-mini", true],
        ["o3", true],
        ["o3-mini", true],
        ["o4-mini", true],
    ])("%s → %s", (id, expected) => {
        expect(isOpenAIChatModel(id)).toBe(expected)
    })

    it.each([
        ["text-embedding-ada-002", false],
        ["dall-e-3", false],
        ["whisper-1", false],
        ["tts-1", false],
        ["gpt-4-instruct", false],
        ["babbage-002", false],
    ])("excludes %s → false", (id) => {
        expect(isOpenAIChatModel(id)).toBe(false)
    })
})

// ── B. Gemini provider ────────────────────────────────────────────────────────

describe("B. GET /api/settings/models?provider=gemini", () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1" } })
        // LLM-04: Clear Gemini model cache between tests to avoid cross-test pollution
        const { _clearGeminiModelCacheForTest } = await import("@/app/api/settings/models/route")
        _clearGeminiModelCacheForTest()
    })

    it("returns 401 when not authenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "gemini" }))
        expect(res.status).toBe(401)
    })

    it("returns 400 when no API key configured", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: {} })
        delete process.env.GEMINI_API_KEY
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "gemini" }))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toMatch(/API key/i)
    })

    it("resolves key from legacy llmConfig.apiKey shape", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { apiKey: "enc:gm-key", provider: "gemini" } })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                models: [
                    { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash", supportedGenerationMethods: ["generateContent"] },
                ],
            }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "gemini" }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.models[0].id).toBe("gemini-2.0-flash")
        expect(body.models[0].capability_hint).toBe("standard")
    })

    it("resolves key from new keys.gemini shape", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: { gemini: "enc:gm-key2" } } })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                models: [
                    { name: "models/gemma-3-27b-it", displayName: "Gemma 3 27B", supportedGenerationMethods: ["generateContent"] },
                ],
            }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "gemini" }))
        const body = await res.json()
        expect(body.models[0].capability_hint).toBe("oss")
    })

    it("filters out models without generateContent support", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { apiKey: "enc:k" } })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                models: [
                    { name: "models/gemini-2.0-flash", displayName: "Flash", supportedGenerationMethods: ["generateContent"] },
                    { name: "models/text-embedding-004", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
                ],
            }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "gemini" }))
        const body = await res.json()
        expect(body.models).toHaveLength(1)
        expect(body.models[0].id).toBe("gemini-2.0-flash")
    })

    it("enriches thinking model with thinking capability_hint", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { apiKey: "enc:k" } })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                models: [
                    { name: "models/gemini-2.0-flash-thinking-exp", displayName: "Thinking", supportedGenerationMethods: ["generateContent"] },
                ],
            }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "gemini" }))
        const body = await res.json()
        expect(body.models[0].capability_hint).toBe("thinking")
    })

    it("propagates upstream API error status", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { apiKey: "enc:bad" } })
        mockFetch.mockResolvedValue({
            ok: false,
            status: 403,
            statusText: "Forbidden",
            json: async () => ({ error: { message: "API key invalid" } }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "gemini" }))
        expect(res.status).toBe(403)
    })
})

// ── C. OpenAI provider ────────────────────────────────────────────────────────

describe("C. GET /api/settings/models?provider=openai", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1" } })
    })

    it("returns 400 when no API key configured", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: {} })
        delete process.env.OPENAI_API_KEY
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "openai" }))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toMatch(/API key/i)
    })

    it("resolves key from new keys.openai shape", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: { openai: "enc:sk-test" } } })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    { id: "gpt-4o" },
                    { id: "gpt-4o-mini" },
                    { id: "o3-mini" },
                    { id: "text-embedding-ada-002" },  // should be filtered out
                    { id: "dall-e-3" },                // should be filtered out
                ],
            }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "openai" }))
        expect(res.status).toBe(200)
        const body = await res.json()
        const ids = body.models.map((m: any) => m.id)
        expect(ids).toContain("gpt-4o")
        expect(ids).toContain("o3-mini")
        expect(ids).not.toContain("text-embedding-ada-002")
        expect(ids).not.toContain("dall-e-3")
    })

    it("enriches o1 with reasoning capability_hint", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: { openai: "enc:sk-test" } } })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: "o1" }, { id: "o3-mini" }] }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "openai" }))
        const body = await res.json()
        const o1 = body.models.find((m: any) => m.id === "o1")
        expect(o1?.capability_hint).toBe("reasoning")
    })

    it("enriches gpt-4o with standard capability_hint and context_window", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: { openai: "enc:sk-test" } } })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: "gpt-4o" }] }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "openai" }))
        const body = await res.json()
        expect(body.models[0].capability_hint).toBe("standard")
        expect(body.models[0].context_window).toBe(128_000)
    })

    it("falls back to process.env.OPENAI_API_KEY", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: {} })
        process.env.OPENAI_API_KEY = "sk-from-env"
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: "gpt-4o-mini" }] }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "openai" }))
        expect(res.status).toBe(200)
        delete process.env.OPENAI_API_KEY
    })

    it("uses Bearer token in Authorization header", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: { openai: "enc:sk-mykey" } } })
        let capturedHeaders: any
        mockFetch.mockImplementation((_url: string, opts: any) => {
            capturedHeaders = opts?.headers
            return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
        })
        const { GET } = await import("@/app/api/settings/models/route")
        await GET(makeReq({ provider: "openai" }))
        expect(capturedHeaders?.Authorization).toBe("Bearer sk-mykey")
    })
})

// ── D. Ollama provider ────────────────────────────────────────────────────────

describe("D. GET /api/settings/models?provider=ollama", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1" } })
    })

    it("returns models from /v1/models (openai-compat) when available", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: "llama3" }, { id: "mistral" }] }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "ollama", baseUrl: "http://localhost:11434" }))
        const body = await res.json()
        expect(body.format).toBe("openai")
        expect(body.models.map((m: any) => m.id)).toContain("llama3")
    })

    it("falls back to /api/tags when /v1/models fails", async () => {
        mockFetch
            .mockRejectedValueOnce(new Error("Connection refused"))  // /v1/models fails
            .mockResolvedValueOnce({                                  // /api/tags succeeds
                ok: true,
                json: async () => ({ models: [{ name: "llama3:latest" }] }),
            })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "ollama" }))
        const body = await res.json()
        expect(body.format).toBe("ollama")
        expect(body.models[0].id).toBe("llama3:latest")
    })

    it("returns 503 when both endpoints fail", async () => {
        mockFetch.mockRejectedValue(new Error("No server"))
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "ollama" }))
        expect(res.status).toBe(503)
    })

    it("enriches known OSS model with oss capability_hint", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: "gemma-3-27b-it" }] }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "ollama" }))
        const body = await res.json()
        expect(body.models[0].capability_hint).toBe("oss")
    })
})

// ── E. Unknown provider ───────────────────────────────────────────────────────

describe("E. Unknown provider", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1" } })
    })

    it("returns 400 for truly unknown provider", async () => {
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "cohere" }))
        expect(res.status).toBe(400)
    })
})

// ── F. Anthropic provider ─────────────────────────────────────────────────────

describe("F. GET /api/settings/models?provider=anthropic", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1" } })
    })

    it("returns 400 when no API key configured", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: {}, models: {}, baseUrls: {} } })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "anthropic" }))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toMatch(/API key/i)
    })

    it("resolves key from keys.anthropic and returns Claude model list", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: { anthropic: "enc:sk-ant-test" } } })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    { id: "claude-opus-4-6", display_name: "Claude Opus 4.6", type: "model" },
                    { id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6", type: "model" },
                    { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5", type: "model" },
                ],
            }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "anthropic" }))
        expect(res.status).toBe(200)
        const body = await res.json()
        const ids = body.models.map((m: any) => m.id)
        expect(ids).toContain("claude-sonnet-4-6")
        expect(ids).toContain("claude-opus-4-6")
    })

    it("sends x-api-key header to Anthropic API", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: { anthropic: "enc:sk-ant-test" } } })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: "claude-sonnet-4-6" }] }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        await GET(makeReq({ provider: "anthropic" }))
        const fetchCall = mockFetch.mock.calls[0]
        const headers = fetchCall[1]?.headers ?? {}
        expect(headers["x-api-key"]).toBe("sk-ant-test")
    })

    it("propagates 401 error from Anthropic API", async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: { anthropic: "enc:bad-key" } } })
        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            statusText: "Unauthorized",
            json: async () => ({ error: { type: "authentication_error" } }),
        })
        const { GET } = await import("@/app/api/settings/models/route")
        const res = await GET(makeReq({ provider: "anthropic" }))
        expect(res.status).toBe(401)
    })
})

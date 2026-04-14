/**
 * LLM-09: Per-provider key storage + silent migration.
 *
 * Groups:
 *   A. migrateLlmConfig — old shape → new shape conversion
 *   B. migrateLlmConfig — new shape is idempotent
 *   C. hasStoredKey — old and new shapes
 *   D. getKeyStatusPerProvider — bool map per provider
 *   E. POST /api/settings — saves key to keys[provider], not apiKey
 *   F. POST /api/settings — platform_default preserves all provider keys
 *   G. POST /api/settings — switching providers keeps other provider keys intact
 *   H. GET /api/settings/test-llm — resolves key from new shape
 *   I. GET /api/settings/test-llm — resolves key from legacy shape (migration)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { migrateLlmConfig, hasStoredKey, getKeyStatusPerProvider } from "@/lib/llm-config"

// ── Shared mocks ─────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockGetServerSession = vi.fn()
const mockFetch = vi.fn()
const mockWriteAuditLog = vi.fn()

vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: {
            findUnique: (...a: any[]) => mockFindUnique(...a),
            update: (...a: any[]) => mockUpdate(...a),
        },
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

vi.mock("@/lib/audit", () => ({
    writeAuditLog: (...a: any[]) => mockWriteAuditLog(...a),
    getClientIp: () => "127.0.0.1",
    AuditEvent: { SETTINGS_CHANGED: "SETTINGS_CHANGED" },
}))

vi.stubGlobal("fetch", mockFetch)

// ── A. migrateLlmConfig — legacy → new ───────────────────────────────────────

describe("A. migrateLlmConfig — legacy shape", () => {
    it("promotes apiKey to keys[provider]", () => {
        const raw = { provider: "gemini", apiKey: "enc:old-key", modelName: "gemini-2.0-flash" }
        const result = migrateLlmConfig(raw)
        expect(result.keys.gemini).toBe("enc:old-key")
        expect(result.keys.openai).toBeUndefined()
    })

    it("promotes modelName to models[provider]", () => {
        const raw = { provider: "openai", apiKey: "enc:sk", modelName: "gpt-4o" }
        const result = migrateLlmConfig(raw)
        expect(result.models.openai).toBe("gpt-4o")
        expect(result.models.gemini).toBeUndefined()
    })

    it("promotes baseUrl to baseUrls.ollama", () => {
        const raw = { provider: "ollama", baseUrl: "http://my-server:11434" }
        const result = migrateLlmConfig(raw)
        expect(result.baseUrls.ollama).toBe("http://my-server:11434")
    })

    it("preserves promptTone and scoringModel", () => {
        const raw = { provider: "gemini", promptTone: "Friendly", scoringModel: "holistic" }
        const result = migrateLlmConfig(raw)
        expect(result.promptTone).toBe("Friendly")
        expect(result.scoringModel).toBe("holistic")
    })

    it("does not promote apiKey to keys for platform_default", () => {
        const raw = { provider: "platform_default", apiKey: "enc:old-key" }
        const result = migrateLlmConfig(raw)
        expect(result.keys.platform_default).toBeUndefined()
        expect(result.keys.gemini).toBeUndefined()
    })

    it("handles empty / null input gracefully", () => {
        expect(() => migrateLlmConfig(null)).not.toThrow()
        expect(() => migrateLlmConfig({})).not.toThrow()
        const result = migrateLlmConfig({})
        expect(result.provider).toBe("gemini")
        expect(result.keys).toEqual({})
    })
})

// ── B. migrateLlmConfig — new shape idempotent ───────────────────────────────

describe("B. migrateLlmConfig — new shape is idempotent", () => {
    it("returns the new shape unchanged when keys sub-object exists", () => {
        const raw = {
            provider: "openai",
            keys: { openai: "enc:sk-new", gemini: "enc:gm" },
            models: { openai: "gpt-4o" },
            baseUrls: {},
            promptTone: "Strict",
        }
        const result = migrateLlmConfig(raw)
        expect(result.keys.openai).toBe("enc:sk-new")
        expect(result.keys.gemini).toBe("enc:gm")
        expect(result.models.openai).toBe("gpt-4o")
    })

    it("calling twice is stable", () => {
        const raw = { provider: "gemini", apiKey: "enc:k" }
        const first = migrateLlmConfig(raw)
        const second = migrateLlmConfig(first)
        expect(second).toEqual(first)
    })
})

// ── C. hasStoredKey ───────────────────────────────────────────────────────────

describe("C. hasStoredKey", () => {
    it("returns true for new shape when keys[provider] is set", () => {
        expect(hasStoredKey({ keys: { openai: "enc:sk" } }, "openai")).toBe(true)
    })

    it("returns false for new shape when keys[provider] is missing", () => {
        expect(hasStoredKey({ keys: { gemini: "enc:gm" } }, "openai")).toBe(false)
    })

    it("returns true for legacy apiKey when provider matches", () => {
        expect(hasStoredKey({ apiKey: "enc:k", provider: "gemini" }, "gemini")).toBe(true)
    })

    it("returns false for legacy apiKey when provider does not match", () => {
        expect(hasStoredKey({ apiKey: "enc:k", provider: "gemini" }, "openai")).toBe(false)
    })

    it("returns true for legacy apiKey with no explicit provider (default gemini)", () => {
        expect(hasStoredKey({ apiKey: "enc:k" }, "gemini")).toBe(true)
    })

    it("returns false for null config", () => {
        expect(hasStoredKey(null, "gemini")).toBe(false)
    })
})

// ── D. getKeyStatusPerProvider ────────────────────────────────────────────────

describe("D. getKeyStatusPerProvider", () => {
    it("returns correct booleans for new shape with both keys", () => {
        const status = getKeyStatusPerProvider({
            keys: { gemini: "enc:gm", openai: "enc:sk" },
        })
        expect(status.gemini).toBe(true)
        expect(status.openai).toBe(true)
        expect(status.ollama).toBe(false)  // no key needed for ollama
    })

    it("returns correct booleans for legacy gemini-only shape", () => {
        const status = getKeyStatusPerProvider({ provider: "gemini", apiKey: "enc:k" })
        expect(status.gemini).toBe(true)
        expect(status.openai).toBe(false)
        expect(status.ollama).toBe(false)
    })

    it("always returns false for ollama regardless of config", () => {
        const status = getKeyStatusPerProvider({ provider: "ollama", apiKey: "enc:k" })
        expect(status.ollama).toBe(false)
    })
})

// ── E. POST /api/settings — keys[provider] storage ──────────────────────────

describe("E. POST /api/settings — new key stored in keys[provider]", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1", role: "ADMIN", id: "u1", email: "a@a.com" } })
        mockFindUnique.mockResolvedValue({ llmConfig: {} })
        mockUpdate.mockResolvedValue({ id: "t1" })
        mockWriteAuditLog.mockResolvedValue(undefined)
    })

    it("saves apiKey into keys[gemini] not top-level apiKey", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ models: [] }),
        })
        const { POST } = await import("@/app/api/settings/route")
        const req = new Request("http://localhost/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ llmProvider: "gemini", llmApiKey: "my-gemini-key", llmModelName: "gemini-2.0-flash" }),
        })
        await POST(req)

        const updateCall = mockUpdate.mock.calls[0][0]
        const saved = updateCall.data.llmConfig
        expect(saved.keys?.gemini).toBe("enc:my-gemini-key")
        expect(saved.apiKey).toBeUndefined()
    })

    it("saves openai key into keys[openai]", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: "gpt-4o" }] }),
        })
        const { POST } = await import("@/app/api/settings/route")
        const req = new Request("http://localhost/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ llmProvider: "openai", llmApiKey: "sk-abc", llmModelName: "gpt-4o" }),
        })
        await POST(req)

        const saved = mockUpdate.mock.calls[0][0].data.llmConfig
        expect(saved.keys?.openai).toBe("enc:sk-abc")
        expect(saved.keys?.gemini).toBeUndefined()
    })
})

// ── F. platform_default preserves existing keys ───────────────────────────────

describe("F. POST /api/settings — platform_default preserves keys", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1", role: "ADMIN", id: "u1", email: "a@a.com" } })
        mockUpdate.mockResolvedValue({ id: "t1" })
        mockWriteAuditLog.mockResolvedValue(undefined)
    })

    it("keeps existing gemini and openai keys when switching to platform_default", async () => {
        mockFindUnique.mockResolvedValue({
            llmConfig: { keys: { gemini: "enc:gm", openai: "enc:sk" }, models: {}, baseUrls: {}, provider: "gemini" },
        })
        const { POST } = await import("@/app/api/settings/route")
        const req = new Request("http://localhost/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ llmProvider: "platform_default" }),
        })
        await POST(req)

        const saved = mockUpdate.mock.calls[0][0].data.llmConfig
        expect(saved.provider).toBe("platform_default")
        expect(saved.keys?.gemini).toBe("enc:gm")
        expect(saved.keys?.openai).toBe("enc:sk")
    })
})

// ── G. Switching providers preserves other provider keys ──────────────────────

describe("G. POST /api/settings — switching providers keeps other keys", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1", role: "ADMIN", id: "u1", email: "a@a.com" } })
        mockUpdate.mockResolvedValue({ id: "t1" })
        mockWriteAuditLog.mockResolvedValue(undefined)
    })

    it("keeps gemini key when tenant switches to openai", async () => {
        mockFindUnique.mockResolvedValue({
            llmConfig: { keys: { gemini: "enc:gm-existing" }, models: {}, baseUrls: {}, provider: "gemini" },
        })
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: "gpt-4o" }] }),
        })
        const { POST } = await import("@/app/api/settings/route")
        const req = new Request("http://localhost/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ llmProvider: "openai", llmApiKey: "sk-new", llmModelName: "gpt-4o" }),
        })
        await POST(req)

        const saved = mockUpdate.mock.calls[0][0].data.llmConfig
        expect(saved.provider).toBe("openai")
        expect(saved.keys?.openai).toBe("enc:sk-new")
        expect(saved.keys?.gemini).toBe("enc:gm-existing")  // preserved
    })
})

// ── H. test-llm resolves key from new shape ───────────────────────────────────

describe("H. POST /api/settings/test-llm — new shape key resolution", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1", role: "ADMIN" } })
    })

    it("uses keys.openai from new shape when body omits apiKey", async () => {
        mockFindUnique.mockResolvedValue({
            llmConfig: { keys: { openai: "enc:sk-stored" }, models: {}, baseUrls: {}, provider: "openai" },
        })
        mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) })

        const { POST } = await import("@/app/api/settings/test-llm/route")
        const req = new Request("http://localhost/api/settings/test-llm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "openai" }),
        })
        const res = await POST(req)
        const body = await res.json()
        expect(body.ok).toBe(true)
        // Verify the decrypted key was used in the fetch call
        const fetchCall = mockFetch.mock.calls[0]
        expect(fetchCall[1]?.headers?.Authorization).toBe("Bearer sk-stored")
    })

    it("returns missing_key when no key in new shape", async () => {
        mockFindUnique.mockResolvedValue({
            llmConfig: { keys: {}, models: {}, baseUrls: {}, provider: "openai" },
        })
        const { POST } = await import("@/app/api/settings/test-llm/route")
        const req = new Request("http://localhost/api/settings/test-llm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "openai" }),
        })
        const res = await POST(req)
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe("missing_key")
    })
})

// ── I. test-llm resolves key from legacy shape (migration) ────────────────────

describe("I. POST /api/settings/test-llm — legacy shape migration", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
        mockGetServerSession.mockResolvedValue({ user: { tenantId: "t1", role: "ADMIN" } })
    })

    it("uses legacy apiKey when provider matches", async () => {
        mockFindUnique.mockResolvedValue({
            llmConfig: { provider: "gemini", apiKey: "enc:gm-legacy" },
        })
        mockFetch.mockResolvedValue({ ok: true, json: async () => ({ models: [] }) })

        const { POST } = await import("@/app/api/settings/test-llm/route")
        const req = new Request("http://localhost/api/settings/test-llm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "gemini" }),
        })
        const res = await POST(req)
        const body = await res.json()
        expect(body.ok).toBe(true)
        // Fetch URL should contain the decrypted legacy key
        const fetchUrl: string = mockFetch.mock.calls[0][0]
        expect(fetchUrl).toContain("gm-legacy")
    })
})

// ── J. Anthropic key status ───────────────────────────────────────────────────

describe("J. getKeyStatusPerProvider — anthropic", () => {
    it("returns anthropic: true when keys.anthropic is set", () => {
        const status = getKeyStatusPerProvider({
            keys: { anthropic: "enc:sk-ant" },
        })
        expect(status.anthropic).toBe(true)
    })

    it("returns anthropic: false when keys.anthropic is absent", () => {
        const status = getKeyStatusPerProvider({
            keys: { gemini: "enc:gm" },
        })
        expect(status.anthropic).toBe(false)
    })

    it("includes anthropic in the returned map alongside other providers", () => {
        const status = getKeyStatusPerProvider({
            keys: { gemini: "enc:gm", openai: "enc:sk", anthropic: "enc:ant" },
        })
        expect(status).toMatchObject({
            gemini: true,
            openai: true,
            anthropic: true,
            ollama: false,
        })
    })
})

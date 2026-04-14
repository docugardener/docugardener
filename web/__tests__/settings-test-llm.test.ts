/**
 * GAP-05: Tests for POST /api/settings/test-llm
 *
 * Groups:
 *   A. Auth & RBAC — 401 / 403 guards
 *   B. Input validation — missing / unsupported provider
 *   C. platform_default — always ok, no network call
 *   D. Gemini — valid key, invalid key, timeout, model check
 *   E. OpenAI — valid key, invalid key, timeout, model check
 *   F. Ollama — reachable, unreachable
 *   G. Stored key fallback — uses decrypted DB key when body omits apiKey
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
    prisma: {
        tenant: { findUnique: (...a: any[]) => mockFindUnique(...a) },
    },
}))

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

vi.mock('@/lib/encryption', () => ({
    encrypt: (v: string) => `enc:${v}`,
    decrypt: (v: string) => v.replace(/^enc:/, ''),
}))

const mockGetServerSession = vi.fn()
vi.mock('next-auth', () => ({
    getServerSession: (...a: any[]) => mockGetServerSession(...a),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession(tenantId = 't-1') {
    return { user: { id: 'u-1', email: 'admin@example.com', role: 'ADMIN', tenantId } }
}

function makeRequest(body: Record<string, unknown>) {
    return new Request('http://localhost/api/settings/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
}

function okFetch(body: unknown = {}) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

function failFetch(status: number, body: unknown = {}) {
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

// ── A. Auth & RBAC ────────────────────────────────────────────────────────────

describe('POST /api/settings/test-llm — auth', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns 401 when not authenticated', async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini' }))
        expect(res.status).toBe(401)
    })

    it('returns 403 for VIEWER role', async () => {
        mockGetServerSession.mockResolvedValue({ user: { role: 'VIEWER', tenantId: 't-1' } })
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini' }))
        expect(res.status).toBe(403)
    })

    it('returns 403 for AUDITOR role', async () => {
        mockGetServerSession.mockResolvedValue({ user: { role: 'AUDITOR', tenantId: 't-1' } })
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini' }))
        expect(res.status).toBe(403)
    })
})

// ── B. Input validation ───────────────────────────────────────────────────────

describe('POST /api/settings/test-llm — validation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
    })

    it('returns 400 when provider is missing', async () => {
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(400)
    })

    it('returns ok:false for unsupported provider', async () => {
        mockFindUnique.mockResolvedValue(null)
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'cohere' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('unknown')
    })
})

// ── C. platform_default ───────────────────────────────────────────────────────

describe('POST /api/settings/test-llm — platform_default', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
    })

    it('returns ok:true without making any fetch calls', async () => {
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'platform_default' }))
        const body = await res.json()
        expect(body.ok).toBe(true)
        expect(mockFetch).not.toHaveBeenCalled()
    })
})

// ── D. Gemini ─────────────────────────────────────────────────────────────────

describe('POST /api/settings/test-llm — gemini', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue(null)
    })

    it('returns ok:true when Gemini API responds 200', async () => {
        mockFetch.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini', apiKey: 'valid-key' }))
        expect((await res.json()).ok).toBe(true)
    })

    it('returns ok:false with invalid_key when Gemini returns 403', async () => {
        mockFetch.mockResolvedValue(new Response('', { status: 403 }))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini', apiKey: 'bad-key' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('invalid_key')
    })

    it('returns ok:false with invalid_key when Gemini returns 400', async () => {
        mockFetch.mockResolvedValue(new Response('', { status: 400 }))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini', apiKey: 'bad-key' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('invalid_key')
    })

    it('returns ok:false with missing_key when no apiKey provided and no stored key', async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: null })
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('missing_key')
    })

    it('returns ok:false with model_not_found when model missing from list', async () => {
        mockFetch.mockResolvedValue(new Response(
            JSON.stringify({ models: [{ name: 'models/gemini-1.5-pro' }] }),
            { status: 200 }
        ))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini', apiKey: 'k', modelName: 'gemini-99' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('model_not_found')
    })

    it('returns ok:true when specified model is present', async () => {
        mockFetch.mockResolvedValue(new Response(
            JSON.stringify({ models: [{ name: 'models/gemini-2.0-flash' }] }),
            { status: 200 }
        ))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini', apiKey: 'k', modelName: 'gemini-2.0-flash' }))
        expect((await res.json()).ok).toBe(true)
    })

    it('returns ok:false with connection_error when fetch throws', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'gemini', apiKey: 'k' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('connection_error')
    })
})

// ── E. OpenAI ─────────────────────────────────────────────────────────────────

describe('POST /api/settings/test-llm — openai', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue(null)
    })

    it('returns ok:true for valid OpenAI key', async () => {
        mockFetch.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'openai', apiKey: 'sk-valid' }))
        expect((await res.json()).ok).toBe(true)
    })

    it('returns ok:false with invalid_key when OpenAI returns 401', async () => {
        mockFetch.mockResolvedValue(new Response('', { status: 401 }))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'openai', apiKey: 'sk-bad' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('invalid_key')
    })

    it('returns ok:false with missing_key when no key and nothing stored', async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: {} })
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'openai' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('missing_key')
    })

    it('returns ok:false with model_not_found when model absent', async () => {
        mockFetch.mockResolvedValue(new Response(
            JSON.stringify({ data: [{ id: 'gpt-4o' }] }),
            { status: 200 }
        ))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'openai', apiKey: 'k', modelName: 'gpt-99' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('model_not_found')
    })
})

// ── F. Ollama ─────────────────────────────────────────────────────────────────

describe('POST /api/settings/test-llm — ollama', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
    })

    it('returns ok:true when /v1/models responds 200', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'ollama', baseUrl: 'http://localhost:11434' }))
        expect((await res.json()).ok).toBe(true)
    })

    it('falls back to /api/tags and returns ok:true', async () => {
        mockFetch
            .mockRejectedValueOnce(new Error('ECONNREFUSED'))  // /v1/models fails
            .mockResolvedValueOnce(new Response('{}', { status: 200 }))  // /api/tags ok
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'ollama', baseUrl: 'http://localhost:11434' }))
        expect((await res.json()).ok).toBe(true)
    })

    it('returns ok:false with connection_error when both endpoints fail', async () => {
        mockFetch
            .mockRejectedValueOnce(new Error('ECONNREFUSED'))
            .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'ollama', baseUrl: 'http://localhost:11434' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('connection_error')
    })

    it('uses default base URL when none provided', async () => {
        mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        await POST(makeRequest({ provider: 'ollama' }))
        const calledUrl: string = mockFetch.mock.calls[0][0]
        expect(calledUrl).toContain('localhost:11434')
    })
})

// ── G. Stored key fallback ────────────────────────────────────────────────────

describe('POST /api/settings/test-llm — stored key fallback', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
    })

    it('uses decrypted stored key when body omits apiKey', async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { apiKey: 'enc:stored-secret' } })
        mockFetch.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        await POST(makeRequest({ provider: 'gemini' }))
        // The fetch URL must contain the decrypted key
        const calledUrl: string = mockFetch.mock.calls[0][0]
        expect(calledUrl).toContain('stored-secret')
    })

    it('body apiKey takes precedence over stored key', async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { apiKey: 'enc:old-key' } })
        mockFetch.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        await POST(makeRequest({ provider: 'gemini', apiKey: 'new-key' }))
        const calledUrl: string = mockFetch.mock.calls[0][0]
        expect(calledUrl).toContain('new-key')
        expect(calledUrl).not.toContain('old-key')
    })
})

// ── H. Anthropic provider ────────────────────────────────────────────────────

describe('POST /api/settings/test-llm — anthropic', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
    })

    it('returns ok:true when Anthropic API responds 200', async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: {} })
        mockFetch.mockResolvedValue(new Response(
            JSON.stringify({ data: [{ id: 'claude-sonnet-4-6' }] }),
            { status: 200 }
        ))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'anthropic', apiKey: 'sk-ant-test' }))
        const body = await res.json()
        expect(body.ok).toBe(true)
    })

    it('returns ok:false when Anthropic API returns 401', async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: {} })
        mockFetch.mockResolvedValue(new Response(
            JSON.stringify({ error: { type: 'authentication_error' } }),
            { status: 401 }
        ))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'anthropic', apiKey: 'bad-key' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
    })

    it('returns 400 missing_key when no key provided and none stored', async () => {
        mockFindUnique.mockResolvedValue({ llmConfig: { keys: {}, models: {}, baseUrls: {} } })
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'anthropic' }))
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.code).toBe('missing_key')
    })

    it('uses stored keys.anthropic fallback when body omits apiKey', async () => {
        mockFindUnique.mockResolvedValue({
            llmConfig: { keys: { anthropic: 'enc:sk-ant-stored' }, models: {}, baseUrls: {} },
        })
        mockFetch.mockResolvedValue(new Response(
            JSON.stringify({ data: [{ id: 'claude-sonnet-4-6' }] }),
            { status: 200 }
        ))
        const { POST } = await import('@/app/api/settings/test-llm/route')
        const res = await POST(makeRequest({ provider: 'anthropic' }))
        const body = await res.json()
        expect(body.ok).toBe(true)
        // Verify the decrypted key was passed in the Authorization header
        const fetchCall = mockFetch.mock.calls[0]
        expect(fetchCall[1]?.headers?.['x-api-key'] ?? fetchCall[1]?.headers?.['Authorization']).toContain('sk-ant-stored')
    })
})

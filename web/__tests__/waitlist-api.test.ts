// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Tests for POST /api/waitlist
 *
 * Covers:
 *  - Valid request → 200 { ok: true }
 *  - Missing email → 400 validation error
 *  - Invalid plan enum → 400 validation error
 *  - Invalid email format → 400 validation error
 *  - Name too long (>100 chars) → 400 validation error
 *  - Optional fields omitted → 200 { ok: true }
 *  - SMTP failure does NOT fail the request
 *  - Rate limit returns { ok: true } silently (no error)
 *  - Invalid JSON body → 400 { error: "Invalid JSON" }
 *
 * We reset modules in beforeEach so the in-memory rateLimitMap starts
 * fresh for every test.
 */

// ── Prisma mock (set up before module import via vi.mock hoisting) ────────────

const mockWaitlistCreate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    waitlistEntry: {
      create: (...args: any[]) => mockWaitlistCreate(...args),
    },
  },
}))

// ── nodemailer mock ───────────────────────────────────────────────────────────

const mockSendMail = vi.fn()
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (...args: any[]) => mockCreateTransport(...args),
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, ip = '1.2.3.4'): NextRequest {
  const init: RequestInit =
    typeof body === 'string'
      ? { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip } }
      : { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip } }

  return new NextRequest('http://localhost/api/waitlist', init)
}

function makeRawRequest(rawBody: string, ip = '1.2.3.4'): NextRequest {
  return new NextRequest('http://localhost/api/waitlist', {
    method: 'POST',
    body: rawBody,
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/waitlist', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset rate-limiter state: the rateLimitMap is module-level, so we must
    // reset modules to get a fresh instance each test.
    vi.resetModules()

    // After resetModules the mock registrations are cleared too, so we must
    // re-register them each cycle.
    vi.mock('@/lib/prisma', () => ({
      prisma: {
        waitlistEntry: {
          create: (...args: any[]) => mockWaitlistCreate(...args),
        },
      },
    }))

    vi.mock('nodemailer', () => ({
      default: {
        createTransport: (...args: any[]) => mockCreateTransport(...args),
      },
    }))

    // Default: prisma create resolves successfully
    mockWaitlistCreate.mockResolvedValue({ id: 'entry-1' })
    // Default: sendMail resolves successfully
    mockSendMail.mockResolvedValue({ messageId: 'msg-1' })

    // Set SMTP env vars so sendOwnerNotification tries to send
    vi.stubEnv('OWNER_EMAIL', 'owner@example.com')
    vi.stubEnv('SMTP_HOST', 'smtp.example.com')
    vi.stubEnv('SMTP_PORT', '587')
    vi.stubEnv('SMTP_USER', 'user@example.com')
    vi.stubEnv('SMTP_PASS', 'secret')
  })

  it('returns 200 { ok: true } for a valid pro plan request', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRequest({ email: 'user@example.com', plan: 'pro' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockWaitlistCreate).toHaveBeenCalledOnce()
    expect(mockWaitlistCreate).toHaveBeenCalledWith({
      data: { email: 'user@example.com', name: undefined, plan: 'pro', message: undefined },
    })
  })

  it('returns 200 { ok: true } for a valid team plan request with all optional fields', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRequest({
      email: 'team@example.com',
      name: 'Alice',
      plan: 'team',
      message: 'Looking forward to it!',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockWaitlistCreate).toHaveBeenCalledWith({
      data: {
        email: 'team@example.com',
        name: 'Alice',
        plan: 'team',
        message: 'Looking forward to it!',
      },
    })
  })

  it('returns 200 when optional fields (name, message) are omitted', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRequest({ email: 'minimal@example.com', plan: 'pro' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
  })

  it('returns 400 with error message when email is missing', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRequest({ plan: 'pro' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toHaveProperty('error')
    expect(mockWaitlistCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when email format is invalid', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRequest({ email: 'not-an-email', plan: 'pro' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toHaveProperty('error')
    expect(typeof body.error).toBe('string')
    expect(mockWaitlistCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when plan is an invalid enum value', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRequest({ email: 'user@example.com', plan: 'enterprise' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toHaveProperty('error')
    expect(mockWaitlistCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when plan is missing entirely', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRequest({ email: 'user@example.com' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toHaveProperty('error')
    expect(mockWaitlistCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when name exceeds 100 characters', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const longName = 'A'.repeat(101)
    const req = makeRequest({ email: 'user@example.com', plan: 'pro', name: longName })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toHaveProperty('error')
    expect(mockWaitlistCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when message exceeds 500 characters', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const longMessage = 'B'.repeat(501)
    const req = makeRequest({ email: 'user@example.com', plan: 'team', message: longMessage })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toHaveProperty('error')
    expect(mockWaitlistCreate).not.toHaveBeenCalled()
  })

  it('returns 400 { error: "Invalid JSON" } when body is malformed JSON', async () => {
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRawRequest('{ not valid json }')
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid JSON' })
    expect(mockWaitlistCreate).not.toHaveBeenCalled()
  })

  it('returns 200 { ok: true } even when SMTP sendMail throws', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP connection refused'))
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRequest({ email: 'user@example.com', plan: 'pro' })
    const res = await POST(req)
    const body = await res.json()

    // DB write succeeded, SMTP failure must not propagate
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockWaitlistCreate).toHaveBeenCalledOnce()
  })

  it('returns 200 { ok: true } and does not call nodemailer when SMTP env vars are absent', async () => {
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('SMTP_USER', '')
    vi.stubEnv('SMTP_PASS', '')
    const { POST } = await import('../app/api/waitlist/route')

    const req = makeRequest({ email: 'user@example.com', plan: 'pro' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockCreateTransport).not.toHaveBeenCalled()
  })

  it('silently returns { ok: true } when the IP is rate-limited (does not reveal limit)', async () => {
    const { POST } = await import('../app/api/waitlist/route')
    const ip = '10.0.0.1'
    const validPayload = { email: 'user@example.com', plan: 'pro' }

    // Exhaust the 5-per-hour budget
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest(validPayload, ip))
    }

    // The 6th request must be silently accepted (no error exposed)
    const res = await POST(makeRequest(validPayload, ip))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    // DB must NOT have been called for the 6th request
    expect(mockWaitlistCreate).toHaveBeenCalledTimes(5)
  })

  it('does not rate-limit requests from different IPs independently', async () => {
    const { POST } = await import('../app/api/waitlist/route')
    const validPayload = { email: 'user@example.com', plan: 'pro' }

    // Exhaust limit for IP A
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest(validPayload, '192.168.1.1'))
    }

    // IP B should still be allowed
    const res = await POST(makeRequest(validPayload, '192.168.1.2'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    // 5 from IP A + 1 from IP B = 6 total DB writes
    expect(mockWaitlistCreate).toHaveBeenCalledTimes(6)
  })
})

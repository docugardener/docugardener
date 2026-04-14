// SPDX-License-Identifier: AGPL-3.0-or-later
// SEC-OWN-01: Integration tests for POST /api/admin/owner/auth
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const OWNER_EMAIL = "owner@test.local"
const OWNER_ACCESS_TOKEN = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

// ── Helpers ──────────────────────────────────────────────────────────────────

function ownerSession() {
  return { user: { id: "user-owner", email: OWNER_EMAIL } }
}

function nonOwnerSession() {
  return { user: { id: "user-other", email: "other@test.local" } }
}

function makeReq(body: unknown) {
  return new Request("http://localhost/api/admin/owner/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/admin/owner/auth (SEC-OWN-01)", () => {
  const origOwnerEmail = process.env.OWNER_EMAIL
  const origOwnerToken = process.env.OWNER_ACCESS_TOKEN

  beforeEach(() => {
    vi.resetModules()
    process.env.OWNER_EMAIL = OWNER_EMAIL
    process.env.OWNER_ACCESS_TOKEN = OWNER_ACCESS_TOKEN
    mockGetServerSession.mockResolvedValue(ownerSession())
  })

  afterEach(() => {
    process.env.OWNER_EMAIL = origOwnerEmail
    process.env.OWNER_ACCESS_TOKEN = origOwnerToken
    vi.clearAllMocks()
  })

  it("returns 200 and sets dg_owner_access cookie on correct token", async () => {
    const { POST } = await import("@/app/api/admin/owner/auth/route")
    const res = await POST(makeReq({ token: OWNER_ACCESS_TOKEN }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // Cookie must be set
    const setCookie = res.headers.get("set-cookie")
    expect(setCookie).toContain("dg_owner_access=")
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie?.toLowerCase()).toContain("samesite=strict")
  })

  it("returns 401 on wrong token", async () => {
    const { POST } = await import("@/app/api/admin/owner/auth/route")
    const res = await POST(makeReq({ token: "wrong-token-value" }) as never)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe("invalid_token")
  })

  it("returns 404 when OWNER_ACCESS_TOKEN is not configured", async () => {
    delete process.env.OWNER_ACCESS_TOKEN
    const { POST } = await import("@/app/api/admin/owner/auth/route")
    const res = await POST(makeReq({ token: OWNER_ACCESS_TOKEN }) as never)
    expect(res.status).toBe(404)
  })

  it("returns 404 when OWNER_EMAIL is not configured", async () => {
    delete process.env.OWNER_EMAIL
    const { POST } = await import("@/app/api/admin/owner/auth/route")
    const res = await POST(makeReq({ token: OWNER_ACCESS_TOKEN }) as never)
    expect(res.status).toBe(404)
  })

  it("returns 404 when session email does not match OWNER_EMAIL", async () => {
    mockGetServerSession.mockResolvedValue(nonOwnerSession())
    const { POST } = await import("@/app/api/admin/owner/auth/route")
    const res = await POST(makeReq({ token: OWNER_ACCESS_TOKEN }) as never)
    expect(res.status).toBe(404)
  })

  it("returns 404 when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null)
    const { POST } = await import("@/app/api/admin/owner/auth/route")
    const res = await POST(makeReq({ token: OWNER_ACCESS_TOKEN }) as never)
    expect(res.status).toBe(404)
  })

  it("returns 400 on malformed JSON body", async () => {
    const { POST } = await import("@/app/api/admin/owner/auth/route")
    const req = new Request("http://localhost/api/admin/owner/auth", {
      method: "POST",
      body: "not-json",
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it("returns 400 when token field is missing from body", async () => {
    const { POST } = await import("@/app/api/admin/owner/auth/route")
    const res = await POST(makeReq({ notToken: "something" }) as never)
    expect(res.status).toBe(400)
  })

  it("does not set cookie on failed auth", async () => {
    const { POST } = await import("@/app/api/admin/owner/auth/route")
    const res = await POST(makeReq({ token: "wrong" }) as never)
    expect(res.status).toBe(401)
    const setCookie = res.headers.get("set-cookie")
    expect(setCookie).toBeNull()
  })
})

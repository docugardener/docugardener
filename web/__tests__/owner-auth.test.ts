// SPDX-License-Identifier: AGPL-3.0-or-later
// SEC-OWN-01: Unit tests for owner-auth HMAC helpers.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// We manipulate process.env before importing the module under test
const TOKEN = "abc123def456abc123def456abc123def456abc123def456abc123def456abcd"

describe("owner-auth HMAC helpers", () => {
  beforeEach(() => {
    process.env.OWNER_ACCESS_TOKEN = TOKEN
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.OWNER_ACCESS_TOKEN
    vi.resetModules()
  })

  it("isOwnerTokenConfigured returns true when OWNER_ACCESS_TOKEN is set", async () => {
    const { isOwnerTokenConfigured } = await import("@/lib/owner-auth")
    expect(isOwnerTokenConfigured()).toBe(true)
  })

  it("isOwnerTokenConfigured returns false when OWNER_ACCESS_TOKEN is missing", async () => {
    delete process.env.OWNER_ACCESS_TOKEN
    const { isOwnerTokenConfigured } = await import("@/lib/owner-auth")
    expect(isOwnerTokenConfigured()).toBe(false)
  })

  it("signOwnerToken returns a 64-char hex string (SHA-256)", async () => {
    const { signOwnerToken } = await import("@/lib/owner-auth")
    const sig = signOwnerToken("user-42")
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it("signOwnerToken is deterministic for the same userId", async () => {
    const { signOwnerToken } = await import("@/lib/owner-auth")
    expect(signOwnerToken("user-42")).toBe(signOwnerToken("user-42"))
  })

  it("signOwnerToken produces different values for different userIds", async () => {
    const { signOwnerToken } = await import("@/lib/owner-auth")
    expect(signOwnerToken("user-1")).not.toBe(signOwnerToken("user-2"))
  })

  it("signOwnerToken returns empty string when OWNER_ACCESS_TOKEN is missing", async () => {
    delete process.env.OWNER_ACCESS_TOKEN
    const { signOwnerToken } = await import("@/lib/owner-auth")
    expect(signOwnerToken("user-42")).toBe("")
  })

  it("verifyOwnerToken returns true for a matching cookie", async () => {
    const { signOwnerToken, verifyOwnerToken } = await import("@/lib/owner-auth")
    const cookie = signOwnerToken("user-42")
    expect(verifyOwnerToken("user-42", cookie)).toBe(true)
  })

  it("verifyOwnerToken returns false for a tampered cookie", async () => {
    const { signOwnerToken, verifyOwnerToken } = await import("@/lib/owner-auth")
    const cookie = signOwnerToken("user-42")
    const tampered = cookie.slice(0, -2) + "ff"
    expect(verifyOwnerToken("user-42", tampered)).toBe(false)
  })

  it("verifyOwnerToken returns false for a cookie belonging to a different userId", async () => {
    const { signOwnerToken, verifyOwnerToken } = await import("@/lib/owner-auth")
    const cookieForUser1 = signOwnerToken("user-1")
    expect(verifyOwnerToken("user-2", cookieForUser1)).toBe(false)
  })

  it("verifyOwnerToken returns false for an empty cookie", async () => {
    const { verifyOwnerToken } = await import("@/lib/owner-auth")
    expect(verifyOwnerToken("user-42", "")).toBe(false)
  })

  it("verifyOwnerToken returns false when OWNER_ACCESS_TOKEN is missing", async () => {
    delete process.env.OWNER_ACCESS_TOKEN
    const { verifyOwnerToken } = await import("@/lib/owner-auth")
    expect(verifyOwnerToken("user-42", "somecookie")).toBe(false)
  })

  it("verifyOwnerToken returns false for non-hex garbage input", async () => {
    const { verifyOwnerToken } = await import("@/lib/owner-auth")
    expect(verifyOwnerToken("user-42", "not-hex!!")).toBe(false)
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
/** UX-VSCODE-ONBOARD-01 — one-time code store + redirect_uri allowlist. */
import { describe, it, expect, beforeEach, vi } from "vitest"
import {
    putAuthCode,
    consumeAuthCode,
    isAllowedRedirectUri,
    _clearAuthCodes,
} from "@/lib/vscode-auth-codes"

describe("vscode auth-code store", () => {
    beforeEach(() => _clearAuthCodes())

    it("returns the tenant for a valid code", () => {
        putAuthCode("c1", "tenant-1")
        expect(consumeAuthCode("c1")).toBe("tenant-1")
    })

    it("is single-use — second consume returns null", () => {
        putAuthCode("c1", "tenant-1")
        consumeAuthCode("c1")
        expect(consumeAuthCode("c1")).toBeNull()
    })

    it("returns null for an unknown code", () => {
        expect(consumeAuthCode("nope")).toBeNull()
    })

    it("expires after the TTL", () => {
        vi.useFakeTimers()
        try {
            putAuthCode("c1", "tenant-1")
            vi.advanceTimersByTime(61_000)
            expect(consumeAuthCode("c1")).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })
})

describe("redirect_uri allowlist", () => {
    it("allows known editor callbacks", () => {
        for (const scheme of ["vscode", "vscode-insiders", "cursor", "vscodium"]) {
            expect(isAllowedRedirectUri(`${scheme}://docugardener.docugardener/auth-callback`)).toBe(true)
        }
    })

    it("rejects other schemes, hosts, paths, and empties", () => {
        expect(isAllowedRedirectUri("https://evil.example.com/auth-callback")).toBe(false)
        expect(isAllowedRedirectUri("vscode://attacker.ext/auth-callback")).toBe(false)
        expect(isAllowedRedirectUri("vscode://docugardener.docugardener/somewhere-else")).toBe(false)
        expect(isAllowedRedirectUri("")).toBe(false)
    })
})

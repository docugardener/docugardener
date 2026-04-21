/**
 * SEC-06: Encryption key startup guard — TypeScript (web/lib/encryption.ts).
 *
 * The guard runs inside getSecretKey(), which is called lazily on first
 * encrypt()/decrypt() call. Each test uses vi.resetModules() + dynamic
 * import to exercise a fresh module instance with the desired env config.
 *
 * Covers:
 *   1. no ENCRYPTION_KEY in any env → throws (no silent fallback)
 *   2. valid ENCRYPTION_KEY in any env → encrypt/decrypt round-trips
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const VALID_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"

const setNodeEnv = (value: string) =>
    vi.stubEnv("NODE_ENV", value)

describe("SEC-06 TypeScript encryption guard (web/lib/encryption.ts)", () => {
    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it("throws when ENCRYPTION_KEY is absent in production", async () => {
        setNodeEnv("production")
        vi.stubEnv("ENCRYPTION_KEY", "")

        const mod = await import("@/lib/encryption")
        expect(() => mod.encrypt("test")).toThrow(/ENCRYPTION_KEY is not set/)
    })

    it("throws when ENCRYPTION_KEY is absent in development", async () => {
        setNodeEnv("development")
        vi.stubEnv("ENCRYPTION_KEY", "")

        const mod = await import("@/lib/encryption")
        expect(() => mod.encrypt("test")).toThrow(/ENCRYPTION_KEY is not set/)
    })

    it("throws when ENCRYPTION_KEY is absent in test env", async () => {
        setNodeEnv("test")
        vi.stubEnv("ENCRYPTION_KEY", "")

        const mod = await import("@/lib/encryption")
        expect(() => mod.encrypt("test")).toThrow(/ENCRYPTION_KEY is not set/)
    })

    it("loads successfully in production with a valid ENCRYPTION_KEY", async () => {
        setNodeEnv("production")
        vi.stubEnv("ENCRYPTION_KEY", VALID_KEY)

        const mod = await import("@/lib/encryption")
        expect(mod.encrypt).toBeDefined()
        expect(mod.decrypt).toBeDefined()
    })

    it("encrypt/decrypt round-trip works with a supplied ENCRYPTION_KEY", async () => {
        setNodeEnv("test")
        vi.stubEnv("ENCRYPTION_KEY", VALID_KEY)

        const { encrypt, decrypt } = await import("@/lib/encryption")
        const plaintext = "super-secret-value"
        const ciphertext = encrypt(plaintext)
        expect(ciphertext).not.toEqual(plaintext)
        expect(decrypt(ciphertext)).toEqual(plaintext)
    })

    it("encrypt/decrypt round-trip works in development with a valid key", async () => {
        setNodeEnv("development")
        vi.stubEnv("ENCRYPTION_KEY", VALID_KEY)

        const { encrypt, decrypt } = await import("@/lib/encryption")
        const plaintext = "another-secret"
        expect(decrypt(encrypt(plaintext))).toEqual(plaintext)
    })
})

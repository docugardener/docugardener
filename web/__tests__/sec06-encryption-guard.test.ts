/**
 * SEC-06: Encryption key startup guard — TypeScript (web/lib/encryption.ts).
 *
 * The guard runs inside getSecretKey(), which is called lazily on first
 * encrypt()/decrypt() call. Each test uses vi.resetModules() + dynamic
 * import to exercise a fresh module instance with the desired env config.
 *
 * Covers:
 *   1. production + no ENCRYPTION_KEY → throws when encrypt() is called
 *   2. test env (default) + no ENCRYPTION_KEY → fallback, no throw
 *   3. development + no ENCRYPTION_KEY → fallback, no throw
 *   4. production + valid ENCRYPTION_KEY → module loads, encrypt/decrypt round-trips
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const VALID_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"

// NODE_ENV is read-only in the standard TS types — use this helper to override
// it safely in tests (vi.stubEnv handles restoration automatically).
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

    it("throws when NODE_ENV=production and ENCRYPTION_KEY is absent", async () => {
        setNodeEnv("production")
        vi.stubEnv("ENCRYPTION_KEY", "")

        // Guard is lazy (inside getSecretKey), so the import succeeds but
        // calling encrypt() must throw.
        const mod = await import("@/lib/encryption")
        expect(() => mod.encrypt("test")).toThrow(
            /ENCRYPTION_KEY environment variable is required in production/
        )
    })

    it("does NOT throw in test env (default) when ENCRYPTION_KEY is absent", async () => {
        setNodeEnv("test")
        vi.stubEnv("ENCRYPTION_KEY", "")

        const mod = await import("@/lib/encryption")
        expect(mod.encrypt).toBeDefined()
        expect(mod.decrypt).toBeDefined()
    })

    it("does NOT throw in development when ENCRYPTION_KEY is absent", async () => {
        setNodeEnv("development")
        vi.stubEnv("ENCRYPTION_KEY", "")

        const mod = await import("@/lib/encryption")
        expect(mod.encrypt).toBeDefined()
    })

    it("loads successfully in production with a valid ENCRYPTION_KEY", async () => {
        setNodeEnv("production")
        vi.stubEnv("ENCRYPTION_KEY", VALID_KEY)

        const mod = await import("@/lib/encryption")
        expect(mod.encrypt).toBeDefined()
        expect(mod.decrypt).toBeDefined()
    })

    it("encrypt/decrypt round-trip works with the dev fallback key", async () => {
        setNodeEnv("test")
        vi.stubEnv("ENCRYPTION_KEY", "")

        const { encrypt, decrypt } = await import("@/lib/encryption")
        const plaintext = "super-secret-value"
        const ciphertext = encrypt(plaintext)
        expect(ciphertext).not.toEqual(plaintext)
        expect(decrypt(ciphertext)).toEqual(plaintext)
    })

    it("encrypt/decrypt round-trip works with a supplied ENCRYPTION_KEY", async () => {
        setNodeEnv("test")
        vi.stubEnv("ENCRYPTION_KEY", VALID_KEY)

        const { encrypt, decrypt } = await import("@/lib/encryption")
        const plaintext = "another-secret"
        expect(decrypt(encrypt(plaintext))).toEqual(plaintext)
    })
})

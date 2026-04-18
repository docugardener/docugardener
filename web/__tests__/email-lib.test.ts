// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Unit tests for web/lib/email.ts
 *
 * Covers:
 *   A. Transport selection — SMTP wins over Resend; neither = no-op
 *   B. SMTP configuration — host, port, secure flag, auth
 *   C. Resend fallback
 *   D. No-op when unconfigured — warns, never throws
 *   E. sendMagicLink — subject, HTML content, correct recipient
 *   F. sendInviteEmail — subject, HTML content, with/without inviter
 *   G. FROM address — env override vs default
 *   H. Error propagation — transport error bubbles to caller
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── nodemailer mock ──────────────────────────────────────────────────────────

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "smtp-msg-id" })
const mockCreateTransport = vi.fn().mockReturnValue({ sendMail: mockSendMail })

vi.mock("nodemailer", () => ({
    default: { createTransport: (...args: any[]) => mockCreateTransport(...args) },
}))

// ── Resend mock ──────────────────────────────────────────────────────────────
// vi.hoisted ensures the fn is initialised before vi.mock factories run.

const mockResendSend = vi.hoisted(() =>
    vi.fn().mockResolvedValue({ data: { id: "resend-msg-id" }, error: null }),
)

vi.mock("resend", () => ({
    // Must use a regular function (not arrow) so `new Resend(...)` works —
    // arrow functions do not have [[Construct]] and cannot be called with new.
    Resend: vi.fn().mockImplementation(function (this: any) {
        this.emails = { send: (...args: any[]) => mockResendSend(...args) }
    }),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Stub only the env vars we need for a given test, restore all after. */
function withEnv(vars: Record<string, string>, fn: () => Promise<void>) {
    return async () => {
        Object.entries(vars).forEach(([k, v]) => vi.stubEnv(k, v))
        await fn()
    }
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
    mockSendMail.mockClear()
    mockCreateTransport.mockClear()
    mockResendSend.mockClear()
    // Clear all env stubs so each test starts clean
    vi.unstubAllEnvs()
    // Reset module cache so email.ts re-reads env vars each test
    vi.resetModules()
})

afterEach(() => {
    vi.unstubAllEnvs()
})

// ── A. Transport selection ────────────────────────────────────────────────────

describe("A. Transport selection", () => {
    it("uses SMTP when SMTP_HOST is set", async () => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_USER", "info@docugardener.dev")
        vi.stubEnv("SMTP_PASS", "secret")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("user@example.com", "https://example.com/magic")

        expect(mockCreateTransport).toHaveBeenCalledOnce()
        expect(mockSendMail).toHaveBeenCalledOnce()
        expect(mockResendSend).not.toHaveBeenCalled()
    })

    it("uses Resend when RESEND_API_KEY is set and SMTP_HOST is not", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_test_key")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("user@example.com", "https://example.com/magic")

        expect(mockResendSend).toHaveBeenCalledOnce()
        expect(mockCreateTransport).not.toHaveBeenCalled()
    })

    it("SMTP takes priority when both SMTP_HOST and RESEND_API_KEY are set", async () => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_USER", "info@docugardener.dev")
        vi.stubEnv("SMTP_PASS", "secret")
        vi.stubEnv("RESEND_API_KEY", "re_test_key")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("user@example.com", "https://example.com/magic")

        expect(mockCreateTransport).toHaveBeenCalledOnce()
        expect(mockResendSend).not.toHaveBeenCalled()
    })

    it("no-op (no throw) when neither SMTP_HOST nor RESEND_API_KEY is set", async () => {
        const { sendMagicLink } = await import("@/lib/email")
        await expect(sendMagicLink("user@example.com", "https://example.com/magic"))
            .resolves.toBeUndefined()

        expect(mockCreateTransport).not.toHaveBeenCalled()
        expect(mockResendSend).not.toHaveBeenCalled()
    })
})

// ── B. SMTP configuration ─────────────────────────────────────────────────────

describe("B. SMTP configuration", () => {
    it("passes host, port, user, pass to createTransport", async () => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_PORT", "587")
        vi.stubEnv("SMTP_USER", "info@docugardener.dev")
        vi.stubEnv("SMTP_PASS", "app-password")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("u@example.com", "https://url")

        const config = mockCreateTransport.mock.calls[0][0]
        expect(config.host).toBe("smtp.gmail.com")
        expect(config.port).toBe(587)
        expect(config.auth.user).toBe("info@docugardener.dev")
        expect(config.auth.pass).toBe("app-password")
    })

    it("secure: false for port 587 (STARTTLS)", async () => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_PORT", "587")
        vi.stubEnv("SMTP_USER", "u")
        vi.stubEnv("SMTP_PASS", "p")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("u@example.com", "https://url")

        expect(mockCreateTransport.mock.calls[0][0].secure).toBe(false)
    })

    it("secure: true for port 465 (implicit TLS)", async () => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_PORT", "465")
        vi.stubEnv("SMTP_USER", "u")
        vi.stubEnv("SMTP_PASS", "p")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("u@example.com", "https://url")

        expect(mockCreateTransport.mock.calls[0][0].secure).toBe(true)
    })

    it("secure: true when SMTP_SECURE=true regardless of port", async () => {
        vi.stubEnv("SMTP_HOST", "mail.custom.com")
        vi.stubEnv("SMTP_PORT", "587")
        vi.stubEnv("SMTP_SECURE", "true")
        vi.stubEnv("SMTP_USER", "u")
        vi.stubEnv("SMTP_PASS", "p")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("u@example.com", "https://url")

        expect(mockCreateTransport.mock.calls[0][0].secure).toBe(true)
    })

    it("defaults to port 587 when SMTP_PORT is not set", async () => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_USER", "u")
        vi.stubEnv("SMTP_PASS", "p")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("u@example.com", "https://url")

        expect(mockCreateTransport.mock.calls[0][0].port).toBe(587)
    })
})

// ── C. Resend fallback ────────────────────────────────────────────────────────

describe("C. Resend fallback", () => {
    it("passes correct fields to Resend emails.send()", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_test_key")
        vi.stubEnv("EMAIL_FROM", "DocuGardener <noreply@docugardener.dev>")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("user@example.com", "https://example.com/magic?token=abc")

        expect(mockResendSend).toHaveBeenCalledOnce()
        const args = mockResendSend.mock.calls[0][0]
        expect(args.to).toBe("user@example.com")
        expect(args.from).toBe("DocuGardener <noreply@docugardener.dev>")
        expect(args.html).toContain("https://example.com/magic?token=abc")
    })
})

// ── D. No-op when unconfigured ────────────────────────────────────────────────

describe("D. No-op when unconfigured", () => {
    it("sendMagicLink resolves without throwing", async () => {
        const { sendMagicLink } = await import("@/lib/email")
        await expect(sendMagicLink("u@example.com", "https://url")).resolves.toBeUndefined()
    })

    it("sendInviteEmail resolves without throwing", async () => {
        const { sendInviteEmail } = await import("@/lib/email")
        await expect(sendInviteEmail("u@example.com", "https://url")).resolves.toBeUndefined()
    })
})

// ── E. sendMagicLink ──────────────────────────────────────────────────────────

describe("E. sendMagicLink", () => {
    beforeEach(() => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_USER", "u")
        vi.stubEnv("SMTP_PASS", "p")
    })

    it("sends to the correct recipient", async () => {
        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("alice@example.com", "https://url")

        expect(mockSendMail.mock.calls[0][0].to).toBe("alice@example.com")
    })

    it("subject is 'Sign in to DocuGardener'", async () => {
        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("alice@example.com", "https://url")

        expect(mockSendMail.mock.calls[0][0].subject).toBe("Sign in to DocuGardener")
    })

    it("HTML body contains the magic link URL", async () => {
        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("alice@example.com", "https://magic.example.com/callback?token=xyz")

        const { html } = mockSendMail.mock.calls[0][0]
        expect(html).toContain("https://magic.example.com/callback?token=xyz")
    })

    it("plain-text body contains the magic link URL", async () => {
        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("alice@example.com", "https://magic.example.com/callback?token=xyz")

        const { text } = mockSendMail.mock.calls[0][0]
        expect(text).toContain("https://magic.example.com/callback?token=xyz")
    })

    it("HTML mentions 10-minute expiry", async () => {
        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("alice@example.com", "https://url")

        expect(mockSendMail.mock.calls[0][0].html).toContain("10 minutes")
    })
})

// ── F. sendInviteEmail ────────────────────────────────────────────────────────

describe("F. sendInviteEmail", () => {
    beforeEach(() => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_USER", "u")
        vi.stubEnv("SMTP_PASS", "p")
    })

    it("sends to the correct recipient", async () => {
        const { sendInviteEmail } = await import("@/lib/email")
        await sendInviteEmail("bob@example.com", "https://url", "admin@example.com")

        expect(mockSendMail.mock.calls[0][0].to).toBe("bob@example.com")
    })

    it("subject contains 'invited'", async () => {
        const { sendInviteEmail } = await import("@/lib/email")
        await sendInviteEmail("bob@example.com", "https://url", "admin@example.com")

        expect(mockSendMail.mock.calls[0][0].subject.toLowerCase()).toContain("invited")
    })

    it("HTML body contains the magic link URL", async () => {
        const { sendInviteEmail } = await import("@/lib/email")
        await sendInviteEmail("bob@example.com", "https://invite.example.com/callback", "admin@test.com")

        expect(mockSendMail.mock.calls[0][0].html).toContain("https://invite.example.com/callback")
    })

    it("HTML body contains inviter email when provided", async () => {
        const { sendInviteEmail } = await import("@/lib/email")
        await sendInviteEmail("bob@example.com", "https://url", "alice@mycompany.com")

        expect(mockSendMail.mock.calls[0][0].html).toContain("alice@mycompany.com")
    })

    it("works without inviterEmail (optional param)", async () => {
        const { sendInviteEmail } = await import("@/lib/email")
        await expect(sendInviteEmail("bob@example.com", "https://url")).resolves.toBeUndefined()

        expect(mockSendMail).toHaveBeenCalledOnce()
    })

    it("works with null inviterEmail", async () => {
        const { sendInviteEmail } = await import("@/lib/email")
        await expect(sendInviteEmail("bob@example.com", "https://url", null)).resolves.toBeUndefined()

        expect(mockSendMail).toHaveBeenCalledOnce()
    })
})

// ── G. FROM address ───────────────────────────────────────────────────────────

describe("G. FROM address", () => {
    beforeEach(() => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_USER", "u")
        vi.stubEnv("SMTP_PASS", "p")
    })

    it("uses EMAIL_FROM env var when set", async () => {
        vi.stubEnv("EMAIL_FROM", "MyApp <noreply@myapp.com>")

        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("u@example.com", "https://url")

        expect(mockSendMail.mock.calls[0][0].from).toBe("MyApp <noreply@myapp.com>")
    })

    it("falls back to noreply@docugardener.dev when EMAIL_FROM not set", async () => {
        const { sendMagicLink } = await import("@/lib/email")
        await sendMagicLink("u@example.com", "https://url")

        expect(mockSendMail.mock.calls[0][0].from).toContain("docugardener.dev")
    })
})

// ── H. Error propagation ──────────────────────────────────────────────────────

describe("H. Error propagation", () => {
    it("SMTP error from sendMagicLink bubbles to caller", async () => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_USER", "u")
        vi.stubEnv("SMTP_PASS", "p")
        mockSendMail.mockRejectedValueOnce(new Error("SMTP connection refused"))

        const { sendMagicLink } = await import("@/lib/email")
        await expect(sendMagicLink("u@example.com", "https://url"))
            .rejects.toThrow("SMTP connection refused")
    })

    it("SMTP error from sendInviteEmail bubbles to caller", async () => {
        vi.stubEnv("SMTP_HOST", "smtp.gmail.com")
        vi.stubEnv("SMTP_USER", "u")
        vi.stubEnv("SMTP_PASS", "p")
        mockSendMail.mockRejectedValueOnce(new Error("Auth failed"))

        const { sendInviteEmail } = await import("@/lib/email")
        await expect(sendInviteEmail("u@example.com", "https://url"))
            .rejects.toThrow("Auth failed")
    })

    it("Resend error bubbles to caller", async () => {
        vi.stubEnv("RESEND_API_KEY", "re_test_key")
        mockResendSend.mockRejectedValueOnce(new Error("Resend API error"))

        const { sendMagicLink } = await import("@/lib/email")
        await expect(sendMagicLink("u@example.com", "https://url"))
            .rejects.toThrow("Resend API error")
    })
})

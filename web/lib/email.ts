// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Email transport — nodemailer (SMTP) primary, Resend fallback.
 *
 * Transport priority:
 *   1. SMTP_HOST set   → nodemailer (Google Workspace in production)
 *   2. RESEND_API_KEY  → Resend     (local sandbox / legacy)
 *   3. Neither         → warn + no-op (never throws)
 *
 * Callers are responsible for catching errors when they want non-fatal
 * behaviour (e.g. invite email failing should not block user creation).
 */
import nodemailer from "nodemailer"
import { Resend } from "resend"

const FROM = process.env.EMAIL_FROM ?? "DocuGardener <noreply@docugardener.dev>"
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001"

// ── Transport layer ───────────────────────────────────────────────────────────

type Transport = "smtp" | "resend" | "none"

function detectTransport(): Transport {
    if (process.env.SMTP_HOST) return "smtp"
    if (process.env.RESEND_API_KEY) return "resend"
    return "none"
}

async function sendViaSMTP(
    to: string,
    subject: string,
    html: string,
    text: string,
): Promise<void> {
    const port = parseInt(process.env.SMTP_PORT ?? "587", 10)
    const secure =
        process.env.SMTP_SECURE === "true" || port === 465

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    })

    await transporter.sendMail({ from: FROM, to, subject, html, text })
}

async function sendViaResend(
    to: string,
    subject: string,
    html: string,
    text: string,
): Promise<void> {
    const resend = new Resend(process.env.RESEND_API_KEY!)
    await resend.emails.send({ from: FROM, to, subject, html, text })
}

async function sendEmail(
    to: string,
    subject: string,
    html: string,
    text: string,
): Promise<void> {
    const transport = detectTransport()

    if (transport === "smtp") {
        return sendViaSMTP(to, subject, html, text)
    }

    if (transport === "resend") {
        return sendViaResend(to, subject, html, text)
    }

    // Neither configured — log and no-op. Never throw so callers don't crash.
    console.warn("[email] No transport configured — set SMTP_HOST (prod) or RESEND_API_KEY (dev)")
    console.info("[email] Would have sent to:", to, "| subject:", subject)
}

// ── HTML templates ────────────────────────────────────────────────────────────

function magicLinkHtml(url: string): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#f9fafb;padding:40px 0;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:40px">
    <h1 style="font-size:22px;font-weight:900;color:#111;margin:0 0 8px">DocuGardener</h1>
    <p style="color:#6b7280;font-size:14px;margin:0 0 32px">Automated Documentation Drift Detection</p>
    <p style="color:#111;font-size:15px;margin:0 0 24px">Click the button below to sign in. This link expires in <strong>10 minutes</strong> and can only be used once.</p>
    <a href="${url}" style="display:inline-block;background:#111;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">Sign in to DocuGardener</a>
    <p style="color:#9ca3af;font-size:12px;margin:32px 0 0">If you did not request this email, you can safely ignore it.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#9ca3af;font-size:11px;margin:0">${APP_URL}</p>
  </div>
</body>
</html>`
}

function inviteHtml(url: string, inviterEmail: string | null | undefined): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#f9fafb;padding:40px 0;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:40px">
    <h1 style="font-size:22px;font-weight:900;color:#111;margin:0 0 8px">DocuGardener</h1>
    <p style="color:#6b7280;font-size:14px;margin:0 0 32px">Automated Documentation Drift Detection</p>
    <p style="color:#111;font-size:15px;margin:0 0 8px">You've been invited to join a DocuGardener workspace${inviterEmail ? ` by <strong>${inviterEmail}</strong>` : ""}.</p>
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px">Click the button below to accept and sign in. This link expires in <strong>10 minutes</strong>.</p>
    <a href="${url}" style="display:inline-block;background:#111;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">Accept Invitation</a>
    <p style="color:#9ca3af;font-size:12px;margin:32px 0 0">If you did not expect this invitation, you can safely ignore it.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#9ca3af;font-size:11px;margin:0">${APP_URL}</p>
  </div>
</body>
</html>`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a magic-link sign-in email (NextAuth EmailProvider hook).
 * url is the full NextAuth callback URL including the token.
 */
export async function sendMagicLink(to: string, url: string): Promise<void> {
    await sendEmail(
        to,
        "Sign in to DocuGardener",
        magicLinkHtml(url),
        `Sign in to DocuGardener:\n\n${url}\n\nThis link expires in 10 minutes.`,
    )
}

/**
 * Send a team invitation email that doubles as a magic link.
 * Called by POST /api/users after creating the user record.
 */
export async function sendInviteEmail(
    to: string,
    magicUrl: string,
    inviterEmail?: string | null,
): Promise<void> {
    await sendEmail(
        to,
        "You've been invited to DocuGardener",
        inviteHtml(magicUrl, inviterEmail),
        `You've been invited to DocuGardener${inviterEmail ? ` by ${inviterEmail}` : ""}.\n\nAccept invitation:\n\n${magicUrl}\n\nThis link expires in 10 minutes.`,
    )
}

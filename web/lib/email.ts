// SPDX-License-Identifier: AGPL-3.0-or-later
import { Resend } from "resend"

// Lazy — only instantiated when an API key is present, so dev environments
// without RESEND_API_KEY set don't crash at module load time.
function getResend(): Resend {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error("RESEND_API_KEY not set")
    return new Resend(key)
}

const FROM = process.env.EMAIL_FROM ?? "DocuGardener <noreply@docugardener.dev>"
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001"

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

/**
 * Send a standalone magic link (e.g. from the login page).
 * url is the full NextAuth magic link URL.
 */
export async function sendMagicLink(to: string, url: string): Promise<void> {
    if (!process.env.RESEND_API_KEY) {
        console.warn("[email] RESEND_API_KEY not set — skipping magic link email")
        console.info("[email] Magic link URL:", url)
        return
    }
    await getResend().emails.send({
        from: FROM,
        to,
        subject: "Sign in to DocuGardener",
        html: magicLinkHtml(url),
        text: `Sign in to DocuGardener:\n\n${url}\n\nThis link expires in 10 minutes.`,
    })
}

/**
 * Send an invitation email that doubles as a magic link.
 * Called by POST /api/users after creating the user record.
 */
export async function sendInviteEmail(
    to: string,
    magicUrl: string,
    inviterEmail?: string | null
): Promise<void> {
    if (!process.env.RESEND_API_KEY) {
        console.warn("[email] RESEND_API_KEY not set — skipping invite email")
        console.info("[email] Invite magic link URL:", magicUrl)
        return
    }
    await getResend().emails.send({
        from: FROM,
        to,
        subject: "You've been invited to DocuGardener",
        html: inviteHtml(magicUrl, inviterEmail),
        text: `You've been invited to DocuGardener${inviterEmail ? ` by ${inviterEmail}` : ""}.\n\nAccept invitation:\n\n${magicUrl}\n\nThis link expires in 10 minutes.`,
    })
}

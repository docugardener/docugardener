// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * UX-VSCODE-ONBOARD-01 — one-time authorization codes for the VS Code sign-in flow.
 *
 * The browser (signed-in) mints a single-use code via /api/vscode/grant; the
 * extension exchanges it once at /api/vscode/token for the tenant's plugin API key.
 *
 * Storage is an in-process Map: codes are single-use and live ~60s. Production runs
 * a single `next start` Node process, so module state is shared across requests and
 * this is sufficient. NOTE: if the web tier is ever scaled horizontally (multiple
 * instances) or needs to survive restarts, move this to Redis/DB — the failure mode
 * today is benign (a lost code just means the user clicks "Sign In" again).
 */

const TTL_MS = 60_000

interface CodeEntry {
    tenantId: string
    expiresAt: number
}

// Module-level store (persists across requests within the single Node process).
const _codes = new Map<string, CodeEntry>()

function _sweep(): void {
    const now = Date.now()
    for (const [code, entry] of _codes) {
        if (entry.expiresAt <= now) _codes.delete(code)
    }
}

/** Store a freshly-minted code for a tenant (single-use, ~60s TTL). */
export function putAuthCode(code: string, tenantId: string): void {
    _sweep()
    _codes.set(code, { tenantId, expiresAt: Date.now() + TTL_MS })
}

/**
 * Atomically consume a code: returns the tenantId and deletes it (single use),
 * or null if unknown/expired. Never returns the same code twice.
 */
export function consumeAuthCode(code: string): string | null {
    const entry = _codes.get(code)
    if (!entry) return null
    _codes.delete(code) // single-use: remove regardless of expiry outcome
    if (entry.expiresAt <= Date.now()) return null
    return entry.tenantId
}

/** Test-only: clear all codes. */
export function _clearAuthCodes(): void {
    _codes.clear()
}

/**
 * Allowlist of editor callback URIs the auth code may be redirected to. Exact-match
 * (custom schemes don't parse reliably via URL) — blocks redirecting a code to a
 * malicious target. The extension sends `${vscode.env.uriScheme}://...auth-callback`.
 */
const _ALLOWED_REDIRECT_URIS: ReadonlySet<string> = new Set([
    "vscode://docugardener.docugardener/auth-callback",
    "vscode-insiders://docugardener.docugardener/auth-callback",
    "cursor://docugardener.docugardener/auth-callback",
    "vscodium://docugardener.docugardener/auth-callback",
])

export function isAllowedRedirectUri(uri: string): boolean {
    return _ALLOWED_REDIRECT_URIS.has(uri)
}


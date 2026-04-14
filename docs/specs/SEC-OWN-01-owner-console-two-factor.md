# SEC-OWN-01 — Owner Console Two-Factor Protection

**Status:** todo → in-progress  
**Size:** S  
**Priority:** P0 (pre-publish security)  
**Wave:** 0 (Pre-commit Security)

---

## Problem

The owner console at `/admin/owner/*` is currently guarded only by an email match against `OWNER_EMAIL`. If the operator's email account is compromised (e.g., OAuth token stolen), an attacker gains full access to:

- Tenant feature overrides (can grant any feature to any tenant)
- Quota ceilings (can remove all limits)
- MRR/revenue metrics
- Live Stripe event feed

A second factor — possession of a shared secret — closes this gap without adding an MFA dependency.

---

## Mechanism

### Env Vars

| Var | Description | Example |
|-----|-------------|---------|
| `OWNER_ACCESS_TOKEN` | 32-byte hex secret known only to the operator | `openssl rand -hex 32` |

`OWNER_EMAIL` remains required (first factor). `OWNER_ACCESS_TOKEN` is the second factor.

### Cookie

Name: `dg_owner_access`  
Value: `HMAC-SHA256(userId + ':' + OWNER_ACCESS_TOKEN)` — hex-encoded  
Flags: `HttpOnly`, `SameSite=Strict`, `Path=/admin/owner`, `Max-Age=86400` (24h)  
The HMAC binds the cookie to the specific user — stolen cookies cannot be replayed by a different user.

### Gate Flow

```
Request → /admin/owner/*
  ↓
Layout server component
  1. OWNER_EMAIL set?          — no → notFound()
  2. OWNER_ACCESS_TOKEN set?   — no → notFound() (misconfigured)
  3. Session email === OWNER_EMAIL? — no → notFound()
  4. dg_owner_access cookie present & HMAC valid?
       yes → render owner console
       no  → render token challenge page (inline form, no separate route)
  ↓
Challenge form POSTs to /api/admin/owner/auth
  1. Parse body.token
  2. timingSafeEqual(token, OWNER_ACCESS_TOKEN) — no → 401 JSON
  3. Set dg_owner_access cookie (HMAC-SHA256(userId:OWNER_ACCESS_TOKEN))
  4. Return 200 JSON {ok: true}
  ↓
Client redirects to /admin/owner (layout re-verifies, passes)
```

### Why not a redirect?

Server components cannot set cookies or issue redirects that also set cookies. Instead:
- The layout renders an inline challenge page (not a redirect) when the cookie is missing/invalid.
- The challenge form uses a client component that POSTs to the API route, then calls `router.refresh()`.

---

## Files

| File | Action |
|------|--------|
| `web/lib/owner-auth.ts` | NEW — `signOwnerToken(userId)`, `verifyOwnerToken(userId, cookie)` |
| `web/app/api/admin/owner/auth/route.ts` | NEW — POST endpoint |
| `web/app/admin/owner/layout.tsx` | MODIFY — add cookie check, render challenge on failure |
| `web/components/admin/OwnerChallenge.tsx` | NEW — client component with token form |

---

## Acceptance Criteria

- [ ] `OWNER_ACCESS_TOKEN` missing → notFound() (same as no `OWNER_EMAIL`)
- [ ] Valid email + valid cookie → owner console renders
- [ ] Valid email + invalid cookie → challenge page renders (not 404, not 401)
- [ ] Valid email + no cookie → challenge page renders
- [ ] Wrong email → notFound() (unchanged behaviour)
- [ ] POST /api/admin/owner/auth with correct token → sets cookie, returns `{ok:true}`
- [ ] POST /api/admin/owner/auth with wrong token → 401 `{ok:false}` (uses timingSafeEqual)
- [ ] Cookie is HttpOnly, SameSite=Strict, 24h TTL
- [ ] Stolen cookie from user A cannot be used by user B (HMAC includes userId)
- [ ] Vitest unit tests for `signOwnerToken` + `verifyOwnerToken`
- [ ] Vitest integration test for /api/admin/owner/auth route

---

## Security Notes

- `timingSafeEqual` prevents timing oracle on token comparison
- 404 response for missing/invalid `OWNER_EMAIL` prevents leaking console existence to non-owners
- Challenge page (not 404) for missing cookie avoids confusing legitimate owners during 24h expiry
- `SameSite=Strict` blocks CSRF against the auth endpoint
- Cookie bound to `userId` prevents cookie theft across accounts on shared machines

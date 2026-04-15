export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import NextAuth, { AuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"
import CredentialsProvider from "next-auth/providers/credentials"
import EmailProvider from "next-auth/providers/email"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { writeAuditLog, AuditEvent } from "@/lib/audit"
import { sendMagicLink } from "@/lib/email"

// E2E_DEV_CREDENTIALS=1 enables the dev login provider in CI without
// requiring NODE_ENV=development (which breaks Turbopack static builds).
const isDev = process.env.NODE_ENV !== "production" || process.env.E2E_DEV_CREDENTIALS === "1"
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000"

/**
 * ENT-12: SAML SSO provider.
 * After FastAPI validates the SAML assertion it creates a short-lived
 * exchange token and redirects to /api/auth/callback/saml-sso?token=...
 * This provider consumes the token by calling FastAPI and returns the user.
 */
const samlSsoProvider = CredentialsProvider({
    id: "saml-sso",
    name: "SSO",
    credentials: {
        token: { label: "Exchange Token", type: "text" },
    },
    // @ts-expect-error — NextAuth User type doesn't include role/tenantId; extended via next-auth.d.ts
    async authorize(credentials, _req) {
        if (!credentials?.token) return null
        try {
            const res = await fetch(
                `${BACKEND_URL}/auth/saml/exchange?token=${encodeURIComponent(credentials.token)}`
            )
            if (!res.ok) return null
            const data: any = await res.json()
            // Ensure the user exists in the web DB (JIT provisioning was done in FastAPI)
            const dbUser = await prisma.user.findUnique({
                where: { email: data.email },
                select: { id: true, email: true, name: true, image: true, role: true, tenantId: true },
            })
            if (!dbUser) return null
            return {
                id: dbUser.id,
                email: dbUser.email,
                name: dbUser.name,
                image: dbUser.image,
                // @ts-ignore
                role: dbUser.role,
                // @ts-ignore
                tenantId: dbUser.tenantId,
            }
        } catch {
            return null
        }
    },
})

/**
 * Dev-only credentials provider — lets you sign in as any existing DB user
 * by picking their email. No password. Never active in production.
 */
const devCredentialsProvider = CredentialsProvider({
    id: "dev-login",
    name: "Dev Login (local only)",
    credentials: {
        email: { label: "Email", type: "text", placeholder: "user@example.com" },
    },
    // @ts-expect-error — NextAuth User type doesn't include role/tenantId; extended via next-auth.d.ts
    async authorize(credentials, _req) {
        if (!isDev) return null
        if (!credentials?.email) return null

        const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            select: { id: true, email: true, name: true, image: true, role: true, tenantId: true },
        })

        if (!user) return null

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            // @ts-ignore
            role: user.role,
            // @ts-ignore
            tenantId: user.tenantId,
        }
    },
})

const emailProvider = EmailProvider({
    // No EMAIL_SERVER needed — we override sendVerificationRequest to use Resend
    server: "smtp://localhost",   // dummy, never called
    from: process.env.EMAIL_FROM ?? "noreply@docugardener.dev",
    maxAge: 10 * 60,              // magic link valid for 10 minutes
    async sendVerificationRequest({ identifier: email, url }) {
        await sendMagicLink(email, url)
    },
})

export const authOptions: AuthOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_ID as string,
            clientSecret: process.env.GITHUB_SECRET as string,
            allowDangerousEmailAccountLinking: true,
        }),
        emailProvider,
        samlSsoProvider,
        ...(isDev ? [devCredentialsProvider] : []),
    ],
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/auth/signin",
    },
    debug: isDev,
    events: {
        async signIn({ user }) {
            if (user?.id) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: user.id },
                    select: { tenantId: true, email: true },
                })
                if (dbUser?.tenantId) {
                    await writeAuditLog({
                        tenantId: dbUser.tenantId,
                        actorId: user.id,
                        actorEmail: dbUser.email,
                        event: AuditEvent.USER_LOGIN,
                        resourceType: "user",
                        resourceId: user.id,
                    })
                }
            }
        },
        /**
         * SEC-09: Log every cross-provider account link so admins can audit
         * whether allowDangerousEmailAccountLinking joined unexpected identities.
         * writeAuditLog() swallows errors — this never breaks the sign-in flow.
         */
        async linkAccount({ user, account }) {
            if (user?.id) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: user.id },
                    select: { tenantId: true, email: true },
                })
                if (dbUser?.tenantId) {
                    await writeAuditLog({
                        tenantId: dbUser.tenantId,
                        actorId: user.id,
                        actorEmail: dbUser.email,
                        event: AuditEvent.ACCOUNT_LINKED,
                        resourceType: "account",
                        resourceId: account.providerAccountId,
                        metadata: {
                            provider: account.provider,
                            providerAccountId: account.providerAccountId,
                        },
                    })
                }
            }
        },
    },
    callbacks: {
        async jwt({ token, user }) {
            // Initial sign in — explicitly stamp all identity fields so they
            // are always present in the JWT regardless of provider or email
            // visibility settings.
            if (user) {
                token.id = user.id
                if (user.email) token.email = user.email
                // @ts-ignore
                token.role = user.role
                // @ts-ignore
                token.tenantId = user.tenantId
            }

            // Always sync role and tenantId from DB to pick up changes
            if (token.id) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: token.id as string },
                    select: {
                        tenantId: true,
                        role: true,
                        scimActive: true,
                        tenant: {
                            select: {
                                plan: true,
                                sessionsRevokedAt: true,
                                sessionIdleTimeoutMinutes: true,
                            },
                        },
                    },
                })
                if (dbUser) {
                    // SCIM deprovisioning: block sign-in for deactivated users
                    if (dbUser.scimActive === false) {
                        return { ...token, revoked: true }
                    }
                    // Session revocation: if the JWT was issued before sessionsRevokedAt, invalidate it
                    if (dbUser.tenant?.sessionsRevokedAt && token.iat) {
                        const revokedAtSec = dbUser.tenant.sessionsRevokedAt.getTime() / 1000
                        if ((token.iat as number) < revokedAtSec) {
                            return { ...token, revoked: true }
                        }
                    }
                    // Configurable idle timeout: expire session if inactive too long (rolling window)
                    const idleTimeoutSec =
                        (dbUser.tenant?.sessionIdleTimeoutMinutes ?? 480) * 60 // default 8 h
                    const nowSec = Math.floor(Date.now() / 1000)
                    const lastRefreshed = (token.lastRefreshedAt as number | undefined) ?? nowSec
                    if (nowSec - lastRefreshed > idleTimeoutSec) {
                        return { ...token, revoked: true }
                    }
                    token.lastRefreshedAt = nowSec
                    token.tenantId = (dbUser.tenantId ?? undefined) as string
                    token.role = dbUser.role
                    // @ts-ignore
                    token.plan = dbUser.tenant?.plan ?? "FREE"
                }
            }

            return token
        },
        async session({ session, token }) {
            // Revoked/expired sessions — strip user so middleware redirects to sign-in
            if ((token as any).revoked) {
                return { ...session, user: undefined as any }
            }
            if (session.user) {
                // @ts-ignore
                session.user.id = token.id as string
                // Ensure email is always present — token.email is set explicitly
                // in the jwt callback so it survives providers with private email.
                if (token.email) session.user.email = token.email as string
                // @ts-ignore
                session.user.role = token.role as string
                // @ts-ignore
                session.user.tenantId = token.tenantId as string
                // @ts-ignore
                session.user.plan = (token.plan as string) ?? "FREE"
            }
            return session
        },
    },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }

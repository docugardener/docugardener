/**
 * Direct DB helpers for E2E fixture management.
 *
 * Uses the `pg` package (already a dependency via Prisma).
 * All helpers are idempotent and follow try/finally cleanup rules.
 */
import { Client } from "pg"

const DB_URL =
    process.env.DATABASE_URL ||
    "postgresql://postgres:password@localhost:5433/docugardener-web"

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: DB_URL })
    await client.connect()
    try {
        return await fn(client)
    } finally {
        await client.end()
    }
}

/** Apply seed.sql to the DB (idempotent). Call once in global setup. */
export async function applySeed(sql: string): Promise<void> {
    await withClient(async (c) => {
        await c.query(sql)
    })
}

// ── Job fixtures ───────────────────────────────────────────────────────────────

export interface FixtureJobOptions {
    tenantId: string
    repoName?: string
    prNumber?: number
    triageStatus?: "PENDING" | "ACCEPTED" | "IGNORED"
    driftScore?: number
    severity?: string
}

export interface FixtureJob {
    id: string
    repositoryId: string
}

/**
 * Creates a Repository + Job pair for testing.
 * Both use a generated unique ID so parallel tests don't collide.
 * Call deleteJob() in afterEach (it cascades to the repo too).
 */
export async function createFixtureJob(opts: FixtureJobOptions): Promise<FixtureJob> {
    const {
        tenantId,
        repoName = "e2e-test-repo",
        prNumber = 1,
        triageStatus = "PENDING",
        driftScore = 55,
        severity = "moderate",
    } = opts

    return withClient(async (c) => {
        // Upsert a fixture repository (unique per repoName so tests don't share)
        const repoResult = await c.query(
            `INSERT INTO "Repository" (id, "tenantId", "githubRepoId", name, enabled, "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, true, NOW(), NOW())
             RETURNING id`,
            [tenantId, `e2e-repo-${repoName}-${Date.now()}`, repoName]
        )
        const repositoryId: string = repoResult.rows[0].id

        const jobResult = await c.query(
            `INSERT INTO "Job" (
                id, "tenantId", "repositoryId", "prNumber",
                "triageStatus", status, result, "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid(), $1, $2, $3,
                $4::\"TriageStatus\", 'COMPLETED',
                jsonb_build_object(
                    'drift_score', $5::numeric,
                    'drift_analysis', jsonb_build_object(
                        'severity', $6::text,
                        'items', '[]'::jsonb
                    )
                ),
                NOW(), NOW()
            ) RETURNING id`,
            [tenantId, repositoryId, prNumber, triageStatus, driftScore, severity]
        )
        return { id: jobResult.rows[0].id, repositoryId }
    })
}

/**
 * DOCPOL-01: Creates a fixture job that includes policy_violations in result.
 */
export interface FixtureJobWithPolicyOptions extends FixtureJobOptions {
    policyEnforcement?: "advisory" | "blocking" | "blocking-with-reason"
    policyRuleName?: string
}

export async function createFixtureJobWithPolicy(
    opts: FixtureJobWithPolicyOptions
): Promise<FixtureJob> {
    const {
        tenantId,
        repoName = "e2e-policy-repo",
        prNumber = 1,
        triageStatus = "PENDING",
        driftScore = 55,
        severity = "moderate",
        policyEnforcement = "blocking-with-reason",
        policyRuleName = "api-docs-required",
    } = opts

    return withClient(async (c) => {
        const repoResult = await c.query(
            `INSERT INTO "Repository" (id, "tenantId", "githubRepoId", name, enabled, "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, true, NOW(), NOW())
             RETURNING id`,
            [tenantId, `e2e-policy-repo-${repoName}-${Date.now()}`, repoName]
        )
        const repositoryId: string = repoResult.rows[0].id

        const violation = {
            rule_name: policyRuleName,
            enforcement: policyEnforcement,
            paths_matched: ["src/api/routes.py"],
            require_docs: ["docs/api/**"],
            docs_present: [],
            docs_missing: ["docs/api/**"],
        }

        const jobResult = await c.query(
            `INSERT INTO "Job" (
                id, "tenantId", "repositoryId", "prNumber",
                "triageStatus", status, result, "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid(), $1, $2, $3,
                $4::\"TriageStatus\", 'COMPLETED',
                jsonb_build_object(
                    'drift_score', $5::numeric,
                    'drift_analysis', jsonb_build_object(
                        'severity', $6::text,
                        'items', '[]'::jsonb
                    ),
                    'policy_violations', $7::jsonb,
                    'policy_blocks_merge', true
                ),
                NOW(), NOW()
            ) RETURNING id`,
            [tenantId, repositoryId, prNumber, triageStatus, driftScore, severity, JSON.stringify([violation])]
        )
        return { id: jobResult.rows[0].id, repositoryId }
    })
}

/** Deletes a fixture job and its repository. */
export async function deleteJob(jobId: string, repositoryId?: string): Promise<void> {
    await withClient(async (c) => {
        await c.query(`DELETE FROM "Job" WHERE id = $1`, [jobId])
        if (repositoryId) {
            await c.query(`DELETE FROM "Repository" WHERE id = $1`, [repositoryId])
        }
    })
}

// ── AuditLog fixtures ──────────────────────────────────────────────────────────

export interface FixtureAuditLog {
    id: string
}

export async function insertAuditLog(
    tenantId: string,
    event: string = "USER_LOGIN",
    actorEmail: string = "e2e-admin@test.local"
): Promise<FixtureAuditLog> {
    return withClient(async (c) => {
        const result = await c.query(
            `INSERT INTO "AuditLog" (
                id, "tenantId", "actorEmail", event, hash, "createdAt"
            ) VALUES (
                gen_random_uuid(), $1, $2, $3::\"AuditEvent\",
                md5(random()::text),
                NOW()
            ) RETURNING id`,
            [tenantId, actorEmail, event]
        )
        return { id: result.rows[0].id }
    })
}

export async function deleteAuditLog(auditLogId: string): Promise<void> {
    await withClient(async (c) => {
        await c.query(`DELETE FROM "AuditLog" WHERE id = $1`, [auditLogId])
    })
}

// ── SSO snapshot / restore ─────────────────────────────────────────────────────

export interface TenantSsoSnapshot {
    plan: string
    ssoEnabled: boolean
    ssoProvider: string | null
    samlIdpEntityId: string | null
    samlIdpSsoUrl: string | null
    samlIdpCertificate: string | null
    sessionsRevokedAt: Date | null
    sessionIdleTimeoutMinutes: number | null
}

export async function getTenantSsoSnapshot(tenantId: string): Promise<TenantSsoSnapshot> {
    return withClient(async (c) => {
        const result = await c.query(
            `SELECT plan, "ssoEnabled", "ssoProvider", "samlIdpEntityId", "samlIdpSsoUrl",
                    "samlIdpCertificate", "sessionsRevokedAt", "sessionIdleTimeoutMinutes"
             FROM "Tenant" WHERE id = $1`,
            [tenantId]
        )
        return result.rows[0] ?? {}
    })
}

export async function restoreTenantSsoSnapshot(
    tenantId: string,
    snapshot: TenantSsoSnapshot
): Promise<void> {
    await withClient(async (c) => {
        await c.query(
            `UPDATE "Tenant"
             SET plan = $2,
                 "ssoEnabled" = $3,
                 "ssoProvider" = $4,
                 "samlIdpEntityId" = $5,
                 "samlIdpSsoUrl" = $6,
                 "samlIdpCertificate" = $7,
                 "sessionsRevokedAt" = $8,
                 "sessionIdleTimeoutMinutes" = $9
             WHERE id = $1`,
            [
                tenantId,
                snapshot.plan,
                snapshot.ssoEnabled,
                snapshot.ssoProvider,
                snapshot.samlIdpEntityId,
                snapshot.samlIdpSsoUrl,
                snapshot.samlIdpCertificate,
                snapshot.sessionsRevokedAt,
                snapshot.sessionIdleTimeoutMinutes,
            ]
        )
    })
}

/** Upgrades a tenant to TEAM plan so SSO settings card is visible. */
export async function setTenantPlan(tenantId: string, plan: "FREE" | "PRO" | "TEAM"): Promise<void> {
    await withClient(async (c) => {
        await c.query(`UPDATE "Tenant" SET plan = $2 WHERE id = $1`, [tenantId, plan])
    })
}

/** Returns the current plan of a tenant. */
export async function getTenantPlan(tenantId: string): Promise<"FREE" | "PRO" | "TEAM"> {
    return withClient(async (c) => {
        const result = await c.query(`SELECT plan FROM "Tenant" WHERE id = $1`, [tenantId])
        return result.rows[0]?.plan ?? "FREE"
    })
}

// ── Settings snapshot / restore ────────────────────────────────────────────────

export async function getTenantSettings(tenantId: string): Promise<any> {
    return withClient(async (c) => {
        const result = await c.query(
            `SELECT "billingConfig", "llmConfig", "workflowConfig" FROM "Tenant" WHERE id = $1`,
            [tenantId]
        )
        return result.rows[0] ?? {}
    })
}

export async function restoreTenantSettings(
    tenantId: string,
    snapshot: { billingConfig?: any; llmConfig?: any; workflowConfig?: any }
): Promise<void> {
    await withClient(async (c) => {
        await c.query(
            `UPDATE "Tenant"
             SET "billingConfig" = $2,
                 "llmConfig"     = $3,
                 "workflowConfig" = $4
             WHERE id = $1`,
            [
                tenantId,
                snapshot.billingConfig ?? null,
                snapshot.llmConfig ?? null,
                snapshot.workflowConfig ?? null,
            ]
        )
    })
}

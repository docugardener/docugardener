/**
 * DOCPOL-01: Policy-as-Code — inbox API layer tests.
 *
 *   AC-DOCPOL01-1  PATCH IGNORED with blocking-with-reason violation → emits POLICY_VIOLATION_DISMISSED
 *   AC-DOCPOL01-2  PATCH IGNORED with no blocking-with-reason violation → no POLICY_VIOLATION_DISMISSED
 *   AC-DOCPOL01-3  PATCH ACCEPTED → no POLICY_VIOLATION_DISMISSED even if violation exists
 *   AC-DOCPOL01-4  writeAuditLog called with correct policy_rules metadata
 *   AC-DOCPOL01-5  writeAuditLog called with correct dismiss_reason metadata
 *   AC-DOCPOL01-6  TRIAGE_DECISION audit event still fires on every PATCH
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/audit", () => ({
    writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
    AuditEvent: {
        TRIAGE_DECISION: "TRIAGE_DECISION",
        POLICY_VIOLATION_DISMISSED: "POLICY_VIOLATION_DISMISSED",
    },
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// ── Helpers ──────────────────────────────────────────────────────────────────

function adminSession() {
    return { user: { id: "u-admin", email: "admin@test.com", role: "ADMIN", tenantId: "t-1" } }
}

function jobWithViolation(enforcement: string) {
    return {
        ok: true,
        status: 200,
        json: () =>
            Promise.resolve({
                id: "job-1",
                result: {
                    policy_violations: [
                        {
                            rule_name: "api-docs-required",
                            enforcement,
                            paths_matched: ["src/api/routes.py"],
                            require_docs: ["docs/api/**"],
                            docs_present: [],
                            docs_missing: ["docs/api/**"],
                        },
                    ],
                },
            }),
    }
}

function jobWithoutViolation() {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: "job-1", result: { policy_violations: [] } }),
    }
}

function backendPatchOk() {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: "IGNORED" }),
    })
}

function buildPatchRequest(jobId: string, status: string, reason?: string) {
    const url = `http://localhost/api/inbox/${jobId}?status=${status}`
    return new Request(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: reason ? JSON.stringify({ reason }) : undefined,
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DOCPOL-01: /api/inbox/[id] PATCH — policy audit events", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
    })

    it("AC-DOCPOL01-1: IGNORED + blocking-with-reason violation → POLICY_VIOLATION_DISMISSED emitted", async () => {
        mockFetch
            .mockResolvedValueOnce(jobWithViolation("blocking-with-reason"))
            .mockResolvedValueOnce(backendPatchOk())

        const { PATCH } = await import("@/app/api/inbox/[id]/route")
        const req = buildPatchRequest("job-1", "IGNORED", "Covered by inline comments")
        await PATCH(req, { params: Promise.resolve({ id: "job-1" }) })

        const events = mockWriteAuditLog.mock.calls.map((c: any[]) => c[0].event)
        expect(events).toContain("POLICY_VIOLATION_DISMISSED")
    })

    it("AC-DOCPOL01-2: IGNORED + blocking violation (not blocking-with-reason) → no POLICY_VIOLATION_DISMISSED", async () => {
        mockFetch
            .mockResolvedValueOnce(jobWithViolation("blocking"))
            .mockResolvedValueOnce(backendPatchOk())

        const { PATCH } = await import("@/app/api/inbox/[id]/route")
        const req = buildPatchRequest("job-1", "IGNORED")
        await PATCH(req, { params: Promise.resolve({ id: "job-1" }) })

        const events = mockWriteAuditLog.mock.calls.map((c: any[]) => c[0].event)
        expect(events).not.toContain("POLICY_VIOLATION_DISMISSED")
    })

    it("AC-DOCPOL01-3: ACCEPTED + blocking-with-reason violation → no POLICY_VIOLATION_DISMISSED", async () => {
        mockFetch
            .mockResolvedValueOnce(jobWithViolation("blocking-with-reason"))
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ status: "ACCEPTED" }),
            })

        const { PATCH } = await import("@/app/api/inbox/[id]/route")
        const req = buildPatchRequest("job-1", "ACCEPTED")
        await PATCH(req, { params: Promise.resolve({ id: "job-1" }) })

        const events = mockWriteAuditLog.mock.calls.map((c: any[]) => c[0].event)
        expect(events).not.toContain("POLICY_VIOLATION_DISMISSED")
    })

    it("AC-DOCPOL01-4: POLICY_VIOLATION_DISMISSED metadata contains correct policy_rules", async () => {
        mockFetch
            .mockResolvedValueOnce(jobWithViolation("blocking-with-reason"))
            .mockResolvedValueOnce(backendPatchOk())

        const { PATCH } = await import("@/app/api/inbox/[id]/route")
        const req = buildPatchRequest("job-1", "IGNORED", "documented separately")
        await PATCH(req, { params: Promise.resolve({ id: "job-1" }) })

        const policyCall = mockWriteAuditLog.mock.calls.find(
            (c: any[]) => c[0].event === "POLICY_VIOLATION_DISMISSED"
        )
        expect(policyCall).toBeDefined()
        expect(policyCall![0].metadata.policy_rules).toEqual(["api-docs-required"])
    })

    it("AC-DOCPOL01-5: POLICY_VIOLATION_DISMISSED metadata contains dismiss_reason", async () => {
        mockFetch
            .mockResolvedValueOnce(jobWithViolation("blocking-with-reason"))
            .mockResolvedValueOnce(backendPatchOk())

        const { PATCH } = await import("@/app/api/inbox/[id]/route")
        const req = buildPatchRequest("job-1", "IGNORED", "Covered by ADR-42")
        await PATCH(req, { params: Promise.resolve({ id: "job-1" }) })

        const policyCall = mockWriteAuditLog.mock.calls.find(
            (c: any[]) => c[0].event === "POLICY_VIOLATION_DISMISSED"
        )
        expect(policyCall![0].metadata.dismiss_reason).toBe("Covered by ADR-42")
    })

    it("AC-DOCPOL01-6: TRIAGE_DECISION audit event always fires on successful PATCH", async () => {
        mockFetch
            .mockResolvedValueOnce(jobWithoutViolation())
            .mockResolvedValueOnce(backendPatchOk())

        const { PATCH } = await import("@/app/api/inbox/[id]/route")
        const req = buildPatchRequest("job-1", "IGNORED")
        await PATCH(req, { params: Promise.resolve({ id: "job-1" }) })

        const events = mockWriteAuditLog.mock.calls.map((c: any[]) => c[0].event)
        expect(events).toContain("TRIAGE_DECISION")
    })
})

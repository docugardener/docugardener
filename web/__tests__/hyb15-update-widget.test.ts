/**
 * HYB-15: Update notification widget tests.
 *
 * AC-HYB15-01  GET /api/updates returns null in SaaS mode
 * AC-HYB15-02  GET /api/updates returns 401 when not authenticated
 * AC-HYB15-03  GET /api/updates returns available=false when backend 404
 * AC-HYB15-04  GET /api/updates returns available=false when backend throws
 * AC-HYB15-05  GET /api/updates returns available=true with manifest data
 * AC-HYB15-06  UpdateCard renders "up to date" when available=false
 * AC-HYB15-07  UpdateCard renders critical severity badge
 * AC-HYB15-08  UpdateCard renders recommended severity badge
 * AC-HYB15-09  UpdateCard shows Helm upgrade command
 * AC-HYB15-10  UpdateCard shows release notes link when provided
 * AC-HYB15-11  UpdateCard shows changelog summary when provided
 * AC-HYB15-12  UpdateCard renders null gracefully (no crash)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))
vi.mock("next/server", () => ({
    NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
            _body: body,
            status: init?.status ?? 200,
            json: async () => body,
        }),
    },
}))

vi.mock("lucide-react", () => ({
    CheckCircle: () => React.createElement("span", { "data-testid": "icon-check" }),
    AlertTriangle: () => React.createElement("span", { "data-testid": "icon-warning" }),
    AlertOctagon: () => React.createElement("span", { "data-testid": "icon-critical" }),
    Copy: () => React.createElement("span", { "data-testid": "icon-copy" }),
    Check: () => React.createElement("span", { "data-testid": "icon-checked" }),
    ExternalLink: () => React.createElement("span", { "data-testid": "icon-external" }),
}))

import { getServerSession } from "next-auth"
const mockGetServerSession = vi.mocked(getServerSession)

// ── Route tests ───────────────────────────────────────────────────────────────

describe("GET /api/updates", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
    })

    it("AC-HYB15-01: returns null in SaaS mode", async () => {
        vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_MODE", "saas")
        const { GET } = await import("@/app/api/updates/route")
        const res = await GET()
        expect(await res.json()).toBeNull()
    })

    it("AC-HYB15-02: returns 401 when not authenticated", async () => {
        vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_MODE", "client-installed")
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/updates/route")
        const res = await GET()
        expect(res.status).toBe(401)
    })

    it("AC-HYB15-03: returns available=false when backend 404", async () => {
        vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_MODE", "client-installed")
        mockGetServerSession.mockResolvedValue({
            user: { id: "u1", tenantId: "t1", role: "ADMIN", plan: "PRO" },
        } as any)
        global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => null })

        const { GET } = await import("@/app/api/updates/route")
        const res = await GET()
        expect((await res.json()).available).toBe(false)
    })

    it("AC-HYB15-04: returns available=false when backend throws", async () => {
        vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_MODE", "client-installed")
        mockGetServerSession.mockResolvedValue({
            user: { id: "u1", tenantId: "t1", role: "ADMIN", plan: "PRO" },
        } as any)
        global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"))

        const { GET } = await import("@/app/api/updates/route")
        const res = await GET()
        expect((await res.json()).available).toBe(false)
    })

    it("AC-HYB15-05: returns available=true with manifest data", async () => {
        vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_MODE", "client-installed")
        mockGetServerSession.mockResolvedValue({
            user: { id: "u1", tenantId: "t1", role: "ADMIN", plan: "PRO" },
        } as any)
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                latest_version: "1.2.0",
                severity: "recommended",
                helm_chart_url: "oci://registry.example.com/helm/docugardener:1.2.0",
                release_notes_url: "https://docs.example.com/releases/1.2.0",
                changelog_summary: "Performance improvements",
            }),
        })

        const { GET } = await import("@/app/api/updates/route")
        const res = await GET()
        const data = await res.json()
        expect(data.available).toBe(true)
        expect(data.latestVersion).toBe("1.2.0")
        expect(data.severity).toBe("recommended")
        expect(data.helmChartUrl).toContain("1.2.0")
    })
})

// ── UpdateCard component tests ────────────────────────────────────────────────

describe("UpdateCard", () => {
    it("AC-HYB15-06: renders up-to-date message when available=false", async () => {
        const { UpdateCard } = await import("@/components/settings/UpdateCard")
        render(React.createElement(UpdateCard, { update: { available: false } }))
        expect(screen.getByText(/up to date/i)).toBeTruthy()
    })

    it("AC-HYB15-07: renders critical severity badge", async () => {
        const { UpdateCard } = await import("@/components/settings/UpdateCard")
        render(React.createElement(UpdateCard, {
            update: { available: true, latestVersion: "1.2.0", severity: "critical" }
        }))
        expect(screen.getByText(/critical update/i)).toBeTruthy()
        expect(screen.getByTestId("icon-critical")).toBeTruthy()
    })

    it("AC-HYB15-08: renders recommended severity badge", async () => {
        const { UpdateCard } = await import("@/components/settings/UpdateCard")
        render(React.createElement(UpdateCard, {
            update: { available: true, latestVersion: "1.2.0", severity: "recommended" }
        }))
        expect(screen.getByText(/recommended update/i)).toBeTruthy()
    })

    it("AC-HYB15-09: shows Helm upgrade command", async () => {
        const { UpdateCard } = await import("@/components/settings/UpdateCard")
        render(React.createElement(UpdateCard, {
            update: {
                available: true,
                latestVersion: "1.2.0",
                severity: "optional",
                helmChartUrl: "oci://registry.example.com/helm/docugardener:1.2.0",
            }
        }))
        expect(screen.getAllByText(/helm upgrade/i).length).toBeGreaterThan(0)
    })

    it("AC-HYB15-10: shows release notes link when provided", async () => {
        const { UpdateCard } = await import("@/components/settings/UpdateCard")
        render(React.createElement(UpdateCard, {
            update: {
                available: true,
                latestVersion: "1.2.0",
                severity: "recommended",
                releaseNotesUrl: "https://docs.example.com/releases/1.2.0",
            }
        }))
        const link = screen.getByText(/release notes/i)
        expect(link).toBeTruthy()
    })

    it("AC-HYB15-11: shows changelog summary", async () => {
        const { UpdateCard } = await import("@/components/settings/UpdateCard")
        render(React.createElement(UpdateCard, {
            update: {
                available: true,
                latestVersion: "1.2.0",
                severity: "optional",
                changelogSummary: "Bug fixes and performance improvements",
            }
        }))
        expect(screen.getByText(/bug fixes/i)).toBeTruthy()
    })

    it("AC-HYB15-12: renders null gracefully", async () => {
        const { UpdateCard } = await import("@/components/settings/UpdateCard")
        expect(() =>
            render(React.createElement(UpdateCard, { update: null }))
        ).not.toThrow()
    })
})

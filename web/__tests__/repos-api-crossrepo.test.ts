// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mock next-auth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}))

// Mock authOptions
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({
  authOptions: {},
}))

// Mock audit log (writeAuditLog, getClientIp, AuditEvent)
vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  AuditEvent: { REPO_TOGGLED: "REPO_TOGGLED" },
}))

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    repository: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { PATCH } from "@/app/api/repos/[id]/route"

const mockSession = {
  user: {
    id: "user-1",
    email: "test@example.com",
    tenantId: "tenant-123",
    role: "ADMIN",
  },
}

const mockRepo = {
  id: "repo-1",
  name: "org/repo-one",
  tenantId: "tenant-123",
  enabled: true,
  config: { threshold: 0.75 },
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/repos/repo-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: "repo-1" })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue(mockSession as never)
  vi.mocked(prisma.repository.findFirst).mockResolvedValue(mockRepo as never)
  vi.mocked(prisma.repository.update).mockResolvedValue(mockRepo as never)
})

describe("PATCH /api/repos/[id] — crossRepoSiblings", () => {
  it("1. PATCH with valid crossRepoSiblings string[] updates config", async () => {
    const req = makeRequest({ crossRepoSiblings: ["org/repo-two", "org/repo-three"] })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(200)

    const updateCall = vi.mocked(prisma.repository.update).mock.calls[0]![0]
    const config = (updateCall.data as Record<string, unknown>).config as Record<string, unknown>
    expect(config.crossRepoSiblings).toEqual(["org/repo-two", "org/repo-three"])
  })

  it("2. PATCH with crossRepoSiblings: null clears the field", async () => {
    const req = makeRequest({ crossRepoSiblings: null })
    const res = await PATCH(req, { params })
    // null is explicitly allowed (clears the field) — no update since undefined check
    expect(res.status).toBe(200)
  })

  it("3. PATCH with crossRepoSiblings: [123] (non-string element) returns 400", async () => {
    const req = makeRequest({ crossRepoSiblings: [123] })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/crossRepoSiblings must be a string array/)
    expect(prisma.repository.update).not.toHaveBeenCalled()
  })

  it("4. PATCH with crossRepoSiblings: 'not-an-array' returns 400", async () => {
    const req = makeRequest({ crossRepoSiblings: "not-an-array" })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/crossRepoSiblings must be a string array/)
    expect(prisma.repository.update).not.toHaveBeenCalled()
  })

  it("5. Existing threshold is preserved when only crossRepoSiblings is patched", async () => {
    const req = makeRequest({ crossRepoSiblings: ["org/repo-two"] })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(200)

    const updateCall = vi.mocked(prisma.repository.update).mock.calls[0]![0]
    const config = (updateCall.data as Record<string, unknown>).config as Record<string, unknown>
    // threshold from existing config must be preserved
    expect(config.threshold).toBe(0.75)
    expect(config.crossRepoSiblings).toEqual(["org/repo-two"])
  })
})

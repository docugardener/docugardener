// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockLookup } = vi.hoisted(() => ({ mockLookup: vi.fn() }))

vi.mock("node:dns/promises", () => ({
    default: { lookup: mockLookup },
}))

import { isSafeUrl } from "@/lib/ssrf"

describe("isSafeUrl", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("case 1: AWS metadata IP 169.254.169.254 → false", async () => {
        mockLookup.mockResolvedValue({ address: "169.254.169.254", family: 4 })
        expect(await isSafeUrl("http://169.254.169.254")).toBe(false)
    })

    it("case 2: RFC1918 192.168.1.1 → false", async () => {
        mockLookup.mockResolvedValue({ address: "192.168.1.1", family: 4 })
        expect(await isSafeUrl("http://192.168.1.1")).toBe(false)
    })

    it("case 3: RFC1918 10.0.0.1 → false", async () => {
        mockLookup.mockResolvedValue({ address: "10.0.0.1", family: 4 })
        expect(await isSafeUrl("http://10.0.0.1")).toBe(false)
    })

    it("case 4: RFC1918 172.16.0.1 → false", async () => {
        mockLookup.mockResolvedValue({ address: "172.16.0.1", family: 4 })
        expect(await isSafeUrl("http://172.16.0.1")).toBe(false)
    })

    it("case 5: loopback 127.0.0.1 without allowLocalhost → false", async () => {
        mockLookup.mockResolvedValue({ address: "127.0.0.1", family: 4 })
        expect(await isSafeUrl("http://127.0.0.1")).toBe(false)
    })

    it("case 6: loopback 127.0.0.1 with allowLocalhost: true → true", async () => {
        mockLookup.mockResolvedValue({ address: "127.0.0.1", family: 4 })
        expect(await isSafeUrl("http://127.0.0.1", { allowLocalhost: true })).toBe(true)
    })

    it("case 7: localhost:11434 with allowLocalhost: true → true (resolves to 127.0.0.1)", async () => {
        mockLookup.mockResolvedValue({ address: "127.0.0.1", family: 4 })
        expect(await isSafeUrl("http://localhost:11434", { allowLocalhost: true })).toBe(true)
    })

    it("case 8: public Slack webhook URL → true", async () => {
        mockLookup.mockResolvedValue({ address: "52.1.1.1", family: 4 })
        expect(await isSafeUrl("https://hooks.slack.com/abc")).toBe(true)
    })

    it("case 9: public Jira URL → true", async () => {
        mockLookup.mockResolvedValue({ address: "203.0.113.1", family: 4 })
        expect(await isSafeUrl("https://jira.company.com")).toBe(true)
    })

    it("case 10: ftp:// protocol → false (no DNS lookup needed)", async () => {
        expect(await isSafeUrl("ftp://evil.com")).toBe(false)
        expect(mockLookup).not.toHaveBeenCalled()
    })

    it("case 11: invalid URL → false (no DNS lookup needed)", async () => {
        expect(await isSafeUrl("not-a-url")).toBe(false)
        expect(mockLookup).not.toHaveBeenCalled()
    })

    it("case 12: DNS resolution failure → false", async () => {
        mockLookup.mockRejectedValue(new Error("ENOTFOUND nonexistent.invalid"))
        expect(await isSafeUrl("http://nonexistent.invalid")).toBe(false)
    })

    it("edge: 172.31.255.255 is within RFC1918 172.16/12 → false", async () => {
        mockLookup.mockResolvedValue({ address: "172.31.255.255", family: 4 })
        expect(await isSafeUrl("http://172.31.255.255")).toBe(false)
    })

    it("edge: 172.15.0.1 is below RFC1918 172.16/12 range → true", async () => {
        mockLookup.mockResolvedValue({ address: "172.15.0.1", family: 4 })
        expect(await isSafeUrl("http://172.15.0.1")).toBe(true)
    })

    it("edge: allowLocalhost=true still rejects RFC1918 10.x", async () => {
        mockLookup.mockResolvedValue({ address: "10.0.0.1", family: 4 })
        expect(await isSafeUrl("http://10.0.0.1", { allowLocalhost: true })).toBe(false)
    })

    it("edge: 0.0.0.1 (this-network) → false", async () => {
        mockLookup.mockResolvedValue({ address: "0.0.0.1", family: 4 })
        expect(await isSafeUrl("http://0.0.0.1")).toBe(false)
    })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/dashboard/settings",
}))

vi.mock("@/lib/features", () => ({
    canAccessTenant: vi.fn(() => true),
}))

const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
)
vi.stubGlobal("fetch", fetchMock)

const SSO_PROPS = {
    spEntityId: "https://docugardener.dev/api/saml/metadata",
    spAcsUrl: "https://docugardener.dev/api/saml/callback",
    initialConfig: {
        ssoEnabled: false,
        ssoProvider: null,
        samlIdpEntityId: null,
        samlIdpSsoUrl: null,
        hasCertificate: false,
        samlAttrEmail: "email",
        samlAttrRole: "",
        samlRoleMapAdmin: "",
        sessionIdleTimeoutMinutes: null,
    },
}

// SPEC-SSO-EA-01: SsoConfigForm renders Early Access banner
describe("SPEC-SSO-EA-01: SsoConfigForm Early Access banner", () => {
    beforeEach(() => { fetchMock.mockClear() })

    it("renders Early Access label", async () => {
        const { SsoConfigForm } = await import("@/components/settings/SsoConfigForm")
        render(<SsoConfigForm {...SSO_PROPS} />)
        expect(screen.getByText(/early access/i)).toBeInTheDocument()
    })

    it("renders SSO/SAML description text", async () => {
        const { SsoConfigForm } = await import("@/components/settings/SsoConfigForm")
        render(<SsoConfigForm {...SSO_PROPS} />)
        expect(screen.getByText(/SSO\/SAML works with Okta/i)).toBeInTheDocument()
    })

    it("renders support email link", async () => {
        const { SsoConfigForm } = await import("@/components/settings/SsoConfigForm")
        render(<SsoConfigForm {...SSO_PROPS} />)
        const link = screen.getByRole("link", { name: /support@docugardener\.dev/i })
        expect(link).toHaveAttribute("href", "mailto:support@docugardener.dev")
    })
})

// SPEC-SSO-EA-02: ScimConfigSection renders Early Access banner
describe("SPEC-SSO-EA-02: ScimConfigSection Early Access banner", () => {
    beforeEach(() => { fetchMock.mockClear() })

    it("renders Early Access label", async () => {
        const { ScimConfigSection } = await import("@/components/settings/ScimConfigSection")
        render(
            <ScimConfigSection
                scimEnabled={false}
                hasToken={false}
                scimLastSyncAt={null}
                scimBaseUrl="https://docugardener.dev/scim/v2"
            />
        )
        expect(screen.getByText(/early access/i)).toBeInTheDocument()
    })

    it("renders SCIM description text", async () => {
        const { ScimConfigSection } = await import("@/components/settings/ScimConfigSection")
        render(
            <ScimConfigSection
                scimEnabled={false}
                hasToken={false}
                scimLastSyncAt={null}
                scimBaseUrl="https://docugardener.dev/scim/v2"
            />
        )
        expect(screen.getByText(/SCIM provisioning works with Okta/i)).toBeInTheDocument()
    })
})

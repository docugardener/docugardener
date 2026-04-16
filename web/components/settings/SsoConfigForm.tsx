// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { InfoIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

const SSO_PROVIDERS = [
    { value: "okta", label: "Okta" },
    { value: "azure_ad", label: "Microsoft Entra ID (Azure AD)" },
    { value: "google", label: "Google Workspace" },
    { value: "custom", label: "Custom IdP" },
]

interface SsoConfigFormProps {
    spEntityId: string   // Our SP entity ID (from env)
    spAcsUrl: string     // Assertion Consumer Service URL
    initialConfig: {
        ssoEnabled: boolean
        ssoProvider: string | null
        samlIdpEntityId: string | null
        samlIdpSsoUrl: string | null
        hasCertificate: boolean
        samlAttrEmail: string
        samlAttrRole: string
        samlRoleMapAdmin: string
        sessionIdleTimeoutMinutes: number | null
    }
}

export function SsoConfigForm({ spEntityId, spAcsUrl, initialConfig }: SsoConfigFormProps) {
    const [enabled, setEnabled] = useState(initialConfig.ssoEnabled)
    const [provider, setProvider] = useState(initialConfig.ssoProvider ?? "okta")
    const [entityId, setEntityId] = useState(initialConfig.samlIdpEntityId ?? "")
    const [ssoUrl, setSsoUrl] = useState(initialConfig.samlIdpSsoUrl ?? "")
    const [certificate, setCertificate] = useState("")
    const [attrEmail, setAttrEmail] = useState(initialConfig.samlAttrEmail ?? "email")
    const [attrRole, setAttrRole] = useState(initialConfig.samlAttrRole ?? "")
    const [roleMapAdmin, setRoleMapAdmin] = useState(initialConfig.samlRoleMapAdmin ?? "")
    const [idleTimeout, setIdleTimeout] = useState<string>(
        initialConfig.sessionIdleTimeoutMinutes != null
            ? String(initialConfig.sessionIdleTimeoutMinutes)
            : ""
    )
    const [saving, setSaving] = useState(false)

    async function handleSave() {
        setSaving(true)
        try {
            const res = await fetch("/api/settings/sso", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ssoEnabled: enabled,
                    ssoProvider: provider,
                    samlIdpEntityId: entityId,
                    samlIdpSsoUrl: ssoUrl,
                    samlIdpCertificate: certificate || undefined,
                    samlAttrEmail: attrEmail,
                    samlAttrRole: attrRole || undefined,
                    samlRoleMapAdmin: roleMapAdmin || undefined,
                    sessionIdleTimeoutMinutes: idleTimeout ? parseInt(idleTimeout, 10) : null,
                }),
            })
            if (!res.ok) {
                const text = await res.text()
                toast.error("Failed to save SSO config", { description: text })
                return
            }
            toast.success("SSO configuration saved")
            setCertificate("") // Clear after save
        } catch (err: any) {
            toast.error("Error saving SSO config", { description: err.message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-8">
            {/* PH15-03a: Early Access banner */}
            <div className="flex items-start gap-2 rounded-md border border-blue-800 bg-blue-950/30 p-3 text-sm text-blue-300">
                <InfoIcon className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                    <strong>Early Access</strong> — SSO/SAML works with Okta and standard SAML 2.0
                    identity providers. For assisted setup or to report issues, contact{" "}
                    <a href="mailto:support@docugardener.dev" className="underline">
                        support@docugardener.dev
                    </a>
                    .
                </span>
            </div>
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold text-sm text-foreground">Enable SSO</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        When enabled, users must sign in via your Identity Provider.
                    </p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => setEnabled(!enabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 ${enabled ? "bg-primary" : "bg-input"}`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
                    />
                </button>
            </div>

            {/* SP info (read-only) */}
            <div className="rounded-md bg-muted/50 border border-border p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Service Provider (SP) Details — provide these to your IdP
                </p>
                <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Entity ID</span>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded break-all">{spEntityId}</code>
                    <span className="text-muted-foreground">ACS URL</span>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded break-all">{spAcsUrl}</code>
                </div>
            </div>

            {/* IdP provider selection */}
            <div className="space-y-2">
                <Label className="text-sm font-semibold">Identity Provider</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {SSO_PROVIDERS.map((p) => (
                        <button
                            key={p.value}
                            type="button"
                            onClick={() => setProvider(p.value)}
                            className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left ${
                                provider === p.value
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* IdP details */}
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="sso-entity-id" className="text-sm">IdP Entity ID</Label>
                    <Input
                        id="sso-entity-id"
                        value={entityId}
                        onChange={(e) => setEntityId(e.target.value)}
                        placeholder="https://your-idp.example.com/saml2/metadata"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="sso-url" className="text-sm">IdP SSO URL</Label>
                    <Input
                        id="sso-url"
                        value={ssoUrl}
                        onChange={(e) => setSsoUrl(e.target.value)}
                        placeholder="https://your-idp.example.com/saml2/sso"
                    />
                </div>
            </div>

            {/* Certificate */}
            <div className="space-y-2">
                <Label htmlFor="sso-cert" className="text-sm">
                    IdP Certificate (PEM)
                    {initialConfig.hasCertificate && (
                        <span className="ml-2 text-xs text-green-600 font-normal">✓ certificate saved</span>
                    )}
                </Label>
                <Textarea
                    id="sso-cert"
                    value={certificate}
                    onChange={(e) => setCertificate(e.target.value)}
                    placeholder={
                        initialConfig.hasCertificate
                            ? "Leave blank to keep existing certificate"
                            : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
                    }
                    rows={5}
                    className="font-mono text-xs"
                />
            </div>

            {/* Attribute mapping */}
            <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Attribute Mapping
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="sso-attr-email" className="text-sm">Email attribute</Label>
                        <Input
                            id="sso-attr-email"
                            value={attrEmail}
                            onChange={(e) => setAttrEmail(e.target.value)}
                            placeholder="email"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="sso-attr-role" className="text-sm">
                            Role / group attribute
                            <span className="text-muted-foreground font-normal"> (optional)</span>
                        </Label>
                        <Input
                            id="sso-attr-role"
                            value={attrRole}
                            onChange={(e) => setAttrRole(e.target.value)}
                            placeholder="groups"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="sso-role-admin" className="text-sm">
                            Admin group value
                            <span className="text-muted-foreground font-normal"> (optional)</span>
                        </Label>
                        <Input
                            id="sso-role-admin"
                            value={roleMapAdmin}
                            onChange={(e) => setRoleMapAdmin(e.target.value)}
                            placeholder="docugardener-admin"
                        />
                        <p className="text-xs text-muted-foreground">
                            Users with this group value get ADMIN role; all others get VIEWER.
                        </p>
                    </div>
                </div>
            </div>

            {/* Session idle timeout */}
            <div className="space-y-2">
                <Label htmlFor="sso-idle-timeout" className="text-sm">
                    Session idle timeout (minutes)
                    <span className="text-muted-foreground font-normal"> (optional — default 480 min / 8 h)</span>
                </Label>
                <Input
                    id="sso-idle-timeout"
                    type="number"
                    min={1}
                    max={10080}
                    value={idleTimeout}
                    onChange={(e) => setIdleTimeout(e.target.value)}
                    placeholder="480"
                    className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                    Sessions inactive for longer than this duration will be expired. Range: 1 – 10080 min (7 days).
                </p>
            </div>

            <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save SSO Configuration"}
            </Button>
        </div>
    )
}

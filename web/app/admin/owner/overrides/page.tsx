"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

// Human-readable labels — same source as NewFeaturesBanner.tsx
const FEATURE_LABELS: Record<string, string> = {
  audit_log:                  "Audit Log",
  audit_log_export:           "Audit Log Export",
  risk_map:                   "Risk Map",
  analytics:                  "Analytics",
  holistic_scoring:           "Holistic Scoring",
  prompt_customization:       "Prompt Customization",
  llm_config:                 "LLM Configuration",
  ai_author_mode:             "AI Author Mode",
  slack_integration:          "Slack Integration",
  integrations_jira:          "Jira Integration",
  integrations_linear:        "Linear Integration",
  integrations_github_issues: "GitHub Issues Integration",
  sso_saml:                   "Single Sign-On (SSO)",
  scim:                       "SCIM Provisioning",
  environment_profile:        "Environment Profile Export",
  compliance_templates:       "Compliance Templates",
  role_auditor:               "Auditor Role",
  role_billing_admin:         "Billing Admin Role",
  private_repos:              "Private Repositories",
  agent_rules:                "Agent Rules",
}

// Plan that normally gates each feature (for the "PRO default" / "TEAM default" badge)
const FEATURE_MIN_PLAN: Record<string, "FREE" | "PRO" | "TEAM"> = {
  audit_log: "PRO", audit_log_export: "TEAM", risk_map: "PRO", analytics: "PRO",
  holistic_scoring: "PRO", prompt_customization: "PRO", llm_config: "FREE", ai_author_mode: "FREE",
  slack_integration: "PRO", integrations_jira: "PRO", integrations_linear: "PRO", integrations_github_issues: "FREE",
  sso_saml: "TEAM", scim: "TEAM", environment_profile: "TEAM", compliance_templates: "TEAM",
  role_auditor: "PRO", role_billing_admin: "PRO",
  private_repos: "PRO", agent_rules: "FREE",
}

const PLAN_BADGE: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-500",
  PRO:  "bg-blue-50 text-blue-600",
  TEAM: "bg-purple-50 text-purple-700",
}

const FEATURE_GROUPS: [string, string[]][] = [
  ["Analytics & Reporting", ["audit_log", "audit_log_export", "risk_map", "analytics"]],
  ["AI / LLM",              ["holistic_scoring", "prompt_customization", "llm_config", "ai_author_mode"]],
  ["Integrations",          ["slack_integration", "integrations_jira", "integrations_linear", "integrations_github_issues"]],
  ["Enterprise & Security", ["sso_saml", "scim", "environment_profile", "compliance_templates"]],
  ["RBAC Roles",            ["role_auditor", "role_billing_admin"]],
  ["Repositories",          ["private_repos", "agent_rules"]],
]

interface TenantOption { id: string; name: string; plan: string }

export default function OverridesPage() {
  const searchParams = useSearchParams()
  const preselected = searchParams.get("tenant")

  const [tenants, setTenants]             = useState<TenantOption[]>([])
  const [selectedId, setSelectedId]       = useState<string>(preselected ?? "")
  const [grantedFeatures, setGrantedFeatures] = useState<string[] | null>(null)
  const [useOverride, setUseOverride]     = useState(false)
  const [quotaCeiling, setQuotaCeiling]   = useState<string>("")
  const [unlimited, setUnlimited]         = useState(false)
  const [saving, setSaving]               = useState(false)
  const [loading, setLoading]             = useState(false)

  useEffect(() => {
    fetch("/api/admin/owner/tenants")
      .then((r) => r.json())
      .then((d) => setTenants(d.tenants))
  }, [])

  const loadOverrides = useCallback((id: string) => {
    if (!id) return
    setLoading(true)
    fetch(`/api/admin/owner/tenants/${id}/overrides`)
      .then((r) => r.json())
      .then((d) => {
        const gf = d.grantedFeatures as string[] | null
        setGrantedFeatures(gf)
        setUseOverride(gf !== null)
        if (d.quotaCeiling == null) { setUnlimited(false); setQuotaCeiling("") }
        else if (d.quotaCeiling === -1) { setUnlimited(true); setQuotaCeiling("") }
        else { setUnlimited(false); setQuotaCeiling(String(d.quotaCeiling)) }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (selectedId) loadOverrides(selectedId) }, [selectedId, loadOverrides])

  const toggleFeature = (f: string) => {
    const current = grantedFeatures ?? []
    setGrantedFeatures(current.includes(f) ? current.filter((x) => x !== f) : [...current, f])
    setUseOverride(true)
  }

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      const qc = unlimited ? -1 : quotaCeiling ? parseInt(quotaCeiling, 10) : null
      const res = await fetch(`/api/admin/owner/tenants/${selectedId}/overrides`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantedFeatures: useOverride ? (grantedFeatures ?? []) : null, quotaCeiling: qc }),
      })
      if (!res.ok) throw new Error("Save failed")
      toast.success("Overrides saved")
    } catch { toast.error("Failed to save overrides") }
    finally { setSaving(false) }
  }

  const handleReset = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await fetch(`/api/admin/owner/tenants/${selectedId}/overrides`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantedFeatures: null, quotaCeiling: null }),
      })
      setGrantedFeatures(null); setUseOverride(false); setQuotaCeiling(""); setUnlimited(false)
      toast.success("Reset to plan defaults")
    } catch { toast.error("Failed to reset") }
    finally { setSaving(false) }
  }

  const selectedTenant = tenants.find((t) => t.id === selectedId)
  const enabled = grantedFeatures ?? []

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Feature Overrides</h1>
      <p className="text-sm text-gray-500 mb-6">
        Grant or revoke features and set quota ceilings per tenant.
      </p>

      {/* Tenant selector */}
      <div className="mb-8">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Tenant</Label>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-72"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Select a tenant…</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.plan})</option>
          ))}
        </select>
        {selectedTenant && (
          <span className={`ml-3 text-xs font-bold px-2 py-0.5 rounded-full ${PLAN_BADGE[selectedTenant.plan]}`}>
            {selectedTenant.plan}
          </span>
        )}
      </div>

      {!selectedId && <div className="text-sm text-gray-400">Select a tenant to configure overrides.</div>}
      {selectedId && loading && <div className="text-sm text-gray-400">Loading…</div>}

      {selectedId && !loading && (
        <div className="space-y-6">

          {/* Override toggle header */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <Switch
              id="use-override"
              checked={useOverride}
              onCheckedChange={(v) => { setUseOverride(v); if (v && !grantedFeatures) setGrantedFeatures([]) }}
            />
            <div>
              <Label htmlFor="use-override" className="font-semibold text-gray-900 cursor-pointer">
                Use feature override list
              </Label>
              <p className="text-xs text-gray-400 mt-0.5">
                When off, standard plan-based gating applies. When on, only checked features are accessible.
              </p>
            </div>
          </div>

          {/* Feature checklist */}
          {useOverride && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {FEATURE_GROUPS.map(([group, features], gi) => (
                <div key={group} className={gi > 0 ? "border-t border-gray-100" : ""}>
                  <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">{group}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                    {features.map((f, fi) => {
                      const isEnabled = enabled.includes(f)
                      const minPlan = FEATURE_MIN_PLAN[f] ?? "FREE"
                      return (
                        <label
                          key={f}
                          className={`flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-gray-50 transition-colors
                            ${fi % 2 === 0 && features.length > 1 ? "sm:border-r border-gray-100" : ""}
                            ${fi < features.length - 2 ? "border-b border-gray-100" : ""}
                            ${fi === features.length - 1 && features.length % 2 !== 0 ? "sm:col-span-2" : ""}
                          `}
                        >
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => toggleFeature(f)}
                            className="w-4 h-4 rounded accent-green-600 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm ${isEnabled ? "text-gray-900 font-medium" : "text-gray-600"}`}>
                              {FEATURE_LABELS[f] ?? f}
                            </span>
                            <span className="text-xs text-gray-400 ml-1.5 font-mono">{f}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${PLAN_BADGE[minPlan]}`}>
                            {minPlan}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quota ceiling */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="font-semibold text-gray-900 mb-1">Quota Ceiling</h3>
            <p className="text-xs text-gray-400 mb-4">PR analyses per month. Overrides the plan default. Null = use plan default.</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="unlimited"
                  checked={unlimited}
                  onCheckedChange={(v) => { setUnlimited(v); if (v) setQuotaCeiling("") }}
                />
                <Label htmlFor="unlimited" className="text-sm">Unlimited (−1)</Label>
              </div>
              {!unlimited && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="plan default"
                    value={quotaCeiling}
                    onChange={(e) => setQuotaCeiling(e.target.value)}
                    className="w-36 text-sm"
                  />
                  <span className="text-xs text-gray-400">analyses/mo</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
              {saving ? "Saving…" : "Save overrides"}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              Reset to plan defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

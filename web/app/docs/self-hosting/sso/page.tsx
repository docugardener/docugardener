// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "SSO / SAML 2.0 — DocuGardener Docs",
  description: "Configure SAML 2.0 single sign-on with Okta, Entra ID (Azure AD), and other identity providers.",
}

export default function SsoPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        SSO / SAML 2.0
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Configure SAML 2.0 single sign-on for your organisation. DocuGardener acts as the
        Service Provider (SP); your Identity Provider (IdP) handles authentication.
      </p>

      {/* Early Access notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 mb-8">
        <svg className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm">
          <p className="font-semibold text-amber-600 mb-1">Early Access — SAML/SSO</p>
          <p className="text-gray-600 text-xs leading-relaxed">
            Validated with Okta. Entra ID (Azure AD) and other IdPs are in active testing.
            If you encounter issues, <a href="https://github.com/docugardener/docugardener/issues" className="underline text-green-600" target="_blank" rel="noopener noreferrer">open an issue</a> with your IdP name and error.
          </p>
        </div>
      </div>

      {/* Prerequisites */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Prerequisites</h2>
      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 mb-8">
        <li>DocuGardener on a <strong>TEAM</strong> plan</li>
        <li>Access to your IdP admin console (Okta, Entra, Google Workspace, etc.)</li>
        <li><code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">APP_URL</code> set to your public URL (required for SP metadata generation)</li>
      </ul>

      {/* Step 1: Get SP metadata */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Step 1 — Get SP metadata</h2>
      <p className="text-sm text-gray-700 mb-3">
        Navigate to <strong>Settings → Security → SSO / SAML</strong>. Copy the
        SP Entity ID and ACS URL shown in the read-only panel — you will need these when
        creating the SAML app in your IdP.
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-6">
{`SP Entity ID:  https://your-domain.example.com/auth/saml/metadata
ACS URL:       https://your-domain.example.com/auth/saml/callback`}
      </pre>
      <p className="text-sm text-gray-700 mb-8">
        You can also fetch the full SP metadata XML directly:
      </p>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-8">
{`curl "https://your-domain.example.com/auth/saml/metadata?tenant_id=<YOUR_TENANT_ID>"`}
      </pre>

      {/* Okta setup */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Okta setup</h2>
      <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 mb-8">
        <li>In Okta Admin, go to <strong>Applications → Create App Integration → SAML 2.0</strong>.</li>
        <li>Set <strong>Single sign-on URL</strong> to your ACS URL.</li>
        <li>Set <strong>Audience URI (SP Entity ID)</strong> to your SP Entity ID.</li>
        <li>Under <strong>Attribute Statements</strong>, map <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">email</code> → <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">user.email</code>.</li>
        <li>Download the IdP certificate (PEM format) and copy the IdP SSO URL and Entity ID.</li>
        <li>Back in DocuGardener Settings, paste the IdP Entity ID, SSO URL, and certificate, then click <strong>Save SSO Configuration</strong>.</li>
      </ol>

      {/* Entra ID setup */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Entra ID (Azure AD) setup</h2>
      <p className="text-sm text-gray-700 mb-4">
        Entra ID sends a <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">persistent</code> NameID
        (a UUID) by default rather than an email address. DocuGardener handles this automatically via attribute
        fallback — no extra configuration required. However, we recommend explicitly mapping the email claim
        for reliability:
      </p>
      <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 mb-6">
        <li>In Azure Portal, go to <strong>Enterprise Applications → New application → Non-gallery</strong>.</li>
        <li>Under <strong>Single sign-on → SAML</strong>, set the Reply URL (ACS URL) and Identifier (SP Entity ID).</li>
        <li>
          Under <strong>Attributes &amp; Claims</strong>, add a claim:
          <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
            <li>Name: <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">emailaddress</code></li>
            <li>Namespace: <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">http://schemas.xmlsoap.org/ws/2005/05/identity/claims</code></li>
            <li>Source attribute: <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">user.mail</code></li>
          </ul>
        </li>
        <li>Download the <strong>Certificate (Base64)</strong> and copy the Login URL and Azure AD Identifier.</li>
        <li>In DocuGardener Settings, paste the values and save. The <strong>Email attribute</strong> field can be left as <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">email</code> — the attribute fallback chain handles the full claim URI automatically.</li>
      </ol>
      <p className="text-sm text-gray-500 mb-8">
        Screenshot of the Entra ID attribute mapping screen coming soon.
      </p>

      {/* Attribute mapping reference */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Attribute mapping reference</h2>
      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm border border-gray-200 rounded-lg">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Field</th>
              <th className="px-4 py-3 text-left">Default</th>
              <th className="px-4 py-3 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-700">
            <tr>
              <td className="px-4 py-3 font-mono text-xs">Email attribute</td>
              <td className="px-4 py-3 font-mono text-xs">email</td>
              <td className="px-4 py-3 text-xs">Also checks Entra claim URIs automatically when NameID is not an email</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-xs">Role attribute</td>
              <td className="px-4 py-3 text-xs text-gray-400">optional</td>
              <td className="px-4 py-3 text-xs">Attribute name containing group/role values</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-xs">Admin group value</td>
              <td className="px-4 py-3 text-xs text-gray-400">optional</td>
              <td className="px-4 py-3 text-xs">Users with this value get ADMIN role; all others get Developer</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* JIT provisioning */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Just-in-time provisioning</h2>
      <p className="text-sm text-gray-700 mb-8">
        When a user signs in via SSO for the first time, DocuGardener automatically creates their account
        (JIT provisioning). Subsequent logins update the role if the IdP group membership has changed.
        To pre-provision users or sync deactivations, enable{" "}
        <strong>SCIM 2.0 provisioning</strong> in the same Settings page.
      </p>

      {/* Troubleshooting */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Troubleshooting</h2>
      <div className="space-y-4 mb-8">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-900 mb-1">"Cannot resolve email from assertion"</p>
          <p className="text-xs text-gray-600">
            Your IdP is sending a non-email NameID (e.g. Entra persistent format) and no email attribute was found.
            Add an email claim to your IdP app (see Entra setup above) or set the <strong>Email attribute</strong>
            field to match the exact attribute name your IdP sends.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-900 mb-1">"SAML assertion has expired"</p>
          <p className="text-xs text-gray-600">
            Clock skew between your server and the IdP. Ensure your VPS is syncing time via NTP
            (<code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">timedatectl status</code>).
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-900 mb-1">"User email already associated with a different organisation"</p>
          <p className="text-xs text-gray-600">
            The email from the assertion is already registered under a different tenant.
            Contact <a href="mailto:support@docugardener.dev" className="text-green-600 underline">support@docugardener.dev</a> to merge or transfer the account.
          </p>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        For IdP-specific issues not covered here,{" "}
        <a href="https://github.com/docugardener/docugardener/issues" className="text-green-600 hover:underline font-medium" target="_blank" rel="noopener noreferrer">
          open a GitHub issue
        </a>{" "}
        with your IdP name, the error message, and (if possible) a sanitised SAML response.
      </p>
    </>
  )
}

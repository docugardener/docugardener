// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Team & RBAC — DocuGardener Docs",
  description:
    "Manage team members, assign roles, and configure SSO in DocuGardener.",
}

export default function TeamPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Team &amp; RBAC
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Manage who has access to your DocuGardener workspace and what they can do.
      </p>

      {/* ── Roles ────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Roles</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        DocuGardener uses role-based access control (RBAC) with four predefined roles. Every team
        member is assigned exactly one role.
      </p>

      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Role
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Admin</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Full access. Can manage repos, triage findings, view audit logs, manage billing, and
              invite or remove team members.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Member</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Day-to-day user. Can view the dashboard and triage findings (apply fixes, dismiss, or
              mark as no-update-needed).
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Auditor
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Read-only compliance role. Can view the dashboard and access the audit log. Cannot
              triage findings or change settings.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Billing Admin
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Can view the dashboard and manage billing (upgrade/downgrade plans, update payment
              methods). Cannot triage or change settings.
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Permissions matrix ───────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Permissions Matrix</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Action
            </th>
            <th className="text-center bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Admin
            </th>
            <th className="text-center bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Member
            </th>
            <th className="text-center bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Auditor
            </th>
            <th className="text-center bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Billing Admin
            </th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Manage repositories", true, false, false, false],
            ["Triage inbox (apply fix, dismiss)", true, true, false, false],
            ["View dashboard", true, true, true, true],
            ["View audit log", true, false, true, false],
            ["Manage billing", true, false, false, true],
            ["Invite / remove users", true, false, false, false],
            ["Configure settings", true, false, false, false],
            ["Configure agent governance", true, false, false, false],
            ["Define documentation policies", true, false, false, false],
          ].map(([action, admin, member, auditor, billing]) => (
            <tr key={action as string}>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{action as string}</td>
              {[admin, member, auditor, billing].map((has, i) => (
                <td
                  key={i}
                  className="px-3 py-2 border border-gray-200 text-center text-gray-600"
                >
                  {has ? (
                    <span className="text-green-600 font-bold" aria-label="Yes">
                      &#10003;
                    </span>
                  ) : (
                    <span className="text-gray-300" aria-label="No">
                      &mdash;
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Inviting users ───────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Inviting Team Members</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Admins can invite new team members from{" "}
        <strong>Settings &rarr; Team &rarr; Invite by email</strong>. The invited user receives an
        email with a link to join the workspace. You choose the role at invite time — it can be
        changed later.
      </p>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-4">
        <strong>Plan limits:</strong> The FREE plan includes 1 seat. PRO supports up to 10 seats.
        TEAM plans have unlimited seats. You will see a warning if you try to invite more members
        than your plan allows.
      </div>

      {/* ── SSO ──────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">
        SSO &amp; SCIM (TEAM Plan)
      </h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Teams on the <strong>TEAM</strong> plan can configure SAML-based single sign-on (SSO)
        and SCIM 2.0 user provisioning. This allows you to:
      </p>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
        <li>
          Enforce login through your identity provider (Okta, Azure AD, Google Workspace, etc.).
        </li>
        <li>
          Automatically create and deactivate DocuGardener accounts as users are added or removed
          in your IdP directory.
        </li>
        <li>Map IdP groups to DocuGardener roles.</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4">
        To configure SSO, go to{" "}
        <strong>Settings &rarr; Team &rarr; SSO Configuration</strong> and follow the guided
        setup. You will need the SAML metadata URL or XML from your identity provider.
      </p>

      {/* ── Authentication methods ───────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Authentication Methods</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        DocuGardener supports three authentication methods out of the box:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Method
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Available On
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              GitHub OAuth
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">All plans</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Default. Uses your GitHub identity.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Email magic link
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">All plans</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Passwordless email sign-in.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              SAML SSO
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">TEAM plan only</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Enterprise IdP integration with SCIM provisioning.
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}

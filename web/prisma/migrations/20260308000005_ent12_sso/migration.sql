-- ENT-12: SSO / SAML 2.0
--
-- Adds SAML IdP configuration columns to Tenant and a session-revocation
-- timestamp. All columns are nullable with safe defaults so existing rows
-- are unaffected.

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "ssoEnabled"        BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ssoProvider"       TEXT,
  ADD COLUMN IF NOT EXISTS "samlIdpEntityId"   TEXT,
  ADD COLUMN IF NOT EXISTS "samlIdpSsoUrl"     TEXT,
  ADD COLUMN IF NOT EXISTS "samlIdpCertificate" TEXT,
  ADD COLUMN IF NOT EXISTS "samlAttrEmail"     TEXT,
  ADD COLUMN IF NOT EXISTS "samlAttrRole"      TEXT,
  ADD COLUMN IF NOT EXISTS "samlRoleMapAdmin"  TEXT,
  ADD COLUMN IF NOT EXISTS "sessionsRevokedAt" TIMESTAMP(3);

-- New audit event values
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'SSO_LOGIN';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'SSO_CONFIG_CHANGED';
ALTER TYPE "AuditEvent" ADD VALUE IF NOT EXISTS 'SESSIONS_REVOKED';

-- ENT-12 SCIM 2.0: bearer token on Tenant, externalId/scimActive on User,
-- five new AuditEvent values for SCIM provisioning operations.

-- AlterTable: Tenant SCIM fields
ALTER TABLE "Tenant" ADD COLUMN "scimEnabled"          BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Tenant" ADD COLUMN "scimBearerTokenHash"  TEXT;
ALTER TABLE "Tenant" ADD COLUMN "scimLastSyncAt"       TIMESTAMP(3);

-- AlterTable: User SCIM fields
ALTER TABLE "User"   ADD COLUMN "externalId"  TEXT;
ALTER TABLE "User"   ADD COLUMN "scimActive"  BOOLEAN NOT NULL DEFAULT TRUE;

-- AlterEnum: new SCIM audit events
-- PostgreSQL requires one ALTER TYPE per value
ALTER TYPE "AuditEvent" ADD VALUE 'SCIM_USER_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'SCIM_USER_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'SCIM_USER_DEACTIVATED';
ALTER TYPE "AuditEvent" ADD VALUE 'SCIM_USER_REACTIVATED';
ALTER TYPE "AuditEvent" ADD VALUE 'SCIM_TOKEN_ROTATED';

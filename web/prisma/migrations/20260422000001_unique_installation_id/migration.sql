-- BUG-ONBOARD-02: Enforce uniqueness on installationId.
-- Guard: clear installationId from any auto-provisioned 'default' tenant (air-gap
-- mode artefact) before adding the constraint. Runs atomically — if the constraint
-- still can't be applied (two real tenants share an ID) the whole migration rolls back.
UPDATE "Tenant"
SET "installationId" = NULL
WHERE name = 'default'
  AND "githubOrgId" IS NULL
  AND "installationId" IS NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_installationId_key" UNIQUE ("installationId");

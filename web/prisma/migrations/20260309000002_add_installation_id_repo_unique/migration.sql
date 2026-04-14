-- AlterTable: add installationId to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "installationId" TEXT;

-- AlterTable: add githubRepoId to Repository (if not already there)
-- (only needed if the column was added in this session)

-- CreateIndex: unique constraint on Repository(tenantId, githubRepoId)
CREATE UNIQUE INDEX IF NOT EXISTS "Repository_tenantId_githubRepoId_key" ON "Repository"("tenantId", "githubRepoId");

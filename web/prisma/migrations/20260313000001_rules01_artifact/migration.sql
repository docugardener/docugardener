-- RULES-01: Agent Rules Compiler
-- CreateTable: RulesArtifact

CREATE TABLE "RulesArtifact" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "repoId"          TEXT NOT NULL,
    "targetFormat"    TEXT NOT NULL,
    "outputPath"      TEXT NOT NULL,
    "lastHash"        TEXT,
    "lastGeneratedAt" TIMESTAMP(3),
    "lastPrUrl"       TEXT,
    "isStale"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RulesArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RulesArtifact_tenantId_repoId_targetFormat_key"
    ON "RulesArtifact"("tenantId", "repoId", "targetFormat");

CREATE INDEX "RulesArtifact_tenantId_isStale_idx"
    ON "RulesArtifact"("tenantId", "isStale");

-- AddForeignKey
ALTER TABLE "RulesArtifact"
    ADD CONSTRAINT "RulesArtifact_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RulesArtifact"
    ADD CONSTRAINT "RulesArtifact_repoId_fkey"
    FOREIGN KEY ("repoId") REFERENCES "Repository"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

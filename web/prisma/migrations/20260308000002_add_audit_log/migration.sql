-- ENT-11: SOC 2 Audit Logging

CREATE TYPE "AuditEvent" AS ENUM (
  'USER_LOGIN',
  'USER_LOGIN_FAILED',
  'SETTINGS_CHANGED',
  'TRIAGE_DECISION',
  'REPO_TOGGLED'
);

CREATE TABLE "AuditLog" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "actorId"      TEXT,
  "actorEmail"   TEXT,
  "actorIp"      TEXT,
  "event"        "AuditEvent" NOT NULL,
  "resourceType" TEXT,
  "resourceId"   TEXT,
  "metadata"     JSONB,
  "hash"         TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

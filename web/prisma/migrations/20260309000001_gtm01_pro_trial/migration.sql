-- GTM-01: PRO Trial
-- Add trialExpiresAt column to Tenant
ALTER TABLE "Tenant" ADD COLUMN "trialExpiresAt" TIMESTAMP(3);

-- AlterEnum: Add trial audit events
ALTER TYPE "AuditEvent" ADD VALUE 'TRIAL_STARTED';
ALTER TYPE "AuditEvent" ADD VALUE 'TRIAL_EXPIRED';

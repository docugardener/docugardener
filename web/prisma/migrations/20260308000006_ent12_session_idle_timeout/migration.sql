-- ENT-12: Configurable session idle timeout per tenant
-- Null = system default (480 minutes / 8 hours)
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "sessionIdleTimeoutMinutes" INTEGER;

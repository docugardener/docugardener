-- I-01/I-02: Add stripeCustomerId to Tenant for Stripe Billing integration
ALTER TABLE "Tenant" ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "Tenant_stripeCustomerId_key" ON "Tenant"("stripeCustomerId");

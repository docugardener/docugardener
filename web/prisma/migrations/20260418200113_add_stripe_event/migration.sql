-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "customerId" TEXT,
    "amountCents" INTEGER,
    "metadata" JSONB,
    "stripeUrl" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StripeEvent_customerId_idx" ON "StripeEvent"("customerId");

-- CreateIndex
CREATE INDEX "StripeEvent_type_createdAt_idx" ON "StripeEvent"("type", "createdAt");

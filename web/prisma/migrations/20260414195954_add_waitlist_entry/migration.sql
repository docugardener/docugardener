-- AlterEnum
ALTER TYPE "AuditEvent" ADD VALUE 'OWNER_FEATURE_OVERRIDE';

-- AlterEnum
ALTER TYPE "TriageStatus" ADD VALUE 'RESOLVED';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "aiAuthored" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "billingConfig" JSONB,
ADD COLUMN     "workflowConfig" JSONB;

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "plan" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

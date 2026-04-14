-- CreateEnum
CREATE TYPE "TriageStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IGNORED');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "triageStatus" "TriageStatus" NOT NULL DEFAULT 'PENDING';

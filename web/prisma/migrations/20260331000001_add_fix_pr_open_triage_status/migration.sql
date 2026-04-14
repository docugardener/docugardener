-- Add FIX_PR_OPEN to TriageStatus enum
-- FIX_PR_OPEN represents: fix PR created on GitHub, not yet merged.
-- Transitions to RESOLVED when the docugardener-fix-* branch merge webhook fires.
ALTER TYPE "TriageStatus" ADD VALUE IF NOT EXISTS 'FIX_PR_OPEN';

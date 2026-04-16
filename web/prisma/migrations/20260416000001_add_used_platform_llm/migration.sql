-- PH15-01: track whether the bundled operator Gemini key was used per job
-- Enables operator-wide platform LLM cost cap (PLATFORM_LLM_MONTHLY_CAP_EUR)
-- Nullable for backward compat with existing rows (NULL treated as false)
ALTER TABLE "Job" ADD COLUMN "usedPlatformLlm" BOOLEAN NOT NULL DEFAULT false;

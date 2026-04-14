-- FEED-01: Analysis Feedback Signal
-- Stores developer thumbs-up / thumbs-down signals from PR comment links.
-- Written by FastAPI (SQLAlchemy); read by Next.js for governance KPIs.

CREATE TABLE IF NOT EXISTS "AnalysisFeedback" (
    "id"        TEXT         NOT NULL,
    "jobId"     TEXT         NOT NULL,
    "tenantId"  TEXT         NOT NULL,
    "signal"    TEXT         NOT NULL,
    "source"    TEXT         NOT NULL DEFAULT 'pr_comment',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisFeedback_pkey" PRIMARY KEY ("id")
);

-- One feedback record per job per source (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS "AnalysisFeedback_jobId_source_key"
    ON "AnalysisFeedback"("jobId", "source");

-- Index for tenant-scoped KPI queries
CREATE INDEX IF NOT EXISTS "AnalysisFeedback_tenantId_createdAt_idx"
    ON "AnalysisFeedback"("tenantId", "createdAt");

-- Foreign keys
ALTER TABLE "AnalysisFeedback"
    ADD CONSTRAINT "AnalysisFeedback_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalysisFeedback"
    ADD CONSTRAINT "AnalysisFeedback_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

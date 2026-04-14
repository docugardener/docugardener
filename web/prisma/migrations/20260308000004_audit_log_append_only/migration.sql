-- ENT-11: SOC 2 Audit Log — DB-level append-only enforcement
--
-- In production this migration should be run as a superuser after creating
-- a dedicated app role. The Prisma app user (DATABASE_URL) should only have
-- INSERT + SELECT on "AuditLog".
--
-- Steps for production deployment:
--   1. Create a restricted app role (if not already):
--        CREATE ROLE docugardener_app LOGIN PASSWORD '<secret>';
--        GRANT CONNECT ON DATABASE "docugardener-web" TO docugardener_app;
--        GRANT USAGE ON SCHEMA public TO docugardener_app;
--        GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO docugardener_app;
--        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO docugardener_app;
--   2. Revoke mutation rights on AuditLog specifically:
--        REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "AuditLog" FROM docugardener_app;
--   3. Update DATABASE_URL in production to use docugardener_app credentials.
--
-- In dev/test environments the postgres superuser bypasses REVOKE so this
-- is a no-op. Safe to apply at any time.

DO $$
BEGIN
  -- Only attempt REVOKE if the restricted role exists; skip silently otherwise.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'docugardener_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "AuditLog" FROM docugardener_app;
    RAISE NOTICE 'AuditLog: UPDATE, DELETE, TRUNCATE revoked from docugardener_app';
  ELSE
    RAISE NOTICE 'AuditLog REVOKE skipped: role docugardener_app does not exist (dev environment)';
  END IF;
END
$$;

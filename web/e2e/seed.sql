-- E2E standing fixture: idempotent (safe to run on every CI run)
-- Never delete these rows — tests depend on them existing.

INSERT INTO "Tenant" (id, name, "githubOrgId", plan, "createdAt", "updatedAt")
VALUES (
    'e2e-tenant-fixed',
    'E2E Test Org',
    'e2e-999',
    'TEAM',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "User" (id, email, name, role, "tenantId", "createdAt", "updatedAt")
VALUES
    ('e2e-user-admin',   'e2e-admin@test.local',   'E2E Admin',   'ADMIN',         'e2e-tenant-fixed', NOW(), NOW()),
    ('e2e-user-auditor', 'e2e-auditor@test.local', 'E2E Auditor', 'AUDITOR',       'e2e-tenant-fixed', NOW(), NOW()),
    ('e2e-user-billing', 'e2e-billing@test.local', 'E2E Billing', 'BILLING_ADMIN', 'e2e-tenant-fixed', NOW(), NOW()),
    ('e2e-user-viewer',  'e2e-viewer@test.local',  'E2E Viewer',  'VIEWER',        'e2e-tenant-fixed', NOW(), NOW()),
    -- Cold onboarding user: exists in DB but has no tenant assignment
    ('e2e-user-newuser', 'e2e-newuser@test.local', 'E2E New User', 'VIEWER',       NULL,               NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
    role       = EXCLUDED.role,
    "tenantId" = EXCLUDED."tenantId";

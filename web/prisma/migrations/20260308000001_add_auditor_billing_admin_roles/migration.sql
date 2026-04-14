-- AlterEnum: add AUDITOR and BILLING_ADMIN to UserRole
-- ENT-10: RBAC Extension — prerequisite for Audit Logging and SSO

ALTER TYPE "UserRole" ADD VALUE 'AUDITOR';
ALTER TYPE "UserRole" ADD VALUE 'BILLING_ADMIN';

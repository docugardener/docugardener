"""
OPS-01: Validation tests for the backup script and docker-compose backup config.

Tests cover:
  - backup.sh structure and correctness
  - docker-compose.prod.yml backup-cron service config
  - Weaviate backup module enablement
  - backup volume sharing between services
  - DEPLOYMENT.md backup documentation completeness
"""

from __future__ import annotations

from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
BACKUP_SCRIPT = ROOT / "scripts" / "backup.sh"
PROD_COMPOSE = ROOT / "docker" / "docker-compose.prod.yml"
DEPLOYMENT_MD = ROOT / "DEPLOYMENT.md"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def backup_script_content():
    return BACKUP_SCRIPT.read_text()


@pytest.fixture(scope="module")
def compose_content():
    return PROD_COMPOSE.read_text()


@pytest.fixture(scope="module")
def deployment_content():
    return DEPLOYMENT_MD.read_text()


# ---------------------------------------------------------------------------
# Backup script — existence and basics
# ---------------------------------------------------------------------------

class TestBackupScriptBasics:
    def test_script_exists(self):
        assert BACKUP_SCRIPT.exists()

    def test_script_has_shebang(self, backup_script_content):
        assert backup_script_content.startswith("#!/usr/bin/env bash")

    def test_script_uses_strict_mode(self, backup_script_content):
        assert "set -euo pipefail" in backup_script_content


# ---------------------------------------------------------------------------
# Backup script — PostgreSQL backup
# ---------------------------------------------------------------------------

class TestBackupScriptPostgres:
    def test_pg_dump_command_present(self, backup_script_content):
        assert "pg_dump" in backup_script_content

    def test_connects_to_postgres_host(self, backup_script_content):
        assert "-h postgres" in backup_script_content

    def test_dumps_correct_database(self, backup_script_content):
        assert "docugardener-web" in backup_script_content

    def test_output_is_gzipped(self, backup_script_content):
        assert "gzip" in backup_script_content

    def test_uses_postgres_password_env(self, backup_script_content):
        assert "POSTGRES_PASSWORD" in backup_script_content

    def test_no_owner_flag(self, backup_script_content):
        assert "--no-owner" in backup_script_content

    def test_no_privileges_flag(self, backup_script_content):
        assert "--no-privileges" in backup_script_content


# ---------------------------------------------------------------------------
# Backup script — Weaviate backup
# ---------------------------------------------------------------------------

class TestBackupScriptWeaviate:
    def test_weaviate_backup_api_called(self, backup_script_content):
        assert "/v1/backups/filesystem" in backup_script_content

    def test_weaviate_url_configurable(self, backup_script_content):
        assert "WEAVIATE_URL" in backup_script_content

    def test_weaviate_default_url(self, backup_script_content):
        assert "http://weaviate:8080" in backup_script_content

    def test_polls_for_completion(self, backup_script_content):
        # Script should poll the backup status endpoint
        assert "STATUS" in backup_script_content
        assert "SUCCESS" in backup_script_content

    def test_handles_failure_status(self, backup_script_content):
        assert "FAILED" in backup_script_content

    def test_handles_http_error(self, backup_script_content):
        # Script should gracefully handle non-200 responses
        assert "skipping" in backup_script_content.lower()


# ---------------------------------------------------------------------------
# Backup script — S3 upload
# ---------------------------------------------------------------------------

class TestBackupScriptS3:
    def test_s3_upload_conditional(self, backup_script_content):
        assert "BACKUP_S3_BUCKET" in backup_script_content

    def test_s3_endpoint_used(self, backup_script_content):
        assert "BACKUP_S3_ENDPOINT" in backup_script_content
        assert "--endpoint-url" in backup_script_content

    def test_s3_skipped_when_not_configured(self, backup_script_content):
        assert "S3 not configured" in backup_script_content


# ---------------------------------------------------------------------------
# Backup script — retention
# ---------------------------------------------------------------------------

class TestBackupScriptRetention:
    def test_retention_days_configurable(self, backup_script_content):
        assert "BACKUP_RETENTION_DAYS" in backup_script_content

    def test_default_retention_7_days(self, backup_script_content):
        assert ":-7" in backup_script_content

    def test_find_delete_old_backups(self, backup_script_content):
        assert "-mtime" in backup_script_content
        assert "-delete" in backup_script_content

    def test_reports_remaining_count(self, backup_script_content):
        assert "backup(s) kept" in backup_script_content


# ---------------------------------------------------------------------------
# Docker Compose — backup-cron service
# ---------------------------------------------------------------------------

class TestComposeBackupService:
    def test_backup_cron_service_exists(self, compose_content):
        assert "backup-cron:" in compose_content

    def test_backup_container_name(self, compose_content):
        assert "docugardener-backup" in compose_content

    def test_uses_postgres_alpine_image(self, compose_content):
        # backup-cron uses postgres image so pg_dump is available
        lines = compose_content.split("\n")
        in_backup = False
        for line in lines:
            if "backup-cron:" in line:
                in_backup = True
            elif in_backup and line.strip() and not line.startswith(" ") and not line.startswith("\t"):
                break
            elif in_backup and "image:" in line:
                assert "postgres" in line.lower()
                return
        pytest.fail("backup-cron service image not found")

    def test_mounts_backup_script(self, compose_content):
        assert "backup.sh:/scripts/backup.sh" in compose_content

    def test_mounts_backup_volume(self, compose_content):
        assert "backup-data:/backups" in compose_content

    def test_depends_on_postgres(self, compose_content):
        # Verify backup-cron depends on postgres
        lines = compose_content.split("\n")
        in_backup = False
        in_depends = False
        for line in lines:
            if "backup-cron:" in line:
                in_backup = True
            elif in_backup and "depends_on:" in line:
                in_depends = True
            elif in_backup and in_depends and "postgres:" in line:
                return
            elif in_backup and line.strip() and not line.startswith(" ") and not line.startswith("\t"):
                break
        pytest.fail("backup-cron does not depend on postgres")

    def test_depends_on_weaviate(self, compose_content):
        lines = compose_content.split("\n")
        in_backup = False
        in_depends = False
        for line in lines:
            if "backup-cron:" in line:
                in_backup = True
            elif in_backup and "depends_on:" in line:
                in_depends = True
            elif in_backup and in_depends and "weaviate:" in line:
                return
            elif in_backup and line.strip() and not line.startswith(" ") and not line.startswith("\t"):
                break
        pytest.fail("backup-cron does not depend on weaviate")

    def test_restart_policy(self, compose_content):
        lines = compose_content.split("\n")
        in_backup = False
        for line in lines:
            if "backup-cron:" in line:
                in_backup = True
            elif in_backup and "restart:" in line:
                assert "unless-stopped" in line
                return
            elif in_backup and line.strip() and not line.startswith(" ") and not line.startswith("\t"):
                break


# ---------------------------------------------------------------------------
# Docker Compose — Weaviate backup module
# ---------------------------------------------------------------------------

class TestComposeWeaviateBackup:
    def test_weaviate_backup_module_enabled(self, compose_content):
        assert "ENABLE_MODULES" in compose_content
        assert "backup-filesystem" in compose_content

    def test_weaviate_backup_path_configured(self, compose_content):
        assert "BACKUP_FILESYSTEM_PATH" in compose_content

    def test_weaviate_shares_backup_volume(self, compose_content):
        # Weaviate should mount the same backup-data volume
        lines = compose_content.split("\n")
        in_weaviate = False
        in_volumes = False
        for line in lines:
            if "weaviate:" in line and "docugardener-weaviate" not in line and "WEAVIATE" not in line:
                in_weaviate = True
            elif in_weaviate and "volumes:" in line:
                in_volumes = True
            elif in_weaviate and in_volumes and "backup-data:" in line:
                return
            elif in_weaviate and line.strip() and not line.startswith(" ") and not line.startswith("\t"):
                break
        pytest.fail("Weaviate does not mount backup-data volume")


# ---------------------------------------------------------------------------
# Docker Compose — backup-data volume declared
# ---------------------------------------------------------------------------

class TestComposeBackupVolume:
    def test_backup_data_volume_declared(self, compose_content):
        # The volume must be in the top-level volumes section
        lines = compose_content.split("\n")
        in_top_volumes = False
        for line in lines:
            stripped = line.rstrip()
            if stripped == "volumes:":
                in_top_volumes = True
            elif in_top_volumes and "backup-data:" in stripped:
                return
            elif in_top_volumes and not stripped.startswith(" ") and stripped and stripped != "volumes:":
                break
        pytest.fail("backup-data volume not declared in top-level volumes")


# ---------------------------------------------------------------------------
# DEPLOYMENT.md — backup documentation
# ---------------------------------------------------------------------------

class TestDeploymentDocs:
    def test_backups_section_exists(self, deployment_content):
        assert "## Backups" in deployment_content

    def test_documents_nightly_schedule(self, deployment_content):
        assert "nightly" in deployment_content.lower() or "02:00" in deployment_content

    def test_documents_postgres_backup(self, deployment_content):
        assert "pg_dump" in deployment_content or "PostgreSQL" in deployment_content

    def test_documents_weaviate_backup(self, deployment_content):
        assert "Weaviate" in deployment_content

    def test_documents_s3_configuration(self, deployment_content):
        assert "BACKUP_S3_BUCKET" in deployment_content

    def test_documents_retention(self, deployment_content):
        assert "BACKUP_RETENTION_DAYS" in deployment_content

    def test_documents_manual_backup(self, deployment_content):
        assert "Manual backup" in deployment_content or "manual" in deployment_content.lower()

    def test_documents_restore_postgres(self, deployment_content):
        assert "Restore" in deployment_content
        assert "psql" in deployment_content

    def test_documents_restore_weaviate(self, deployment_content):
        assert "restore" in deployment_content.lower()
        assert "/v1/backups/" in deployment_content

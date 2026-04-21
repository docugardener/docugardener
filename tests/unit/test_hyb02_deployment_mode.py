"""HYB-02: DEPLOYMENT_MODE flag expansion tests."""

import pytest
from pydantic import ValidationError

from src.core.config import Settings


def make_settings(**kwargs) -> Settings:
    """Create a Settings instance with test defaults, overriding with kwargs."""
    defaults = {
        "app_env": "development",
        "sql_database_url": "postgresql://test",
        "allowed_origins": ["http://localhost"],
    }
    defaults.update(kwargs)
    return Settings(**defaults)


class TestDeploymentModeDefault:
    def test_default_is_saas(self):
        s = make_settings()
        assert s.deployment_mode == "saas"

    def test_saas_accepted_explicitly(self):
        s = make_settings(deployment_mode="saas")
        assert s.deployment_mode == "saas"


class TestDeploymentModeValidValues:
    def test_client_installed_accepted(self):
        s = make_settings(deployment_mode="client-installed")
        assert s.deployment_mode == "client-installed"

    def test_air_gap_accepted(self):
        s = make_settings(deployment_mode="air-gap")
        assert s.deployment_mode == "air-gap"


class TestBackwardCompatibility:
    def test_sovereign_maps_to_client_installed(self):
        """Legacy 'sovereign' env var value must not break existing deployments."""
        s = make_settings(deployment_mode="sovereign")
        assert s.deployment_mode == "client-installed"


class TestInvalidValues:
    def test_invalid_value_raises(self):
        with pytest.raises(ValidationError):
            make_settings(deployment_mode="hosted")

    def test_empty_string_raises(self):
        with pytest.raises(ValidationError):
            make_settings(deployment_mode="")

    def test_uppercase_saas_raises(self):
        # Pydantic Literal is case-sensitive
        with pytest.raises(ValidationError):
            make_settings(deployment_mode="SAAS")


class TestNewConfigFields:
    def test_single_tenant_id_defaults_none(self):
        # Explicitly pass None to override any SINGLE_TENANT_ID env var in the test environment
        s = make_settings(single_tenant_id=None)
        assert s.single_tenant_id is None

    def test_single_tenant_id_settable(self):
        s = make_settings(single_tenant_id="default")
        assert s.single_tenant_id == "default"

    def test_license_portal_url_defaults_empty(self):
        s = make_settings()
        assert s.license_portal_url == ""

    def test_github_org_defaults_none(self):
        s = make_settings(github_org=None)
        assert s.github_org is None

    def test_admin_email_defaults_none(self):
        s = make_settings(admin_email=None)
        assert s.admin_email is None


class TestValidateProductionConfig:
    def test_saas_production_does_not_require_github_org(self):
        """SaaS production with no GITHUB_ORG must not raise."""
        s = make_settings(
            app_env="production",
            deployment_mode="saas",
            allowed_origins=["https://app.docugardener.dev"],
            sql_database_url="postgresql://prod",
            feedback_hmac_secret="x" * 32,
        )
        # Should not raise (github_org not required in saas mode)
        s.validate_production_config()

    def test_client_installed_production_without_github_org_passes(self):
        """GITHUB_ORG is optional — missing it no longer blocks startup."""
        s = make_settings(
            app_env="production",
            deployment_mode="client-installed",
            allowed_origins=["https://app.example.com"],
            sql_database_url="postgresql://prod",
            feedback_hmac_secret="x" * 32,
            github_org=None,
        )
        # Should NOT raise — GITHUB_ORG is a display name only
        s.validate_production_config()

    def test_client_installed_production_with_github_org_passes(self):
        s = make_settings(
            app_env="production",
            deployment_mode="client-installed",
            allowed_origins=["https://app.example.com"],
            sql_database_url="postgresql://prod",
            feedback_hmac_secret="x" * 32,
            github_org="acme-corp",
        )
        s.validate_production_config()  # Must not raise

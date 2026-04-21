"""HYB-07: Air-gap offline license validation tests."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from src.core.license import (
    LicenseError,
    LicenseExpiredError,
    LicensePayload,
    LicenseTamperedError,
    sign_license_payload,
    validate_license_file,
)

# Dev private key generated during HYB-07 setup (test use only)
_DEV_PRIVATE_KEY_HEX = "64703e22668f1fdf9d82fa70c1f40c9904d0710cc2e22b96196558613fcb2146"
_DEV_PRIVATE_KEY_BYTES = bytes.fromhex(_DEV_PRIVATE_KEY_HEX)

# Path to the bundled dev public key
_DEV_PUBLIC_KEY_PATH = str(
    Path(__file__).parents[2] / "src" / "core" / "keys" / "license_verify.pub"
)


def make_license_payload(
    *,
    expires_days: int = 365,
    plan: str = "TEAM",
    org: str = "Acme Corp",
) -> dict:
    """Create a license payload dict (without signature)."""
    now = datetime.now(tz=UTC)
    return {
        "license_key_id": "dg_lic_abc123def456",
        "org_name": org,
        "plan": plan,
        "issued_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "expires_at": (now + timedelta(days=expires_days)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def write_license_file(payload: dict, private_key: bytes, path: str) -> None:
    """Sign and write a license JSON file."""
    sig = sign_license_payload(payload, private_key)
    full = {**payload, "signature": sig}
    Path(path).write_text(json.dumps(full, indent=2), encoding="utf-8")


class TestValidLicense:
    def test_valid_license_returns_payload(self, tmp_path):
        payload = make_license_payload()
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)

        result = validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)

        assert isinstance(result, LicensePayload)
        assert result.org_name == "Acme Corp"
        assert result.plan == "TEAM"
        assert result.license_key_id == "dg_lic_abc123def456"

    def test_pro_plan_accepted(self, tmp_path):
        payload = make_license_payload(plan="PRO")
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)

        result = validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)
        assert result.plan == "PRO"

    def test_expires_at_parsed_correctly(self, tmp_path):
        payload = make_license_payload(expires_days=30)
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)

        result = validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)
        assert result.expires_at > datetime.now(tz=UTC)


class TestInvalidSignature:
    def test_tampered_org_name_raises(self, tmp_path):
        payload = make_license_payload()
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)

        # Tamper: change org_name after signing
        data = json.loads(Path(lic_path).read_text())
        data["org_name"] = "Evil Corp"
        Path(lic_path).write_text(json.dumps(data))

        with pytest.raises(LicenseTamperedError):
            validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)

    def test_tampered_plan_raises(self, tmp_path):
        payload = make_license_payload(plan="FREE")
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)

        data = json.loads(Path(lic_path).read_text())
        data["plan"] = "TEAM"
        Path(lic_path).write_text(json.dumps(data))

        with pytest.raises(LicenseTamperedError):
            validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)

    def test_wrong_signature_value_raises(self, tmp_path):
        payload = make_license_payload()
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)

        data = json.loads(Path(lic_path).read_text())
        data["signature"] = (
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        )
        Path(lic_path).write_text(json.dumps(data))

        with pytest.raises(LicenseTamperedError):
            validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)

    def test_wrong_public_key_raises(self, tmp_path):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

        # Generate a different key pair
        other_private = Ed25519PrivateKey.generate()
        other_pub_bytes = other_private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        other_pub_path = str(tmp_path / "other.pub")
        Path(other_pub_path).write_bytes(other_pub_bytes)

        payload = make_license_payload()
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)

        with pytest.raises(LicenseTamperedError):
            validate_license_file(lic_path, public_key_path=other_pub_path)


class TestExpiredLicense:
    def test_expired_license_raises(self, tmp_path):
        payload = make_license_payload(expires_days=-1)  # expired yesterday
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)

        with pytest.raises(LicenseExpiredError):
            validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)

    def test_expired_error_message_contains_date(self, tmp_path):
        payload = make_license_payload(expires_days=-10)
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)

        with pytest.raises(LicenseExpiredError, match="expired"):
            validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)

    def test_not_expired_on_exact_expiry_second(self, tmp_path):
        """License valid right up until expiry."""
        payload = make_license_payload()
        lic_path = str(tmp_path / "license.json")
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, lic_path)
        # Pass a 'now' that is clearly before expiry
        past = datetime.now(tz=UTC) - timedelta(days=1)
        result = validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH, now=past)
        assert result is not None


class TestMissingFile:
    def test_missing_file_raises_file_not_found(self, tmp_path):
        with pytest.raises(FileNotFoundError, match="not found"):
            validate_license_file(
                str(tmp_path / "nonexistent.json"),
                public_key_path=_DEV_PUBLIC_KEY_PATH,
            )


class TestMalformedLicense:
    def test_invalid_json_raises_license_error(self, tmp_path):
        lic_path = str(tmp_path / "license.json")
        Path(lic_path).write_text("not json {{{", encoding="utf-8")

        with pytest.raises(LicenseError):
            validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)

    def test_missing_required_field_raises_license_error(self, tmp_path):
        payload = make_license_payload()
        del payload["plan"]  # Remove required field
        lic_path = str(tmp_path / "license.json")
        sig = sign_license_payload(payload, _DEV_PRIVATE_KEY_BYTES)
        Path(lic_path).write_text(json.dumps({**payload, "signature": sig}))

        with pytest.raises(LicenseError, match="missing fields"):
            validate_license_file(lic_path, public_key_path=_DEV_PUBLIC_KEY_PATH)


class TestValidateProductionConfigAirGap:
    def test_air_gap_without_license_file_passes_config_check(self, tmp_path):
        """Missing license file no longer blocks startup — AGPL self-hosters run without one."""
        from src.core.config import Settings

        s = Settings(
            app_env="production",
            deployment_mode="air-gap",
            github_org="acme",
            allowed_origins=["https://app.example.com"],
            sql_database_url="postgresql://prod",
            feedback_hmac_secret="x" * 32,
            license_file_path=str(tmp_path / "nonexistent.json"),
        )
        # Should NOT raise — license file is optional in the AGPL build
        s.validate_production_config()

    def test_air_gap_with_license_file_passes_config_check(self, tmp_path):
        lic_path = tmp_path / "license.json"
        payload = make_license_payload()
        write_license_file(payload, _DEV_PRIVATE_KEY_BYTES, str(lic_path))

        from src.core.config import Settings

        s = Settings(
            app_env="production",
            deployment_mode="air-gap",
            github_org="acme",
            allowed_origins=["https://app.example.com"],
            sql_database_url="postgresql://prod",
            feedback_hmac_secret="x" * 32,
            license_file_path=str(lic_path),
        )
        s.validate_production_config()  # Must not raise

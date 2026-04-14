# SPDX-License-Identifier: AGPL-3.0-or-later
"""HYB-07: Offline license file validation for air-gap deployments.

The license file is a JSON document signed with Ed25519. The public key is
bundled in the Docker image at src/core/keys/license_verify.pub (32 raw bytes).
In production the key pair is managed by PlatformCloud (HYB-08); the key in this
repo is the dev/test key only.

License file format:
    {
        "license_key_id": "dg_lic_...",
        "org_name": "Acme Corp",
        "plan": "TEAM",
        "expires_at": "2027-03-16T00:00:00Z",
        "issued_at": "2026-03-16T00:00:00Z",
        "signature": "<base64url Ed25519 signature over canonical payload>"
    }

The signature covers the canonical payload: JSON with keys sorted, no whitespace,
excluding the "signature" field itself.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

from src.core.logging import get_logger

logger = get_logger(__name__)

# Path to the bundled Ed25519 public key (32 raw bytes)
_BUNDLED_KEY_PATH = Path(__file__).parent / "keys" / "license_verify.pub"


class LicenseError(Exception):
    """Base class for license validation errors."""


class LicenseTamperedError(LicenseError):
    """License file signature is invalid or the payload was modified."""


class LicenseExpiredError(LicenseError):
    """License expiry date has passed."""


class LicensePayload:
    """Parsed and validated license payload."""

    def __init__(
        self,
        license_key_id: str,
        org_name: str,
        plan: str,
        expires_at: datetime,
        issued_at: datetime,
    ) -> None:
        self.license_key_id = license_key_id
        self.org_name = org_name
        self.plan = plan
        self.expires_at = expires_at
        self.issued_at = issued_at

    def __repr__(self) -> str:
        return (
            f"LicensePayload(org={self.org_name!r}, plan={self.plan!r}, "
            f"expires={self.expires_at.date()})"
        )


def validate_license_file(
    path: str,
    *,
    public_key_path: str | None = None,
    now: datetime | None = None,
) -> LicensePayload:
    """Read, verify, and parse an offline license file.

    Args:
        path:             Path to the license JSON file.
        public_key_path:  Override the bundled public key path (used in tests).
        now:              Override "current time" for expiry checks (used in tests).

    Returns:
        LicensePayload with validated fields.

    Raises:
        FileNotFoundError:    License file not found at *path*.
        LicenseError:         Malformed JSON or missing required fields.
        LicenseTamperedError: Ed25519 signature verification failed.
        LicenseExpiredError:  License has expired.
    """
    # Load the license file
    license_path = Path(path)
    if not license_path.exists():
        raise FileNotFoundError(
            f"HYB-07: License file not found at {path!r}. "
            "Set LICENSE_FILE_PATH to the correct location."
        )

    try:
        raw = json.loads(license_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LicenseError(f"HYB-07: License file is not valid JSON: {exc}") from exc

    # Extract and validate required fields
    required = {"license_key_id", "org_name", "plan", "expires_at", "issued_at", "signature"}
    missing = required - set(raw.keys())
    if missing:
        raise LicenseError(f"HYB-07: License file missing fields: {missing}")

    # Verify Ed25519 signature
    key_path = Path(public_key_path) if public_key_path else _BUNDLED_KEY_PATH
    if not key_path.exists():
        raise LicenseError(f"HYB-07: Public key not found at {key_path}")

    pub_key_bytes = key_path.read_bytes()
    if len(pub_key_bytes) != 32:
        raise LicenseError(
            f"HYB-07: Public key must be 32 raw bytes; got {len(pub_key_bytes)}"
        )

    public_key = Ed25519PublicKey.from_public_bytes(pub_key_bytes)

    # Canonical payload: sorted keys, no whitespace, excluding "signature"
    payload_dict = {k: v for k, v in raw.items() if k != "signature"}
    canonical = json.dumps(payload_dict, sort_keys=True, separators=(",", ":"))

    try:
        sig_bytes = base64.urlsafe_b64decode(raw["signature"] + "==")
        public_key.verify(sig_bytes, canonical.encode("utf-8"))
    except (InvalidSignature, Exception) as exc:
        raise LicenseTamperedError(
            "HYB-07: License file signature is invalid. "
            "The file may have been modified or signed with a different key."
        ) from exc

    # Parse expiry
    try:
        expires_at = datetime.fromisoformat(raw["expires_at"].replace("Z", "+00:00"))
        issued_at = datetime.fromisoformat(raw["issued_at"].replace("Z", "+00:00"))
    except ValueError as exc:
        raise LicenseError(f"HYB-07: Invalid date format in license: {exc}") from exc

    # Check expiry
    current_time = now or datetime.now(tz=timezone.utc)
    if current_time > expires_at:
        raise LicenseExpiredError(
            f"HYB-07: License expired on {expires_at.date()}. "
            "Contact your DocuGardener account manager to renew."
        )

    payload = LicensePayload(
        license_key_id=raw["license_key_id"],
        org_name=raw["org_name"],
        plan=raw["plan"],
        expires_at=expires_at,
        issued_at=issued_at,
    )
    logger.info(
        "HYB-07: License validated",
        org=payload.org_name,
        plan=payload.plan,
        expires=str(payload.expires_at.date()),
    )
    return payload


def sign_license_payload(payload_dict: dict, private_key_bytes: bytes) -> str:
    """Sign a license payload with an Ed25519 private key.

    Used in tests and by PlatformCloud (HYB-08) to generate license files.
    Returns the base64url-encoded signature (without padding).
    """
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    canonical = json.dumps(
        {k: v for k, v in payload_dict.items() if k != "signature"},
        sort_keys=True,
        separators=(",", ":"),
    )
    private_key = Ed25519PrivateKey.from_private_bytes(private_key_bytes)
    sig = private_key.sign(canonical.encode("utf-8"))
    return base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")

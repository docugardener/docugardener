# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Unit tests for _extract_email_from_assertion() NameID fallback chain.
Covers Okta (emailAddress NameID), Entra ID (persistent NameID), and error paths.
"""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from src.api.saml import (
    _EMAIL_NAMEID_FORMAT,
    _PERSISTENT_NAMEID_FORMAT,
    _UNSPECIFIED_NAMEID_FORMAT,
    _extract_email_from_assertion,
)

ENTRA_EMAIL_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
ENTRA_UPN_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"


def _mock_auth(
    nameid: str,
    nameid_format: str,
    attributes: dict | None = None,
) -> MagicMock:
    auth = MagicMock()
    auth.get_nameid.return_value = nameid
    auth.get_nameid_format.return_value = nameid_format
    auth.get_attributes.return_value = attributes or {}
    return auth


class TestEmailAddressNameId:
    def test_emailaddress_nameid_used_directly(self):
        """Standard Okta assertion — emailAddress NameID → returned as-is."""
        auth = _mock_auth(
            nameid="alice@example.com",
            nameid_format=_EMAIL_NAMEID_FORMAT,
        )
        assert _extract_email_from_assertion(auth, None) == "alice@example.com"

    def test_emailaddress_nameid_tenant_attr_ignored(self):
        """When NameID format is emailAddress, tenant attribute setting is irrelevant."""
        auth = _mock_auth(
            nameid="alice@example.com",
            nameid_format=_EMAIL_NAMEID_FORMAT,
            attributes={"email": ["other@example.com"]},
        )
        assert _extract_email_from_assertion(auth, "email") == "alice@example.com"


class TestPersistentNameIdEntra:
    def test_persistent_nameid_email_from_entra_claim_uri(self):
        """Entra assertion: persistent NameID + full claim URI → resolved via attribute."""
        auth = _mock_auth(
            nameid="00000000-0000-0000-0000-000000000001",
            nameid_format=_PERSISTENT_NAMEID_FORMAT,
            attributes={ENTRA_EMAIL_CLAIM: ["bob@corp.com"]},
        )
        assert _extract_email_from_assertion(auth, None) == "bob@corp.com"

    def test_persistent_nameid_email_from_short_attribute(self):
        """Persistent NameID + short 'email' attribute → resolved."""
        auth = _mock_auth(
            nameid="00000000-0000-0000-0000-000000000002",
            nameid_format=_PERSISTENT_NAMEID_FORMAT,
            attributes={"email": ["carol@corp.com"]},
        )
        assert _extract_email_from_assertion(auth, None) == "carol@corp.com"

    def test_persistent_nameid_upn_fallback(self):
        """Persistent NameID, no email attr, UPN looks like email → use UPN."""
        auth = _mock_auth(
            nameid="00000000-0000-0000-0000-000000000003",
            nameid_format=_PERSISTENT_NAMEID_FORMAT,
            attributes={ENTRA_UPN_CLAIM: ["dave@corp.onmicrosoft.com"]},
        )
        assert _extract_email_from_assertion(auth, None) == "dave@corp.onmicrosoft.com"

    def test_persistent_nameid_tenant_attr_override_wins(self):
        """Tenant-configured attribute name takes priority when present."""
        auth = _mock_auth(
            nameid="uuid-here",
            nameid_format=_PERSISTENT_NAMEID_FORMAT,
            attributes={
                "customEmailAttr": ["eve@acme.com"],
                ENTRA_EMAIL_CLAIM: ["other@acme.com"],
            },
        )
        assert _extract_email_from_assertion(auth, "customEmailAttr") == "eve@acme.com"

    def test_persistent_nameid_no_email_raises(self):
        """Persistent NameID with no email anywhere → HTTPException 422 with message."""
        auth = _mock_auth(
            nameid="00000000-0000-0000-0000-000000000004",
            nameid_format=_PERSISTENT_NAMEID_FORMAT,
            attributes={"groups": ["admin"]},
        )
        with pytest.raises(HTTPException) as exc_info:
            _extract_email_from_assertion(auth, None)
        assert exc_info.value.status_code == 422
        assert "Cannot resolve email" in exc_info.value.detail
        assert "persistent" in exc_info.value.detail


class TestUnspecifiedNameId:
    def test_unspecified_nameid_email_from_attribute(self):
        """unspecified NameID format + email attribute → resolved."""
        auth = _mock_auth(
            nameid="frank-uuid",
            nameid_format=_UNSPECIFIED_NAMEID_FORMAT,
            attributes={"email": ["frank@example.org"]},
        )
        assert _extract_email_from_assertion(auth, "email") == "frank@example.org"

    def test_unspecified_nameid_looks_like_email(self):
        """Some IdPs send email directly as unspecified NameID — accept it."""
        auth = _mock_auth(
            nameid="grace@example.org",
            nameid_format=_UNSPECIFIED_NAMEID_FORMAT,
        )
        assert _extract_email_from_assertion(auth, None) == "grace@example.org"

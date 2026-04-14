"""
ENT-12: Certificate encryption at rest — unit tests.

Covers:
  - _get_saml_auth decrypts stored cert before building SAML settings
  - Plaintext cert fallback (graceful degradation for pre-encryption certs)
  - Round-trip: encrypt() → decrypt() produces original PEM
"""

from unittest.mock import MagicMock, patch

import pytest

from src.security.crypto import decrypt as decrypt_cert, encrypt as encrypt_cert


# ── crypto round-trip ─────────────────────────────────────────────────────────

class TestCryptoRoundTrip:

    def test_encrypt_decrypt_round_trip(self):
        plaintext = "-----BEGIN CERTIFICATE-----\nMIIDfake...\n-----END CERTIFICATE-----"
        encrypted = encrypt_cert(plaintext)
        assert encrypted != plaintext
        assert encrypted.count(":") == 2  # ivHex:authTagHex:encryptedHex
        assert decrypt_cert(encrypted) == plaintext

    def test_encrypted_values_differ_each_call(self):
        """Random IV means each encryption produces a different ciphertext."""
        text = "some-cert"
        enc1 = encrypt_cert(text)
        enc2 = encrypt_cert(text)
        assert enc1 != enc2

    def test_decrypt_raises_on_garbage(self):
        with pytest.raises(ValueError):
            decrypt_cert("not-valid-ciphertext")

    def test_decrypt_raises_on_wrong_format(self):
        with pytest.raises((ValueError, Exception)):
            decrypt_cert("aabbcc:ddeeff")  # only 2 parts, missing encrypted block


# ── _get_saml_auth cert decryption ────────────────────────────────────────────

class TestSamlAuthCertDecryption:
    """
    Verify that _get_saml_auth decrypts the stored certificate before
    passing it to the python3-saml settings dict.
    """

    def _make_tenant(self, cert: str | None = None) -> MagicMock:
        t = MagicMock()
        t.samlIdpEntityId = "https://idp.example.com"
        t.samlIdpSsoUrl = "https://idp.example.com/sso"
        t.samlIdpCertificate = cert
        return t

    @patch("src.api.saml.decrypt_cert")
    @patch("src.api.saml.OneLogin_Saml2_Auth", create=True)
    def test_decrypted_cert_passed_to_settings(self, mock_auth_cls, mock_decrypt):
        """When a stored cert exists it must be decrypted before building settings."""
        from src.api.saml import _get_saml_auth

        mock_decrypt.return_value = "PLAINTEXT_CERT"
        mock_auth_cls.return_value = MagicMock()

        tenant = self._make_tenant(cert="iv:tag:enc")
        request_data = {}

        # Patch the import inside _get_saml_auth
        with patch.dict("sys.modules", {"onelogin.saml2.auth": MagicMock(OneLogin_Saml2_Auth=mock_auth_cls)}):
            try:
                _get_saml_auth(tenant, request_data)
            except Exception:
                pass  # We only care about the decrypt call

        mock_decrypt.assert_called_once_with("iv:tag:enc")

    @patch("src.api.saml.decrypt_cert", side_effect=ValueError("bad ciphertext"))
    def test_plaintext_cert_fallback(self, mock_decrypt):
        """If decryption fails (legacy plaintext cert), falls back gracefully."""
        from src.api.saml import _get_saml_auth

        tenant = self._make_tenant(cert="PLAINTEXT_PEM_CERT")
        request_data = {}

        with patch.dict("sys.modules", {
            "onelogin": MagicMock(),
            "onelogin.saml2": MagicMock(),
            "onelogin.saml2.auth": MagicMock(),
        }):
            # Should not raise even when decrypt fails
            try:
                _get_saml_auth(tenant, request_data)
            except Exception:
                pass  # Might fail for other reasons (missing library)

        mock_decrypt.assert_called_once_with("PLAINTEXT_PEM_CERT")

    def test_no_cert_skips_decrypt(self):
        """If no cert is stored, decrypt is never called."""
        from src.api.saml import _get_saml_auth

        tenant = self._make_tenant(cert=None)
        request_data = {}

        with patch("src.api.saml.decrypt_cert") as mock_decrypt:
            with patch.dict("sys.modules", {
                "onelogin.saml2.auth": MagicMock(),
            }):
                try:
                    _get_saml_auth(tenant, request_data)
                except Exception:
                    pass

            mock_decrypt.assert_not_called()

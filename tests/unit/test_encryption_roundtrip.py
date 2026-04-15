# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Encrypt / decrypt round-trip tests for src/security/encryption.py.

These tests exercise the actual AES-256-GCM code paths (encrypt_credential
and decrypt_credential) without any mocks, using a valid hex-encoded key.
"""

from unittest.mock import patch

import pytest

import src.security.encryption as enc

# 64 hex chars = 32 bytes = valid AES-256 key
_VALID_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"


def _settings_with_key(key=_VALID_KEY):
    """Return a mock settings object that supplies the given key."""
    from unittest.mock import MagicMock

    s = MagicMock()
    s.encryption_key = key
    return s


class TestEncryptDecryptRoundtrip:
    def test_roundtrip_short_string(self):
        """Encrypt then decrypt a short string returns the original."""
        with patch.object(enc, "settings", _settings_with_key()):
            cipher = enc.encrypt_credential("hello world")
            result = enc.decrypt_credential(cipher)
        assert result == "hello world"

    def test_roundtrip_long_string(self):
        """Encrypt then decrypt a longer credential."""
        plaintext = "sk-ant-api03-" + "x" * 80
        with patch.object(enc, "settings", _settings_with_key()):
            cipher = enc.encrypt_credential(plaintext)
            result = enc.decrypt_credential(cipher)
        assert result == plaintext

    def test_roundtrip_empty_string(self):
        """Encrypt then decrypt an empty string."""
        with patch.object(enc, "settings", _settings_with_key()):
            cipher = enc.encrypt_credential("")
            result = enc.decrypt_credential(cipher)
        assert result == ""

    def test_roundtrip_unicode(self):
        """Encrypt then decrypt a string with non-ASCII characters."""
        plaintext = "pässwörd-日本語-🔑"
        with patch.object(enc, "settings", _settings_with_key()):
            cipher = enc.encrypt_credential(plaintext)
            result = enc.decrypt_credential(cipher)
        assert result == plaintext

    def test_encrypt_produces_three_part_format(self):
        """encrypt_credential output has format iv:authTag:content."""
        with patch.object(enc, "settings", _settings_with_key()):
            cipher = enc.encrypt_credential("test")
        parts = cipher.split(":")
        assert len(parts) == 3
        # All parts should be non-empty hex strings
        for part in parts:
            assert len(part) > 0
            int(part, 16)  # must be valid hex

    def test_each_encryption_produces_different_ciphertext(self):
        """Two encryptions of the same plaintext produce different ciphertexts (random IV)."""
        with patch.object(enc, "settings", _settings_with_key()):
            c1 = enc.encrypt_credential("secret")
            c2 = enc.encrypt_credential("secret")
        assert c1 != c2

    def test_decrypt_wrong_format_raises(self):
        """decrypt_credential with wrong number of parts raises ValueError."""
        with patch.object(enc, "settings", _settings_with_key()):
            with pytest.raises(ValueError, match="Invalid cipher text format"):
                enc.decrypt_credential("onlytwoparts:here")

    def test_decrypt_invalid_hex_raises(self):
        """decrypt_credential with non-hex content raises ValueError."""
        with patch.object(enc, "settings", _settings_with_key()):
            with pytest.raises(ValueError):
                enc.decrypt_credential("notvalidhex:nothex:nothex")

    def test_non_hex_key_falls_back_to_sha256(self):
        """A plain-text (non-hex) key uses the SHA-256 fallback path."""
        with patch.object(enc, "settings", _settings_with_key("plain-text-key")):
            cipher = enc.encrypt_credential("data")
            result = enc.decrypt_credential(cipher)
        assert result == "data"

"""
SEC-06: Encryption key startup guard — unit tests.

Covers:
  1. get_secret_key() raises RuntimeError in production when ENCRYPTION_KEY absent
  2. get_secret_key() allows dev fallback when APP_ENV=development (default)
  3. get_secret_key() raises on malformed hex key (any env)
  4. get_secret_key() raises on valid hex but wrong byte length (any env)
  5. get_secret_key() returns correct 32 bytes when valid key is set
  6. lifespan startup validation raises in production without key
  7. lifespan startup validation raises in production with malformed key
  8. src/security/encryption.py already raises — regression guard
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── get_secret_key() (src/security/crypto.py) ─────────────────────────────────


class TestGetSecretKey:
    def _reload_and_get(self, env_overrides: dict):
        """Re-import get_secret_key with patched env."""
        import importlib

        import src.security.crypto as crypto_mod

        with patch.dict(os.environ, env_overrides, clear=False):
            # Reload to pick up any module-level state (none here — function reads env at call time)
            importlib.reload(crypto_mod)
            return crypto_mod.get_secret_key

    def test_raises_in_production_without_key(self):
        """Production + no ENCRYPTION_KEY → RuntimeError."""
        env = {"APP_ENV": "production"}
        env_without_key = {k: v for k, v in os.environ.items() if k != "ENCRYPTION_KEY"}
        env_without_key["APP_ENV"] = "production"

        with patch.dict(os.environ, env_without_key, clear=True):
            import importlib

            import src.security.crypto as m

            importlib.reload(m)
            with pytest.raises(RuntimeError, match="ENCRYPTION_KEY is required"):
                m.get_secret_key()

    def test_raises_in_staging_without_key(self):
        """staging (non-development) + no ENCRYPTION_KEY → RuntimeError."""
        env_without_key = {k: v for k, v in os.environ.items() if k != "ENCRYPTION_KEY"}
        env_without_key["APP_ENV"] = "staging"

        with patch.dict(os.environ, env_without_key, clear=True):
            import importlib

            import src.security.crypto as m

            importlib.reload(m)
            with pytest.raises(RuntimeError, match="ENCRYPTION_KEY is required"):
                m.get_secret_key()

    def test_fallback_allowed_in_development(self):
        """development + no ENCRYPTION_KEY → returns 32-byte fallback (no error)."""
        env_without_key = {k: v for k, v in os.environ.items() if k != "ENCRYPTION_KEY"}
        env_without_key["APP_ENV"] = "development"

        with patch.dict(os.environ, env_without_key, clear=True):
            import importlib

            import src.security.crypto as m

            importlib.reload(m)
            key = m.get_secret_key()
            assert isinstance(key, bytes)
            assert len(key) == 32

    def test_raises_on_non_hex_key(self):
        """ENCRYPTION_KEY with non-hex chars → RuntimeError regardless of env."""
        with patch.dict(
            os.environ, {"ENCRYPTION_KEY": "this-is-not-hex-!!!!", "APP_ENV": "development"}
        ):
            import importlib

            import src.security.crypto as m

            importlib.reload(m)
            with pytest.raises(RuntimeError, match="malformed"):
                m.get_secret_key()

    def test_raises_on_short_hex_key(self):
        """ENCRYPTION_KEY with only 4 hex chars (2 bytes) → RuntimeError."""
        with patch.dict(os.environ, {"ENCRYPTION_KEY": "aabb", "APP_ENV": "development"}):
            import importlib

            import src.security.crypto as m

            importlib.reload(m)
            with pytest.raises(RuntimeError, match="32 bytes"):
                m.get_secret_key()

    def test_returns_32_bytes_with_valid_key(self):
        """Valid 64-hex-char key → returns exactly 32 bytes."""
        valid_key = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
        with patch.dict(os.environ, {"ENCRYPTION_KEY": valid_key, "APP_ENV": "production"}):
            import importlib

            import src.security.crypto as m

            importlib.reload(m)
            key = m.get_secret_key()
            assert isinstance(key, bytes)
            assert len(key) == 32
            assert key == bytes.fromhex(valid_key)


# ── src/security/encryption.py — regression guard ────────────────────────────


class TestEncryptionModuleGuard:
    def test_encryption_module_raises_without_key(self):
        """src/security/encryption.py already raises ValueError when key absent — regression."""
        from unittest.mock import patch as _patch

        import src.security.encryption as enc_mod

        with _patch.object(enc_mod, "settings") as mock_settings:
            mock_settings.encryption_key = None
            with pytest.raises(ValueError, match="ENCRYPTION_KEY"):
                enc_mod.decrypt_credential("aa:bb:cc")

    def test_encrypt_credential_raises_without_key(self):
        """encrypt_credential raises when key is absent."""
        import src.security.encryption as enc_mod

        with patch.object(enc_mod, "settings") as mock_settings:
            mock_settings.encryption_key = None
            with pytest.raises(ValueError, match="ENCRYPTION_KEY"):
                enc_mod.encrypt_credential("plaintext")


# ── main.py lifespan startup validation ───────────────────────────────────────


class TestLifespanStartupValidation:
    def _make_mock_settings(self, app_env: str, encryption_key=None):
        s = MagicMock()
        s.app_env = app_env
        s.encryption_key = encryption_key
        s.app_name = "DocuGardener"
        s.version = "test"
        s.debug = False
        s.weaviate_url = "http://localhost:8080"
        return s

    @pytest.mark.asyncio
    async def test_lifespan_raises_in_production_without_key(self):
        """lifespan startup raises RuntimeError when production + no ENCRYPTION_KEY."""
        from fastapi import FastAPI

        from src.main import lifespan

        mock_settings = self._make_mock_settings("production", encryption_key=None)

        with patch("src.main.settings", mock_settings):
            app = FastAPI()
            with pytest.raises(RuntimeError, match="ENCRYPTION_KEY is required"):
                async with lifespan(app):
                    pass  # pragma: no cover

    @pytest.mark.asyncio
    async def test_lifespan_raises_in_production_with_malformed_key(self):
        """lifespan startup raises RuntimeError when key is not valid hex."""
        from fastapi import FastAPI

        from src.main import lifespan

        mock_settings = self._make_mock_settings("production", encryption_key="not-hex-!!!")

        with patch("src.main.settings", mock_settings):
            app = FastAPI()
            with pytest.raises(RuntimeError, match="ENCRYPTION_KEY is invalid"):
                async with lifespan(app):
                    pass  # pragma: no cover

    @pytest.mark.asyncio
    async def test_lifespan_passes_in_development_without_key(self):
        """lifespan startup does NOT raise in development with no ENCRYPTION_KEY."""
        from fastapi import FastAPI

        from src.main import lifespan

        valid_key = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
        mock_settings = self._make_mock_settings("development", encryption_key=None)
        mock_settings.github_app_id = None

        with patch("src.main.settings", mock_settings):
            with patch("src.storage.weaviate_db.WeaviateDB") as mock_wv_cls:
                mock_wv = AsyncMock()
                mock_wv_cls.return_value = mock_wv
                app = FastAPI()
                # Should not raise — development bypasses the key requirement
                try:
                    async with lifespan(app):
                        pass
                except RuntimeError as exc:
                    pytest.fail(f"lifespan raised unexpectedly in development: {exc}")

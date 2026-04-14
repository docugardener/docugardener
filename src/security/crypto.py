# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Cross-platform AES-256-GCM encryption utilities.

These functions are strictly compatible with the Node.js `crypto`
implementation found in `web/lib/encryption.ts`.
"""

import os
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def get_secret_key() -> bytes:
    """
    Get the 32-byte secret key for AES-256-GCM.
    Mirrors the fallback logic in Node.js.

    SEC-06: In non-development environments the key is required.
    A missing or malformed key raises RuntimeError at call time rather
    than silently falling back to a known static value.
    """
    key = os.getenv("ENCRYPTION_KEY")
    if key:
        try:
            key_bytes = bytes.fromhex(key)
        except ValueError:
            raise RuntimeError(
                "ENCRYPTION_KEY is malformed — must be 64 hex characters (32 bytes). "
                "Generate with: openssl rand -hex 32"
            )
        if len(key_bytes) != 32:
            raise RuntimeError(
                f"ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars), got {len(key_bytes)}"
            )
        return key_bytes

    # No key set — only permitted in development
    app_env = os.getenv("APP_ENV", "development")
    if app_env != "development":
        raise RuntimeError(
            "ENCRYPTION_KEY is required in non-development environments. "
            "Generate with: openssl rand -hex 32"
        )
    # Development fallback — matches Node.js web/lib/encryption.ts
    return hashlib.sha256(b"local-dev-secret-key-12345").digest()

def decrypt(text: str) -> str:
    """
    Decrypts a string that was encrypted by Node.js web/lib/encryption.ts.
    
    Args:
        text: String in the format "ivHex:authTagHex:encryptedHex"
        
    Returns:
        The decrypted plaintext string.
    """
    try:
        iv_hex, auth_tag_hex, encrypted_hex = text.split(':')
        iv = bytes.fromhex(iv_hex)
        auth_tag = bytes.fromhex(auth_tag_hex)
        encrypted = bytes.fromhex(encrypted_hex)
        
        # In the Python cryptography library, the tag is appended to the ciphertext
        aesgcm = AESGCM(get_secret_key())
        decrypted = aesgcm.decrypt(iv, encrypted + auth_tag, None)
        return decrypted.decode('utf-8')
    except Exception as e:
        raise ValueError(f"Failed to decrypt string: {e}")

def encrypt(text: str) -> str:
    """
    Encrypts a string in a format compatible with Node.js web/lib/encryption.ts.
    
    Args:
        text: Plaintext string to encrypt.
        
    Returns:
        String in the format "ivHex:authTagHex:encryptedHex"
    """
    import os as sys_os
    
    iv = sys_os.urandom(12)
    aesgcm = AESGCM(get_secret_key())
    
    # Python cryptography appends the 16-byte auth tag to the end of the ciphertext
    ciphertext_and_tag = aesgcm.encrypt(iv, text.encode('utf-8'), None)
    
    encrypted = ciphertext_and_tag[:-16]
    auth_tag = ciphertext_and_tag[-16:]
    
    return f"{iv.hex()}:{auth_tag.hex()}:{encrypted.hex()}"

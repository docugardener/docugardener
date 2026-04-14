# SPDX-License-Identifier: AGPL-3.0-or-later
import binascii
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from src.core.config import settings

def decrypt_credential(cipher_text: str) -> str:
    """
    Decrypts a credential stored in the format: iv:authTag:encrypted_content
    Uses AES-256-GCM with the shared ENCRYPTION_KEY.
    """
    if not settings.encryption_key:
        raise ValueError("ENCRYPTION_KEY is not set in environment settings")

    # Generate key from hex string or use fallback for dev
    # Same logic as Node.js: Buffer.from(key, 'hex')
    try:
        key = binascii.unhexlify(settings.encryption_key)
    except Exception:
        # Fallback if key is not hex (or for local dev compatibility if set to a plain string)
        # In production this MUST correspond to the Node.js Buffer
        import hashlib
        key = hashlib.sha256(settings.encryption_key.encode()).digest()

    try:
        parts = cipher_text.split(":")
        if len(parts) != 3:
            raise ValueError("Invalid cipher text format. Expected iv:authTag:content")
            
        iv_hex, auth_tag_hex, encrypted_content_hex = parts
        
        iv = binascii.unhexlify(iv_hex)
        auth_tag = binascii.unhexlify(auth_tag_hex)
        encrypted_content = binascii.unhexlify(encrypted_content_hex)
        
        # Construct Cipher
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(iv, auth_tag),
        )
        
        decryptor = cipher.decryptor()
        decrypted_data = decryptor.update(encrypted_content) + decryptor.finalize()
        
        return decrypted_data.decode("utf-8")
        
    except Exception as e:
        # Avoid leaking details in logs, but raise specific error
        raise ValueError(f"Decryption failed: {str(e)}")

def encrypt_credential(plain_text: str) -> str:
    """
    Encrypts a credential using AES-256-GCM.
    Returns format: iv:authTag:encrypted_content
    """
    if not settings.encryption_key:
        raise ValueError("ENCRYPTION_KEY is not set in environment settings")

    try:
        key = binascii.unhexlify(settings.encryption_key)
    except Exception:
        import hashlib
        key = hashlib.sha256(settings.encryption_key.encode()).digest()

    iv = os.urandom(12) # GCM recommended IV size
    
    cipher = Cipher(
        algorithms.AES(key),
        modes.GCM(iv),
    )
    
    encryptor = cipher.encryptor()
    encrypted_content = encryptor.update(plain_text.encode("utf-8")) + encryptor.finalize()
    
    return f"{binascii.hexlify(iv).decode()}:{binascii.hexlify(encryptor.tag).decode()}:{binascii.hexlify(encrypted_content).decode()}"

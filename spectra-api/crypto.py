"""Symmetric encryption for secrets at rest (ClickHouse passwords, etc.).

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the cryptography library.
The encryption key is derived from the ENCRYPTION_KEY env var.
If no key is set, falls back to a deterministic dev key (NOT safe for production).
"""
import os
import base64
import hashlib
from cryptography.fernet import Fernet


def _get_fernet() -> Fernet:
    raw_key = os.getenv("ENCRYPTION_KEY", "")
    if not raw_key:
        # Dev fallback — predictable key so local SQLite data stays readable across restarts.
        # In production, ENCRYPTION_KEY must be set to a random 32+ char secret.
        raw_key = "spectra-dev-encryption-key-CHANGE-ME"
    # Derive a valid 32-byte Fernet key from the raw secret
    derived = hashlib.sha256(raw_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt(plaintext: str) -> str:
    """Encrypt a string, return base64-encoded ciphertext."""
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext back to plaintext."""
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except Exception:
        # If decryption fails, the value is likely stored as plaintext (pre-migration).
        # Return as-is so the app doesn't crash — it will be re-encrypted on next save.
        return ciphertext

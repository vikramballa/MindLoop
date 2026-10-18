"""Field-level encryption for sensitive free text (journal notes, messages, transcripts, memory)."""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


class ConfigurationError(RuntimeError):
    pass


@lru_cache
def _fernet() -> Fernet:
    s = get_settings()
    key = s.encryption_key
    if not key:
        if s.is_production:
            raise ConfigurationError("ENCRYPTION_KEY must be set in production")
        # Deterministic dev/test key derived from the JWT secret so local data stays readable.
        key = base64.urlsafe_b64encode(hashlib.sha256(s.jwt_secret.encode()).digest()).decode()
    return Fernet(key.encode())


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ConfigurationError("Unable to decrypt stored data: ENCRYPTION_KEY changed?") from exc

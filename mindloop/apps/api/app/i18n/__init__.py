"""User-facing text from the backend lives in `locales/<lang>.json`.

Missing languages and keys fall back to English, so a new locale can be filled in gradually.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_DIR = Path(__file__).parent / "locales"
DEFAULT_LANGUAGE = "en"
SUPPORTED_LANGUAGES = ("en", "hi", "te", "ta", "kn", "ml", "mr", "bn")


@lru_cache
def _catalog(lang: str) -> dict[str, Any]:
    path = _DIR / f"{lang}.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _lookup(catalog: dict[str, Any], key: str) -> Any:
    node: Any = catalog
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def base_language(lang: str | None) -> str:
    return (lang or DEFAULT_LANGUAGE).split("-")[0].lower()


def t(key: str, lang: str | None = None, **params: Any) -> str:
    value = _lookup(_catalog(base_language(lang)), key)
    if value is None:
        value = _lookup(_catalog(DEFAULT_LANGUAGE), key)
    if value is None:
        raise KeyError(f"Missing i18n key: {key}")
    return str(value).format(**params) if params else str(value)


def t_list(key: str, lang: str | None = None) -> list[str]:
    value = _lookup(_catalog(base_language(lang)), key) or _lookup(_catalog(DEFAULT_LANGUAGE), key)
    if not isinstance(value, list):
        raise KeyError(f"Missing i18n list: {key}")
    return [str(v) for v in value]


def has_key(key: str, lang: str | None = None) -> bool:
    return (
        _lookup(_catalog(base_language(lang)), key) is not None or _lookup(_catalog(DEFAULT_LANGUAGE), key) is not None
    )

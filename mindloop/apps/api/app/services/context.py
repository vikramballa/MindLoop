"""Country and language specific presentation settings.

A policy may change wording, formality, spelling and which support services we point to.
It must never change risk assessment, signal extraction or which interventions are allowed,
and it never encodes assumptions about a person's psychology, family or beliefs.
"""

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.i18n import base_language
from app.repositories.system import ContextPolicyRepository

GLOBAL_COUNTRY = "ZZ"


@dataclass(frozen=True)
class ContextPolicy:
    country: str = GLOBAL_COUNTRY
    language: str = "en"
    formality: str = "friendly and respectful"
    spelling_instruction: str = ""
    example_situations: list[str] = field(default_factory=list)
    open_questions: list[str] = field(default_factory=list)
    support_pathway_note: str | None = None
    emergency_number: str | None = None

    @classmethod
    def from_row(cls, country: str, language: str, data: dict[str, Any]) -> "ContextPolicy":
        return cls(
            country=country,
            language=language,
            formality=data.get("formality", cls.formality),
            spelling_instruction=data.get("spelling_instruction", ""),
            example_situations=list(data.get("example_situations", [])),
            open_questions=list(data.get("open_questions", [])),
            support_pathway_note=data.get("support_pathway_note"),
            emergency_number=data.get("emergency_number"),
        )


class ContextPolicyService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = ContextPolicyRepository(db)

    async def resolve(self, country: str | None, language: str | None) -> ContextPolicy:
        """Most specific match wins: (country, lang), (country, en), (global, lang), (global, en)."""
        country = (country or GLOBAL_COUNTRY).upper()
        lang = base_language(language)
        for c, lg in ((country, lang), (country, "en"), (GLOBAL_COUNTRY, lang), (GLOBAL_COUNTRY, "en")):
            row = await self.repo.find(c, lg)
            if row is not None:
                return ContextPolicy.from_row(country, lang, row.data)
        return ContextPolicy(country=country, language=lang)

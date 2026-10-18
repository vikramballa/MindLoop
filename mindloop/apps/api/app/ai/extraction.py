"""Structured signal extraction: one small-model call with a JSON schema, validated by
Pydantic, merged with deterministic rules. Any failure falls back to rules only."""

from dataclasses import dataclass

from pydantic import ValidationError

from app.ai.factory import get_llm, get_router
from app.ai.prompts import extraction_messages
from app.ai.provider import LLMError, ModelTask
from app.ai.rules_extractor import extract_rules
from app.ai.schemas import ExtractionResult
from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.vocab import SCORE_TO_MOOD
from app.safety.output_guard import check_output

log = get_logger(__name__)
_SCHEMA = ExtractionResult.model_json_schema()


@dataclass
class Extraction:
    result: ExtractionResult
    extractor: str  # llm | rules
    model: str | None


def _merge(model_out: ExtractionResult, rules: ExtractionResult) -> ExtractionResult:
    """User-selected chips and rule-derived targets are always kept; the model adds detail."""
    merged = model_out.model_copy()
    merged.topics = list(dict.fromkeys([*rules.topics, *model_out.topics]))[:4]
    merged.targets = list(dict.fromkeys([*model_out.targets, *rules.targets]))[:4]
    if merged.mood is None:
        merged.mood = rules.mood
    return merged


async def extract_signals(
    *, text: str | None, mood: int | None, topics: list[str], stress: int | None, allow_model: bool = True
) -> Extraction:
    rules = extract_rules(text=text, mood=mood, topics=topics, stress=stress)
    if not text or not allow_model or not get_settings().llm_enabled:
        return Extraction(rules, "rules", None)
    model = get_router().model_for(ModelTask.EXTRACTION)
    try:
        raw = await get_llm().generate(
            model=model,
            messages=extraction_messages(text=text, mood_label=SCORE_TO_MOOD.get(mood or 0), topics=topics),
            json_schema=_SCHEMA,
            temperature=0.0,
            max_tokens=300,
        )
        parsed = ExtractionResult.model_validate_json(raw.text)
    except (LLMError, ValidationError, ValueError) as exc:
        log.warning("extraction_fallback", extra={"error_type": type(exc).__name__})
        return Extraction(rules, "rules", None)
    if parsed.reflection and not check_output(parsed.reflection).ok:
        parsed.reflection = None
    return Extraction(_merge(parsed, rules), "llm", model)

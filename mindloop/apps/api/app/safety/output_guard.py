"""Checks every generated reply before the user sees it.

If a generated reply contains diagnosis, dependency, medication or false-confidentiality
language, the reply is discarded and replaced with a reviewed template.
"""

import re
from dataclasses import dataclass, field

_CONDITIONS = (
    r"(?:clinical )?depression|depressive disorder|an? anxiety disorder|bipolar|adhd|ptsd|ocd|"
    r"schizophreni\w*|psychosis|borderline|personality disorder|an? eating disorder|insomnia disorder"
)

_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "diagnosis",
        re.compile(
            rf"\byou (?:have|probably have|might have|may have|are suffering from|suffer from)\s+(?:{_CONDITIONS})\b",
            re.I,
        ),
    ),
    (
        "diagnosis",
        re.compile(r"\byou(?: are|'re)\s+(?:clinically\s+)?(?:depressed|bipolar|psychotic|mentally ill)\b", re.I),
    ),
    (
        "diagnosis",
        re.compile(r"\b(?:i diagnose|my diagnosis|this is a diagnosis|sounds like (?:clinical )?depression)\b", re.I),
    ),
    (
        "dependency",
        re.compile(
            r"\b(?:i(?:'m| am) all you need|only (?:one|person) you need|you only need me|"
            r"you don'?t need (?:a therapist|anyone else|other people|professional help|a doctor))\b",
            re.I,
        ),
    ),
    (
        "medication",
        re.compile(
            r"\b(?:stop|quit|reduce|increase|double|skip)\s+(?:taking\s+)?(?:your\s+)?(?:medication|meds|pills|dose|dosage)\b",
            re.I,
        ),
    ),
    ("medication", re.compile(r"\b\d+\s?(?:mg|milligrams?|mcg)\b", re.I)),
    (
        "false_identity",
        re.compile(r"\bi(?:'m| am) (?:a|your) (?:therapist|psychologist|psychiatrist|doctor|counsell?or)\b", re.I),
    ),
    (
        "confidentiality",
        re.compile(r"\b(?:completely|totally|100%) (?:confidential|private)|no one will ever (?:see|know)\b", re.I),
    ),
    ("over_mirroring", re.compile(r"\bi know exactly how you feel\b", re.I)),
    ("cure_claim", re.compile(r"\b(?:this will (?:fix|cure) you|cure your|guaranteed to (?:help|work))\b", re.I)),
)


@dataclass
class GuardResult:
    ok: bool
    violations: list[str] = field(default_factory=list)


def check_output(text: str) -> GuardResult:
    violations = sorted({name for name, pattern in _RULES if pattern.search(text)})
    return GuardResult(ok=not violations, violations=violations)

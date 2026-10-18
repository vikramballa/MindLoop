"""Rule-based risk classifier.

It runs before any model call and is the only thing that can decide a message is high
risk. It errs on the side of caution: a false positive gently shows support resources,
while a false negative could miss someone in danger. Each rule has a stable id, so safety
events can be audited without storing what the user wrote. Rule changes need review
(see docs/SAFETY.md).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from enum import StrEnum

CLASSIFIER_VERSION = "2026.10.1"


class RiskLevel(StrEnum):
    LOW = "low"
    CONCERNING = "concerning"
    HIGH = "high"

    @property
    def rank(self) -> int:
        return {"low": 0, "concerning": 1, "high": 2}[self.value]


@dataclass(frozen=True)
class Rule:
    id: str
    category: str
    level: RiskLevel
    pattern: re.Pattern[str]
    negatable: bool = True


@dataclass
class SafetyAssessment:
    level: RiskLevel = RiskLevel.LOW
    categories: list[str] = field(default_factory=list)
    matched_rules: list[str] = field(default_factory=list)
    injection_detected: bool = False
    stereotype_request: bool = False
    version: str = CLASSIFIER_VERSION

    @property
    def is_high(self) -> bool:
        return self.level is RiskLevel.HIGH


def _r(rule_id: str, category: str, level: RiskLevel, pattern: str, negatable: bool = True) -> Rule:
    return Rule(rule_id, category, level, re.compile(pattern), negatable)


H, C = RiskLevel.HIGH, RiskLevel.CONCERNING
_ME = r"(?:myself|my self|my own life|my life)"

RULES: tuple[Rule, ...] = (
    # Suicide and self-harm intent (high)
    _r("si_kill_self", "suicide", H, rf"\b(?:kill|killing|end|ending|take|taking)\s+{_ME}\b"),
    _r("si_suicide_word", "suicide", H, r"\b(?:suicide|suicidal|commit suicide)\b"),
    _r("si_want_die", "suicide", H, r"\b(?:want|wanna|going|plan|planning|ready|wish)\s+(?:to\s+)?(?:die|be dead)\b"),
    _r("si_wish_dead", "suicide", H, r"\bwish\s+i\s+(?:was|were|am)\s+(?:dead|not alive|never born|not here)\b"),
    _r(
        "si_not_live",
        "suicide",
        H,
        r"\b(?:do not|dont|no longer)\s+want\s+to\s+(?:live|be alive|exist|wake up|be here anymore)\b",
    ),
    _r("si_end_it", "suicide", H, r"\b(?:end it all|end it tonight|end everything|finish it all)\b"),
    _r("si_better_off", "suicide", H, r"\b(?:better off (?:dead|without me)|no reason to (?:live|be alive))\b"),
    _r(
        "si_method",
        "suicide",
        H,
        r"\b(?:hang myself|slit my wrists?|jump off (?:a|the) (?:bridge|building|roof)|overdose on|"
        r"take all (?:my|the) pills)\b",
    ),
    _r("sh_intent", "self_harm", H, r"\b(?:want|going|plan|planning|about)\s+to\s+(?:hurt|harm|cut|burn)\s+myself\b"),
    _r(
        "sh_current",
        "self_harm",
        H,
        r"\b(?:i am|im|i have been|ive been|been)\s+(?:cutting|hurting|harming|burning)\s+myself\b",
    ),
    _r("sh_generic", "self_harm", C, r"\b(?:self harm|self-harm|selfharm|hurt myself|cut myself|harm myself)\b"),
    # Hindi / Hinglish (romanised and Devanagari)
    _r("si_hi_marna", "suicide", H, r"\b(?:marna|mar jana|mar jaana)\s+(?:chahta|chahti|chahte)\b"),
    _r("si_hi_khudkushi", "suicide", H, r"\b(?:khudkushi|khud kushi|aatmahatya|atmahatya)\b"),
    _r("si_hi_jeena", "suicide", H, r"\bjeena\s+nahi\s+(?:chahta|chahti|chahte)\b"),
    _r("si_hi_deva", "suicide", H, r"(?:आत्महत्या|ख़ुदकुशी|खुदकुशी|मरना चाहता|मरना चाहती|जीना नहीं चाहता|जीना नहीं चाहती)"),
    # Harm to others (high)
    _r(
        "ho_intent",
        "harm_to_others",
        H,
        r"\b(?:want|going|plan|planning|about)\s+to\s+(?:kill|hurt|stab|shoot|attack)\s+"
        r"(?:him|her|them|someone|somebody|people|everyone|my\s+\w+)\b",
    ),
    _r(
        "ho_will",
        "harm_to_others",
        H,
        r"\bi\s+(?:will|am going to|ll)\s+(?:kill|stab|shoot)\s+(?:him|her|them|someone|you)\b",
    ),
    # Medical and immediate danger (high)
    _r(
        "em_overdose",
        "medical_emergency",
        H,
        r"\b(?:took|swallowed|taken)\s+(?:a lot of|too many|all (?:my|the)|a bunch of|\d+)\s+(?:pills|tablets|meds)\b",
        negatable=False,
    ),
    _r("em_overdosed", "medical_emergency", H, r"\b(?:i overdosed|i have overdosed|ive overdosed)\b", negatable=False),
    _r(
        "em_unsafe_now",
        "unsafe_situation",
        H,
        r"\b(?:i am|im)\s+(?:not safe|in danger)\b|\bsomeone is (?:hurting|attacking|going to hurt) me\b",
    ),
    # Severe disorientation and command hallucinations (high)
    _r(
        "dis_commands",
        "severe_disorientation",
        H,
        r"\bvoices?\s+(?:are\s+)?(?:telling|told|tell)\s+me\s+to\s+(?:hurt|kill|die)\b",
    ),
    _r("dis_lost", "severe_disorientation", H, r"\b(?:i do not|i dont) know (?:where i am|who i am|what is real)\b"),
    # Concerning
    _r(
        "cn_hopeless",
        "hopelessness",
        C,
        r"\b(?:hopeless|no point (?:in )?(?:living|anything|trying)|nothing matters|cant go on|can not go on|"
        r"cant take (?:it|this) anymore|give up on everything|burden (?:to|on) everyone|want to disappear|"
        r"wish i could disappear|sleep and never wake up)\b",
    ),
    _r(
        "cn_function",
        "functioning",
        C,
        r"\b(?:cant function|can not function|not functioning|cant get out of bed|"
        r"(?:have not|havent|not) (?:slept|been sleeping|eaten|been eating)(?: (?:in|for) (?:days|a week|weeks))?|"
        r"stopped eating|not sleeping at all)\b",
    ),
    _r(
        "cn_perception",
        "unusual_experiences",
        C,
        r"\b(?:hearing voices|voices in my head|seeing things that are not there|people are watching me|"
        r"someone is controlling my (?:mind|thoughts)|thoughts are being (?:read|controlled))\b",
    ),
    _r("cn_abuse", "abuse", C, r"\b(?:he|she|they|my \w+)\s+(?:hits|beats|abuses|hurts)\s+me\b|\bbeing abused\b"),
    _r("cn_substance", "substance_use", C, r"\b(?:drinking|drunk|high)\s+(?:every day|every night|all the time)\b"),
    _r("cn_panic", "acute_distress", C, r"\b(?:panic attack|cant breathe|can not breathe)\b"),
    _r(
        "cn_third_party",
        "third_party_risk",
        C,
        r"\b(?:my|a)\s+(?:friend|brother|sister|roommate|partner|classmate)\s+"
        r"(?:wants to|is going to|said they would)\s+"
        r"(?:kill (?:himself|herself|themselves)|die|end (?:his|her|their) life)\b",
    ),
)

# A dampener only applies when it directly governs the matched phrase: short gap, no clause break.
_NEGATION = re.compile(
    r"\b(?:never|not|dont|do not|wouldnt|would not|wont|will not|no longer|am not)\b(?P<gap>[^.?!,;]{0,16})$"
)
_PAST = re.compile(r"\b(?:used to|in the past|years ago|when i was younger)\b(?P<gap>[^.?!,;]{0,20})$")
_CLAUSE_BREAK = re.compile(r"\b(?:but|and|so|yet|because|though)\b")

_INJECTION = re.compile(
    r"\b(?:ignore|disregard|forget|override|bypass)\b[^.]{0,40}\b(?:instructions|rules|safety|guidelines|prompt)\b|"
    r"\b(?:you are now|act as|pretend to be|developer mode|jailbreak|system prompt)\b"
)
_STEREOTYPE = re.compile(
    r"\b(?:because|since|as)\s+i\s+am\s+(?:an?\s+)?\w+\b[^.]{0,60}\b(?:assume|obviously|must be|probably)\b|"
    r"\bassume\b[^.]{0,60}\bbecause\s+i\s+am\b"
)

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s"})
_CONTRACTIONS = (
    (r"\bi'?m\b", "im"),
    (r"\bdon'?t\b", "dont"),
    (r"\bcan'?t\b", "cant"),
    (r"\bwon'?t\b", "wont"),
    (r"\bwouldn'?t\b", "wouldnt"),
    (r"\bhaven'?t\b", "havent"),
    (r"\bi'?ve\b", "ive"),
    (r"\bi'?ll\b", "ill"),
    (r"\bwanna\b", "want to"),
    (r"\bgonna\b", "going to"),
    (r"\bcannot\b", "cant"),
    (r"\bi'?d\b", "i would"),
    (r"\bk[i1]ll\s*my\s*s[e3]lf\b", "kill myself"),
    (r"\bunalive\b", "kill"),
)


def normalize(text: str) -> str:
    t = unicodedata.normalize("NFKC", text).lower()
    t = t.replace("’", "'").replace("‘", "'")
    # Leetspeak only inside latin words, so Devanagari is untouched.
    t = re.sub(
        r"[a-z0-9@$]+", lambda m: m.group(0).translate(_LEET) if re.search(r"[a-z]", m.group(0)) else m.group(0), t
    )
    for pat, rep in _CONTRACTIONS:
        t = re.sub(pat, rep, t)
    t = re.sub(r"(.)\1{2,}", r"\1\1", t)  # "dieeee" -> "diee"
    t = re.sub(r"[^\w\s'.?!ऀ-ॿ-]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _dampened(prefix: str) -> bool:
    for pattern in (_NEGATION, _PAST):
        m = pattern.search(prefix)
        if m and not _CLAUSE_BREAK.search(m.group("gap")):
            return True
    return False


class SafetyClassifier:
    def __init__(self, rules: tuple[Rule, ...] = RULES) -> None:
        self._rules = rules

    def classify(self, text: str | None) -> SafetyAssessment:
        result = SafetyAssessment()
        if not text or not text.strip():
            return result
        norm = normalize(text)
        result.injection_detected = bool(_INJECTION.search(norm))
        result.stereotype_request = bool(_STEREOTYPE.search(norm))

        for rule in self._rules:
            for match in rule.pattern.finditer(norm):
                level = rule.level
                prefix = norm[max(0, match.start() - 40) : match.start()]
                if rule.negatable and level is RiskLevel.HIGH and _dampened(prefix):
                    # "I would never kill myself" / "I used to self-harm": still worth a gentle check-in.
                    level = RiskLevel.CONCERNING
                self._add(result, rule, level)
        return result

    @staticmethod
    def _add(result: SafetyAssessment, rule: Rule, level: RiskLevel) -> None:
        if rule.id not in result.matched_rules:
            result.matched_rules.append(rule.id)
        if rule.category not in result.categories:
            result.categories.append(rule.category)
        if level.rank > result.level.rank:
            result.level = level


def combine_with_model_risk(assessment: SafetyAssessment, model_risk: str | None) -> SafetyAssessment:
    """The model can't lower a result or produce high risk on its own.

    A model "high" only lifts low to concerning, in case the rules missed something. We ignore
    a model "concerning" here because small models give that label to ordinary stress.
    """
    if model_risk == "high" and assessment.level is RiskLevel.LOW:
        assessment.level = RiskLevel.CONCERNING
        if "model_flag" not in assessment.categories:
            assessment.categories.append("model_flag")
    return assessment


_default = SafetyClassifier()


def classify(text: str | None) -> SafetyAssessment:
    return _default.classify(text)

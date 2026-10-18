"""Speech to text, using faster-whisper locally.

The model loads on first use and is reused for every job in the worker process.
"""

import threading
from dataclasses import dataclass
from typing import Protocol

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass
class Transcription:
    text: str
    language: str | None
    duration_seconds: float


class AudioRejected(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class SpeechToText(Protocol):
    def transcribe(self, path: str, *, language: str | None, max_seconds: int) -> Transcription: ...


class FasterWhisperSTT:
    def __init__(self, model_name: str, device: str, compute_type: str) -> None:
        self._model_name = model_name
        self._device = device
        self._compute_type = compute_type
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from faster_whisper import WhisperModel  # heavy import, worker-only dependency

                    log.info("stt_model_loading", extra={"model": self._model_name, "device": self._device})
                    self._model = WhisperModel(self._model_name, device=self._device, compute_type=self._compute_type)
        return self._model

    def transcribe(self, path: str, *, language: str | None, max_seconds: int) -> Transcription:
        model = self._load()
        try:
            segments, info = model.transcribe(
                path,
                language=language,
                vad_filter=True,
                beam_size=1,
                vad_parameters={"min_silence_duration_ms": 500},
            )
        except Exception as exc:  # noqa: BLE001 - decoding errors from PyAV/ctranslate2 vary by version
            log.warning("stt_decode_failed", extra={"error_type": type(exc).__name__})
            raise AudioRejected("undecodable_audio") from exc
        if info.duration > max_seconds + 1:
            raise AudioRejected("audio_too_long")
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return Transcription(text=text, language=info.language, duration_seconds=round(info.duration, 1))


_stt: SpeechToText | None = None


def get_stt() -> SpeechToText:
    global _stt
    if _stt is None:
        s = get_settings()
        _stt = FasterWhisperSTT(s.model_stt, s.stt_device, s.stt_compute_type)
    return _stt


def set_stt(stt: SpeechToText | None) -> None:
    global _stt
    _stt = stt

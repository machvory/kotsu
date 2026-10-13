"""Thin wrappers over the Google Cloud clients KOTSU uses.

Clients are created lazily so that importing the app (tests, `--help`) does not
require credentials.
"""
from __future__ import annotations

import datetime as _dt
import threading
from typing import Any

from google.cloud import firestore, storage, texttospeech_v1beta1 as tts

from . import config


_lock = threading.Lock()
_clients: dict[str, Any] = {}


def _one(name: str, make):
    """A single client per process, built under a lock (see gemini.client for why)."""
    c = _clients.get(name)
    if c is None:
        with _lock:
            c = _clients.get(name)
            if c is None:
                c = _clients[name] = make()
    return c


def storage_client() -> storage.Client:
    return _one("storage", lambda: storage.Client(project=config.PROJECT_ID))


def db() -> firestore.Client:
    return _one("firestore", lambda: firestore.Client(project=config.PROJECT_ID))


def tts_client() -> tts.TextToSpeechClient:
    return _one("tts", tts.TextToSpeechClient)


def upload_bytes(path: str, data: bytes, content_type: str) -> str:
    """Store an object and return its gs:// URI."""
    blob = storage_client().bucket(config.BUCKET).blob(path)
    blob.upload_from_string(data, content_type=content_type)
    return f"gs://{config.BUCKET}/{path}"


def download_bytes(path: str) -> bytes:
    return storage_client().bucket(config.BUCKET).blob(path).download_as_bytes()


def blob_size(path: str) -> int:
    blob = storage_client().bucket(config.BUCKET).blob(path)
    blob.reload()
    return blob.size or 0


def download_range(path: str, start: int, end: int) -> bytes:
    """Bytes [start, end] inclusive, so a browser can seek inside a video.

    Media is streamed through the API rather than signed. Signing needs a
    private key, which neither a developer's gcloud login nor Cloud Run's own
    service identity has; routing it here keeps one code path that works in
    both, and leaves the bucket entirely private.
    """
    blob = storage_client().bucket(config.BUCKET).blob(path)
    return blob.download_as_bytes(start=start, end=end)



def synthesize(text: str, lang: str) -> bytes:
    """Read a knack card aloud with the Gemini TTS voice."""
    _, locale, voice = config.LANGUAGES.get(lang, config.LANGUAGES["en"])
    req = tts.SynthesizeSpeechRequest(
        input=tts.SynthesisInput(text=text),
        voice=tts.VoiceSelectionParams(
            language_code=locale, name=voice, model_name=config.TTS_MODEL
        ),
        audio_config=tts.AudioConfig(audio_encoding=tts.AudioEncoding.MP3),
    )
    return tts_client().synthesize_speech(request=req).audio_content


def now() -> str:
    return _dt.datetime.now(_dt.UTC).isoformat()

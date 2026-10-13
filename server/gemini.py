"""Calls to Gemini on Vertex AI.

One client, created once. Everything that reaches a worker goes through
`generate_json`, so there is a single place where the response schema is
enforced and a single place to look when an answer comes back malformed.
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any

from google import genai
from google.genai import types

from . import config

log = logging.getLogger("kotsu.gemini")


_client: genai.Client | None = None
_client_lock = threading.Lock()


def client() -> genai.Client:
    """One client for the process, created under a lock.

    FastAPI runs sync endpoints on a thread pool. A plain lru_cache let several
    threads build their own client on a cold start; the cache kept one, the rest
    were garbage-collected mid-request, and closing them closed the HTTP
    transport out from under live calls ("client has been closed").
    """
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = genai.Client(vertexai=True, project=config.PROJECT_ID, location=config.LOCATION)
    return _client


def video_part(gs_uri: str, fps: float | None = None, mime: str = "video/mp4") -> types.Part:
    """A video for Gemini to watch, straight out of Cloud Storage.

    `fps` matters more than it looks. The default sampling of one frame per
    second walks straight past a knack that lives in a quarter second - a wipe,
    a tap, a re-grip. Steps get sampled dense; whole videos stay cheap.
    """
    part = types.Part(file_data=types.FileData(file_uri=gs_uri, mime_type=mime))
    if fps:
        part.video_metadata = types.VideoMetadata(fps=fps)
    return part


def generate_json(
    *,
    system: str,
    parts: list[types.Part],
    schema: dict[str, Any],
    model: str | None = None,
    temperature: float = 0.2,
    thinking: str | None = "low",
) -> dict[str, Any]:
    """Run one grounded request and return parsed JSON.

    Temperature stays low on purpose: this is reading evidence, not writing
    copy. A creative answer here is a wrong answer.
    """
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=temperature,
    )
    if thinking:
        cfg.thinking_config = types.ThinkingConfig(thinking_level=thinking)

    resp = client().models.generate_content(
        model=model or config.MODEL_ANALYST,
        contents=[types.Content(role="user", parts=parts)],
        config=cfg,
    )
    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError(f"Gemini returned nothing (finish: {_finish(resp)})")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        log.error("unparseable response: %s", text[:800])
        raise RuntimeError("Gemini returned text that is not JSON") from e


def transcribe(gs_uri: str, mime: str, language_hint: str | None = None) -> str:
    """Turn the expert's spoken answer into text, in whatever language they used."""
    hint = (
        f" The speaker is most likely speaking {language_hint}."
        if language_hint
        else ""
    )
    resp = client().models.generate_content(
        model=config.MODEL_ANALYST,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part(
                        file_data=types.FileData(file_uri=gs_uri, mime_type=mime)
                    ),
                    types.Part(
                        text=(
                            "Transcribe this recording exactly as spoken, in the "
                            "language it was spoken in. Return only the words."
                            + hint
                        )
                    ),
                ],
            )
        ],
        config=types.GenerateContentConfig(temperature=0.0),
    )
    return (resp.text or "").strip()


def _finish(resp: Any) -> str:
    try:
        return str(resp.candidates[0].finish_reason)
    except Exception:
        return "unknown"

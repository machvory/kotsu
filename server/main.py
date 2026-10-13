"""KOTSU - the API behind Watch, Ask, Teach, Coach, Prove.

One Cloud Run service: this API plus the built web app. A task lives in one
Firestore document; videos live in Cloud Storage and are read by Gemini straight
from there, so no video is ever copied through this process twice.
"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles

from . import agents, config, gcp, gemini, okf, video

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("kotsu")

app = FastAPI(title="KOTSU", version="1.0", docs_url="/api/docs")

WEB_DIR = Path(__file__).resolve().parent.parent / "web" / "dist"


@app.middleware("http")
async def no_store_api(request: Request, call_next):
    """Never let a browser cache an API response.

    A task changes the moment the expert approves a knack. A cached GET shows
    the previous state, which on a factory tool reads as "the approval did not
    save" — the one thing that must never be in doubt. Media is excluded: those
    responses are immutable and carry their own caching.
    """
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") and not path.endswith(("/file", "/audio")) and "/frame" not in path:
        response.headers["Cache-Control"] = "no-store"
    return response


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _task_ref(task_id: str):
    return gcp.db().collection("tasks").document(task_id)


def _load(task_id: str) -> dict[str, Any]:
    snap = _task_ref(task_id).get()
    if not snap.exists:
        raise HTTPException(404, "task not found")
    return snap.to_dict() or {}


def _save(task_id: str, data: dict[str, Any]) -> None:
    _task_ref(task_id).set(data, merge=True)


def _apply(task_id: str, change) -> Any:
    """Read the task, apply `change(task)`, write it back — atomically.

    Every mutation goes through here. The slow work (Gemini, TTS, ffmpeg) is done
    *before*, on a plain read; only the cheap edit runs inside the transaction,
    which Firestore retries if the task changed underneath it. Without this, two
    cards built at once each wrote the whole task back and the second silently
    erased the first.
    """
    from google.cloud import firestore as _fs

    ref = _task_ref(task_id)

    @_fs.transactional
    def run(tx):
        snap = ref.get(transaction=tx)
        if not snap.exists:
            raise HTTPException(404, "task not found")
        task = snap.to_dict() or {}
        result = change(task)
        tx.set(ref, task)
        return result

    # A burst of edits to one task (four languages built at once) contends on one document;
    # the default five attempts is not enough headroom for that.
    return run(gcp.db().transaction(max_attempts=20))


def _find(items: list[dict[str, Any]], item_id: str) -> dict[str, Any] | None:
    return next((i for i in items if i.get("id") == item_id), None)


def _suffix(filename: str | None) -> str:
    s = Path(filename or "clip.mp4").suffix.lower()
    return s if s else ".mp4"


async def _read_upload(f: UploadFile) -> bytes:
    data = await f.read()
    mb = len(data) / 1_048_576
    if mb > config.MAX_UPLOAD_MB:
        raise HTTPException(413, f"{mb:.0f} MB is over the {config.MAX_UPLOAD_MB} MB limit")
    if not data:
        raise HTTPException(400, "empty upload")
    return data


# --------------------------------------------------------------------------
# health + config
# --------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "project": config.PROJECT_ID,
        "model": config.MODEL_ANALYST,
        "languages": {k: v[0] for k, v in config.LANGUAGES.items()},
    }


# --------------------------------------------------------------------------
# 0. a task
# --------------------------------------------------------------------------

@app.post("/api/tasks")
def create_task(
    title: str = Form(...),
    expert_name: str = Form(...),
    worker_name: str = Form(""),
    hint: str = Form(""),
    language: str = Form("id"),
) -> dict[str, Any]:
    task_id = f"t_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": task_id,
        "title": title.strip(),
        "expert_name": expert_name.strip(),
        # Who the second recording is of. Defaults to the role, so a task never
        # names a person it does not know.
        "worker_name": worker_name.strip() or "New worker",
        "hint": hint.strip(),
        "language": language,
        "created_at": gcp.now(),
        "videos": {},
        "steps": [],
        "knacks": [],
        "questions": [],
        "attempts": [],
        "state": "created",
    }
    _save(task_id, doc)
    return doc


@app.get("/api/tasks")
def list_tasks() -> list[dict[str, Any]]:
    out = []
    for snap in gcp.db().collection("tasks").stream():
        d = snap.to_dict() or {}
        out.append({
            "id": d.get("id"),
            "title": d.get("title"),
            "expert_name": d.get("expert_name"),
            "created_at": d.get("created_at"),
            "state": d.get("state"),
            "knacks": len(d.get("knacks", [])),
        })
    return sorted(out, key=lambda t: t.get("created_at") or "", reverse=True)


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str) -> dict[str, Any]:
    return _load(task_id)


# --------------------------------------------------------------------------
# 1. Watch - upload the two recordings
# --------------------------------------------------------------------------

@app.post("/api/tasks/{task_id}/videos/{role}")
async def upload_video(task_id: str, role: str, file: UploadFile = File(...)) -> dict[str, Any]:
    if role not in ("expert", "novice"):
        raise HTTPException(400, "role must be expert or novice")
    _load(task_id)  # 404 before reading a large upload
    data = await _read_upload(file)

    data, mime = video.to_mp4(data, _suffix(file.filename))
    duration = video.probe_duration(data)
    path = f"tasks/{task_id}/{role}.mp4"
    uri = gcp.upload_bytes(path, data, mime)

    record = {
        "uri": uri, "path": path, "mime": mime,
        "duration_s": round(duration, 2),
        "size_mb": round(len(data) / 1_048_576, 2),
        "uploaded_at": gcp.now(),
    }

    def change(t):
        t.setdefault("videos", {})[role] = record
        t["state"] = "uploaded"
    _apply(task_id, change)
    return record


def _serve_blob(path: str, mime: str, range_header: str | None) -> Response:
    """Serve a private Cloud Storage object, honouring Range so video can seek."""
    size = gcp.blob_size(path)
    if not size:
        raise HTTPException(404, "that file is not in storage")

    start, end = 0, size - 1
    partial = False
    if range_header and range_header.startswith("bytes="):
        spec = range_header[6:].split(",")[0].strip()
        first, _, last = spec.partition("-")
        if first:
            start = int(first)
            if last:
                end = min(int(last), size - 1)
        elif last:                      # a suffix range, e.g. "bytes=-500"
            start = max(size - int(last), 0)
        if start > end or start >= size:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        partial = True

    # Cap a single response so one seek cannot pull a whole video into memory.
    end = min(end, start + 4 * 1024 * 1024 - 1, size - 1)
    data = gcp.download_range(path, start, end)

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(len(data)),
        "Cache-Control": "private, max-age=3600",
    }
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return Response(data, status_code=206 if partial else 200, media_type=mime, headers=headers)


@app.get("/api/tasks/{task_id}/videos/{role}/file")
def video_file(task_id: str, role: str, request: Request) -> Response:
    task = _load(task_id)
    v = (task.get("videos") or {}).get(role)
    if not v:
        raise HTTPException(404, "no such video")
    return _serve_blob(v["path"], v.get("mime", "video/mp4"), request.headers.get("range"))


@app.get("/api/tasks/{task_id}/attempts/{attempt_id}/file")
def attempt_file(task_id: str, attempt_id: str, request: Request) -> Response:
    task = _load(task_id)
    a = _find(task.get("attempts", []), attempt_id)
    if not a or not a.get("path"):
        raise HTTPException(404, "that attempt has no video")
    return _serve_blob(a["path"], "video/mp4", request.headers.get("range"))


@app.get("/api/tasks/{task_id}/knacks/{knack_id}/audio")
def card_audio(task_id: str, knack_id: str, lang: str, request: Request) -> Response:
    task = _load(task_id)
    knack = _find(task.get("knacks", []), knack_id)
    path = (knack or {}).get("cards", {}).get(lang, {}).get("audio_path")
    if not path:
        raise HTTPException(404, "that card has no spoken cue")
    return _serve_blob(path, "audio/mpeg", request.headers.get("range"))


@app.get("/api/tasks/{task_id}/frame")
def frame(task_id: str, role: str, t: float) -> Response:
    """A still from the recording, at the second a knack was observed."""
    task = _load(task_id)
    v = (task.get("videos") or {}).get(role)
    if not v:
        raise HTTPException(404, "no such video")
    data = gcp.download_bytes(v["path"])
    jpg = video.keyframe(data, t)
    return Response(jpg, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=3600"})


# --------------------------------------------------------------------------
# 2. Watch - find the knacks
# --------------------------------------------------------------------------

@app.post("/api/tasks/{task_id}/analyse")
def analyse(task_id: str, metrics: dict[str, Any] | None = None) -> dict[str, Any]:
    task = _load(task_id)
    vids = task.get("videos") or {}
    if "expert" not in vids or "novice" not in vids:
        raise HTTPException(400, "both the expert and the new worker video are needed")

    result = agents.analyse(
        expert_uri=vids["expert"]["uri"],
        novice_uri=vids["novice"]["uri"],
        expert_mime=vids["expert"]["mime"],
        novice_mime=vids["novice"]["mime"],
        metrics=(metrics or {}).get("hands") if metrics else None,
        hint=task.get("hint") or None,
    )
    result = agents.validate(
        result,
        expert_duration_s=vids["expert"]["duration_s"],
        novice_duration_s=vids["novice"]["duration_s"],
    )

    fields = {
        "task_name": result.get("task_name"),
        "steps": result.get("steps", []),
        "knacks": result.get("knacks", []),
        "questions": result.get("questions", []),
        "validation": result.get("validation", {}),
        "measured": (metrics or {}).get("hands"),
        "analysed_at": gcp.now(),
        "state": "analysed",
    }

    def change(t):
        t.update(fields)
        return t
    return _apply(task_id, change)


# --------------------------------------------------------------------------
# 3. Ask - the expert answers, out loud
# --------------------------------------------------------------------------

@app.post("/api/tasks/{task_id}/questions/{question_id}/answer")
async def answer_question(
    task_id: str,
    question_id: str,
    text: str = Form(""),
    knack_id: str = Form(""),
    audio: UploadFile | None = File(None),
) -> dict[str, Any]:
    task = _load(task_id)
    question = _find(task.get("questions", []), question_id)
    if not question:
        raise HTTPException(404, "question not found")

    answer_text = text.strip()
    audio_path = None
    if audio is not None:
        data = await _read_upload(audio)
        suffix = _suffix(audio.filename) or ".webm"
        audio_path = f"tasks/{task_id}/answers/{question_id}{suffix}"
        mime = audio.content_type or "audio/webm"
        uri = gcp.upload_bytes(audio_path, data, mime)
        answer_text = gemini.transcribe(
            uri, mime, language_hint=config.LANGUAGES.get(task.get("language", "id"), ("",))[0]
        )
    if not answer_text:
        raise HTTPException(400, "no answer was given")

    knack = _find(task.get("knacks", []), knack_id) if knack_id else None
    merged = agents.merge_answer(
        knack=knack,
        question=question,
        answer_text=answer_text,
        expert_name=task.get("expert_name", "the expert"),
    )

    answered = {"status": "answered", "answer_text": answer_text, "answer_audio": audio_path,
                "answered_at": gcp.now()}

    def change(t):
        q = _find(t.get("questions", []), question_id)
        q.update(answered)
        k = _find(t.get("knacks", []), knack_id) if knack_id else None
        if k and merged.get("changed"):
            k.update({
                "title": merged.get("updated_title") or k.get("title"),
                "instruction": merged.get("updated_instruction") or k.get("instruction"),
                "expert_reason": merged.get("expert_reason"),
                "status": "draft",
            })
        elif merged.get("is_new_knack"):
            t.setdefault("knacks", []).append({
                "id": f"k_{uuid.uuid4().hex[:8]}",
                "title": merged.get("updated_title"),
                "instruction": merged.get("updated_instruction"),
                "expert_reason": merged.get("expert_reason"),
                "why_it_matters": merged.get("expert_reason"),
                "expert_does": q.get("observation"),
                "expert_at_s": q.get("at_s"),
                "novice_does": "not observed - this knack came from the expert, not the video",
                "novice_at_s": 0,
                "impact": "quality",
                "confidence": "high",
                "step_index": -1,
                "from_question": question_id,
                "evidence_ok": True,
                "evidence_problems": [],
                "status": "draft",
            })
        t["state"] = "asked"
        return q, t

    question, task = _apply(task_id, change)
    return {"question": question, "merge": merged, "task": task}


# --------------------------------------------------------------------------
# 4. Teach - approve, then turn into a card in the worker's language
# --------------------------------------------------------------------------

@app.post("/api/tasks/{task_id}/knacks/{knack_id}/approve")
def approve(task_id: str, knack_id: str, approved: bool = True) -> dict[str, Any]:
    """Nothing is taught to anyone until the expert signs off on it."""
    def change(t):
        k = _find(t.get("knacks", []), knack_id)
        if not k:
            raise HTTPException(404, "knack not found")
        k["status"] = "approved" if approved else "rejected"
        k["approved_by"] = t.get("expert_name") if approved else None
        k["approved_at"] = gcp.now() if approved else None
        return k
    return _apply(task_id, change)


@app.post("/api/tasks/{task_id}/knacks/{knack_id}/card")
def card(task_id: str, knack_id: str, lang: str = "id") -> dict[str, Any]:
    task = _load(task_id)
    knack = _find(task.get("knacks", []), knack_id)
    if not knack:
        raise HTTPException(404, "knack not found")
    if lang not in config.LANGUAGES:
        raise HTTPException(400, f"language must be one of {list(config.LANGUAGES)}")

    built = agents.make_card(
        knack=knack, lang=lang, expert_name=task.get("expert_name", "")
    )
    try:
        audio = gcp.synthesize(built["spoken_cue"], lang)
        audio_path = f"tasks/{task_id}/cards/{knack_id}_{lang}.mp3"
        gcp.upload_bytes(audio_path, audio, "audio/mpeg")
        built["audio_path"] = audio_path
    except Exception as exc:  # a card without audio still teaches
        log.warning("tts failed: %s", exc)
        built["audio_path"] = None
        built["audio_error"] = str(exc)[:200]

    def change(t):
        k = _find(t.get("knacks", []), knack_id)
        if not k:
            raise HTTPException(404, "knack not found")
        k.setdefault("cards", {})[lang] = built
    _apply(task_id, change)
    return built


# --------------------------------------------------------------------------
# 5. Coach + Prove - the new worker tries again, and we measure it
# --------------------------------------------------------------------------

@app.post("/api/tasks/{task_id}/attempts")
async def add_attempt(
    task_id: str,
    worker: str = Form("new worker"),
    seconds: float = Form(0),
    defects: int = Form(-1),
    coached: bool = Form(False),
    file: UploadFile | None = File(None),
) -> dict[str, Any]:
    task = _load(task_id)
    attempts = task.setdefault("attempts", [])
    attempt: dict[str, Any] = {
        "id": f"a_{uuid.uuid4().hex[:8]}",
        "n": len(attempts) + 1,
        "worker": worker,
        "seconds": seconds,
        "defects_reported": defects,
        "coached": coached,
        "at": gcp.now(),
    }

    if file is not None:
        data = await _read_upload(file)
        data, mime = video.to_mp4(data, _suffix(file.filename))
        attempt["seconds"] = attempt["seconds"] or round(video.probe_duration(data), 2)
        path = f"tasks/{task_id}/attempts/{attempt['id']}.mp4"
        uri = gcp.upload_bytes(path, data, mime)
        attempt.update({"path": path, "uri": uri})

        cards = [
            {"id": k["id"], "title": k.get("title"), "instruction": k.get("instruction")}
            for k in task.get("knacks", []) if k.get("status") == "approved"
        ]
        if cards:
            attempt["review"] = agents.review_attempt(
                attempt_uri=uri, cards=cards, mime=mime
            )

    def change(t):
        a = t.setdefault("attempts", [])
        attempt["n"] = len(a) + 1
        a.append(attempt)
        t["state"] = "proving"
    _apply(task_id, change)
    return attempt


@app.get("/api/tasks/{task_id}/progress")
def progress(task_id: str) -> dict[str, Any]:
    """The numbers that say whether any of this actually worked."""
    task = _load(task_id)
    attempts = sorted(task.get("attempts", []), key=lambda a: a.get("n", 0))
    approved = [k for k in task.get("knacks", []) if k.get("status") == "approved"]
    expert_s = (task.get("videos", {}).get("expert") or {}).get("duration_s")

    series = []
    for a in attempts:
        review = a.get("review") or {}
        followed = [f for f in review.get("followed", []) if f.get("followed")]
        series.append({
            "n": a.get("n"),
            "worker": a.get("worker"),
            "seconds": a.get("seconds"),
            "coached": a.get("coached"),
            "knacks_followed": len(followed),
            "knacks_total": len(approved),
            "defects": (
                a["defects_reported"] if a.get("defects_reported", -1) >= 0
                else review.get("defects_seen")
            ),
            "say_next_time": review.get("say_next_time"),
        })

    first = series[0]["seconds"] if series else None
    last = series[-1]["seconds"] if series else None
    to_standard = next(
        (s["n"] for s in series
         if expert_s and s["seconds"] and s["seconds"] <= expert_s * 1.25
         and (s["defects"] in (0, None))),
        None,
    )
    return {
        "expert_seconds": expert_s,
        "attempts": series,
        "first_seconds": first,
        "last_seconds": last,
        "improvement_pct": (
            round((first - last) / first * 100, 1) if first and last and first > 0 else None
        ),
        "attempts_to_standard": to_standard,
        "approved_knacks": len(approved),
    }


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------

@app.get("/api/tasks/{task_id}/okf", response_class=PlainTextResponse)
def export_okf(task_id: str) -> str:
    return okf.export(_load(task_id))


# --------------------------------------------------------------------------
# the web app
# --------------------------------------------------------------------------

if WEB_DIR.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = WEB_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        # The shell must never be cached: its asset names change on every build,
        # so a stale copy silently serves yesterday's app.
        return FileResponse(
            WEB_DIR / "index.html",
            headers={"Cache-Control": "no-cache, must-revalidate"},
        )
else:
    @app.get("/", include_in_schema=False)
    def no_web():
        return JSONResponse({"ok": True, "note": "web/dist not built; API only"})

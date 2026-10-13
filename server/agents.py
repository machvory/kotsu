"""The five KOTSU steps, each one a small agent over Gemini.

Watch -> Ask -> Teach -> Coach -> Prove.

Between Gemini and the worker sits `validate`, which is the part that makes the
rest safe to use. A knack whose evidence does not check out never reaches a
bench; it goes to the expert for review instead.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from google.genai import types

from . import config, gemini, prompts, schemas

log = logging.getLogger("kotsu.agents")


# --------------------------------------------------------------------------
# 1 + 2. Watch: segment both videos, find the knacks, find what to ask.
# --------------------------------------------------------------------------

def analyse(
    *,
    expert_uri: str,
    novice_uri: str,
    expert_mime: str = "video/mp4",
    novice_mime: str = "video/mp4",
    metrics: dict[str, Any] | None = None,
    hint: str | None = None,
    fps: float = 4.0,
) -> dict[str, Any]:
    """Compare an expert and a novice doing the same task."""
    parts = [
        types.Part(text="VIDEO A - the EXPERT:"),
        gemini.video_part(expert_uri, fps=fps, mime=expert_mime),
        types.Part(text="VIDEO B - the NOVICE:"),
        gemini.video_part(novice_uri, fps=fps, mime=novice_mime),
        types.Part(text=prompts.analyst_user(metrics, hint)),
    ]
    out = gemini.generate_json(
        system=prompts.ANALYST_SYSTEM,
        parts=parts,
        schema=schemas.ANALYSIS_SCHEMA,
        thinking="high",  # finding a knack is the hardest thing KOTSU does
    )
    for k in out.get("knacks", []):
        k.setdefault("id", f"k_{uuid.uuid4().hex[:8]}")
        k["status"] = "draft"
    for i, q in enumerate(out.get("questions", [])):
        q.setdefault("id", f"q_{uuid.uuid4().hex[:8]}")
        q["index"] = i
        q["status"] = "open"
    return out


# --------------------------------------------------------------------------
# The validator. Nothing reaches a worker without passing this.
# --------------------------------------------------------------------------

def validate(
    analysis: dict[str, Any],
    *,
    expert_duration_s: float,
    novice_duration_s: float,
) -> dict[str, Any]:
    """Check every claim against the evidence it says it has.

    A model that cites 0:42 of a 30-second video has not watched it. That is
    cheap to detect and worth detecting, because it is exactly the failure a
    confident paragraph hides.
    """
    steps = analysis.get("steps", [])
    step_indexes = {s.get("index") for s in steps}
    report = {"checked": 0, "passed": 0, "flagged": []}

    def within(t: Any, limit: float) -> bool:
        return isinstance(t, (int, float)) and -0.01 <= t <= limit + 0.5

    for k in analysis.get("knacks", []):
        report["checked"] += 1
        problems: list[str] = []

        if not within(k.get("expert_at_s"), expert_duration_s):
            problems.append(
                f"cites {k.get('expert_at_s')}s in the expert video, which is "
                f"{expert_duration_s:.1f}s long"
            )
        if not within(k.get("novice_at_s"), novice_duration_s):
            problems.append(
                f"cites {k.get('novice_at_s')}s in the novice video, which is "
                f"{novice_duration_s:.1f}s long"
            )
        if step_indexes and k.get("step_index") not in step_indexes:
            problems.append(f"refers to step {k.get('step_index')}, which was not found")
        if not (k.get("instruction") or "").strip():
            problems.append("has no instruction a worker could follow")
        if k.get("confidence") == "unsure":
            problems.append("the model said it was unsure")

        k["evidence_ok"] = not problems
        k["evidence_problems"] = problems
        if problems:
            k["status"] = "needs_review"
            report["flagged"].append({"id": k.get("id"), "problems": problems})
        else:
            report["passed"] += 1

    for q in analysis.get("questions", []):
        if not within(q.get("at_s"), expert_duration_s):
            q["status"] = "needs_review"

    analysis["validation"] = report
    return analysis


# --------------------------------------------------------------------------
# 3. Ask: the expert answers out loud, and the card learns something.
# --------------------------------------------------------------------------

def merge_answer(
    *,
    knack: dict[str, Any] | None,
    question: dict[str, Any],
    answer_text: str,
    expert_name: str,
) -> dict[str, Any]:
    """Fold the expert's spoken answer back into the knack card."""
    current = (
        f"Current card:\n"
        f"  title: {knack.get('title')}\n"
        f"  instruction: {knack.get('instruction')}\n"
        f"  why: {knack.get('why_it_matters')}\n"
        if knack
        else "There is no card for this moment yet.\n"
    )
    user = (
        f"{current}\n"
        f"At {question.get('at_s')}s of their own video, {expert_name} was seen to: "
        f"{question.get('observation')}\n"
        f"You asked: {question.get('question')}\n"
        f"{expert_name} answered, out loud: \"{answer_text}\"\n\n"
        "Fold that answer into the card."
    )
    return gemini.generate_json(
        system=prompts.INTERVIEW_MERGE_SYSTEM,
        parts=[types.Part(text=user)],
        schema=schemas.MERGE_SCHEMA,
        temperature=0.3,
    )


# --------------------------------------------------------------------------
# 4. Teach: the card, in the worker's language, in their ear.
# --------------------------------------------------------------------------

def make_card(*, knack: dict[str, Any], lang: str, expert_name: str) -> dict[str, Any]:
    language_label = config.LANGUAGES.get(lang, config.LANGUAGES["en"])[0]
    user = (
        f"The knack, as observed and as the expert explained it:\n"
        f"  what the expert does: {knack.get('expert_does')}\n"
        f"  what the new worker does instead: {knack.get('novice_does')}\n"
        f"  why it matters: {knack.get('why_it_matters')}\n"
        f"  the expert's own reason: {knack.get('expert_reason') or '(not asked yet)'}\n"
        f"  short instruction: {knack.get('instruction')}\n\n"
        f"Write the card."
    )
    return gemini.generate_json(
        system=prompts.TEACHER_SYSTEM.format(language=language_label),
        parts=[types.Part(text=user)],
        schema=schemas.CARD_SCHEMA,
        temperature=0.4,
    )


# --------------------------------------------------------------------------
# 5. Coach / Prove: judge one attempt against the approved cards.
# --------------------------------------------------------------------------

def review_attempt(
    *, attempt_uri: str, cards: list[dict[str, Any]], mime: str = "video/mp4",
    fps: float = 3.0,
) -> dict[str, Any]:
    parts = [
        gemini.video_part(attempt_uri, fps=fps, mime=mime),
        types.Part(text=prompts.coach_user(cards)),
    ]
    return gemini.generate_json(
        system=prompts.COACH_SYSTEM,
        parts=parts,
        schema=schemas.COACH_SCHEMA,
        model=config.MODEL_COACH,
        thinking="low",
    )

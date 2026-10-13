"""Response schemas.

Every claim KOTSU shows a worker has to be traceable to a moment in a video.
The schema is what forces that: a knack without timestamps cannot be returned at
all, so the model cannot quietly produce advice it did not see.
"""
from __future__ import annotations

from typing import Any

# --- Step 1 + 2: segment both videos and find what the expert does differently.

ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "task_name": {"type": "string"},
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "name": {"type": "string"},
                    "expert_start_s": {"type": "number"},
                    "expert_end_s": {"type": "number"},
                    "novice_start_s": {"type": "number"},
                    "novice_end_s": {"type": "number"},
                },
                "required": [
                    "index", "name",
                    "expert_start_s", "expert_end_s",
                    "novice_start_s", "novice_end_s",
                ],
            },
        },
        "knacks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "step_index": {"type": "integer"},
                    "expert_does": {"type": "string"},
                    "expert_at_s": {"type": "number"},
                    "novice_does": {"type": "string"},
                    "novice_at_s": {"type": "number"},
                    "why_it_matters": {"type": "string"},
                    "impact": {
                        "type": "string",
                        "enum": ["time", "quality", "safety"],
                    },
                    "instruction": {"type": "string"},
                    "confidence": {
                        "type": "string",
                        "enum": ["high", "medium", "unsure"],
                    },
                },
                "required": [
                    "title", "step_index", "expert_does", "expert_at_s",
                    "novice_does", "novice_at_s", "why_it_matters", "impact",
                    "instruction", "confidence",
                ],
            },
        },
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "at_s": {"type": "number"},
                    "observation": {"type": "string"},
                    "question": {"type": "string"},
                    "why_video_cannot_answer": {"type": "string"},
                },
                "required": [
                    "at_s", "observation", "question", "why_video_cannot_answer",
                ],
            },
        },
    },
    "required": ["task_name", "steps", "knacks", "questions"],
}

# --- Step 3: fold the expert's spoken answer back into the knack card.

MERGE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "updated_title": {"type": "string"},
        "updated_instruction": {"type": "string"},
        "expert_reason": {"type": "string"},
        "is_new_knack": {"type": "boolean"},
        "changed": {"type": "boolean"},
        "note": {"type": "string"},
    },
    "required": [
        "updated_title", "updated_instruction", "expert_reason",
        "is_new_knack", "changed", "note",
    ],
}

# --- Step 4: teach the card in the worker's own language.

CARD_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "do_this": {"type": "string"},
        "not_this": {"type": "string"},
        "because": {"type": "string"},
        "spoken_cue": {"type": "string"},
    },
    "required": ["title", "do_this", "not_this", "because", "spoken_cue"],
}

# --- Step 5: the coach judging one attempt against the approved cards.

COACH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "followed": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "knack_id": {"type": "string"},
                    "followed": {"type": "boolean"},
                    "evidence_at_s": {"type": "number"},
                    "evidence": {"type": "string"},
                    "confidence": {
                        "type": "string",
                        "enum": ["high", "medium", "unsure"],
                    },
                },
                "required": [
                    "knack_id", "followed", "evidence_at_s", "evidence",
                    "confidence",
                ],
            },
        },
        "say_next_time": {"type": "string"},
        "defects_seen": {"type": "integer"},
    },
    "required": ["followed", "say_next_time", "defects_seen"],
}

"""Export approved knacks as Open Knowledge Format.

OKF is Google Cloud's vendor-neutral Markdown spec for the curated context an
agent is given. Exporting to it is the point: a factory's hard-won knacks should
not be trapped inside KOTSU, and provenance - who said it, from which second of
whose video, approved by whom - is what makes the knowledge auditable later.
"""
from __future__ import annotations

from typing import Any


def export(task: dict[str, Any]) -> str:
    knacks = [
        k for k in task.get("knacks", [])
        if k.get("status") == "approved"
    ]
    name = task.get("task_name") or task.get("title") or "Manual task"
    expert = task.get("expert_name", "unnamed expert")

    lines = [
        "---",
        f'title: "{name} - knacks"',
        'format: okf/1.0',
        'profile: industrial',
        f'source_expert: "{expert}"',
        'captured_by: "KOTSU"',
        f'captured_at: "{task.get("created_at", "")}"',
        f'review_status: "{"approved" if knacks else "draft"}"',
        "---",
        "",
        f"# {name}",
        "",
        f"Hand knowledge recorded from {expert} and approved by them. Every entry "
        "below cites the second of the recording it was observed in.",
        "",
    ]
    if not knacks:
        lines += ["_No knack has been approved by the expert yet._", ""]

    for i, k in enumerate(knacks, 1):
        lines += [
            f"## {i}. {k.get('title', 'Knack')}",
            "",
            f"**Do this.** {k.get('instruction', '')}",
            "",
            f"**Why.** {k.get('expert_reason') or k.get('why_it_matters', '')}",
            "",
            "| | |",
            "|---|---|",
            f"| Expert does | {k.get('expert_does','')} (at {k.get('expert_at_s','?')}s) |",
            f"| New worker does | {k.get('novice_does','')} (at {k.get('novice_at_s','?')}s) |",
            f"| Matters for | {k.get('impact','')} |",
            f"| Confidence | {k.get('confidence','')} |",
            f"| Expert's own words | {'yes, recorded' if k.get('expert_reason') else 'not asked'} |",
            f"| Approved by | {expert} |",
            "",
        ]
    return "\n".join(lines)

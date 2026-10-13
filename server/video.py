"""Video helpers built on ffmpeg.

KOTSU needs two things from a file that Gemini cannot give it: how long it
really is (so the validator can catch a citation past the end) and a still
frame at a given second (so a knack card can show the moment it came from).
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path


def probe_duration(data: bytes, suffix: str = ".mp4") -> float:
    """Length in seconds, measured rather than trusted."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as f:
        f.write(data)
        f.flush()
        out = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "json", f.name,
            ],
            capture_output=True, text=True, timeout=120,
        )
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {out.stderr[:300]}")
    return float(json.loads(out.stdout)["format"]["duration"])


def keyframe(data: bytes, at_s: float, suffix: str = ".mp4", width: int = 720) -> bytes:
    """One JPEG at `at_s`, for the card to show what the expert's hands did."""
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / f"in{suffix}"
        dst = Path(d) / "out.jpg"
        src.write_bytes(data)
        out = subprocess.run(
            [
                "ffmpeg", "-nostdin", "-v", "error",
                "-ss", f"{max(at_s, 0):.3f}", "-i", str(src),
                "-frames:v", "1", "-vf", f"scale={width}:-2",
                "-q:v", "4", "-y", str(dst),
            ],
            capture_output=True, text=True, timeout=180,
        )
        if out.returncode != 0 or not dst.exists():
            raise RuntimeError(f"ffmpeg failed: {out.stderr[:300]}")
        return dst.read_bytes()


def to_mp4(data: bytes, suffix: str) -> tuple[bytes, str]:
    """Normalise a browser recording to MP4/H.264.

    Phones hand us MP4 already. The in-browser recorder, which is where face
    blurring happens, produces WebM - and Gemini reads MP4 far more reliably.
    """
    if suffix.lower() in (".mp4", ".mov", ".m4v"):
        return data, "video/mp4"
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / f"in{suffix}"
        dst = Path(d) / "out.mp4"
        src.write_bytes(data)
        out = subprocess.run(
            [
                "ffmpeg", "-nostdin", "-v", "error", "-i", str(src),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-c:a", "aac", "-b:a", "96k", "-y", str(dst),
            ],
            capture_output=True, text=True, timeout=600,
        )
        if out.returncode != 0 or not dst.exists():
            raise RuntimeError(f"transcode failed: {out.stderr[:300]}")
        return dst.read_bytes(), "video/mp4"

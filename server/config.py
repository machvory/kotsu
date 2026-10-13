"""Runtime configuration. Everything comes from the environment so the same
image runs locally and on Cloud Run."""
import os

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
LOCATION = os.environ.get("KOTSU_LOCATION", "global")
BUCKET = os.environ.get("KOTSU_BUCKET", "")

# Gemini 3.8 Flash reads several videos in one call with per-second timestamps.
MODEL_ANALYST = os.environ.get("KOTSU_MODEL", "gemini-3.8-flash")
# The coach has to answer inside a worker's pause, so it gets the fastest model.
MODEL_COACH = os.environ.get("KOTSU_MODEL_COACH", "gemini-3.8-flash")

# Cloud Text-to-Speech, Gemini voice. Knack cards are read aloud because a
# worker with gloves and a soldering iron cannot hold a phone.
TTS_MODEL = os.environ.get("KOTSU_TTS_MODEL", "gemini-2.5-flash-tts")

# Languages a knack card can be taught in. Code -> (label, TTS locale, voice).
LANGUAGES = {
    "id": ("Bahasa Indonesia", "id-ID", "Kore"),
    "en": ("English", "en-US", "Kore"),
    "ja": ("日本語", "ja-JP", "Kore"),
    "vi": ("Tiếng Việt", "vi-VN", "Kore"),
}

MAX_UPLOAD_MB = int(os.environ.get("KOTSU_MAX_UPLOAD_MB", "120"))

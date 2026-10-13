<div align="center">

# KOTSU コツ

**Most AI watches. KOTSU asks.**

Your best worker's knack, taught to every worker.

**[Live prototype](https://kotsu-851289363685.asia-southeast1.run.app)** · **[Demo video (2:36)](https://drive.google.com/file/d/1X-M49uETMV7OWt5opsjBY9FGFRZNQFEh/view)**

</div>

---

## The problem

In Japanese manufacturing, 91.1% of companies say passing on skill matters and only
33.3% say it is working. The skill they name most often after precision work and
trouble handling is **勘・コツ** — *kan* and *kotsu*, the feel and the knack (JILPT,
survey of 4,342 companies, 27 May 2026).

A knack is the thing your best worker does that they cannot explain. They tap the
housing twice. They hold the fork with their left thumb. Ask them why and they say
"practice". It leaves with them when they retire, and the new worker — increasingly
one of the 635,075 foreign workers in Japanese manufacturing, or one of Indonesia's
20 million — has to rediscover it alone, in a second language.

## What KOTSU does

Film two phone videos of the same job: your expert, and someone new. Then:

| | Step | What happens |
|---|---|---|
| 1 | **Watch** | Gemini 3.8 Flash reads both videos at 4 fps, splits the job into the same steps for each, and finds what the expert's hands do *differently*. Every claim cites the second it was seen, in both videos. |
| 2 | **Ask** | KOTSU finds the moments the video **cannot** explain — a pause, a tap, a re-grip — and asks the expert about each one. They answer out loud, in their own language. Gemini transcribes it and folds their reason into the card. |
| 3 | **Teach** | The expert approves. Only then does the knack become a card in the new worker's language (ID / EN / JA / VI), with a one-line cue read aloud by Cloud Text-to-Speech for ears that are busy. |
| 4 | **Coach** | The new worker records an attempt. KOTSU checks it against the approved knacks, citing the second for each, and says **one** thing before the next try. |
| 5 | **Prove** | Time, defects and attempts-to-standard, with and without the cards. |

The Ask step is the part other tools do not have. Comparing expert and novice video
is established work — NEC, Mitsubishi Electric and tebiki all do it. Asking the
expert a question generated from their own footage, and closing the loop until the
new worker measurably improves, is where KOTSU is different.

## Why this cannot be faked

Three design decisions, because a confident wrong answer on a factory floor is worse
than no answer:

1. **Numbers are measured, not generated.** MediaPipe Hand Landmarker runs *in the
   browser* and produces hand travel, still time and pause counts. Those numbers are
   handed to Gemini as facts it may not contradict. See [`web/src/vision.js`](web/src/vision.js).
2. **Every claim must cite evidence, and the citation is checked.** The response
   schema makes a knack without timestamps impossible to return, and
   [`server/agents.py`](server/agents.py) `validate()` then checks each timestamp against the
   real duration from ffprobe. A knack that cites 0:42 of a 30-second video is
   quarantined and shown to the expert, not to a worker. The app shows what was held
   back rather than hiding it.
3. **The expert approves everything.** Nothing reaches a bench unapproved. Their name
   stays on the card and they can withdraw it.

Faces are found and blurred **in the browser**, before upload, so an unblurred frame
never reaches Cloud Storage. When no face is in shot — the usual case for a bench
camera — KOTSU says how many frames it checked instead of re-encoding for nothing.

Approved knacks export as **Open Knowledge Format**, Google Cloud's vendor-neutral
spec for curated agent context, with full provenance: who said it, which second it
came from, who approved it. The knowledge does not belong to KOTSU.

## Architecture

```
Phone / browser  ──  MediaPipe Hand Landmarker + Face Detector (on device)
       │                measure hands · blur faces · then upload
       ▼
Cloud Run (FastAPI + the built React app, one service, one URL)
       ├── Cloud Storage       the videos; Gemini reads them straight from gs://
       ├── Firestore           tasks, steps, knacks, questions, attempts
       ├── Vertex AI           Gemini 3.8 Flash — analyse · interview · teach · coach
       ├── Cloud Text-to-Speech  Gemini TTS voice for the spoken cue
       └── ffmpeg              true duration, and the still frame on each card
```

Five small agents over one model, in [`server/agents.py`](server/agents.py): Analyst,
Validator, Interviewer, Teacher, Coach. Prompts are in
[`server/prompts.py`](server/prompts.py); the schemas that force evidence are in
[`server/schemas.py`](server/schemas.py).

## Run it

```bash
# Google Cloud: Vertex AI, Cloud Storage, Firestore, Cloud Text-to-Speech, Cloud Run
gcloud auth application-default login
gcloud config set project YOUR_PROJECT
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT KOTSU_BUCKET=YOUR_BUCKET   # a private bucket for the videos

python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd web && npm ci && npm run build && cd ..
.venv/bin/uvicorn server.main:app --port 8080     # http://localhost:8080
```

Deploy to Cloud Run (Cloud Build + Artifact Registry, no local Docker needed):

```bash
KOTSU_BUCKET=YOUR_BUCKET ./deploy.sh
```

The Cloud Run service account needs `roles/datastore.user`, `roles/aiplatform.user`
and `roles/storage.objectAdmin` on the bucket; Cloud Build needs
`roles/cloudbuild.builds.builder` and `roles/artifactregistry.writer`.

Configuration is environment-only — see [`server/config.py`](server/config.py).

## Honest limits

- The `Prove` numbers are from a handful of attempts by a handful of people. The app
  says so on screen. It is an early signal, not a result.
- The coach reviews a recorded attempt. Live in-ear coaching during the work is the
  next step, not a claim we make today.
- Gemini's timestamps were within 0.1 s of ground truth on a controlled clip; on real
  factory footage they drift further, which is exactly why the validator exists.
- We are not the first to compare expert and novice video. NEC, Mitsubishi Electric,
  tebiki, Squint and Retrocausal all cover parts of this. We do not claim otherwise.

## Licence

Apache-2.0. The fonts in `web/public/fonts/` are Google Sans Flex under the SIL Open
Font Licence; the licence text ships beside them.

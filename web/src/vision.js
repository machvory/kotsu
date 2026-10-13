/** What the browser does before a single byte leaves the phone.
 *
 *  Two jobs, both deliberately on-device:
 *
 *  1. Measure. Gemini is excellent at explaining *why* a hand moves the way it
 *     does and poor at being a stopwatch. So the stopwatch is here: MediaPipe
 *     Hand Landmarker produces the distances and pauses, and those numbers are
 *     handed to the model as facts it may not contradict. A number KOTSU shows
 *     a worker was measured, never generated.
 *
 *  2. Blur faces. A tool that films people on a line earns its welcome or it
 *     does not get installed. Faces are found and blurred in the browser, so an
 *     unblurred frame never reaches Cloud Storage. When a scan finds no face at
 *     all — the usual case for a bench shot from above — we say so and upload
 *     the original rather than re-encoding it for nothing.
 */
import { FilesetResolver, HandLandmarker, FaceDetector } from "@mediapipe/tasks-vision";

const WASM = "/mediapipe";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const SAMPLE_FPS = 5;        // dense enough to catch a tap, cheap enough to be quick
const STILL = 0.004;         // normalised movement below this counts as "not moving"
const PAUSE_MIN_S = 0.4;     // a pause only counts once it is long enough to notice

let _vision, _hands, _faces;

async function vision() {
  if (!_vision) _vision = await FilesetResolver.forVisionTasks(WASM);
  return _vision;
}

async function handLandmarker() {
  if (!_hands) {
    _hands = await HandLandmarker.createFromOptions(await vision(), {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
  }
  return _hands;
}

async function faceDetector() {
  if (!_faces) {
    _faces = await FaceDetector.createFromOptions(await vision(), {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
  }
  return _faces;
}

/* --------------------------------------------------------------- utilities */

function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "auto";
    el.muted = true;
    el.playsInline = true;
    el.src = URL.createObjectURL(file);
    el.onloadedmetadata = () => resolve(el);
    el.onerror = () => reject(new Error("This file could not be read as a video."));
  });
}

function seek(el, t) {
  return new Promise((resolve, reject) => {
    const done = () => { el.removeEventListener("seeked", done); resolve(); };
    el.addEventListener("seeked", done);
    el.onerror = () => reject(new Error("Seeking failed while reading the video."));
    el.currentTime = Math.min(t, Math.max(el.duration - 0.05, 0));
  });
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ------------------------------------------------------------------ measure */

/**
 * Walk a video at SAMPLE_FPS and measure the hands.
 * @returns {{metrics: object, faceFrames: Array}}
 */
export async function scan(file, { onProgress } = {}) {
  const el = await loadVideo(file);
  const [hands, faces] = await Promise.all([handLandmarker(), faceDetector()]);

  const canvas = document.createElement("canvas");
  const w = (canvas.width = Math.min(el.videoWidth || 640, 640));
  const h = (canvas.height = Math.round(w * ((el.videoHeight || 360) / (el.videoWidth || 640))));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const duration = el.duration;
  const step = 1 / SAMPLE_FPS;
  const faceFrames = [];

  let prev = null, travel = 0, seen = 0, frames = 0;
  let stillRun = 0, pauses = 0, idle = 0;

  for (let t = 0; t < duration; t += step) {
    await seek(el, t);
    ctx.drawImage(el, 0, 0, w, h);
    const ms = Math.round(t * 1000);
    frames += 1;

    const hr = hands.detectForVideo(el, ms);
    const lm = hr?.landmarks?.[0];
    if (lm) {
      seen += 1;
      const wrist = lm[0];
      if (prev) {
        const d = dist(prev, wrist);
        travel += d;
        if (d < STILL) {
          stillRun += step;
          idle += step;
        } else {
          if (stillRun >= PAUSE_MIN_S) pauses += 1;
          stillRun = 0;
        }
      }
      prev = wrist;
    }

    const fr = faces.detectForVideo(el, ms);
    if (fr?.detections?.length) {
      faceFrames.push({
        t,
        boxes: fr.detections.map((d) => ({
          x: d.boundingBox.originX / w, y: d.boundingBox.originY / h,
          w: d.boundingBox.width / w, h: d.boundingBox.height / h,
        })),
      });
    }

    onProgress?.(Math.min(t / duration, 1));
  }
  if (stillRun >= PAUSE_MIN_S) pauses += 1;

  URL.revokeObjectURL(el.src);
  onProgress?.(1);

  return {
    metrics: {
      duration_s: round(duration, 2),
      frames_sampled: frames,
      sample_fps: SAMPLE_FPS,
      hands_visible_pct: frames ? round((seen / frames) * 100, 1) : 0,
      hand_travel: round(travel, 3),           // normalised screen widths
      hand_travel_per_s: duration ? round(travel / duration, 3) : 0,
      still_seconds: round(idle, 1),
      pauses_over_400ms: pauses,
    },
    faceFrames,
  };
}

const round = (n, d) => Number(n.toFixed(d));

/** Put the two measurements side by side for the model to reason over. */
export function compareMetrics(expert, novice) {
  const pct = (a, b) => (a && b ? round(((b - a) / a) * 100, 1) : null);
  return {
    expert,
    novice,
    difference: {
      novice_slower_by_pct: pct(expert.duration_s, novice.duration_s),
      novice_extra_hand_travel_pct: pct(expert.hand_travel, novice.hand_travel),
      novice_extra_still_seconds: round(novice.still_seconds - expert.still_seconds, 1),
      novice_extra_pauses: novice.pauses_over_400ms - expert.pauses_over_400ms,
    },
    measured_by: "MediaPipe Hand Landmarker, in the browser, before upload",
  };
}

/* --------------------------------------------------------------- blur faces */

/**
 * Re-encode the video with every detected face blurred.
 * Only worth calling when `scan` actually found a face.
 */
export async function blurFaces(file, faceFrames, { onProgress } = {}) {
  const el = await loadVideo(file);
  const canvas = document.createElement("canvas");
  canvas.width = el.videoWidth;
  canvas.height = el.videoHeight;
  const ctx = canvas.getContext("2d");

  // Nearest detection in time, so a face stays covered between samples.
  const boxesAt = (t) => {
    let best = null, bestDt = Infinity;
    for (const f of faceFrames) {
      const dt = Math.abs(f.t - t);
      if (dt < bestDt) { bestDt = dt; best = f; }
    }
    return bestDt <= 0.4 ? best.boxes : [];
  };

  const stream = canvas.captureStream(30);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("This browser cannot record the blurred video.");

  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const finished = new Promise((r) => (rec.onstop = r));
  rec.start();

  el.currentTime = 0;
  await el.play();

  await new Promise((resolve) => {
    const draw = () => {
      if (el.ended || el.paused) return resolve();
      ctx.filter = "none";
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      for (const b of boxesAt(el.currentTime)) {
        const x = b.x * canvas.width, y = b.y * canvas.height;
        const w = b.w * canvas.width, h = b.h * canvas.height;
        const pad = Math.max(w, h) * 0.25;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2 + pad, h / 2 + pad, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.filter = `blur(${Math.max(12, w * 0.4)}px)`;
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      onProgress?.(el.currentTime / el.duration);
      requestAnimationFrame(draw);
    };
    draw();
  });

  rec.stop();
  await finished;
  URL.revokeObjectURL(el.src);
  onProgress?.(1);

  return new File(chunks.map((c) => c), file.name.replace(/\.\w+$/, "") + "-blurred.webm", {
    type: "video/webm",
  });
}

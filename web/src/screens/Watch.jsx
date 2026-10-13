import React, { useRef, useState } from "react";
import { api } from "../api.js";
import { blurFaces, compareMetrics, scan } from "../vision.js";
import {
  Button, Chip, ErrorNote, Label, Link, RecordIcon, Screen, Stat, TimeChip, cx,
} from "../ui.jsx";

/** Before the recordings exist this is a capture screen with the full width.
 *  Afterwards it becomes the inspector beside the stage: the claims, each one
 *  clickable back to the two frames it came from. */
export default function Watch({ task, reload, go, focus, activeKnack }) {
  const [metrics, setMetrics] = useState({});
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState(null);

  const ready = Boolean(task.videos?.expert && task.videos?.novice);
  const knacks = task.knacks || [];
  const good = knacks.filter((k) => k.evidence_ok);
  const flagged = knacks.filter((k) => !k.evidence_ok);

  async function analyse() {
    setAnalysing(true); setError(null);
    try {
      const hands = metrics.expert && metrics.novice
        ? compareMetrics(metrics.expert, metrics.novice) : undefined;
      await api.analyse(task.id, hands ? { hands } : {});
      reload();
    } catch (e) { setError(e); } finally { setAnalysing(false); }
  }

  if (!knacks.length) {
    return (
      <Screen
        title="Two recordings of the same job"
        sub="Your phone, the same spot for both takes. Hands are measured and faces blurred in your browser, before anything is uploaded."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Slot role="expert" tone="accent" label={task.expert_name} taskId={task.id}
                existing={task.videos?.expert} onDone={reload}
                onMetrics={(m) => setMetrics((p) => ({ ...p, expert: m }))} />
          <Slot role="novice" tone="amber" label={task.worker_name || "New worker"} taskId={task.id}
                existing={task.videos?.novice} onDone={reload}
                onMetrics={(m) => setMetrics((p) => ({ ...p, novice: m }))} />
        </div>

        {ready && (
          <div className="mt-9">
            <Button variant="accent" busy={analysing} onClick={analyse}>
              {analysing ? "Watching both recordings" : "Find the knacks"}
            </Button>
            <p className="mt-3 text-[13px] text-muted">
              Gemini 3.8 Flash watches both at 4 frames a second. About a minute.
            </p>
          </div>
        )}
        <ErrorNote className="mt-6" error={error} what="analyse these videos" onRetry={analyse} />
      </Screen>
    );
  }

  return (
    <div>
      <header className="mb-5">
        <h2 className="text-[19px] leading-snug">
          {good.length} knack{good.length === 1 ? "" : "s"}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          What {task.expert_name}&rsquo;s hands do that {task.worker_name || "New worker"}&rsquo;s do not. Click a
          time to put both moments on screen.
        </p>
      </header>

      <div className="grid gap-2.5">
        {good.map((k) => (
          <Knack
            key={k.id} k={k}
            active={activeKnack === k.id}
            onPick={() => focus(k.expert_at_s, k.novice_at_s, k.id)}
          />
        ))}
      </div>

      {flagged.length > 0 && (
        <div className="mt-7 border-l-2 border-line-2 pl-3.5">
          <Label tone="amber">
            {flagged.length} claim{flagged.length === 1 ? "" : "s"} held back
          </Label>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Every claim is checked against the video it says it came from. These did not pass, so
            nobody is taught them. They are shown because hiding them would be worse.
          </p>
          <ul className="mt-2.5 grid gap-1.5">
            {flagged.map((k) => (
              <li key={k.id} className="text-[13px] leading-snug">
                {k.title}
                <span className="ml-1.5 text-[12px] text-worker-ink">
                  {(k.evidence_problems || []).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.measured && <Measured m={task.measured} expertName={task.expert_name} />}

      <div className="mt-8 flex items-center gap-4 border-t border-line pt-6">
        <Button variant="accent" size="sm" onClick={() => go("ask")}>
          Next: ask {task.expert_name} →
        </Button>
        <Link onClick={analyse}>{analysing ? "looking again…" : "look again"}</Link>
      </div>
      <ErrorNote className="mt-5" error={error} what="analyse these videos" />
    </div>
  );
}

/* -------------------------------------------------------------------- knack */

function Knack({ k, active, onPick }) {
  return (
    <button
      onClick={onPick}
      className={cx(
        "press w-full rounded-[10px] border p-4 text-left",
        active ? "border-ink/25 bg-surface" : "border-line bg-canvas hover:bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[15px] leading-snug" style={{ fontWeight: 560 }}>{k.title}</h3>
        <span className="shrink-0 text-[10px] uppercase tracking-[.1em] text-muted">{k.impact}</span>
      </div>

      <p className="mt-2.5 text-[14px] leading-snug text-accent-ink">{k.instruction}</p>

      <dl className="mt-3 grid gap-1.5 text-[12.5px] leading-snug">
        <div className="flex gap-2">
          <dt className="shrink-0"><TimeChip t={k.expert_at_s} /></dt>
          <dd className="min-w-0">{k.expert_does}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0"><TimeChip t={k.novice_at_s} /></dt>
          <dd className="min-w-0 text-muted">{k.novice_does}</dd>
        </div>
      </dl>

      <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{k.why_it_matters}</p>
    </button>
  );
}

/* --------------------------------------------------------------------- slot */

function Slot({ role, taskId, label, tone, existing, onMetrics, onDone }) {
  const [stage, setStage] = useState(null);
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const input = useRef(null);

  async function handle(file) {
    if (!file) return;
    setError(null); setNote(null);
    try {
      setStage("scanning"); setPct(0);
      const { metrics, faceFrames } = await scan(file, { onProgress: setPct });
      onMetrics(metrics);

      let upload = file;
      if (faceFrames.length) {
        setStage("blurring"); setPct(0);
        upload = await blurFaces(file, faceFrames, { onProgress: setPct });
        setNote(`${faceFrames.length} frames had a face. Blurred here, before upload.`);
      } else {
        setNote(`No face in ${metrics.frames_sampled} sampled frames. Nothing to blur.`);
      }

      setStage("uploading"); setPct(0);
      await api.uploadVideo(taskId, role, upload);
      setStage(null);
      onDone();
    } catch (e) { setError(e); setStage(null); }
  }

  const stageLabel = {
    scanning: "Measuring hands, checking for faces",
    blurring: "Blurring faces",
    uploading: "Uploading",
  }[stage];

  return (
    <div className="rounded-[14px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <Chip tone={tone} dot>{label}</Chip>
        {existing && (
          <span className="text-[12px] tabular-nums text-muted">
            {existing.duration_s}s · {existing.size_mb} MB
          </span>
        )}
      </div>

      {stage ? (
        <div className="mt-4">
          <p className="text-[13px]">{stageLabel}</p>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-black/[.06]">
            <div className={cx("h-full transition-[width]", tone === "accent" ? "bg-accent" : "bg-worker")}
                 style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <input ref={input} type="file" accept="video/*" capture="environment" className="hidden"
                 onChange={(e) => handle(e.currentTarget.files?.[0])} />
          {existing
            ? <Link onClick={() => input.current?.click()}>replace video</Link>
            : (
              <Button variant="solid" size="sm" onClick={() => input.current?.click()}>
                <RecordIcon width="16" height="16" /> Film or choose
              </Button>
            )}
        </div>
      )}

      {note && <p className="mt-3 text-[12px] leading-snug text-accent-ink">{note}</p>}
      <ErrorNote className="mt-3" error={error} what="prepare this video" />
    </div>
  );
}

/* -------------------------------------------------------- measured, not said */

const fmt = (n) => (n == null ? "—" : n > 0 ? `+${n}` : String(n));

function Measured({ m, expertName }) {
  const d = m.difference || {};
  return (
    <section className="mt-8 border-t border-line pt-6">
      <Label>Measured, not generated</Label>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        MediaPipe produced these in the browser. Gemini is given them as facts it may not contradict.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-5">
        <Stat label="Time" value={fmt(d.novice_slower_by_pct)} unit="%" tone="amber"
              basis={`${expertName} ${m.expert?.duration_s}s · new worker ${m.novice?.duration_s}s`} />
        <Stat label="Hand travel" value={fmt(d.novice_extra_hand_travel_pct)} unit="%" tone="amber"
              basis="Wrist distance, in screen widths" />
        <Stat label="Standing still" value={d.novice_extra_still_seconds} unit="s more" tone="amber"
              basis={`${expertName} ${m.expert?.still_seconds}s · new worker ${m.novice?.still_seconds}s`} />
        <Stat label="Pauses" value={fmt(d.novice_extra_pauses)} tone="amber"
              basis="Stops longer than 0.4 s" />
      </div>
    </section>
  );
}

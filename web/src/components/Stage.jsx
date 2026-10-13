/** The stage: both recordings, and the timeline that ties them together.
 *
 *  Kept on screen while you read the claims beside it, so a claim and the frame
 *  it came from are never more than a glance apart. */
import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { api } from "../api.js";
import { Chip, PlayIcon, clock } from "../ui.jsx";
import Timeline from "./Timeline.jsx";

const Stage = forwardRef(function Stage({ task, activeKnackId, onPick }, ref) {
  const a = useRef(null);
  const b = useRef(null);
  const [time, setTime] = useState({ a: 0, b: 0 });
  const [playing, setPlaying] = useState(false);

  const both = (fn) => [a, b].forEach((r) => r.current && fn(r.current));

  useImperativeHandle(ref, () => ({
    show(expertAt, noviceAt) {
      if (a.current && expertAt != null) a.current.currentTime = Math.max(expertAt, 0);
      if (b.current && noviceAt != null) b.current.currentTime = Math.max(noviceAt, 0);
      both((v) => v.pause());
      setPlaying(false);
    },
  }));

  const seek = (which, t, knackId) => {
    if (which === "both") {
      const k = (task.knacks || []).find((x) => x.id === knackId);
      if (k) onPick?.(k.expert_at_s, k.novice_at_s, k.id);
      return;
    }
    const v = (which === "a" ? a : b).current;
    if (v) v.currentTime = t;
  };

  return (
    /* The stage fills whatever height it is given: the recordings grow into the
       space and the timeline stays docked under them. Evidence should be the
       biggest thing on screen, not a thumbnail floating in a gap. */
    <div className="flex h-full min-h-0 w-full flex-col gap-5 p-6">
      <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-2">
        <Lane
          vref={a} tone="accent" label={task.expert_name}
          src={api.videoUrl(task.id, "expert")} time={time.a}
          onTime={(v) => setTime((p) => ({ ...p, a: v }))}
        />
        <Lane
          vref={b} tone="amber" label={task.worker_name || "New worker"}
          src={api.videoUrl(task.id, "novice")} time={time.b}
          onTime={(v) => setTime((p) => ({ ...p, b: v }))}
        />
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <button
          onClick={() => {
            if (playing) { both((v) => v.pause()); setPlaying(false); }
            else { both((v) => v.play().catch(() => {})); setPlaying(true); }
          }}
          className="press inline-flex h-9 items-center gap-2 rounded-full bg-black/[.05] px-4 text-[13px] hover:bg-black/[.09]"
          style={{ fontWeight: 560 }}
        >
          {playing ? "Pause both" : <><PlayIcon width="14" height="14" /> Play both</>}
        </button>
        <button
          onClick={() => { both((v) => { v.currentTime = 0; }); setTime({ a: 0, b: 0 }); }}
          className="text-[13px] text-muted hover:text-ink"
        >
          back to start
        </button>
      </div>

      <div className="shrink-0">
        <Timeline task={task} time={time} onSeek={seek} activeKnackId={activeKnackId} />
      </div>
    </div>
  );
});

function Lane({ vref, tone, label, src, time, onTime }) {
  return (
    <figure className="flex min-h-0 min-w-0 flex-col">
      <figcaption className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <Chip tone={tone} dot>{label}</Chip>
        <span className="font-mono text-[11px] tabular-nums text-muted">{clock(time)}</span>
      </figcaption>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[10px] border border-line bg-surface">
        <video
          ref={vref} src={src} playsInline preload="metadata" controls
          onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
          className="block h-full w-full object-contain"
        />
      </div>
    </figure>
  );
}

export default Stage;

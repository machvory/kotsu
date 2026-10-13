/** The shared timeline. This is the view the whole product turns on.
 *
 *  Two tracks on one ruler: the expert above, the new worker below. The job's
 *  steps are segments, so you can see at a glance where the new worker's time
 *  actually goes — it is almost never spread evenly. Knacks sit on the track as
 *  markers at the exact second they were observed, which is the claim and its
 *  evidence occupying the same pixel.
 *
 *  Each track is scaled to its own video's length, so the steps line up by
 *  position in the job rather than by clock time. That is the comparison that
 *  matters; identical clocks would just show that one bar is shorter.
 */
import React from "react";
import { clock, cx } from "../ui.jsx";

export default function Timeline({ task, time, onSeek, activeKnackId }) {
  const e = task.videos?.expert;
  const n = task.videos?.novice;
  if (!e || !n) return null;

  const steps = task.steps || [];
  const knacks = (task.knacks || []).filter((k) => k.evidence_ok);

  return (
    <div className="select-none">
      <Track
        label={task.expert_name} tone="accent" duration={e.duration_s} playhead={time?.a}
        segments={steps.map((s) => ({
          key: s.index, name: s.name, start: s.expert_start_s, end: s.expert_end_s,
        }))}
        markers={knacks.map((k) => ({ id: k.id, at: k.expert_at_s, title: k.title }))}
        activeKnackId={activeKnackId}
        onSeek={(t) => onSeek?.("a", t)}
        onMarker={(k) => onSeek?.("both", k.at, k.id)}
      />
      <Track
        label={task.worker_name || "New worker"} tone="amber" duration={n.duration_s} playhead={time?.b}
        segments={steps.map((s) => ({
          key: s.index, name: s.name, start: s.novice_start_s, end: s.novice_end_s,
        }))}
        markers={knacks.map((k) => ({ id: k.id, at: k.novice_at_s, title: k.title }))}
        activeKnackId={activeKnackId}
        onSeek={(t) => onSeek?.("b", t)}
        onMarker={(k) => onSeek?.("both", null, k.id)}
        className="mt-2"
      />
      <p className="mt-3 text-[11px] text-muted">
        Each track is drawn to its own recording&rsquo;s length, so the same step sits in the same
        place. {task.expert_name} took {clock(e.duration_s)}; {task.worker_name || "New worker"} took {clock(n.duration_s)}.
      </p>
    </div>
  );
}

function Track({
  label, tone, duration, segments, markers, playhead, activeKnackId,
  onSeek, onMarker, className,
}) {
  const trackRef = React.useRef(null);
  const [scrubbing, setScrubbing] = React.useState(false);
  const pct = (t) => Math.max(0, Math.min(100, (t / duration) * 100));

  const seekTo = (clientX) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    onSeek?.((x / r.width) * duration);
  };
  const accent = tone === "accent" ? "bg-accent" : "bg-worker";
  const label_c = tone === "accent" ? "text-accent-ink" : "text-worker-ink";
  const ring = tone === "accent" ? "ring-accent" : "ring-line-2";

  return (
    <div className={cx("flex items-center gap-3", className)}>
      <span
        className={cx(
          "w-[104px] shrink-0 truncate text-right text-[11px] uppercase tracking-[.1em]",
          label_c,
        )}
      >
        {label}
      </span>

      <div
        ref={trackRef}
        role="slider"
        aria-label={`${label} timeline`}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(playhead ?? 0)}
        tabIndex={0}
        onKeyDown={(ev) => {
          const step = ev.shiftKey ? 1 : 0.1;
          if (ev.key === "ArrowRight") { ev.preventDefault(); onSeek?.(Math.min((playhead ?? 0) + step, duration)); }
          if (ev.key === "ArrowLeft")  { ev.preventDefault(); onSeek?.(Math.max((playhead ?? 0) - step, 0)); }
        }}
        onPointerDown={(ev) => {
          // 1:1 scrubbing: the playhead follows the pointer for the whole
          // gesture, including outside the track, and updates continuously
          // rather than only on release.
          ev.currentTarget.setPointerCapture(ev.pointerId);
          setScrubbing(true);
          seekTo(ev.clientX);
        }}
        onPointerMove={(ev) => { if (scrubbing) seekTo(ev.clientX); }}
        onPointerUp={(ev) => {
          ev.currentTarget.releasePointerCapture(ev.pointerId);
          setScrubbing(false);
        }}
        onPointerCancel={() => setScrubbing(false)}
        className={cx(
          "relative h-9 flex-1 touch-none rounded-[6px] bg-black/[.04] transition-shadow",
          scrubbing ? "cursor-grabbing ring-2 ring-ink/15" : "cursor-pointer",
        )}
      >
        {/* the job's steps */}
        {segments.map((s, i) => (
          <div
            key={s.key ?? i}
            title={`${s.name} — ${clock(s.end - s.start)}`}
            className={cx(
              "absolute inset-y-[5px] rounded-[4px] opacity-70 transition-opacity hover:opacity-90",
              accent,
            )}
            style={{ left: `${pct(s.start)}%`, width: `${Math.max(pct(s.end - s.start), 0.8)}%` }}
          >
            <span className="pointer-events-none block truncate px-1.5 text-[10px] font-semibold leading-[26px] text-canvas">
              {i + 1}
            </span>
          </div>
        ))}

        {/* the knacks, at the second they were observed */}
        {markers.map((m) => (
          <button
            key={m.id}
            title={m.title}
            onClick={(ev) => { ev.stopPropagation(); onMarker?.(m); }}
            style={{ left: `${pct(m.at)}%` }}
            className={cx(
              "absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full",
              "ring-2 ring-offset-2 ring-offset-[color:var(--color-canvas)] transition-transform hover:scale-125",
              accent, ring,
              activeKnackId === m.id ? "scale-125" : "opacity-85",
            )}
          />
        ))}

        {/* where the video is now */}
        {playhead != null && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-white/70"
            style={{ left: `${pct(playhead)}%` }}
          />
        )}
      </div>

      <span className="w-11 shrink-0 font-mono text-[11px] tabular-nums text-muted">
        {clock(duration)}
      </span>
    </div>
  );
}

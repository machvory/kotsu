import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Empty, ErrorNote, Label, Skeleton, Stat, cx } from "../ui.jsx";

/** Did any of it work?
 *
 *  Times come from the recordings, defect counts come from a person, and the
 *  knack counts come from a review that had to cite a second for every call.
 *  Where a number cannot be supported, the screen says why rather than showing
 *  a plausible figure. */
export default function Prove({ task, go }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.progress(task.id).then(setP).catch(setError);
  }, [task.id, task.attempts?.length]);

  if (error) return <ErrorNote error={error} what="load the numbers" />;
  if (!p) return <Skeleton className="h-72" />;

  if (!p.attempts.length) {
    return (
      <Empty
        title="No attempt recorded yet"
        body="Record the new worker's attempts in Coach — before the cards and after — and the before/after appears here."
        action={<Button variant="accent" size="sm" onClick={() => go("coach")}>Go to Coach</Button>}
      />
    );
  }

  const max = Math.max(...p.attempts.map((a) => a.seconds || 0), p.expert_seconds || 0);
  const uncoached = p.attempts.filter((a) => !a.coached);
  const coached = p.attempts.filter((a) => a.coached);
  const avg = (xs) => (xs.length ? xs.reduce((s, a) => s + (a.seconds || 0), 0) / xs.length : null);
  const before = avg(uncoached), after = avg(coached);
  const people = new Set(p.attempts.map((a) => a.worker)).size;

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="mb-7">
        <h2 className="text-[22px] leading-snug">Did it actually help?</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
          Times are measured from the recordings. Defects are counted by a person. Knacks followed
          come from a Gemini review that had to cite a second for every call.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-7 border-y border-line py-7 md:grid-cols-4">
        <Stat label="Expert" value={p.expert_seconds?.toFixed?.(1)} unit="s" tone="accent"
              basis={`${task.expert_name}'s recording`} />
        <Stat label="First attempt" value={p.first_seconds?.toFixed?.(1)} unit="s" tone="amber"
              basis="New worker, before any card" />
        <Stat label="Latest attempt" value={p.last_seconds?.toFixed?.(1)} unit="s"
              tone={p.improvement_pct > 0 ? "accent" : "amber"}
              basis={p.improvement_pct != null
                ? `${p.improvement_pct > 0 ? "−" : "+"}${Math.abs(p.improvement_pct)}% against the first`
                : "needs two attempts"} />
        <Stat label="Attempts to standard" value={p.attempts_to_standard ?? "not yet"}
              tone={p.attempts_to_standard ? "accent" : "amber"}
              basis="Within 125% of the expert's time, no defects" />
      </div>

      {before != null && after != null && (
        <p className="mt-6 max-w-3xl text-[14px] leading-relaxed text-muted">
          Without the cards, {uncoached.length} attempt{uncoached.length === 1 ? "" : "s"} averaged{" "}
          <span className="tnum text-worker-ink">{before.toFixed(1)}s</span>. With them,{" "}
          {coached.length} attempt{coached.length === 1 ? "" : "s"} averaged{" "}
          <span className="tnum text-accent-ink">{after.toFixed(1)}s</span>.{" "}
          {p.attempts.length < 6 && (
            <>That is {p.attempts.length} attempts by {people} {people === 1 ? "person" : "people"} —
            an early signal, not a result.</>
          )}
        </p>
      )}

      <section className="mt-9">
        <Label className="mb-4">Every attempt</Label>
        <ul className="grid gap-4">
          {p.expert_seconds && (
            <Row label={`${task.expert_name} — expert`} seconds={p.expert_seconds} max={max}
                 tone="accent" meta="the target" />
          )}
          {p.attempts.map((a) => (
            <Row
              key={a.n} label={`Attempt ${a.n} — ${a.worker}`} seconds={a.seconds} max={max}
              tone={a.coached ? "accent" : "amber"}
              meta={[
                a.coached ? "with cards" : "no cards",
                a.knacks_total ? `${a.knacks_followed}/${a.knacks_total} knacks` : null,
                a.defects != null ? `${a.defects} defects` : "defects not counted",
              ].filter(Boolean).join(" · ")}
              say={a.say_next_time}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ label, seconds, max, tone, meta, say }) {
  const w = max ? Math.max(2, (seconds / max) * 100) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[14px]">{label}</span>
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted">
          {Number(seconds).toFixed(1)}s
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[.05]">
        <div className={cx("h-full rounded-full", tone === "accent" ? "bg-accent" : "bg-worker")}
             style={{ width: `${w}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-muted">{meta}</div>
      {say && <div className="mt-1 text-[12px] text-accent-ink">“{say}”</div>}
    </li>
  );
}

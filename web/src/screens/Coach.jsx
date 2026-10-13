import React, { useRef, useState } from "react";
import { api } from "../api.js";
import {
  Button, Chip, Empty, ErrorNote, Label, RecordIcon, TimeChip, cx,
} from "../ui.jsx";

/** The new worker tries again, and KOTSU checks the attempt against the
 *  approved knacks — citing the second it saw each one, and saying one thing
 *  before the next try. One thing: a worker told five changes nothing. */
export default function Coach({ task, reload, go }) {
  const approved = (task.knacks || []).filter((k) => k.status === "approved");
  const attempts = task.attempts || [];

  if (!approved.length) {
    return (
      <Empty
        title="No approved knack to coach against"
        body={`${task.expert_name} has to approve at least one knack first. Coaching someone on an unapproved guess is the thing this product exists to avoid.`}
        action={<Button variant="accent" size="sm" onClick={() => go("teach")}>Back to Teach</Button>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[22px] leading-snug">Record an attempt</h2>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
            KOTSU watches it against {approved.length} approved
            knack{approved.length === 1 ? "" : "s"} and says one thing before the next try.
          </p>
        </div>
        {attempts.length > 0 && (
          <Button variant="accent" size="sm" onClick={() => go("prove")}>See the numbers →</Button>
        )}
      </header>

      <Form task={task} reload={reload} />

      {attempts.length > 0 && (
        <section className="mt-9">
          <Label className="mb-3">
            {attempts.length} attempt{attempts.length === 1 ? "" : "s"}
          </Label>
          <div className="grid gap-3">
            {[...attempts].reverse().map((a) => (
              <Attempt key={a.id} a={a} task={task} approved={approved} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const field =
  "w-full h-10 rounded-[10px] border border-line bg-surface px-3 text-[14px] text-ink " +
  "placeholder:text-muted/70 focus:border-ink/40 focus:outline-none";

function Form({ task, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const input = useRef(null);

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setError(null);
    try {
      await api.addAttempt(task.id, {
        worker: fd.get("worker") || "new worker",
        seconds: fd.get("seconds") || 0,
        defects: fd.get("defects") === "" ? -1 : fd.get("defects"),
        coached: fd.get("coached") === "on",
        file: file || undefined,
      });
      setFile(null);
      form.reset();
      reload();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form className="rounded-[14px] border border-line bg-surface p-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <Label className="mb-1.5">Who tried it</Label>
          <input name="worker" className={field} placeholder="Dimas" />
        </label>
        <label className="block">
          <Label className="mb-1.5">Seconds</Label>
          <input name="seconds" type="number" step="0.1" min="0" className={field}
                 placeholder="from the video" />
        </label>
        <label className="block">
          <Label className="mb-1.5">Defects counted</Label>
          <input name="defects" type="number" min="0" className={field} placeholder="by a person" />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <input ref={input} type="file" accept="video/*" capture="environment" className="hidden"
               onChange={(e) => setFile(e.currentTarget.files?.[0] || null)} />
        <Button type="button" variant="solid" size="sm" onClick={() => input.current?.click()}>
          <RecordIcon width="16" height="16" /> {file ? "Change video" : "Add the attempt video"}
        </Button>
        {file && <span className="text-[12px] text-muted">{file.name}</span>}
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" name="coached" className="accent-[color:var(--color-teal)]" />
          They had the knack cards
        </label>
      </div>

      <ErrorNote className="mt-5" error={error} what="save this attempt" />

      <div className="mt-5 flex items-center gap-4 border-t border-line pt-5">
        <Button type="submit" variant="accent" size="sm" busy={busy}>Save attempt</Button>
        <p className="text-[12px] text-muted">
          {file ? "KOTSU will watch it against the approved knacks."
                : "Without a video, only the time and defect count are recorded."}
        </p>
      </div>
    </form>
  );
}

function Attempt({ a, task, approved }) {
  const review = a.review;
  const followed = review?.followed || [];
  const hit = followed.filter((f) => f.followed).length;

  return (
    <article className="rounded-[14px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[.05] text-[12px] tnum">
            {a.n}
          </span>
          <div>
            <div className="text-[15px]" style={{ fontWeight: 560 }}>{a.worker}</div>
            <div className="text-[11px] text-muted">
              {new Date(a.at).toLocaleString()} · {a.coached ? "with knack cards" : "without cards"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="mute">{Number(a.seconds).toFixed(1)}s</Chip>
          {review && (
            <Chip tone={hit === approved.length ? "accent" : "amber"}>
              {hit}/{approved.length} knacks
            </Chip>
          )}
          {review?.defects_seen > 0 && <Chip tone="red">{review.defects_seen} defects seen</Chip>}
        </div>
      </div>

      {review ? (
        <>
          <ul className="mt-4 grid gap-2">
            {followed.map((f) => {
              const k = (task.knacks || []).find((x) => x.id === f.knack_id);
              return (
                <li key={f.knack_id} className="flex items-start gap-2.5 text-[13px] leading-snug">
                  <span className={cx("mt-px shrink-0", f.followed ? "text-accent-ink" : "text-worker-ink")}>
                    {f.followed ? "✓" : "✗"}
                  </span>
                  <span className="min-w-0 flex-1">
                    {k?.title || f.knack_id}
                    <span className="mt-0.5 block text-[12px] text-muted">{f.evidence}</span>
                  </span>
                  <TimeChip t={f.evidence_at_s} />
                  {f.confidence === "unsure" && <Chip tone="amber">unsure</Chip>}
                </li>
              );
            })}
          </ul>
          {review.say_next_time && (
            <p className="mt-4 border-l-2 border-accent pl-3.5 text-[16px] leading-snug text-ink">
              “{review.say_next_time}”
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-[12px] text-muted">
          No video was attached, so this attempt counts for the time and defect figures only.
        </p>
      )}
    </article>
  );
}

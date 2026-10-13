import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import {
  Button, Chip, CircleAction, Empty, ErrorNote, Label, Link, MicIcon, Quote,
  StopIcon, TimeChip, clock, cx,
} from "../ui.jsx";

/** The one step that is not watching.
 *
 *  A camera records what the hands did; it cannot record why. These questions
 *  are written from the expert's own video, and the expert answers them out
 *  loud, in their own words. One question at a time — that is how you ask a
 *  person something — with the stage beside it holding the moment in view. */
export default function Ask({ task, reload, go, focus }) {
  const questions = task.questions || [];
  const [i, setI] = useState(() =>
    Math.max(questions.findIndex((q) => q.status !== "answered"), 0));

  const q = questions[Math.min(i, Math.max(questions.length - 1, 0))];

  // Put the moment being asked about on the stage, so the two always agree.
  useEffect(() => { if (q) focus?.(q.at_s, null, null); }, [q?.id]); // eslint-disable-line

  if (!questions.length) {
    return (
      <Empty
        title="Nothing to ask yet"
        body="KOTSU writes its questions from the expert's own video. Analyse the two recordings first."
        action={<Button variant="accent" size="sm" onClick={() => go("watch")}>Back to Watch</Button>}
      />
    );
  }

  const answered = questions.filter((x) => x.status === "answered").length;

  return (
    <div>
      <header className="mb-5">
        <h2 className="text-[19px] leading-snug">Question for {task.expert_name}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Moments the video cannot explain. Their answer becomes the reason on the card.
        </p>
      </header>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex gap-1.5">
          {questions.map((x, n) => (
            <button
              key={x.id} onClick={() => setI(n)} aria-label={`Question ${n + 1}`}
              aria-current={n === i}
              className={cx(
                "h-1 w-8 rounded-full transition-colors",
                n === i ? "bg-accent" : x.status === "answered" ? "bg-accent/35" : "bg-black/[.09]",
              )}
            />
          ))}
        </div>
        <span className="text-[12px] tabular-nums text-muted">
          {answered} of {questions.length} answered
        </span>
      </div>

      <Question
        key={q.id} q={q} task={task} reload={reload} onJump={() => focus?.(q.at_s, null, null)}
        onNext={i < questions.length - 1 ? () => setI(i + 1) : null}
        onDone={() => go("teach")}
      />
    </div>
  );
}

function Question({ q, task, reload, onNext, onDone, onJump }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const rec = useRef(null);
  const chunks = useRef([]);

  const answered = q.status === "answered" || result;
  const knack = (task.knacks || []).find(
    (k) => Math.abs((k.expert_at_s ?? -99) - q.at_s) < 1.5);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find((m) => MediaRecorder.isTypeSupported(m));
      rec.current = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.current.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.current.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.current.mimeType });
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        send({ audio: new File([blob], `answer.${ext}`, { type: blob.type }) });
      };
      rec.current.start();
      setRecording(true);
    } catch {
      setError(new Error("The microphone could not be opened. Allow access, or type the answer."));
      setTyping(true);
    }
  }

  async function send(payload) {
    setBusy(true); setError(null);
    try {
      const r = await api.answer(task.id, q.id, { ...payload, knackId: knack?.id });
      setResult(r.merge);
      reload();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <div>
      <button
        onClick={onJump}
        className="press flex w-full items-center gap-3 rounded-[10px] border border-line bg-surface p-2.5 text-left hover:bg-raise"
      >
        <div className="relative shrink-0">
          <img
            src={api.frameUrl(task.id, "expert", q.at_s)}
            alt={`${task.expert_name} at ${clock(q.at_s)}`}
            className="h-[54px] w-[90px] rounded-[7px] bg-black object-cover"
          />
          <span className="absolute bottom-1 left-1"><TimeChip t={q.at_s} /></span>
        </div>
        <p className="min-w-0 text-[13px] leading-snug text-muted">{q.observation}</p>
      </button>

      <div className="mt-6">
        <Label>KOTSU asks</Label>
        <h3 className="mt-2.5 text-[22px] leading-[1.25]" style={{ fontWeight: 560 }}>
          {q.question}
        </h3>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">{q.why_video_cannot_answer}</p>
      </div>

      {answered ? (
        <div className="mt-7">
          <Quote label={task.expert_name}
                 by={q.answer_audio ? "spoken, transcribed by Gemini" : "typed"}>
            “{q.answer_text ?? text}”
          </Quote>
          {result && <Merged result={result} />}
          <div className="mt-7">
            {onNext
              ? <Button variant="accent" size="sm" onClick={onNext}>Next question</Button>
              : <Button variant="accent" size="sm" onClick={onDone}>Make the cards →</Button>}
          </div>
        </div>
      ) : (
        <div className="mt-8">
          {typing ? (
            <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ text }); }}>
              <textarea
                rows={4} value={text} onChange={(e) => setText(e.target.value)}
                aria-label={`${task.expert_name}'s answer`}
                className="w-full resize-y rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-muted/70 focus:border-ink/40 focus:outline-none"
                placeholder={`${task.expert_name}'s answer, in their own words.`}
              />
              <div className="mt-3.5 flex items-center gap-4">
                <Button type="submit" variant="accent" size="sm" busy={busy} disabled={!text.trim()}>
                  Fold it in
                </Button>
                <Link type="button" onClick={() => setTyping(false)}>answer out loud instead</Link>
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center">
              <CircleAction
                size={76}
                tone={recording ? "red" : busy ? "accent" : "idle"}
                icon={recording ? <StopIcon /> : <MicIcon width="26" height="26" />}
                label={recording ? "Recording — tap to stop"
                      : busy ? "Transcribing" : `Record ${task.expert_name}'s answer`}
                busy={busy}
                onClick={() => {
                  if (recording) { setRecording(false); rec.current?.stop(); }
                  else start();
                }}
              />
              {!busy && <Link className="mt-5" onClick={() => setTyping(true)}>type it instead</Link>}
            </div>
          )}
        </div>
      )}

      <ErrorNote className="mt-6" error={error} what="record this answer" />
    </div>
  );
}

function Merged({ result }) {
  const isNew = result.is_new_knack && !result.changed;
  if (!result.changed && !isNew) {
    return <p className="mt-5 text-[13px] leading-relaxed text-muted">{result.note}</p>;
  }
  return (
    <div className="mt-6 border-t border-line pt-5">
      <Chip tone="accent" dot>{isNew ? "a knack the video never showed" : "card updated"}</Chip>
      <h4 className="mt-3 text-[17px] leading-snug">{result.updated_title}</h4>
      <p className="mt-1.5 text-[14px] leading-relaxed">{result.updated_instruction}</p>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        Still has to be approved before anyone is taught it.
      </p>
    </div>
  );
}

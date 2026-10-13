import React, { useState } from "react";
import { api } from "../api.js";
import {
  ApprovedBy, Button, Empty, ErrorNote, Label, Link, Quote, Segmented, TimeChip, cx,
} from "../ui.jsx";

const LANGS = [
  { value: "id", label: "Indonesia" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語", jp: true },
  { value: "vi", label: "Tiếng Việt" },
];

/** The expert signs off, and the knack becomes a card in the language the
 *  worker actually thinks in — with one line their ear can catch while their
 *  hands are busy. */
export default function Teach({ task, reload, go }) {
  const [lang, setLang] = useState(task.language || "id");
  const usable = (task.knacks || []).filter((k) => k.evidence_ok);
  const approved = usable.filter((k) => k.status === "approved");

  if (!usable.length) {
    return (
      <Empty
        title="Nothing to teach yet"
        body="Knacks appear here once the two recordings have been compared and the evidence checks out."
        action={<Button variant="accent" size="sm" onClick={() => go("watch")}>Back to Watch</Button>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[22px] leading-snug">
            {approved.length} of {usable.length} approved by {task.expert_name}
          </h2>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
            Nothing reaches a bench until the expert approves it. Their name stays on it and they
            can withdraw it at any time.
          </p>
        </div>
        <Segmented options={LANGS} value={lang} onChange={setLang} />
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {usable.map((k) => <Card key={k.id} k={k} task={task} lang={lang} reload={reload} />)}
      </div>

      {approved.length > 0 && (
        <>
          <Okf task={task} />
          <div className="mt-8 border-t border-line pt-6">
            <Button variant="accent" size="sm" onClick={() => go("coach")}>Next: coach →</Button>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ k, task, lang, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const card = k.cards?.[lang];
  const approved = k.status === "approved";
  const jp = lang === "ja" ? "jp" : "";

  const run = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); reload(); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <article className={cx(
      "flex flex-col overflow-hidden rounded-[14px] border bg-surface",
      approved ? "border-line" : "border-line",
    )}>
      <img
        src={api.frameUrl(task.id, "expert", k.expert_at_s)}
        alt={`What ${task.expert_name}'s hands do at ${k.expert_at_s} seconds`}
        loading="lazy"
        className="aspect-[16/8] w-full bg-black object-cover"
      />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className={cx("min-w-0 text-[17px] leading-snug", jp)} style={{ fontWeight: 560 }}>
            {card?.title || k.title}
          </h3>
          <TimeChip t={k.expert_at_s} />
        </div>

        {card ? (
          <div className={cx("mt-3.5 grid gap-2.5", jp)}>
            <p className="text-[15px] leading-snug text-accent-ink">✓ {card.do_this}</p>
            <p className="text-[15px] leading-snug text-worker-ink">✗ {card.not_this}</p>
            <p className="text-[13px] leading-relaxed text-muted">{card.because}</p>

            <div className="mt-1 rounded-[10px] bg-raise p-3">
              <Label>In their ear</Label>
              <p className="mt-1.5 text-[15px] leading-snug">“{card.spoken_cue}”</p>
              {card.audio_path ? (
                <audio controls preload="none" src={api.audioUrl(task.id, k.id, lang)}
                       className="mt-2.5 h-8 w-full" />
              ) : (
                <p className="mt-2 text-[12px] text-worker-ink">
                  Spoken audio unavailable{card.audio_error ? `: ${card.audio_error}` : "."} The
                  text still works.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3.5 text-[14px] leading-relaxed text-muted">{k.instruction}</p>
        )}

        {k.expert_reason && (
          <div className="mt-4">
            <Quote label="Why" by={`${task.expert_name}, asked by KOTSU`}>
              <span className="text-[14px]">“{k.expert_reason}”</span>
            </Quote>
          </div>
        )}

        <ErrorNote className="mt-4" error={error} what="update this card" />

        <div className="mt-auto pt-5">
          {approved ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ApprovedBy name={task.expert_name} />
              <div className="flex items-center gap-4">
                <Button variant="solid" size="sm" busy={busy}
                        onClick={() => run(() => api.card(task.id, k.id, lang))}>
                  {card ? "Rebuild" : "Make the card"}
                </Button>
                <Link onClick={() => run(() => api.approve(task.id, k.id, false))}>withdraw</Link>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Button variant="accent" size="sm" busy={busy}
                      onClick={() => run(() => api.approve(task.id, k.id, true))}>
                {task.expert_name} approves this
              </Button>
              <Link onClick={() => run(() => api.approve(task.id, k.id, false))}>not right</Link>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function Okf({ task }) {
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setBusy(true); setError(null);
    try { setText(await api.okf(task.id)); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <section className="mt-10 border-t border-line pt-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="text-[17px]">These knacks do not belong to KOTSU</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Approved knacks export as Open Knowledge Format, Google Cloud&rsquo;s vendor-neutral
            spec for curated agent context — with who said it, which second it came from, and who
            approved it.
          </p>
        </div>
        <Button variant="ghost" size="sm" busy={busy} onClick={load}>
          {text ? "Refresh" : "Show the export"}
        </Button>
      </div>
      <ErrorNote className="mt-4" error={error} what="build the export" />
      {text && (
        <pre className="mt-4 max-h-80 overflow-auto rounded-[10px] border border-line bg-raise p-4 font-mono text-[12px] leading-relaxed text-muted">
          {text}
        </pre>
      )}
    </section>
  );
}

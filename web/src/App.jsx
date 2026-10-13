import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { Button, Empty, ErrorNote, Group, Label, Link, Row, Skeleton, Wordmark } from "./ui.jsx";
import Task from "./screens/Task.jsx";

function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export const go = (path) => { window.location.hash = path; };

/** The app fills the viewport and does not scroll as a page: the stage stays
 *  put and only the panel beside it moves, the way a review tool behaves.
 *  Below `lg` that inverts — the phone gets one scrolling column. */
export default function App() {
  const route = useRoute();
  const taskId = route.startsWith("/task/") ? route.slice(6).split("/")[0] : null;

  if (taskId) return <Task id={taskId} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="material sticky top-0 z-30 flex h-14 items-center gap-4 px-6">
        <a href="#/" aria-label="KOTSU home"><Wordmark size={17} /></a>
        <span className="ml-auto hidden text-[13px] text-muted sm:block">
          Your best worker&rsquo;s knack, taught to every worker
        </span>
      </header>
      <main className="flex-1 px-6 py-12">
        {route === "/new" ? <NewTask /> : <Home />}
      </main>
    </div>
  );
}

/* --------------------------------------------------------------------- home */

const HOW = [
  ["Watch", "Two phone videos of the same job. Gemini reads both at 4 frames a second and finds what the expert's hands do differently — citing the second it saw each one, in both videos."],
  ["Ask", "The part no camera can do. KOTSU finds the moments the video cannot explain — a pause, a tap, a re-grip — and asks the expert. They answer out loud, in their own words."],
  ["Teach", "The expert approves, and the knack becomes a card in the new worker's language, with one line short enough to hear while their hands are busy."],
  ["Coach", "The new worker records an attempt. KOTSU checks it against the approved knacks and says one thing before the next try."],
  ["Prove", "Time, defects and attempts-to-standard, with the cards and without."],
];

function Home() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.listTasks().then(setTasks).catch((e) => { setTasks([]); setError(e); });
  }, []);
  useEffect(load, [load]);

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div>
          <h1 className="t-display">
            Most AI watches.<br />KOTSU asks.
          </h1>
          <p className="t-body mt-4 max-w-[46ch] text-muted">
            In Japanese manufacturing 91% of companies say passing on skill matters, and only 33%
            say it is working. The skill they name most often is <span className="jp">コツ</span> —
            the knack: the thing your best worker does that they cannot explain.
          </p>
          <p className="t-small mt-2 text-faint">
            JILPT, survey of 4,342 companies, 27 May 2026
          </p>
          <div className="mt-7 flex items-center gap-5">
            <Button variant="accent" onClick={() => go("/new")}>Start a task</Button>
            <span className="t-small text-muted">One job, filmed twice.</span>
          </div>
        </div>

        <ol className="grid gap-px overflow-hidden rounded-[14px] border border-line bg-[color:var(--color-line)]">
          {HOW.map(([name, body], i) => (
            <li key={name} className="bg-canvas px-5 py-4">
              <div className="flex items-baseline gap-3">
                <span className="t-label w-4 shrink-0 text-faint tnum">{i + 1}</span>
                <h2 className="text-[15px]" style={{ fontWeight: 560 }}>{name}</h2>
              </div>
              <p className="t-small mt-1.5 pl-7 text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14">
        {error && <ErrorNote error={error} onRetry={load} what="load your tasks" />}

        {!tasks && !error && (
          <div className="grid gap-2"><Skeleton className="h-[72px]" /><Skeleton className="h-[72px]" /></div>
        )}

        {tasks?.length === 0 && !error && (
          <Empty
            title="No task yet"
            body="Start one above, then film your expert and a new worker doing the same job."
          />
        )}

        {tasks?.length > 0 && (
          <>
            <Label className="mb-3">Tasks</Label>
            <Group>
              {tasks.map((t) => (
                <Row
                  key={t.id}
                  dot={t.knacks ? "accent" : "amber"}
                  title={t.title}
                  sub={t.expert_name}
                  right={t.knacks ? `${t.knacks} knacks` : "not analysed"}
                  onClick={() => go(`/task/${t.id}`)}
                />
              ))}
            </Group>
          </>
        )}
      </section>

      <footer className="mt-16 border-t border-line pt-6">
        <p className="t-small text-faint">
          Machvory Digital Engineering, Jakarta. Built on Google Cloud — Gemini 3.8 Flash on
          Vertex AI, Cloud Run, Firestore, Cloud Storage, Cloud Text-to-Speech, and MediaPipe in
          the browser. Nothing here claims to be the first to compare an expert and a novice on
          video; the <em>asking</em> is what is different.
        </p>
      </footer>
    </div>
  );
}

/* ----------------------------------------------------------------- new task */

const field =
  "w-full rounded-[10px] border border-line bg-canvas px-3.5 py-2.5 text-[15px] text-ink " +
  "placeholder:text-muted/70 focus:border-accent-ink focus:outline-none";

function NewTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    try {
      const t = await api.createTask(Object.fromEntries(fd));
      go(`/task/${t.id}`);
    } catch (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <h1 className="t-title">Start a task</h1>
      <p className="t-body mt-2 text-muted">Keep the camera in the same place for both takes.</p>

      <form className="mt-9 grid gap-6" onSubmit={submit}>
        <div>
          <Label className="mb-2">What is the job?</Label>
          <input name="title" required className={field}
                 placeholder="Soldering a 6-pin header onto a board" />
        </div>
        <div>
          <Label className="mb-2">Who is the expert?</Label>
          <input name="expert_name" required className={field} placeholder="Pak Harjo" />
          <p className="t-small mt-2 text-muted">
            Their name goes on every knack. Nothing is taught to anyone until they approve it.
          </p>
        </div>
        <div>
          <Label className="mb-2">Who is the new worker?</Label>
          <input name="worker_name" className={field} placeholder="Dimas" />
        </div>
        <div>
          <Label className="mb-2">Anything the camera will not show?</Label>
          <input name="hint" className={field} placeholder="Six joints. A cold joint is a defect." />
        </div>
        <div>
          <Label className="mb-2">Which language will the new worker read?</Label>
          <select name="language" defaultValue="id" className={field}>
            <option value="id">Bahasa Indonesia</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="vi">Tiếng Việt</option>
          </select>
        </div>

        <ErrorNote error={error} what="start this task" />

        <div className="flex items-center gap-5">
          <Button type="submit" variant="accent" busy={busy}>Start</Button>
          <Link type="button" onClick={() => go("/")}>cancel</Link>
        </div>
      </form>
    </div>
  );
}

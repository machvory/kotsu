import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { ErrorNote, Skeleton, Wordmark, cx } from "../ui.jsx";
import Stage from "../components/Stage.jsx";
import Watch from "./Watch.jsx";
import Ask from "./Ask.jsx";
import Teach from "./Teach.jsx";
import Coach from "./Coach.jsx";
import Prove from "./Prove.jsx";

const STEPS = [
  { key: "watch", label: "Watch" },
  { key: "ask",   label: "Ask" },
  { key: "teach", label: "Teach" },
  { key: "coach", label: "Coach" },
  { key: "prove", label: "Prove" },
];

/** Steps that read against the two recordings keep the stage. The others take
 *  the full width — a video they do not refer to is just decoration. */
const WITH_STAGE = new Set(["watch", "ask"]);

export default function Task({ id }) {
  const [task, setTask] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState("watch");
  const [activeKnack, setActiveKnack] = useState(null);
  const stage = useRef(null);

  const load = useCallback(() => {
    setError(null);
    api.getTask(id).then(setTask).catch(setError);
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!task) return;
    if ((task.attempts || []).length) setStep("prove");
    else if ((task.knacks || []).some((k) => k.status === "approved")) setStep("teach");
    else if (task.knacks?.length) setStep("ask");
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return <Shell><div className="p-8"><ErrorNote error={error} onRetry={load} what="open this task" /></div></Shell>;
  }
  if (!task) {
    return (
      <Shell>
        <div className="grid gap-4 p-8"><Skeleton className="h-8 w-80" /><Skeleton className="h-[420px]" /></div>
      </Shell>
    );
  }

  const done = new Set();
  if (task.knacks?.length) done.add("watch");
  if ((task.questions || []).some((q) => q.status === "answered")) done.add("ask");
  if ((task.knacks || []).some((k) => k.cards)) done.add("teach");
  if ((task.attempts || []).length) { done.add("coach"); done.add("prove"); }

  const hasStage = WITH_STAGE.has(step) && task.videos?.expert && task.videos?.novice;

  const focus = (expertAt, noviceAt, knackId) => {
    setActiveKnack(knackId ?? null);
    stage.current?.show(expertAt, noviceAt);
  };

  const props = { task, reload: load, go: setStep, focus, activeKnack };
  const pane = (
    <>
      {step === "watch" && <Watch {...props} />}
      {step === "ask"   && <Ask {...props} />}
      {step === "teach" && <Teach {...props} />}
      {step === "coach" && <Coach {...props} />}
      {step === "prove" && <Prove {...props} />}
    </>
  );

  return (
    <Shell task={task} step={step} done={done} onGo={setStep}>
      {hasStage ? (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* The stage holds still. Only the panel beside it moves. */}
          <div className="flex min-h-[46vh] min-w-0 flex-1 lg:min-h-0">
            <Stage ref={stage} task={task} activeKnackId={activeKnack} onPick={focus} />
          </div>
          <aside className="flex min-h-0 w-full shrink-0 flex-col border-line lg:w-[420px] lg:border-l xl:w-[460px]">
            <div className="min-h-0 flex-1 overflow-y-auto px-7 py-7">{pane}</div>
          </aside>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-9 lg:px-10">{pane}</div>
      )}
    </Shell>
  );
}

/** The chrome: wordmark, what you are looking at, and where you are in it —
 *  all in one bar, so the workspace below it is entirely content. */
function Shell({ task, step, done, onGo, children }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="material z-30 flex h-14 shrink-0 items-center gap-5 border-b border-line px-5">
        <a href="#/" aria-label="KOTSU home" className="shrink-0"><Wordmark size={17} /></a>

        {task && (
          <>
            <span className="hidden h-5 w-px shrink-0 bg-[color:var(--color-line)] sm:block" />
            <div className="hidden min-w-0 shrink sm:block">
              <p className="truncate text-[14px] leading-tight" style={{ fontWeight: 560 }}>
                {task.title}
              </p>
              <p className="truncate text-[12px] leading-tight text-muted">{task.expert_name}</p>
            </div>

            <nav aria-label="Progress" className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto">
              {STEPS.map((s, i) => {
                const now = s.key === step;
                return (
                  <button
                    key={s.key}
                    onClick={() => onGo(s.key)}
                    aria-current={now ? "step" : undefined}
                    className={cx(
                      "press flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[13px]",
                      now ? "bg-surface text-ink" : "text-muted hover:bg-surface hover:text-ink",
                    )}
                    style={now ? { fontWeight: 560 } : undefined}
                  >
                    <span
                      className={cx(
                        "flex h-[17px] w-[17px] items-center justify-center rounded-full text-[10px] tnum",
                        now ? "bg-ink text-canvas"
                            : done.has(s.key) ? "bg-accent text-canvas" : "bg-raise text-faint",
                      )}
                      style={{ fontWeight: 600 }}
                    >
                      {done.has(s.key) && !now ? "✓" : i + 1}
                    </span>
                    {s.label}
                  </button>
                );
              })}
            </nav>
          </>
        )}
      </header>

      {children}
    </div>
  );
}

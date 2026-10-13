/** The KOTSU interface vocabulary.
 *
 *  These are the components the film's phone screens are made of, nothing more:
 *  a screen title, one grouped list, a segmented control, a circular action, a
 *  numbered instruction, a quote with a teal rule, a chip. If a screen needs
 *  something outside this set, the screen is usually doing too much.
 *
 *  See docs/DESIGN.md. Teal is the expert and what is correct; amber is the new
 *  worker and what needs attention; red is a defect. They never swap.
 */
import React from "react";

export const cx = (...a) => a.filter(Boolean).join(" ");

/** 42.3 -> "0:42". People on a line read clock time, not decimals. */
export const clock = (s) => {
  if (s == null || Number.isNaN(Number(s))) return "—";
  const total = Math.round(Number(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/* ---------------------------------------------------------------- wordmark */

export function Wordmark({ size = 20, className }) {
  return (
    <span className={cx("inline-block whitespace-nowrap leading-none", className)}>
      <span style={{ fontSize: size, fontWeight: 600, letterSpacing: ".06em" }}>KOTSU</span>
      <span
        className="jp text-muted"
        style={{ fontSize: size * 0.45, fontWeight: 560, marginLeft: ".14em", letterSpacing: ".04em" }}
      >
        コツ
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ screen */

/** A screen has a title, maybe a line under it, and then content. Nothing else
 *  competes at the top. */
export function Screen({ title, sub, action, children, className }) {
  return (
    <section className={cx("mx-auto w-full max-w-[600px]", className)}>
      {title && (
        <header className="mb-7">
          <h2 className="text-[30px] leading-[1.12] md:text-[34px]">{title}</h2>
          {sub && <p className="mt-2 text-[15px] leading-relaxed text-muted">{sub}</p>}
          {action && <div className="mt-5">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** A section label: 11px, uppercase, tracked. The only all-caps in the app. */
export function Label({ children, tone = "mute", className }) {
  const c = { mute: "text-muted", accent: "text-accent-ink", amber: "text-worker-ink" }[tone];
  return (
    <div className={cx("text-[11px] font-semibold uppercase tracking-[.12em]", c, className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ groups */

/** The one container the design allows: a grouped list, radius 22, hairline,
 *  dividers inset from the left the way the phone screens draw them. */
export function Group({ children, className }) {
  return (
    <div className={cx("overflow-hidden rounded-[22px] border border-line bg-surface", className)}>
      {children}
    </div>
  );
}

export function Row({ dot, title, sub, right, onClick, className }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cx(
        "press relative flex w-full items-center gap-4 px-5 py-4 text-left",
        "after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-[color:var(--color-line)]",
        "last:after:hidden",
        onClick && "transition-colors hover:bg-black/[.02]",
        dot && "pl-12",
        className,
      )}
    >
      {dot && (
        <i
          className={cx(
            "absolute left-5 top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full",
            dot === "accent" ? "bg-accent" : dot === "amber" ? "bg-worker" : "bg-faint",
          )}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px]" style={{ fontWeight: 560 }}>{title}</span>
        {sub && <span className="mt-0.5 block truncate text-[14px] text-muted">{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-[13px] text-muted">{right}</span>}
    </Tag>
  );
}

/* ----------------------------------------------------------------- actions */

/** The primary action, as the film draws it: a filled circle with the label
 *  underneath. One per screen. */
export function CircleAction({ icon, label, tone = "accent", size = 88, busy, ...rest }) {
  const fill = {
    accent: "bg-ink text-canvas ring-transparent",
    red:  "bg-red text-canvas ring-transparent",
    idle: "bg-surface text-ink ring-line",
  }[tone];
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        {...rest}
        disabled={busy || rest.disabled}
        style={{ width: size, height: size }}
        className={cx(
          "press flex items-center justify-center rounded-full ring-1",
          "active:scale-95 disabled:opacity-50 disabled:active:scale-100",
          fill,
        )}
      >
        {busy ? <Spinner className="h-6 w-6" /> : icon}
      </button>
      <span className="text-[15px] text-muted">{label}</span>
    </div>
  );
}

const BTN = {
  accent: "bg-ink text-canvas hover:bg-ink/88 disabled:bg-raise disabled:text-faint",
  solid: "bg-black/[.05] text-ink hover:bg-black/[.08]",
  ghost: "border border-line text-muted hover:text-ink",
  danger: "border border-line-2 text-red-ink hover:bg-red-wash",
};

export function Button({ variant = "solid", size = "md", busy, className, children, ...rest }) {
  const sizes = { sm: "h-9 px-4 text-[14px]", md: "h-11 px-5 text-[15px]" };
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={cx(
        "press inline-flex items-center justify-center gap-2 rounded-full",
        "disabled:cursor-not-allowed disabled:active:scale-100",
        BTN[variant], sizes[size], className,
      )}
      style={{ fontWeight: 560 }}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

/** A quiet textual action. Used for the second option, never a second button. */
export function Link({ className, ...rest }) {
  return (
    <button
      {...rest}
      className={cx(
        "text-[15px] text-muted underline-offset-4 hover:text-ink hover:underline",
        className,
      )}
    />
  );
}

/* ------------------------------------------------------- segmented control */

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx("inline-flex rounded-full bg-surface p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={cx(
            "press rounded-full px-4 py-1.5 text-[14px]",
            o.value === value ? "bg-canvas text-ink shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-muted hover:text-ink",
            o.jp && "jp",
          )}
          style={{ fontWeight: 560 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- chips */

const CHIP = {
  accent:  "text-ink border-line bg-canvas [&>i]:bg-accent",
  amber: "text-ink border-line bg-canvas [&>i]:bg-worker",
  red:   "text-red-ink border-line bg-canvas [&>i]:bg-red",
  mute:  "text-muted border-line bg-canvas [&>i]:bg-faint",
};

export function Chip({ tone = "mute", dot, children, className }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-[7px] rounded-full border px-[11px] py-[3px]",
        "whitespace-nowrap text-[13px] leading-6", CHIP[tone], className,
      )}
      style={{ fontWeight: 560 }}
    >
      {dot && <i className="block h-[7px] w-[7px] shrink-0 rounded-full" />}
      {children}
    </span>
  );
}

/** A timestamp. Clicking it puts that moment on screen. */
export function TimeChip({ t, onClick }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={onClick ? `Jump to ${clock(t)}` : undefined}
      className={cx(
        "rounded-[5px] border border-line bg-surface px-1.5 font-mono text-[11px] leading-5",
        "tabular-nums text-muted",
        onClick && "cursor-pointer hover:bg-raise hover:text-ink",
      )}
    >
      {clock(t)}
    </Tag>
  );
}

/* ------------------------------------------------- instructions and quotes */

/** Numbered teal discs, as on the knack card. */
export function Steps({ items, className }) {
  return (
    <ol className={cx("grid gap-3", className)}>
      {items.map((text, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[13px] leading-none text-muted"
            style={{ fontWeight: 560 }}
          >
            {i + 1}
          </span>
          <span className="text-[17px] leading-snug">{text}</span>
        </li>
      ))}
    </ol>
  );
}

/** The expert's own words, kept. */
export function Quote({ label = "Why", children, by }) {
  return (
    <div>
      <Label>{label}</Label>
      <blockquote className="mt-2 border-l-2 border-accent pl-4 text-[17px] leading-relaxed">
        {children}
      </blockquote>
      {by && <p className="mt-2 pl-4 text-[13px] text-muted">— {by}</p>}
    </div>
  );
}

/** Approval, as a quiet footer. Never a banner. */
export function ApprovedBy({ name }) {
  return (
    <p className="flex items-center gap-2 text-[15px] text-muted">
      <span className="flex h-[17px] w-[17px] items-center justify-center rounded-full bg-accent text-[10px] leading-none text-canvas">
        ✓
      </span>
      Approved by {name}
    </p>
  );
}

/* ------------------------------------------------------------------ states */

export function Spinner({ className }) {
  return (
    <span
      role="status" aria-label="Working"
      className={cx(
        "inline-block h-4 w-4 shrink-0 animate-spin rounded-full",
        "border-2 border-current border-r-transparent opacity-80", className,
      )}
    />
  );
}

export function Skeleton({ className }) {
  return <div className={cx("animate-pulse rounded-2xl bg-black/[.04]", className)} aria-hidden />;
}

/** Empty states say WHY they are empty. "No data" is never the reason. */
export function Empty({ title, body, action }) {
  return (
    <div className="py-10 text-center">
      <h3 className="text-[19px]">{title}</h3>
      {body && <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error, onRetry, what = "load this", className }) {
  if (!error) return null;
  return (
    <div role="alert" className={cx("border-l-2 border-red pl-4", className)}>
      <p className="text-[15px] text-red-ink" style={{ fontWeight: 560 }}>Could not {what}</p>
      <p className="mt-1 break-words text-[14px] leading-relaxed text-muted">
        {String(error?.message || error)}
      </p>
      {onRetry && <Link className="mt-2 block" onClick={onRetry}>try again</Link>}
    </div>
  );
}

/** A number and, under it, where it came from. No figure appears without one. */
export function Stat({ label, value, unit, basis, tone = "text" }) {
  const c = { accent: "text-accent-ink", amber: "text-worker-ink", red: "text-red-ink", text: "text-ink" }[tone];
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <div className={cx("mt-2 flex items-baseline gap-1 text-[34px] leading-none", c)}>
        <span className="tnum" style={{ fontWeight: 560 }}>{value ?? "—"}</span>
        {unit && <span className="text-[15px] text-muted">{unit}</span>}
      </div>
      {basis && <p className="mt-2 text-[12px] leading-snug text-muted">{basis}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------- icons */
/* Drawn here rather than pulled from an icon set, so the weight matches the
   type and there are only the four the app actually uses. */

export const MicIcon = (p) => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </svg>
);

export const StopIcon = (p) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
);

export const RecordIcon = (p) => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinejoin="round" {...p}>
    <path d="M3 7.5h4l1.5-2h7L17 7.5h4v11H3z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </svg>
);

export const PlayIcon = (p) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" {...p}>
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

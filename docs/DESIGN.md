# KOTSU interface

KOTSU is a **web app**. One Cloud Run URL: a workspace on a desktop, and the
same URL on a phone at the bench for filming, recording the expert's answer and
checking an attempt.

## Where the look comes from

The palette and the typeface are the film's end card — near-white page,
near-black wordmark, grey コツ, Google Sans Flex. The *layout* is not the film's:
that is a phone, and a phone screen stretched across a desktop is why an app
looks amateur. The workspace below is designed for the screen it runs on.

The colour discipline follows Apple's: white, one light grey, one hairline, two
greys of ink — and colour only where it carries meaning.

| Token | Value | Used for |
|---|---|---|
| canvas | `#ffffff` | the page |
| surface | `#f5f5f7` | chrome, a panel, a video letterbox |
| raise | `#ebebef` | hover |
| line | `#d8d8de` | the only border there is |
| ink | `#1d1d1f` | type, and the one filled button |
| muted / faint | `#6e6e73` / `#86868b` | secondary and tertiary type |
| accent | `#0077c8` | **the expert, and what is confirmed** — Machvory's own cyan, darkened until it reads as text on white |
| worker | `#8e8e93` | the new worker's lane |
| amber | `#b25e00` | only when something needs attention |
| red | `#c0211e` | only a defect |

The new worker's lane is graphite, not a second brand colour: the lanes are told
apart by their label and their position, not by flooding each with hue. If amber
or red is on screen often, something is wrong.

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ KOTSU コツ │ task · expert          Watch Ask Teach Coach … │  h-14, translucent
├────────────────────────────────────┬────────────────────────┤
│  expert recording │ new worker      │  the claims            │
│        (fills the height)           │  (the only thing       │
│  ─ timeline, docked ─               │   that scrolls)        │
└────────────────────────────────────┴────────────────────────┘
```

- **The page does not scroll.** The stage holds still and only the panel beside
  it moves, the way a review tool behaves.
- **The chrome carries the task and the five steps,** so the workspace below it
  is entirely content and there is no sparse rail taking a column for nothing.
- **The recordings fill the stage.** They are the evidence; they should be the
  biggest thing on screen.
- **The timeline is docked under them.** Two tracks on one ruler, each drawn to
  its own recording's length so the same step sits in the same place. Steps are
  segments, knacks are markers at the second they were observed. Click a claim
  and both recordings go there.
- Below `lg` this inverts into one scrolling column and the steps become a
  scrollable row — a phone gets a phone layout.

## Craft rules (from Apple's design talks)

- **Tracking and leading are size-specific.** One `letter-spacing` for every size
  is wrong somewhere: display text takes `-0.028em`, body sits at `0`. See the
  `.t-*` classes in `index.css`.
- **Feedback is on pointer-down and instant** — `.press` scales to `0.978` in
  110 ms. Never only on release.
- **Chrome is a translucent material** the content scrolls under
  (`backdrop-filter`), with a scroll-edge fade instead of a hard divider.
- **The timeline scrubs 1:1** with pointer capture, so the playhead follows the
  finger continuously and outside the track, not just on release.
- **Reduced motion is a gentler equivalent, not the absence of feedback.**
  `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast`
  are all honoured.
- Contrast: muted 5.6:1, accent-ink 5.6:1, amber-ink 6.1:1, red-ink 6.9:1 on the
  page — all above the 4.5:1 floor.

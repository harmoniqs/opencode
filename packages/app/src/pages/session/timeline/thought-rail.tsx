// AMICODE: the thought rail — a vertical spine down a turn's assistant steps,
// ported from the website's /amicode animation (harmoniqs-ai
// app/components/demo/parts.jsx, `Step`).
//
// Six geometry rules — keep them together, they are the whole rail. A
// standalone, framework-agnostic snippet is at the bottom of this header.
//
// 1. Per-row segments, not a container border. Forced by virtualization:
//    @tanstack/solid-virtual renders every row as an absolutely-positioned
//    box; consecutive rows share no ancestor except the height spacer, so
//    border-left on a wrapper is structurally impossible. Each row draws
//    its own 1px span and they meet. The site arrived at the same per-row
//    approach independently, which is why the port is cheap.
//
// 2. Segments reach up through the gap above them. TimelineRowFrame
//    (message-timeline.tsx) puts `pt-3` on every step after the first, and
//    the rail's positioning ancestor — the inner `session-turn` div — sits
//    INSIDE that padding. A segment anchored at `top: 0` therefore starts
//    12px below where the previous one ended and you get a dashed column.
//    Fix is `top: calc(var(--space-3) * -1)` (NEG_STEP_GAP). Most "rounding"
//    reports are this gap, not rounding.
//
// 3. Caps land on the dot centre. dotCentre = DOT_TOP + NODE/2 (7.5 + 3.5
//    = 11px). First segment starts there, last stops there: the tail is
//    `height = STEP_GAP + dotCentre` from NEG_STEP_GAP (so its bottom is
//    dotCentre), and the first mid segment is `top: dotCentre`. PR #242
//    fixed the 1–2px stub that peeked past the dot from the old
//    `DOT_TOP + NODE/2` inline math plus the 0.5px centring in
//    LINE_X = GUTTER + NODE/2 - 0.5. Lone first+last is zero-height by
//    intent — see shouldRenderRail.
//
// 4. "Done" is adjacency, not lifecycle. A step is finished once a
//    successor exists. Tools complete out of order and run in parallel, so
//    asking each row "am I done?" lets a filled dot sit above a hollow one
//    and destroys the rail's grammar. Adjacency makes the sequence monotonic
//    by construction — exactly what the website does (a step flips no later
//    than when the next one appears). Hollow therefore means RUNNING — the
//    tail of a turn still in flight — never "planned". The site never
//    previews future steps either (gated on `t >= from`); a plan source
//    would be score stages, a later step.
//
// 5. Two details worth keeping:
 //    - Gutter, not flush. GUTTER=8, NODE=7, content clears at pl-6 (24px).
 //      GUTTER+NODE=15px stays inside the inset and leaves ~9px dot-to-content
 //      breath (pl-4 left a 1px glue). Flush at left:0 clips the live ring
 //      below the md breakpoint where the message column has no padding and
 //      begins at the viewport edge.
 //    - Contrast is the spec. Done dots use icon-muted (4.58:1 dark,
 //      5.74:1 light) not border-strong (≈ white@20% → #4C4C4C = 1.92:1,
 //      fails the 3:1 a UI mark needs). Live uses the brand yellow
 //      (--accent / --accent-edge, ink-ring defines the dot on light where
 //      #FFE614 is ~1.2:1). Defect 1 fix: line and dot agree on "running":
 //      both key off props.running (whole-turn, Fix B). A running turn's
 //      entire spine is yellow; dots stay yellow throughout, with hollow vs
 //      solid distinguishing succeeded vs in-flight (tail filled + pulsing,
 //      earlier hollow), so no yellow line ever sits above grey dots.
//
// 6. shouldRenderRail is polish: a lone COMPLETED step renders nothing (one
//    dot is decoration, not a sequence). A lone RUNNING step DOES rail —
//    its dot is the turn's only "working" signal (card sig / Livedot are
//    gone) and first steps are often the longest, so waiting for step two
//    left the opening with no status. The lone live dot draws no line
//    (0px) — every spine must end at a dot, so a single dot has no dangling
//    half-spine above or below. A one-step completion still reads as "dot
//    fills".
//
// Other implementation: the harness StepFrame rail on PR #216 slices by SDK
// step-start/step-finish markers instead of assistant-part turns — different
// segmentation model, same geometry problem. Portable math if you need it:
//
//   const NODE = 7, DOT_TOP = 7.5, GUTTER = 8, LINE_X = GUTTER + NODE/2 - 0.5
//   const STEP_GAP = "var(--space-3)", NEG = `calc(${STEP_GAP} * -1)`
//   const dotCentre = DOT_TOP + NODE/2
//   // mid:  { top: first ? dotCentre : NEG, bottom: 0 }
//   // tail: { top: first ? "0px" : NEG, height: first ? "0px" : `calc(${STEP_GAP} + ${dotCentre}px)` }


const NODE = 7 // dot diameter, px — matches the site's Step
const DOT_TOP = 10 // px from the row's top edge to the dot's top — was 7.5, but Thinking's Reasoning label is 22px line-height and the dot read as floating above the text; 10 aligns dot centre (13.5) with the label's cap-height

// The rail sits in a gutter carved out of the row's own left inset, NOT flush
// against the row edge. Flush was wrong: below the md breakpoint the message
// column has no horizontal padding, so the turn box begins at the scroll
// viewport's edge and a dot at left:0 lands hard against it — with the live
// node's ring clipped away entirely. GUTTER + NODE (15px) stays inside
// THOUGHT_RAIL_INSET, so the rail never pushes content around.
const GUTTER = 8
const LINE_X = GUTTER + NODE / 2 - 0.5 // 1px line centred under the dot

// TimelineRowFrame (message-timeline.tsx) puts `pt-3` on every step after the
// first, and the rail's positioning ancestor — the inner `session-turn` div —
// sits INSIDE that padding. So a segment anchored at top:0 begins 12px below
// where the previous segment ended, and the line reads as a dotted column of
// dashes rather than a spine. Each segment therefore reaches up through the gap
// above it. Same value as the frame's `pt-3`; if that spacing changes, this
// follows it.
const STEP_GAP = "var(--space-3)"
const NEG_STEP_GAP = `calc(${STEP_GAP} * -1)`

export function ThoughtRail(props: {
  /** first step of the turn — the line must not run above the dot */
  first: boolean
  /** last step of the turn — the line must not run below the dot */
  last: boolean
  /** the turn is still working, so this tail step is in flight */
  running: boolean
}) {
  // Only the tail of a still-running turn is hollow/pulsing. Everything above
  // it has, by definition, been succeeded (Rule 4 — adjacency).
  const isTailRunning = () => props.last && props.running
  const isTurnRunning = () => props.running
  // Rule 3 — cap at dot centre; Rule 2 — NEG_STEP_GAP bridges the pt-3 gap.
  const dotCentre = DOT_TOP + NODE / 2
  // Defect 2 ruling — lone Thinking (first && last && running): dot-only.
  // Every line must end at a dot at both ends; a single dot has no dangling
  // half-spine above or below. Alternatives were a cap 0→dotCentre and a
  // tail dotCentre→bottom — both leave one open end (no dot at the far
  // side) and were rejected in the widget lab as "line with no end". A
  // lone dot has no line, so a one-step completion is just "dot fills" with
  // no retraction. If you want the opening's longest phase to show a spine,
  // you need a score-stage plan source, not a speculative tail.
  const isLoneRunning = () => props.first && props.last && props.running
  return (
    <>
      <span
        aria-hidden="true"
        data-slot="thought-rail-line"
        class="pointer-events-none absolute w-px"
        style={{
          left: `${LINE_X}px`,
          background: isTurnRunning() ? "var(--accent)" : "var(--v2-icon-icon-muted)",
          ...(isLoneRunning()
            ? // lone thinking — no line, just the blinking dot (0px, like PR 242)
              { top: "0px", height: "0px" }
            : props.last
              ? // tail: capped at the dot centre, never below (Rule 3) — +1px overlap guarantees no 12px dash on subpixel rounding
                {
                  top: props.first ? "0px" : `calc(${NEG_STEP_GAP} - 1px)`,
                  height: props.first ? "0px" : `calc(${STEP_GAP} + ${dotCentre}px + 1px)`,
                }
              : // mid-run: from dot centre (first) or gap (others) down to row bottom — 1px upward overlap closes the pt-3 seam
                { top: props.first ? `${dotCentre}px` : `calc(${NEG_STEP_GAP} - 1px)`, bottom: "0px" }),
        }}
      />
      <span
        aria-hidden="true"
        data-slot="thought-rail-dot"
        data-state={isTailRunning() ? "running" : "done"}
        classList={{
          "pointer-events-none absolute rounded-full": true,
          // Defect 1 Fix B: whole-turn yellow. Tail filled + pulsing, earlier
          // succeeded steps hollow yellow (border accent, transparent fill) so
          // hue never mismatches line; done turns muted.
          "thought-rail-dot--running": isTailRunning(),
        }}
        style={{
          top: `${DOT_TOP}px`,
          left: `${GUTTER}px`,
          width: `${NODE}px`,
          height: `${NODE}px`,
          // LIVE is the brand yellow; DONE is icon weight, not border weight.
          //
          // --accent-edge is doing real work on the live tail: it resolves to
          // ink on light and to a yellow mix on dark, which is exactly the rule
          // the accent system states — #FFE614 is ~1.2:1 on a light ground, so
          // on light the dot is *defined* by its ink ring, never by the fill.
          // On dark the fill carries it and the edge just tightens the shape.
          //
          // Defect 1 Fix B: for a running turn every dot is yellow. Tail is
          // filled + pulsing; earlier steps are hollow (accent border, bg-base)
          // so fill distinguishes succeeded vs in-flight instead of hue.
          // Done dots remain icon-muted (4.58:1 dark, 5.74:1 light) not
          // border-strong (≈1.92:1, fails 3:1).
          border: isTailRunning()
            ? "1px solid var(--accent-edge)"
            : isTurnRunning()
              ? "1px solid var(--accent)"
              : "1px solid var(--v2-icon-icon-muted)",
          background: isTailRunning()
            ? "var(--accent)"
            : isTurnRunning()
              ? "var(--v2-background-bg-base)"
              : "var(--v2-icon-icon-muted)",
        }}
      />
    </>
  )
}

/**
 * Eyebrow naming a step's action, for rows whose content doesn't open with its
 * own title (assistant prose, reasoning). Sits on the dot's line so the rail
 * reads as a labelled list of actions; tool cards and group headers are their
 * own labels. Mono, uppercase, faint — the same voice as the timeline's other
 * structural furniture, quieter than the content it introduces.
 */
export function ThoughtRailLabel(props: { label: string }) {
  return (
    <span
      data-slot="thought-rail-label"
      class="block font-mono text-[10px] font-medium uppercase tracking-[0.08em] leading-[22px] text-v2-text-text-faint select-none"
    >
      {props.label}
    </span>
  )
}

/** The gutter a rail occupies, so content clears it. GUTTER + NODE ends at
 *  15px; pl-6 (24px) leaves the same ~9px dot-to-content breath the website's
 *  Step has — pl-4 left a 1px gap and labels read as glued to their dots. (Rule 5) */
export const THOUGHT_RAIL_INSET = "pl-6"

/**
 * Rule 6 — lone COMPLETED steps render nothing (one dot is decoration). A
 * RUNNING turn rails from its very first step, though — the live dot is the
 * timeline's only "working" mark (the card's pulsing sig and Livedot are
 * gone), and a turn's first step is often its longest, so waiting for step
 * two meant the whole opening had no status signal. The lone live dot draws
 * no line — every line must end at a dot at both ends, so a single dot has
 * no dangling half — and a one-step completion still reads as "dot fills".
 */
export function shouldRenderRail(input: {
  previousAssistantPart: boolean
  lastAssistantPart: boolean
  turnRunning: boolean
}) {
  const isOnlyStep = !input.previousAssistantPart && input.lastAssistantPart
  return !isOnlyStep || input.turnRunning
}

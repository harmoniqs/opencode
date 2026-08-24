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
//      #FFE614 is ~1.2:1). Line colour is uniform per turn — accent while
//      running, icon-muted when done — not border-strong, so a running
//      spine never reads half-yellow/half-grey; segments within a turn
//      share one token.
//
// 6. shouldRenderRail is polish: a lone COMPLETED step renders nothing (one
//    dot is decoration, not a sequence). A lone RUNNING step DOES rail —
//    its dot is the turn's only "working" signal (card sig / Livedot are
//    gone) and first steps are often the longest, so waiting for step two
//    left the opening with no status. The lone live dot itself carries no
//    line (first && last → 0px) so completion is just "dot fills" with no
//    retraction.
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
const DOT_TOP = 7.5 // px from the row's top edge to the dot's top

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
  // Only the tail of a still-running turn is hollow. Everything above it has,
  // by definition, been succeeded. (Rule 4 — adjacency.)
  const isRunning = () => props.last && props.running
  // Rule 3 — cap at dot centre; Rule 2 — NEG_STEP_GAP bridges the pt-3 gap.
  const dotCentre = DOT_TOP + NODE / 2
  return (
    <>
      <span
        aria-hidden="true"
        data-slot="thought-rail-line"
        class="pointer-events-none absolute w-px"
        style={{
          left: `${LINE_X}px`,
          background: props.running ? "var(--accent)" : "var(--v2-icon-icon-muted)",
          ...(
          props.last
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
        data-state={isRunning() ? "running" : "done"}
        classList={{
          "pointer-events-none absolute rounded-full": true,
          // hollow + pulsing while in flight, solid once succeeded
          "thought-rail-dot--running": isRunning(),
        }}
        style={{
          top: `${DOT_TOP}px`,
          left: `${GUTTER}px`,
          width: `${NODE}px`,
          height: `${NODE}px`,
          // LIVE is the brand yellow; DONE is icon weight, not border weight.
          //
          // --accent-edge is doing real work on the live node: it resolves to ink
          // on light and to a yellow mix on dark, which is exactly the rule the
          // accent system states — #FFE614 is ~1.2:1 on a light ground, so on
          // light the dot is *defined* by its ink ring, never by the fill. On dark
          // the fill carries it and the edge just tightens the shape.
          //
          // Done dots take icon-icon-muted rather than border-border-strong: the
          // latter is white at 20% on the dark ground, compositing to #4C4C4C =
          // 1.92:1, under the 3:1 a UI mark needs. icon-icon-muted measures
          // 4.58:1 dark and 5.74:1 light. (Rule 5)
          border: isRunning() ? "1px solid var(--accent-edge)" : "1px solid var(--v2-icon-icon-muted)",
          background: isRunning() ? "var(--accent)" : "var(--v2-icon-icon-muted)",
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
 * two meant the whole opening had no status signal. The lone live dot
 * carries no line (first && last draws zero-height segments), so nothing
 * retracts visibly when a one-step turn completes: the dot simply fills.
 */
export function shouldRenderRail(input: {
  previousAssistantPart: boolean
  lastAssistantPart: boolean
  turnRunning: boolean
}) {
  const isOnlyStep = !input.previousAssistantPart && input.lastAssistantPart
  return !isOnlyStep || input.turnRunning
}

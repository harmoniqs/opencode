// AMICODE: the thought rail — a vertical spine down a turn's assistant steps,
// ported from the website's /amicode animation (harmoniqs-ai
// app/components/demo/parts.jsx, `Step`).
//
// TWO THINGS THAT LOOK LIKE MISTAKES AND ARE NOT:
//
// 1. The rail is drawn as a PER-ROW SEGMENT, not as a border-left on a shared
//    container. It has to be. The timeline is virtualised (@tanstack/solid-virtual):
//    every row is an absolutely-positioned box and consecutive rows share no
//    ancestor except the total-height spacer, so a container spine is structurally
//    impossible here. The site independently arrived at the same per-row approach,
//    which is why the port is cheap. Segments meet because each one reaches UP
//    through the 12px `pt-3` the frame puts above its row — see STEP_GAP below.
//    Anchoring at top:0 alone leaves a 12px break in the line, because the rail's
//    positioning ancestor sits inside that padding rather than around it.
//
// 2. "done" is decided by ADJACENCY — a step is finished once a successor exists —
//    not by that step's own tool lifecycle. Tools can complete out of order or run
//    in parallel, so asking each row "are you finished?" would let a filled dot sit
//    above a hollow one and destroy the rail's grammar. Adjacency makes the
//    sequence monotonic by construction. It is also exactly what the website does:
//    a step flips filled no later than the moment the next one appears.
//
// Hollow therefore means RUNNING (the tail of a turn still in flight), never
// "planned". The website does not preview future steps either — its scenes gate
// every entry on `t >= from`, so an unstarted step is never in the DOM. Showing
// the path ahead needs a real plan source (score stages), which is a later step.


const NODE = 7 // dot diameter, px — matches the site's Step
const DOT_TOP = 7.5 // px from the row's top edge to the dot's top

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
  // by definition, been succeeded.
  const isRunning = () => props.last && props.running
  return (
    <>
      <span
        aria-hidden="true"
        data-slot="thought-rail-line"
        class="pointer-events-none absolute left-[3px] w-px bg-v2-border-border-strong"
        style={
          props.last
            ? // the tail: draw only down to the dot, never past it
              {
                top: props.first ? "0px" : NEG_STEP_GAP,
                height: props.first ? "0px" : `calc(${STEP_GAP} + ${DOT_TOP + NODE / 2}px)`,
              }
            : // mid-run: span the row AND the gap above it — but start below the
              // dot on the very first step, where there is nothing to join to
              { top: props.first ? `${DOT_TOP + NODE / 2}px` : NEG_STEP_GAP, bottom: "0px" }
        }
      />
      <span
        aria-hidden="true"
        data-slot="thought-rail-dot"
        data-state={isRunning() ? "running" : "done"}
        classList={{
          "pointer-events-none absolute left-0 rounded-full": true,
          // hollow + pulsing while in flight, solid once succeeded
          "thought-rail-dot--running": isRunning(),
        }}
        style={{
          top: `${DOT_TOP}px`,
          width: `${NODE}px`,
          height: `${NODE}px`,
          // icon weight, not border weight. border-border-strong is white at 20%
          // on the dark ground, which composites to #4C4C4C = 1.92:1 — under the
          // 3:1 a UI mark needs, so the rail was effectively invisible there.
          // icon-icon-muted is a real mark colour: 4.58:1 dark, 5.74:1 light.
          border: "1px solid var(--v2-icon-icon-muted)",
          background: isRunning() ? "var(--v2-background-bg-base)" : "var(--v2-icon-icon-muted)",
        }}
      />
    </>
  )
}

/** The gutter a rail occupies, so content clears it. */
export const THOUGHT_RAIL_INSET = "pl-4"

/**
 * A lone step is not a sequence: one dot on its own reads as decoration rather
 * than as a rail, so a single-part turn gets nothing.
 */
export function shouldRenderRail(input: { previousAssistantPart: boolean; lastAssistantPart: boolean }) {
  const isOnlyStep = !input.previousAssistantPart && input.lastAssistantPart
  return !isOnlyStep
}

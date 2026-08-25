// AMICODE: the circular working indicator — the first three radial harmonics
// of the hydrogen atom, drawn as concentric shells (n = 1, 2, 3) around a
// filled nucleus. Each shell takes its turn brightening and swelling, climbing
// the harmonics the way the retired wave climbed its modes (Kate 2026-08-25:
// the working signal should be circular, kin to the rail nodes' dots).
//
// Replaces AmicoWave inside the thinking block (thinking-line.tsx). Carries
// the `amc-wave` class ONLY for the thinking grid's placement rule
// (.amc-thinking .amc-wave); its own skin lives under .amc-harmonics-* in
// amicode.css. Ink via currentColor — the rail-dot family, never the accent.
//
// NO <defs> and NO ids — several indicators can mount at once and SVG ids are
// document-global (the same rule amico-wave.tsx earned).
import { For } from "solid-js"

const BOX = { w: 14, h: 12, cx: 7, cy: 6 } as const
const NUCLEUS_R = 1.6
/** shell radii for n = 1, 2, 3 — outermost + stroke stays inside the box */
const SHELL_RADII = [2.4, 3.7, 5] as const
const SHELL_STROKE = 1
/** one shell's turn; the full cycle is one turn per shell */
export const HARMONICS_TURN_MS = 1150

export function AmicoHarmonics(props: { class?: string }) {
  return (
    <svg
      data-component="amico-harmonics"
      class={`amc-wave amc-harmonics${props.class ? " " + props.class : ""}`}
      width={BOX.w}
      height={BOX.h}
      viewBox={`0 0 ${BOX.w} ${BOX.h}`}
      shape-rendering="geometricPrecision"
      aria-hidden="true"
      style={{ "--amc-harmonics-period": `${HARMONICS_TURN_MS * SHELL_RADII.length}ms` }}
    >
      <circle class="amc-harmonics-nucleus" cx={BOX.cx} cy={BOX.cy} r={NUCLEUS_R} fill="currentColor" />
      <For each={SHELL_RADII}>
        {(r, i) => (
          <circle
            class="amc-harmonics-shell"
            cx={BOX.cx}
            cy={BOX.cy}
            r={r}
            fill="none"
            stroke="currentColor"
            stroke-width={SHELL_STROKE}
            style={{ "animation-delay": `${i() * HARMONICS_TURN_MS}ms` }}
          />
        )}
      </For>
    </svg>
  )
}

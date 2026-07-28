// AMICODE: the harmonic working indicator — a standing wave in quadrature, shown while
// Amico works. Replaces the amc-text-shimmer treatment on both indicator surfaces.
//
// Markup only: all geometry and timing come from ./amico-wave, handed to the CSS as custom
// properties so there is exactly one source of truth. Two paths per mode (lead + companion
// out of phase by a quarter period); the companion is at full swing exactly when the lead
// crosses zero, which is what stops the glyph reading as a blink at 12px.
//
// NO <defs> and NO ids — several indicators mount at once (one thinking line plus one tool
// header per tool call) and SVG ids are document-global, so ids would collide and every
// instance would resolve to the first definition. If a variant ever needs masking it must
// use CSS mask-image, not an SVG <mask>.
import { For } from "solid-js"
import {
  WAVE_BOX,
  WAVE_LEAD_STROKE,
  WAVE_COMPANION_STROKE,
  WAVE_COMPANION_OPACITY,
  WAVE_PERIOD_MS,
  WAVE_EASING,
  MODE_PATHS,
  companionDelayMs,
  modeCadenceMs,
  modeDelaysMs,
  // Explicit extension: this package's bundler resolution (moduleResolution: "bundler")
  // prefers a sibling .tsx over .ts for an extensionless specifier, and this directory now
  // has both amico-wave.ts (pure module) and amico-wave.tsx (this file) sharing a stem. An
  // extensionless "./amico-wave" here would resolve back to THIS file, not the pure module —
  // confirmed by running it (Bun picks .tsx first). The explicit extension pins the target.
} from "./amico-wave.ts"

const DELAYS = modeDelaysMs()

export function AmicoWave(props: { class?: string }) {
  return (
    <svg
      data-component="amico-wave"
      class={`amc-wave${props.class ? " " + props.class : ""}`}
      width={WAVE_BOX.w}
      height={WAVE_BOX.h}
      viewBox={`0 0 ${WAVE_BOX.w} ${WAVE_BOX.h}`}
      shape-rendering="geometricPrecision"
      aria-hidden="true"
      style={{
        "--amc-wave-period": `${WAVE_PERIOD_MS}ms`,
        "--amc-wave-ease": WAVE_EASING,
        "--amc-wave-quad": `${companionDelayMs()}ms`,
        "--amc-wave-cadence": `${modeCadenceMs()}ms`,
        "--amc-wave-comp-op": String(WAVE_COMPANION_OPACITY),
      }}
    >
      <For each={MODE_PATHS}>
        {(d, i) => (
          <g class="amc-wave-mode" style={{ "animation-delay": `${DELAYS[i()]}ms` }}>
            <path
              class="amc-wave-ln"
              data-role="companion"
              d={d}
              fill="none"
              stroke="currentColor"
              stroke-width={WAVE_COMPANION_STROKE}
              stroke-linecap="round"
            />
            <path
              class="amc-wave-ln"
              d={d}
              fill="none"
              stroke="currentColor"
              stroke-width={WAVE_LEAD_STROKE}
              stroke-linecap="round"
            />
          </g>
        )}
      </For>
    </svg>
  )
}

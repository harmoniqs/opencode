// packages/ui/src/amicode/harmonic-dot.tsx
// AMICODE: the spherical-harmonic morphing dot — shown on the thought rail's active
// (running) node. Cycles through Y_l^m silhouettes with a pulse rhythm:
// sphere → shape → sphere → shape → ... (the sphere is home base).
//
// RANDOMIZED: each mount picks fresh random rotation angles for the shapes,
// so no two streaming turns look identical. The mode ORDER is fixed (for
// visual contrast), but the angles are drawn from the allowed 45°-increment
// sets per mode.
//
// Under prefers-reduced-motion the SMIL animate is hidden and the path is a static circle.

import { type ComponentProps } from "solid-js"
import {
  HARMONIC_SIZE,
  CIRCLE_PATH,
  randomPulseSequence,
  buildSmil,
} from "./harmonic-geometry"

export function HarmonicDot(props: {
  class?: string
  style?: ComponentProps<"svg">["style"]
}) {
  // Computed once per mount — each streaming turn gets a unique sequence
  const sequence = randomPulseSequence()
  const smil = buildSmil(sequence)

  return (
    <svg
      data-component="harmonic-dot"
      class={`harmonic-dot${props.class ? " " + props.class : ""}`}
      width={HARMONIC_SIZE}
      height={HARMONIC_SIZE}
      viewBox={`0 0 ${HARMONIC_SIZE} ${HARMONIC_SIZE}`}
      shape-rendering="geometricPrecision"
      aria-hidden="true"
      style={props.style}
    >
      <path
        class="harmonic-dot-shape"
        d={CIRCLE_PATH}
        fill="var(--accent)"
        stroke="var(--accent-edge)"
        stroke-width="1"
      >
        <animate
          attributeName="d"
          values={smil.values}
          keyTimes={smil.keyTimes}
          dur={smil.dur}
          repeatCount="indefinite"
          calcMode="linear"
        />
      </path>
    </svg>
  )
}

// packages/ui/src/amicode/harmonic-dot.tsx
// AMICODE: the spherical-harmonic morphing dot — shown on the thought rail's active
// (running) node. Cycles through Y_l^m silhouettes with a pulse rhythm:
// sphere → shape → sphere → shape → ... (the sphere is home base).
//
// DONUT PATH: A single filled path using fill-rule="evenodd" — the outer contour
// draws the harmonic shape clockwise, an inner contour draws a circle counter-
// clockwise to punch the hole. When the inner radius is 0, the hole collapses
// and the shape is solid. SMIL interpolates between donut (ring) and solid
// (harmonic) point-by-point — the ring smoothly closes as the shape blooms.
//
// No stroke, no layered circles — one crisp filled path at native 13px.
//
// RANDOMIZED: each mount picks fresh random rotation angles.
// Under prefers-reduced-motion the SMIL animates are hidden — static ring.

import { type ComponentProps } from "solid-js"
import {
  HARMONIC_SIZE,
  CIRCLE_DONUT_PATH,
  randomPulseSequence,
  buildSmil,
} from "./harmonic-geometry"

export function HarmonicDot(props: {
  class?: string
  style?: ComponentProps<"svg">["style"]
}) {
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
        d={CIRCLE_DONUT_PATH}
        fill="var(--accent)"
        fill-rule="evenodd"
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

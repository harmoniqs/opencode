// packages/ui/src/amicode/harmonic-dot.tsx
// AMICODE: the spherical-harmonic morphing dot — shown on the thought rail's active
// (running) node. Cycles through Y_l^m silhouettes with a pulse rhythm:
// sphere → shape → sphere → shape → ... (the sphere is home base).
//
// The sphere rests as a HOLLOW RING (fill-opacity 0, stroke only). When a harmonic
// shape pulses in, fill-opacity transitions to 1 (solid). This creates the visual
// of a ring "filling up" with each excitation and draining back to hollow.
//
// RANDOMIZED: each mount picks fresh random rotation angles.
// Under prefers-reduced-motion the SMIL animates are hidden — static hollow ring.

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
        fill-opacity="0"
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
        <animate
          attributeName="fill-opacity"
          values={smil.fillOpacity}
          keyTimes={smil.keyTimes}
          dur={smil.dur}
          repeatCount="indefinite"
          calcMode="linear"
        />
      </path>
    </svg>
  )
}

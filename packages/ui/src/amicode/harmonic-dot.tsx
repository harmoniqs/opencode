// packages/ui/src/amicode/harmonic-dot.tsx
// AMICODE: the spherical-harmonic morphing dot — shown on the thought rail's active
// (running) node. Cycles through Y_l^m silhouettes with a pulse rhythm:
// sphere → shape → sphere → shape → ... (the sphere is home base).
//
// RING EFFECT: The shape is rendered as a solid fill. A smaller circle filled
// with the page background is layered on top, punching a visual "hole" — this
// creates a thick ring without using SVG stroke (which gets fuzzy at 13px).
// The background disc also masks the rail line that runs behind the dot.
//
// During harmonic phases the inner disc shrinks radially to 0 (solid shape);
// it grows back from the centre when returning to sphere (ring). The radial
// grow/shrink is synced to the outer shape morph for a cohesive animation.
//
// RANDOMIZED: each mount picks fresh random rotation angles.
// Under prefers-reduced-motion the SMIL animates are hidden — static ring.

import { type ComponentProps } from "solid-js"
import {
  HARMONIC_SIZE,
  INNER_R,
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
      {/* Solid shape — bright yellow fill */}
      <path
        class="harmonic-dot-shape"
        d={CIRCLE_PATH}
        fill="var(--accent)"
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
      {/* Inner disc — grows/shrinks radially in sync with outer morph.
          Full radius during sphere (ring), shrinks to 0 during harmonics (solid). */}
      <circle
        cx={HARMONIC_SIZE / 2}
        cy={HARMONIC_SIZE / 2}
        r={INNER_R}
        fill="var(--v2-background-bg-base)"
      >
        <animate
          attributeName="r"
          values={smil.innerRadius}
          keyTimes={smil.keyTimes}
          dur={smil.dur}
          repeatCount="indefinite"
          calcMode="linear"
        />
      </circle>
    </svg>
  )
}

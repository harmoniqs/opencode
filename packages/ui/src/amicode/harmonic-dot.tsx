// packages/ui/src/amicode/harmonic-dot.tsx
// AMICODE: the spherical-harmonic morphing dot — shown on the thought rail's active
// (running) node. Cycles through Y_l^m silhouettes with a pulse rhythm:
// sphere → shape → sphere → shape → ... (the sphere is home base).
//
// Architecture mirrors amico-wave.tsx: geometry comes from ./harmonic-geometry (pure,
// tested), this file is markup only. NO <defs>, NO ids (multiple running dots can mount
// simultaneously in a virtualised timeline — SVG ids are document-global).
//
// Motion: the <path> morphs via SMIL <animate attributeName="d"> with explicit holds
// (duplicate keyframe values) and short morph intervals. No CSS rotation — the per-pulse
// orientation changes provide enough visual variety.
// Under prefers-reduced-motion the SMIL animate is hidden and the path is a static circle.

import { type ComponentProps } from "solid-js"
import {
  HARMONIC_SIZE,
  CIRCLE_PATH,
  SMIL,
} from "./harmonic-geometry"

export function HarmonicDot(props: {
  class?: string
  style?: ComponentProps<"svg">["style"]
}) {
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
          values={SMIL.values}
          keyTimes={SMIL.keyTimes}
          dur={SMIL.dur}
          repeatCount="indefinite"
          calcMode="linear"
        />
      </path>
    </svg>
  )
}

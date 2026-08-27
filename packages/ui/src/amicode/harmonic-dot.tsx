// packages/ui/src/amicode/harmonic-dot.tsx
// AMICODE: the spherical-harmonic morphing dot — shown on the thought rail's active
// (running) node. Replaces the old breathing box-shadow ring with a shape that cycles
// through Y_l^m silhouettes via SMIL path interpolation.
//
// Architecture mirrors amico-wave.tsx: geometry comes from ./harmonic-geometry (pure,
// tested), this file is markup only. NO <defs>, NO ids (multiple running dots can mount
// simultaneously in a virtualised timeline — SVG ids are document-global).
//
// Motion: the <path> morphs via SMIL <animate attributeName="d">, the parent <g> rotates
// via CSS transform. Under prefers-reduced-motion both stop and the path is a static circle.

import { type ComponentProps } from "solid-js"
import {
  HARMONIC_SIZE,
  HARMONIC_PATHS,
  MODE_HOLD_MS,
  MODE_COUNT,
  MORPH_CADENCE_MS,
  ROTATION_PERIOD_MS,
  SMIL_VALUES,
  smilKeyTimes,
} from "./harmonic-geometry"

const KEY_TIMES = smilKeyTimes()
const DUR = `${MORPH_CADENCE_MS}ms`
const ROTATE_DUR = `${ROTATION_PERIOD_MS}ms`

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
      <g class="harmonic-dot-rotate">
        <path
          class="harmonic-dot-shape"
          d={HARMONIC_PATHS[0]}
          fill="var(--accent)"
          stroke="var(--accent-edge)"
          stroke-width="1"
        >
          <animate
            attributeName="d"
            values={SMIL_VALUES}
            keyTimes={KEY_TIMES}
            dur={DUR}
            repeatCount="indefinite"
            calcMode="linear"
          />
        </path>
      </g>
    </svg>
  )
}

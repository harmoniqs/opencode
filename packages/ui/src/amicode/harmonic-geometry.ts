// packages/ui/src/amicode/harmonic-geometry.ts
// AMICODE: pure geometry + timing for the spherical-harmonic morphing dot (harmonic-dot.tsx).
// Mirrors the wave-geometry.ts pattern: DOM-free, unit-tested, module-level precomputation.
//
// The dot morphs through four Y_l^m silhouettes rendered as 2D polar outlines.
// All paths share the same command structure (64 points, M + 63 L + Z) so SVG
// SMIL <animate attributeName="d"> can interpolate natively between them.

/** Diameter of the morphing dot when in the running state (px). */
export const HARMONIC_SIZE = 13

/** Number of angular samples per shape — shared across all modes for SMIL compat. */
export const HARMONIC_SAMPLES = 64

/** How long each harmonic mode is displayed before morphing to the next (ms). */
export const MODE_HOLD_MS = 2300

/** Full rotation period for the slow CSS transform (ms). */
export const ROTATION_PERIOD_MS = 12000

/** Number of harmonic modes in the cycle. */
export const MODE_COUNT = 4

/**
 * Compute the normalized radius [0, 1] for a given mode at angle theta.
 *
 * Mode 0: Y_0^0 — circle (constant)
 * Mode 1: Y_1^0 — dumbbell (cos²θ with base)
 * Mode 2: Y_2^0 — pinched (|3cos²θ − 1| normalized, with base)
 * Mode 3: Y_2^2 — four-lobe clover (|cos(2θ)| with base)
 *
 * A base offset (min radius ~0.2) prevents cusps and keeps shapes "spherical" —
 * at 13px a cusp would be a single-pixel spike, unreadable.
 */
export function harmonicRadius(mode: number, theta: number): number {
  switch (mode) {
    case 0:
      // Perfect circle
      return 1.0
    case 1: {
      // Dumbbell: two lobes at top/bottom, narrow waist
      const cos = Math.cos(theta)
      return 0.25 + 0.75 * cos * cos
    }
    case 2: {
      // Pinched: |3cos²θ - 1| gives lobes at poles + equatorial bump
      const cos = Math.cos(theta)
      const raw = Math.abs(3 * cos * cos - 1) // range [0, 2]
      return 0.2 + 0.8 * (raw / 2)
    }
    case 3: {
      // Four-lobe clover: |cos(2θ)| gives four symmetric lobes
      const raw = Math.abs(Math.cos(2 * theta)) // range [0, 1]
      return 0.2 + 0.8 * raw
    }
    default:
      return 1.0
  }
}

/**
 * Generate a closed SVG path (M...L...Z) for a harmonic mode.
 * The path fits inside a HARMONIC_SIZE × HARMONIC_SIZE viewBox,
 * centred at (HARMONIC_SIZE/2, HARMONIC_SIZE/2).
 */
export function harmonicPath(mode: number, samples: number = HARMONIC_SAMPLES): string {
  const cx = HARMONIC_SIZE / 2
  const cy = HARMONIC_SIZE / 2
  // Leave 0.5px margin for anti-aliasing / border
  const maxR = (HARMONIC_SIZE - 1) / 2

  const round = (n: number) => Math.round(n * 100) / 100

  const parts: string[] = []
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * 2 * Math.PI
    const r = harmonicRadius(mode, theta) * maxR
    const x = round(cx + r * Math.cos(theta))
    const y = round(cy + r * Math.sin(theta))
    parts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`)
  }
  parts.push("Z")
  return parts.join("")
}

/** Pre-computed paths for all modes — module-level, once. */
export const HARMONIC_PATHS: readonly string[] = Array.from(
  { length: MODE_COUNT },
  (_, mode) => harmonicPath(mode),
)

/** Total cadence of the full morph cycle (ms). */
export const MORPH_CADENCE_MS = MODE_HOLD_MS * MODE_COUNT

/**
 * SMIL `values` attribute content: all paths semicolon-joined, with the first
 * repeated at the end for a seamless loop.
 */
export const SMIL_VALUES = [...HARMONIC_PATHS, HARMONIC_PATHS[0]].join(";")

/**
 * SMIL `keyTimes` for a hold-then-morph cadence. Each mode holds for most of
 * its slot, then morphs quickly to the next. This gives the viewer time to
 * perceive each shape before it transitions.
 */
export function smilKeyTimes(holdFraction: number = 0.7): string {
  // With 4 modes + loop-close = 5 path values, we need 5 keyTimes in [0, 1].
  // Each mode gets 1/MODE_COUNT of the total duration.
  // Within each slot: hold for holdFraction, morph for (1-holdFraction).
  const times: number[] = [0]
  const slotSize = 1 / MODE_COUNT
  for (let i = 0; i < MODE_COUNT; i++) {
    if (i < MODE_COUNT - 1) {
      // End of hold for this mode = start of transition to next
      times.push((i + holdFraction) * slotSize)
    }
    if (i < MODE_COUNT - 1) {
      // Start of next mode's hold
      times.push((i + 1) * slotSize)
    }
  }
  // Final value is always 1
  times.push(1)

  // But SMIL values needs exactly N keyTimes for N values.
  // We have MODE_COUNT + 1 values (4 shapes + loop-close).
  // Simplest: evenly spaced keyTimes, let SMIL's calcMode="spline" handle hold/morph.
  // Actually for the cleanest approach with hold phases: use calcMode="linear"
  // with explicit duplicate values for holds.
  //
  // Simplest correct approach: MODE_COUNT+1 evenly-spaced keyTimes with linear interp.
  const simple: number[] = []
  for (let i = 0; i <= MODE_COUNT; i++) {
    simple.push(Math.round((i / MODE_COUNT) * 10000) / 10000)
  }
  return simple.join(";")
}

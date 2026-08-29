// packages/ui/src/amicode/harmonic-geometry.ts
// AMICODE: pure geometry + timing for the spherical-harmonic morphing dot (harmonic-dot.tsx).
// Mirrors the wave-geometry.ts pattern: DOM-free, unit-tested, module-level precomputation.
//
// Rhythm: sphere → harmonic → sphere → harmonic → ... (the sphere is "home base").
// Each pulse is ~1.2s: sphere-hold (350ms) → morph-out (175ms) → shape-hold (500ms)
// → morph-back (175ms). Twelve pulses make one full cycle (~14.4s).
//
// The sequence is strictly ascending by quantum numbers (l, m): l=2→4, m=0→l
// within each level. This gives a natural build-up from simple pills to complex
// stars as the animation loops.
//
// All paths share the same command structure (64 points, M + 63 L + Z) so SVG
// SMIL <animate attributeName="d"> can interpolate natively between them.

/** CSS size of the morphing dot when in the running state (px). */
export const HARMONIC_SIZE = 13

/** Number of angular samples per shape — shared across all modes for SMIL compat. */
export const HARMONIC_SAMPLES = 64

// --- Timing constants (pulse rhythm) ---

/** How long the sphere rests between pulses (ms). */
export const SPHERE_HOLD_MS = 350

/** Duration of the morph transition sphere↔shape (ms). */
export const MORPH_MS = 175

/** How long each harmonic shape is held at full excitation (ms). */
export const SHAPE_HOLD_MS = 500

/** One full pulse: sphere-hold + morph-out + shape-hold + morph-back (ms). */
export const PULSE_MS = SPHERE_HOLD_MS + MORPH_MS + SHAPE_HOLD_MS + MORPH_MS

/** Number of pulses in one full cycle. */
export const PULSE_COUNT = 12

/** Total cycle duration (ms). */
export const CYCLE_MS = PULSE_MS * PULSE_COUNT

// --- Modes ---

/** Number of distinct harmonic modes (circle + 13 shapes). */
export const MODE_COUNT = 14

/**
 * Compute the normalized radius [0, 1] for a given mode at angle theta.
 *
 * Modes are indexed by increasing (l, m):
 *   Mode  0: circle         — Y_0^0 (home base, not in pulse sequence)
 *   Mode  1: dumbbell       — (1,0) cos²θ, base 0.25 [legacy, not in sequence]
 *   Mode  2: pinched        — (2,0) |3cos²θ−1|/2, base 0.2
 *   Mode  3: clover         — (2,2) |cos(2θ)|, base 0.2
 *   Mode  4: rosette        — (3,3) |cos(3θ)|, base 0.25
 *   Mode  5: trefoil        — (3,0) (1+cos3θ)/2, base 0.3
 *   Mode  6: star-8         — (4,4) |cos(4θ)|, base 0.3
 *   Mode  7: double-pinch   — (4,0) |P_4^0|, base 0.2
 *   Mode  8: soft-pill      — (2,1) cos²θ, base 0.35
 *   Mode  9: sharp-pill     — (3,1) cos²θ, base 0.15
 *   Mode 10: sharp-clover   — (3,2) |cos(2θ)|, base 0.15
 *   Mode 11: deep-pill      — (4,1) cos²θ, base 0.1
 *   Mode 12: deep-clover    — (4,2) |cos(2θ)|, base 0.1
 *   Mode 13: sharp-rosette  — (4,3) |cos(3θ)|, base 0.15
 *
 * A base offset (min radius) prevents cusps and keeps shapes "spherical" —
 * at 13px a cusp would be a single-pixel spike, unreadable. Higher l for the
 * same lobe pattern uses a lower base, making valleys deeper (sharper shape).
 */
export function harmonicRadius(mode: number, theta: number): number {
  switch (mode) {
    case 0:
      return 1.0
    case 1: {
      // (1,0) Dumbbell: two lobes, gentle — legacy
      const cos = Math.cos(theta)
      return 0.25 + 0.75 * cos * cos
    }
    case 2: {
      // (2,0) Pinched: |3cos²θ - 1| gives lobes at poles + equatorial bump
      const cos = Math.cos(theta)
      const raw = Math.abs(3 * cos * cos - 1) / 2
      return 0.2 + 0.8 * raw
    }
    case 3: {
      // (2,2) Four-lobe clover: |cos(2θ)|, base 0.2
      const raw = Math.abs(Math.cos(2 * theta))
      return 0.2 + 0.8 * raw
    }
    case 4: {
      // (3,3) Six-lobe rosette: |cos(3θ)|, base 0.25
      const raw = Math.abs(Math.cos(3 * theta))
      return 0.25 + 0.75 * raw
    }
    case 5: {
      // (3,0) Trefoil: (1 + cos(3θ))/2 gives gentle 3-lobe shape
      const raw = (1 + Math.cos(3 * theta)) / 2
      return 0.3 + 0.7 * raw
    }
    case 6: {
      // (4,4) Eight-lobe star: |cos(4θ)|, base 0.3
      const raw = Math.abs(Math.cos(4 * theta))
      return 0.3 + 0.7 * raw
    }
    case 7: {
      // (4,0) Double pinch: |P_4^0(cosθ)| = |35cos⁴θ − 30cos²θ + 3|/8
      const cos = Math.cos(theta)
      const cos2 = cos * cos
      const raw = Math.abs(35 * cos2 * cos2 - 30 * cos2 + 3) / 8
      return 0.2 + 0.8 * raw
    }
    case 8: {
      // (2,1) Soft pill: cos²θ, base 0.35 — gentler than (1,0)
      const cos = Math.cos(theta)
      return 0.35 + 0.65 * cos * cos
    }
    case 9: {
      // (3,1) Sharp pill: cos²θ, base 0.15 — deeper waist
      const cos = Math.cos(theta)
      return 0.15 + 0.85 * cos * cos
    }
    case 10: {
      // (3,2) Sharp clover: |cos(2θ)|, base 0.15 — deeper valleys than (2,2)
      const raw = Math.abs(Math.cos(2 * theta))
      return 0.15 + 0.85 * raw
    }
    case 11: {
      // (4,1) Deep pill: cos²θ, base 0.1 — near-cusp waist
      const cos = Math.cos(theta)
      return 0.1 + 0.9 * cos * cos
    }
    case 12: {
      // (4,2) Deep clover: |cos(2θ)|, base 0.1 — very deep valleys
      const raw = Math.abs(Math.cos(2 * theta))
      return 0.1 + 0.9 * raw
    }
    case 13: {
      // (4,3) Sharp rosette: |cos(3θ)|, base 0.15 — deeper than (3,3)
      const raw = Math.abs(Math.cos(3 * theta))
      return 0.15 + 0.85 * raw
    }
    default:
      return 1.0
  }
}

/**
 * Generate a closed SVG path for a harmonic mode, optionally rotated.
 * The path fits inside a HARMONIC_SIZE × HARMONIC_SIZE viewBox,
 * centred at (HARMONIC_SIZE/2, HARMONIC_SIZE/2).
 *
 * @param mode — which harmonic shape (0=circle, 1=dumbbell, 2=pinched, 3=clover)
 * @param rotationDeg — rotation angle in degrees (applied as offset to sampling angle)
 * @param samples — number of angular samples (must be consistent for SMIL)
 */
export function harmonicPath(mode: number, rotationDeg: number = 0, samples: number = HARMONIC_SAMPLES): string {
  const cx = HARMONIC_SIZE / 2
  const cy = HARMONIC_SIZE / 2
  // Leave 0.5px margin for anti-aliasing / border
  const maxR = (HARMONIC_SIZE - 1) / 2
  const rotationRad = (rotationDeg * Math.PI) / 180

  const round = (n: number) => Math.round(n * 100) / 100

  const parts: string[] = []
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * 2 * Math.PI
    // Sample the harmonic at the rotated angle, but plot at the original angle
    const r = harmonicRadius(mode, theta - rotationRad) * maxR
    const x = round(cx + r * Math.cos(theta))
    const y = round(cy + r * Math.sin(theta))
    parts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`)
  }
  parts.push("Z")
  return parts.join("")
}

/**
 * Generate a donut SVG path: outer harmonic shape (CW) + inner circle (CCW).
 * Used with fill-rule="evenodd" to punch a hole — a single filled path that
 * renders as a ring, no stroke needed.
 *
 * When innerR=0, the inner sub-path collapses to a point at centre (solid shape).
 * SMIL interpolates between donut paths point-by-point, so the ring smoothly
 * closes/opens as the outer shape morphs.
 *
 * @param mode — which harmonic shape for the outer contour
 * @param rotationDeg — rotation for the outer contour
 * @param innerR — radius of the inner hole (0 = no hole = solid)
 */
export function harmonicDonutPath(mode: number, rotationDeg: number = 0, innerR: number = INNER_R, samples: number = HARMONIC_SAMPLES): string {
  const cx = HARMONIC_SIZE / 2
  const cy = HARMONIC_SIZE / 2
  const maxR = (HARMONIC_SIZE - 1) / 2
  const rotationRad = (rotationDeg * Math.PI) / 180
  const round = (n: number) => Math.round(n * 100) / 100

  // Outer contour — clockwise
  const parts: string[] = []
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * 2 * Math.PI
    const r = harmonicRadius(mode, theta - rotationRad) * maxR
    const x = round(cx + r * Math.cos(theta))
    const y = round(cy + r * Math.sin(theta))
    parts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`)
  }
  parts.push("Z")

  // Inner contour — counter-clockwise (punches the hole via evenodd)
  // When innerR=0, all points collapse to centre = no visible hole.
  for (let i = 0; i < samples; i++) {
    const theta = ((samples - i) / samples) * 2 * Math.PI // reversed direction
    const x = round(cx + innerR * Math.cos(theta))
    const y = round(cy + innerR * Math.sin(theta))
    parts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`)
  }
  parts.push("Z")

  return parts.join("")
}

/**
 * The pulse mode sequence: strictly ascending by (l, m).
 * l=2: m=0, m=1, m=2 → l=3: m=0, m=1, m=2, m=3 → l=4: m=0, m=1, m=2, m=3, m=4.
 * Each level starts with its pill (m=0), then builds lobes as m increases.
 */
export const PULSE_MODES: readonly number[] = [
  2,  // (2,0) — pinched pill
  8,  // (2,1) — soft pill
  3,  // (2,2) — 4-lobe clover
  5,  // (3,0) — trefoil
  9,  // (3,1) — sharp pill
  10, // (3,2) — sharp 4-lobe
  4,  // (3,3) — 6-lobe rosette
  7,  // (4,0) — double-pinch pill
  11, // (4,1) — deep pill
  12, // (4,2) — deep 4-lobe
  13, // (4,3) — sharp 6-lobe
  6,  // (4,4) — 8-lobe star
]

/**
 * Fixed rotation angle per pulse slot (degrees). No randomization.
 * Rule: m=2 shapes (4-lobe) rotate 45° so fins form an X (avoid vertical).
 * Everything else stays at 0°.
 */
export const PULSE_ROTATIONS: readonly number[] = [
  0,  // (2,0) — pill, horizontal
  0,  // (2,1) — pill, horizontal
  45, // (2,2) — 4-lobe X
  0,  // (3,0) — trefoil, no vertical lobes
  0,  // (3,1) — pill, horizontal
  45, // (3,2) — 4-lobe X
  0,  // (3,3) — 6-lobe, no vertical lobes
  0,  // (4,0) — pill, horizontal
  0,  // (4,1) — pill, horizontal
  45, // (4,2) — 4-lobe X
  0,  // (4,3) — 6-lobe, no vertical lobes
  0,  // (4,4) — 8-lobe, 0° (accepted)
]

/** The canonical deterministic pulse sequence — mode + fixed rotation per slot.
 *  Used by HarmonicDot directly (no randomization). */
export const PULSE_SEQUENCE: ReadonlyArray<{ mode: number; rotation: number }> =
  PULSE_MODES.map((mode, i) => ({ mode, rotation: PULSE_ROTATIONS[i] }))

/** Inner disc radius that creates the ring hole (px in viewBox units).
 *  maxR is 6, so ring thickness = 6 - INNER_R ≈ 1.5px. */
export const INNER_R = 4.5

/** Pre-computed circle path (the "home" shape). */
export const CIRCLE_PATH = harmonicPath(0)

/** Pre-computed donut circle path (the ring — sphere with inner hole). */
export const CIRCLE_DONUT_PATH = harmonicDonutPath(0, 0, INNER_R)

/**
 * Build SMIL keyframe attributes for a given pulse sequence.
 *
 * Uses donut paths (fill-rule evenodd): the sphere state is a ring (outer circle
 * + inner hole), harmonic states are solid (inner collapsed to centre). SMIL
 * interpolates between them point-by-point — the ring smoothly closes as the
 * shape blooms, reopens when returning to sphere.
 */
export function buildSmil(sequence: ReadonlyArray<{ mode: number; rotation: number }>): {
  values: string
  keyTimes: string
  /** Background masking circle radius: INNER_R during sphere, 0 during harmonic. */
  innerRadius: string
  dur: string
} {
  // Harmonic donut paths with inner hole at r=0 (solid)
  const solidPaths = sequence.map(({ mode, rotation }) => harmonicDonutPath(mode, rotation, 0))
  const values: string[] = []
  const radii: number[] = []
  const times: number[] = []
  const total = PULSE_MS * sequence.length

  let t = 0
  for (let i = 0; i < sequence.length; i++) {
    // Sphere hold start — ring (full inner hole)
    values.push(CIRCLE_DONUT_PATH)
    radii.push(INNER_R)
    times.push(t / total)
    t += SPHERE_HOLD_MS

    // Sphere hold end — morph-out begins
    values.push(CIRCLE_DONUT_PATH)
    radii.push(INNER_R)
    times.push(t / total)
    t += MORPH_MS

    // Shape arrived — solid (inner hole collapsed)
    values.push(solidPaths[i])
    radii.push(0)
    times.push(t / total)
    t += SHAPE_HOLD_MS

    // Shape hold end — morph-back begins
    values.push(solidPaths[i])
    radii.push(0)
    times.push(t / total)
    t += MORPH_MS
  }

  // Final: back to ring
  values.push(CIRCLE_DONUT_PATH)
  radii.push(INNER_R)
  times.push(1)

  return {
    values: values.join(";"),
    keyTimes: times.map((v) => Math.round(v * 10000) / 10000).join(";"),
    innerRadius: radii.join(";"),
    dur: `${total}ms`,
  }
}

// --- Pre-computed exports ---

/** Pre-computed paths for the deterministic pulse sequence. */
export const PULSE_PATHS: readonly string[] = PULSE_SEQUENCE.map(
  ({ mode, rotation }) => harmonicPath(mode, rotation),
)

/** Pre-computed donut paths (solid, inner r=0) for the deterministic pulse sequence. */
export const PULSE_DONUT_PATHS: readonly string[] = PULSE_SEQUENCE.map(
  ({ mode, rotation }) => harmonicDonutPath(mode, rotation, 0),
)

/** Pre-computed base paths for all raw modes (no rotation). */
export const HARMONIC_PATHS: readonly string[] = Array.from(
  { length: MODE_COUNT },
  (_, mode) => harmonicPath(mode),
)

/** Pre-computed SMIL for the canonical pulse sequence. */
export const SMIL = buildSmil(PULSE_SEQUENCE)

/** @deprecated use SMIL.dur or CYCLE_MS */
export const MORPH_CADENCE_MS = CYCLE_MS

/** @deprecated use SMIL.keyTimes */
export function smilKeyTimes(): string {
  return SMIL.keyTimes
}

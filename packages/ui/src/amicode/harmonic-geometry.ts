// packages/ui/src/amicode/harmonic-geometry.ts
// AMICODE: pure geometry + timing for the spherical-harmonic morphing dot (harmonic-dot.tsx).
// Mirrors the wave-geometry.ts pattern: DOM-free, unit-tested, module-level precomputation.
//
// Rhythm: sphere → harmonic → sphere → harmonic → ... (the sphere is "home base").
// Each pulse is ~1.2s: sphere-hold (350ms) → morph-out (175ms) → shape-hold (500ms)
// → morph-back (175ms). Four pulses make one full cycle (~4.8s).
//
// All paths share the same command structure (64 points, M + 63 L + Z) so SVG
// SMIL <animate attributeName="d"> can interpolate natively between them.

/** CSS size of the morphing dot when in the running state (px). */
export const HARMONIC_SIZE = 13

/** Internal SVG resolution — 2x CSS size for crisp rendering on all displays. */
export const HARMONIC_VIEWBOX = 26

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
export const PULSE_COUNT = 10

/** Total cycle duration (ms). */
export const CYCLE_MS = PULSE_MS * PULSE_COUNT

// --- Modes ---

/** Number of distinct harmonic modes (circle + 7 shapes). */
export const MODE_COUNT = 8

/**
 * Compute the normalized radius [0, 1] for a given mode at angle theta.
 *
 * Mode 0: Y_0^0 — circle (constant)
 * Mode 1: Y_1^0 — dumbbell (cos²θ) — NOT USED in pulse sequence (phallic-adjacent)
 * Mode 2: Y_2^0 — pinched (|3cos²θ − 1| normalized, with base)
 * Mode 3: l=2 m=2 — four-lobe clover (|cos(2θ)| with base)
 * Mode 4: l=3 m=3 — six-lobe rosette (|cos(3θ)| with base)
 * Mode 5: l=3 m=0 — trefoil (gentle 3-lobe via (1+cos(3θ))/2)
 * Mode 6: l=4 m=4 — eight-lobe star (|cos(4θ)| with base)
 * Mode 7: l=4 m=0 — double pinch (|P_4^0(cosθ)| — 4 lobes along axis with 2 waists)
 *
 * A base offset (min radius ~0.2–0.3) prevents cusps and keeps shapes "spherical" —
 * at 13px a cusp would be a single-pixel spike, unreadable.
 */
export function harmonicRadius(mode: number, theta: number): number {
  switch (mode) {
    case 0:
      // Perfect circle
      return 1.0
    case 1: {
      // Dumbbell: two lobes (legacy, not in pulse sequence)
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
    case 4: {
      // Six-lobe rosette: |cos(3θ)| gives six symmetric lobes
      const raw = Math.abs(Math.cos(3 * theta)) // range [0, 1]
      return 0.25 + 0.75 * raw
    }
    case 5: {
      // Trefoil: (1 + cos(3θ))/2 gives gentle 3-lobe shape
      const raw = (1 + Math.cos(3 * theta)) / 2 // range [0, 1]
      return 0.3 + 0.7 * raw
    }
    case 6: {
      // Eight-lobe star: |cos(4θ)| gives eight fine lobes
      const raw = Math.abs(Math.cos(4 * theta)) // range [0, 1]
      return 0.3 + 0.7 * raw
    }
    case 7: {
      // Double pinch: |P_4^0(cosθ)| = |35cos⁴θ − 30cos²θ + 3|/8
      // Gives 4 lobes along the polar axis with two pinched waists between them
      const cos = Math.cos(theta)
      const cos2 = cos * cos
      const raw = Math.abs(35 * cos2 * cos2 - 30 * cos2 + 3) / 8 // range [0, 1]
      return 0.2 + 0.8 * raw
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
  const cx = HARMONIC_VIEWBOX / 2
  const cy = HARMONIC_VIEWBOX / 2
  // Leave 1px margin in viewBox units for anti-aliasing / stroke overshoot
  const maxR = (HARMONIC_VIEWBOX - 2) / 2
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
 * The pulse mode sequence: which harmonic shape appears in each pulse.
 * Order is fixed for visual contrast; ANGLES are randomized per mount.
 * 10 pulses using 6 shapes (modes 1–6), no adjacent repeats.
 */
export const PULSE_MODES: readonly number[] = [
  3, // clover (4 lobes, Y_2^2)
  1, // dumbbell (2 lobes, Y_1^0)
  4, // rosette-6 (6 lobes, Y_3^3)
  7, // double pinch (4 axial, P_4^0)
  2, // pinched (2+equator, P_2^0)
  6, // star-8 (8 lobes, Y_4^4)
  3, // clover
  1, // dumbbell
  4, // rosette-6
  6, // star-8
]

/**
 * Allowed rotation angles per mode (degrees, 45° increments).
 *
 * In SVG coordinates, theta=0 points RIGHT. The dumbbell's natural shape
 * (rotation=0°) has lobes at LEFT/RIGHT = horizontal. Rotation=90° makes
 * it VERTICAL — which looks phallic. So modes 1 and 2 EXCLUDE 90° and 270°.
 */
const ANGLES_ANY = [0, 45, 90, 135, 180, 225, 270, 315] as const
const ANGLES_NO_VERTICAL = [0, 45, 135, 180, 225, 315] as const

function allowedAngles(mode: number): readonly number[] {
  if (mode === 1 || mode === 2 || mode === 7) return ANGLES_NO_VERTICAL
  return ANGLES_ANY
}

/**
 * Generate a random pulse sequence (mode + rotation for each pulse).
 * Called once per HarmonicDot mount — each streaming turn gets a fresh sequence.
 */
export function randomPulseSequence(): ReadonlyArray<{ mode: number; rotation: number }> {
  const result: Array<{ mode: number; rotation: number }> = []
  for (let i = 0; i < PULSE_MODES.length; i++) {
    const mode = PULSE_MODES[i]
    const angles = allowedAngles(mode)
    let rotation: number
    const prev = result[i - 1]
    do {
      rotation = angles[Math.floor(Math.random() * angles.length)]
    } while (prev && prev.mode === mode && prev.rotation === rotation)
    result.push({ mode, rotation })
  }
  return result
}

/** Pre-computed circle path (the "home" shape). */
export const CIRCLE_PATH = harmonicPath(0)

/**
 * Build SMIL keyframe attributes for a given pulse sequence.
 */
export function buildSmil(sequence: ReadonlyArray<{ mode: number; rotation: number }>): {
  values: string
  keyTimes: string
  fillOpacity: string
  dur: string
} {
  const pulsePaths = sequence.map(({ mode, rotation }) => harmonicPath(mode, rotation))
  const values: string[] = []
  const opacities: number[] = []
  const times: number[] = []
  const total = PULSE_MS * sequence.length

  let t = 0
  for (let i = 0; i < sequence.length; i++) {
    // Sphere hold start — hollow (opacity 0)
    values.push(CIRCLE_PATH)
    opacities.push(0)
    times.push(t / total)
    t += SPHERE_HOLD_MS

    // Sphere hold end — still hollow, morph-out begins
    values.push(CIRCLE_PATH)
    opacities.push(0)
    times.push(t / total)
    t += MORPH_MS

    // Shape arrived — solid (opacity 1)
    values.push(pulsePaths[i])
    opacities.push(1)
    times.push(t / total)
    t += SHAPE_HOLD_MS

    // Shape hold end — still solid, morph-back begins
    values.push(pulsePaths[i])
    opacities.push(1)
    times.push(t / total)
    t += MORPH_MS
  }

  // Final: back to circle, hollow
  values.push(CIRCLE_PATH)
  opacities.push(0)
  times.push(1)

  return {
    values: values.join(";"),
    keyTimes: times.map((v) => Math.round(v * 10000) / 10000).join(";"),
    fillOpacity: opacities.join(";"),
    dur: `${total}ms`,
  }
}

// --- Deterministic exports for tests ---

/** A deterministic sequence for testing — uses first allowed angle per mode. */
export const PULSE_SEQUENCE: ReadonlyArray<{ mode: number; rotation: number }> =
  PULSE_MODES.map((mode) => ({ mode, rotation: allowedAngles(mode)[0] }))

/** Pre-computed paths for the deterministic test sequence. */
export const PULSE_PATHS: readonly string[] = PULSE_SEQUENCE.map(
  ({ mode, rotation }) => harmonicPath(mode, rotation),
)

/** Pre-computed base paths for all raw modes (no rotation). */
export const HARMONIC_PATHS: readonly string[] = Array.from(
  { length: MODE_COUNT },
  (_, mode) => harmonicPath(mode),
)

/** Pre-computed SMIL for the deterministic test sequence. */
export const SMIL = buildSmil(PULSE_SEQUENCE)

/** @deprecated use SMIL.dur or CYCLE_MS */
export const MORPH_CADENCE_MS = CYCLE_MS

/** @deprecated use SMIL.keyTimes */
export function smilKeyTimes(): string {
  return SMIL.keyTimes
}

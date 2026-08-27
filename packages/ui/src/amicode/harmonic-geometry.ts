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

/** Diameter of the morphing dot when in the running state (px). */
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
export const PULSE_COUNT = 10

/** Total cycle duration (ms). */
export const CYCLE_MS = PULSE_MS * PULSE_COUNT

// --- Modes ---

/** Number of distinct harmonic modes (circle + 6 shapes). */
export const MODE_COUNT = 7

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
 * The pulse sequence: which mode + orientation appears in each pulse.
 * 10 pulses using 5 shapes (modes 2–6) at 45°-increment rotations.
 * No dumbbell (mode 1). No adjacent pulses share the same shape.
 *
 * Shapes: clover(3), rosette(4), pinched(2), trefoil(5), star(6)
 * Angles: 0°, 45°, 90°, 135° — spread across the sequence.
 */
export const PULSE_SEQUENCE: ReadonlyArray<{ mode: number; rotation: number }> = [
  { mode: 3, rotation: 0 },    // clover, lobes at axes
  { mode: 4, rotation: 45 },   // rosette-6, rotated
  { mode: 2, rotation: 90 },   // pinched, horizontal
  { mode: 5, rotation: 0 },    // trefoil, upright
  { mode: 6, rotation: 45 },   // star-8, rotated
  { mode: 3, rotation: 45 },   // clover, lobes at diagonals
  { mode: 4, rotation: 0 },    // rosette-6, axis-aligned
  { mode: 2, rotation: 135 },  // pinched, diagonal
  { mode: 5, rotation: 45 },   // trefoil, rotated
  { mode: 6, rotation: 0 },    // star-8, axis-aligned
]

/** Pre-computed circle path (the "home" shape). */
export const CIRCLE_PATH = harmonicPath(0)

/** Pre-computed paths for each pulse's harmonic shape. */
export const PULSE_PATHS: readonly string[] = PULSE_SEQUENCE.map(
  ({ mode, rotation }) => harmonicPath(mode, rotation),
)

/** Pre-computed base paths for all raw modes (no rotation). For testing. */
export const HARMONIC_PATHS: readonly string[] = Array.from(
  { length: MODE_COUNT },
  (_, mode) => harmonicPath(mode),
)

// --- SMIL attributes ---

/**
 * Build the SMIL `values` for the pulse rhythm.
 * Pattern: circle; shape1; circle; shape2; circle; shape3; circle; shape4; circle
 * (9 values — starts and ends on circle for seamless loop)
 */
function buildSmilValues(): string {
  const values: string[] = [CIRCLE_PATH]
  for (const shapePath of PULSE_PATHS) {
    values.push(shapePath)
    values.push(CIRCLE_PATH)
  }
  return values.join(";")
}

/**
 * Build SMIL `keyTimes` for the asymmetric pulse rhythm.
 *
 * 9 values = 8 intervals. Each pulse (sphere→shape→sphere) has 4 phases:
 *   sphere-hold → morph-out → shape-hold → morph-back
 *
 * But in terms of intervals between the 9 keyframes:
 *   [0] circle → [1] shape1: morph-out (175ms) — preceded by sphere-hold
 *   [1] shape1 → [2] circle: morph-back (175ms) — preceded by shape-hold
 *   ... etc.
 *
 * We encode holds by adjusting keyTime positions so the morph intervals are
 * short and the holds are "time spent at the same value" (between adjacent
 * identical keyframes in `values` — but our values alternate, so we handle
 * holds by making the keyTimes asymmetric).
 *
 * Actually, SMIL interpolates between ADJACENT values during each interval.
 * Since our pattern is: C, S1, C, S2, C, S3, C, S4, C (9 values, 8 intervals):
 *
 * Interval 0: C→S1 (should take: sphere_hold + morph_out = 525ms)
 *   The sphere "holds" at the start of this interval (nothing moves since the
 *   previous value was also C), then morphs to S1.
 *   Duration fraction: (SPHERE_HOLD_MS + MORPH_MS) / CYCLE_MS
 *
 * Interval 1: S1→C (should take: shape_hold + morph_back = 675ms)
 *   The shape holds, then morphs back to circle.
 *   Duration fraction: (SHAPE_HOLD_MS + MORPH_MS) / CYCLE_MS
 *
 * Wait — that's wrong. SMIL linear interpolation spreads the morph evenly across
 * the entire interval. To get a hold followed by a morph we'd need extra keyframes
 * (duplicate values for the hold portion).
 *
 * Better approach: use MORE keyframes with duplicates to create holds explicitly.
 * Pattern with holds:
 *   C, C, S1, S1, C, C, S2, S2, C, C, S3, S3, C, C, S4, S4, C
 *   (17 values = 16 intervals)
 *
 * Each pulse = 4 intervals:
 *   C→C (sphere hold, 350ms), C→S (morph out, 175ms),
 *   S→S (shape hold, 500ms), S→C (morph back, 175ms)
 */
function buildSmilKeyframes(): { values: string; keyTimes: string; dur: string } {
  // 17-value approach with explicit holds
  const values: string[] = []
  const times: number[] = []

  let t = 0
  const total = CYCLE_MS

  for (let i = 0; i < PULSE_COUNT; i++) {
    const shapePath = PULSE_PATHS[i]

    // Sphere hold start
    values.push(CIRCLE_PATH)
    times.push(t / total)
    t += SPHERE_HOLD_MS

    // Sphere hold end / morph-out start
    values.push(CIRCLE_PATH)
    times.push(t / total)
    t += MORPH_MS

    // Shape arrived / shape hold start
    values.push(shapePath)
    times.push(t / total)
    t += SHAPE_HOLD_MS

    // Shape hold end / morph-back start
    values.push(shapePath)
    times.push(t / total)
    t += MORPH_MS
  }

  // Final: back to circle (loop close)
  values.push(CIRCLE_PATH)
  times.push(1)

  return {
    values: values.join(";"),
    keyTimes: times.map((v) => Math.round(v * 10000) / 10000).join(";"),
    dur: `${total}ms`,
  }
}

/** Pre-computed SMIL attributes for the animate element. */
export const SMIL = buildSmilKeyframes()

// Legacy exports kept for backward compat with tests
export const SMIL_VALUES = buildSmilValues()
export const MORPH_CADENCE_MS = CYCLE_MS

export function smilKeyTimes(): string {
  return SMIL.keyTimes
}

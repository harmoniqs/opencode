// packages/ui/src/amicode/amico-wave.ts
// AMICODE: pure geometry + timing for the harmonic working indicator (amico-wave.tsx).
// Spec: spec-20260728-104232-amicode-working-indicator-harmonic-wave.
//
// Fork convention (see thinking.ts / run-series.ts): keep the maths DOM-free and
// unit-tested, keep the component thin.
//
// Every locked constant lives HERE and nowhere else. In particular the per-mode
// animation-delay values are computed by modeDelaysMs() and handed to the component as
// inline style — deliberately NOT written into amicode.css. A hand-authored -1x/-2x
// ordering silently plays the climb 1 -> 3 -> 2, and it is invisible on inspection.
// Keeping the delays in tested code makes that unrepresentable.

/** Box is 1:1 with device pixels; the viewBox aspect MUST match the rendered size or the
 *  default preserveAspectRatio letterboxes the wave and silently shrinks the amplitude. */
export const WAVE_BOX = { w: 30, h: 12, mid: 6 } as const

/** ±4.3px puts the extremes at 0.95/11.05px including the lead stroke — ~0.95px of margin.
 *  ±4.9 leaves ~0.3px and clips visibly on subpixel layouts. */
export const WAVE_AMP = 4.3

export const WAVE_LEAD_STROKE = 1.5
export const WAVE_COMPANION_STROKE = 1.2
export const WAVE_COMPANION_OPACITY = 0.4

export const WAVE_PERIOD_MS = 1150
/** Dwells at the extremes and rips through the zero crossing, so the residual flat instant
 *  is ~1/3 as long as under ease-in-out. */
export const WAVE_EASING = "cubic-bezier(.9,0,.1,1)"

export const MODE_HOLD_MS = 2300
/** Modes 1, 2, 3 across the 30px box. */
export const MODE_WAVELENGTHS = [30, 15, 10] as const

const SAMPLE_STEP = 0.6

/** Quadrature: the companion is a quarter period behind. Derived from the period so the two
 *  numbers can never drift apart. */
export function companionDelayMs(periodMs: number = WAVE_PERIOD_MS): number {
  return -periodMs / 4
}

export function modeCadenceMs(
  holdMs: number = MODE_HOLD_MS,
  modeCount: number = MODE_WAVELENGTHS.length,
): number {
  return holdMs * modeCount
}

/**
 * Negative animation-delays that make the visible mode sequence ASCEND 1 -> 2 -> 3.
 *
 * A delay of -|d| starts the element |d| into its cycle, so it is visible over
 *   t ∈ [cadence - |d|, cadence - |d| + hold).
 * Wanting mode i visible over [i*hold, (i+1)*hold) gives |d_i| = cadence - i*hold —
 * i.e. the magnitudes DESCEND as the index ascends. Mode 0 normalises to 0.
 */
export function modeDelaysMs(
  holdMs: number = MODE_HOLD_MS,
  modeCount: number = MODE_WAVELENGTHS.length,
): number[] {
  const cadence = modeCadenceMs(holdMs, modeCount)
  return Array.from({ length: modeCount }, (_, i) => {
    const d = -(cadence - i * holdMs)
    return d === -cadence ? 0 : d
  })
}

/** Which mode indices are visible at time t. The oracle for the ordering test — derived from
 *  modeDelaysMs so it genuinely exercises the delay maths rather than restating the answer. */
export function visibleModesAt(
  tMs: number,
  holdMs: number = MODE_HOLD_MS,
  modeCount: number = MODE_WAVELENGTHS.length,
): number[] {
  const cadence = modeCadenceMs(holdMs, modeCount)
  const delays = modeDelaysMs(holdMs, modeCount)
  const out: number[] = []
  delays.forEach((d, i) => {
    const local = (((tMs - d) % cadence) + cadence) % cadence
    if (local < holdMs) out.push(i)
  })
  return out
}

/** Sampled points of one standing mode, y measured downward from the top of the box. */
export function samplePoints(wavelength: number): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  const round = (n: number) => Math.round(n * 100) / 100
  for (let x = 0; x <= WAVE_BOX.w + 1e-9; x += SAMPLE_STEP) {
    pts.push([round(x), round(WAVE_BOX.mid - WAVE_AMP * Math.sin((2 * Math.PI * x) / wavelength))])
  }
  return pts
}

/** Open polyline path for one mode. */
export function modePath(wavelength: number): string {
  return "M" + samplePoints(wavelength).map(([x, y]) => `${x},${y}`).join("L")
}

/** Computed once at module load — 153 Math.sin calls total, nowhere near a frame path. */
export const MODE_PATHS: readonly string[] = MODE_WAVELENGTHS.map(modePath)

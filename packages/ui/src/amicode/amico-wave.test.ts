// packages/ui/src/amicode/amico-wave.test.ts
import { describe, expect, test } from "bun:test"
import {
  WAVE_BOX,
  WAVE_AMP,
  WAVE_LEAD_STROKE,
  WAVE_PERIOD_MS,
  MODE_HOLD_MS,
  MODE_WAVELENGTHS,
  MODE_PATHS,
  companionDelayMs,
  modeCadenceMs,
  modeDelaysMs,
  visibleModesAt,
  samplePoints,
} from "./amico-wave"

describe("quadrature", () => {
  test("companion delay is exactly a quarter period, derived from the period", () => {
    expect(companionDelayMs()).toBe(-WAVE_PERIOD_MS / 4)
    expect(companionDelayMs(2000)).toBe(-500)
  })
})

describe("harmonic climb", () => {
  test("cadence is hold x mode count", () => {
    expect(modeCadenceMs()).toBe(MODE_HOLD_MS * MODE_WAVELENGTHS.length)
    expect(modeCadenceMs(1000, 4)).toBe(4000)
  })

  test("delays DESCEND in magnitude so the visible sequence ASCENDS", () => {
    // Regression: -1*step / -2*step silently plays 1 -> 3 -> 2.
    expect(modeDelaysMs()).toEqual([0, -4600, -2300])
  })

  test("exactly one mode is visible at any instant, and the order is 1,2,3", () => {
    const cadence = modeCadenceMs()
    const seen: number[] = []
    // sample the middle of each hold window, avoiding exact boundaries
    for (let t = MODE_HOLD_MS / 2; t < cadence; t += MODE_HOLD_MS) {
      const vis = visibleModesAt(t)
      expect(vis).toHaveLength(1)
      seen.push(vis[0])
    }
    expect(seen).toEqual([0, 1, 2])
  })

  test("never zero or two modes visible across a dense sweep of two cadences", () => {
    const cadence = modeCadenceMs()
    for (let t = 0; t < cadence * 2; t += 37) {
      expect(visibleModesAt(t)).toHaveLength(1)
    }
  })
})

describe("geometry", () => {
  test("one path per mode, mode n has n full wavelengths across the box", () => {
    expect(MODE_PATHS).toHaveLength(MODE_WAVELENGTHS.length)
    MODE_WAVELENGTHS.forEach((lambda, i) => {
      expect(WAVE_BOX.w / lambda).toBe(i + 1)
    })
  })

  test("every sampled point stays inside the box once stroke width is accounted for", () => {
    const half = WAVE_LEAD_STROKE / 2
    for (const lambda of MODE_WAVELENGTHS) {
      for (const [x, y] of samplePoints(lambda)) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(WAVE_BOX.w)
        expect(y - half).toBeGreaterThanOrEqual(0)
        expect(y + half).toBeLessThanOrEqual(WAVE_BOX.h)
      }
    }
  })

  test("amplitude is actually used — extremes reach within 0.1px of the design bound", () => {
    const ys = samplePoints(MODE_WAVELENGTHS[0]).map(([, y]) => y)
    expect(Math.min(...ys)).toBeCloseTo(WAVE_BOX.mid - WAVE_AMP, 1)
    expect(Math.max(...ys)).toBeCloseTo(WAVE_BOX.mid + WAVE_AMP, 1)
  })

  test("paths are well-formed and contain no SVG ids", () => {
    for (const d of MODE_PATHS) {
      expect(d.startsWith("M")).toBe(true)
      expect(d).not.toContain("url(")
      expect(d).not.toContain("id=")
    }
  })
})

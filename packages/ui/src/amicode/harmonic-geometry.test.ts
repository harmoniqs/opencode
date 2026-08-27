// packages/ui/src/amicode/harmonic-geometry.test.ts
import { describe, expect, test } from "bun:test"
import {
  HARMONIC_SIZE,
  HARMONIC_SAMPLES,
  MODE_HOLD_MS,
  ROTATION_PERIOD_MS,
  MODE_COUNT,
  HARMONIC_PATHS,
  harmonicRadius,
  harmonicPath,
} from "./harmonic-geometry"

describe("constants", () => {
  test("HARMONIC_SIZE is 13px — fits inside the 24px content gutter", () => {
    expect(HARMONIC_SIZE).toBe(13)
  })

  test("HARMONIC_SAMPLES is 64 — enough for smooth curves at 13px", () => {
    expect(HARMONIC_SAMPLES).toBe(64)
  })

  test("MODE_COUNT is 4 — circle, dumbbell, pinched, clover", () => {
    expect(MODE_COUNT).toBe(4)
  })

  test("MODE_HOLD_MS matches the wave's existing cadence", () => {
    expect(MODE_HOLD_MS).toBe(2300)
  })

  test("ROTATION_PERIOD_MS is 12s — slow organic rotation", () => {
    expect(ROTATION_PERIOD_MS).toBe(12000)
  })
})

describe("harmonicRadius", () => {
  test("mode 0 is a circle — constant radius at all angles", () => {
    const radii = Array.from({ length: 64 }, (_, i) => harmonicRadius(0, (i / 64) * 2 * Math.PI))
    const first = radii[0]
    for (const r of radii) {
      expect(r).toBeCloseTo(first, 6)
    }
  })

  test("mode 1 (dumbbell) has maxima at 0 and pi, minima at pi/2 and 3pi/2", () => {
    const top = harmonicRadius(1, 0)
    const bottom = harmonicRadius(1, Math.PI)
    const side = harmonicRadius(1, Math.PI / 2)
    expect(top).toBeCloseTo(bottom, 4)
    expect(top).toBeGreaterThan(side)
  })

  test("mode 2 (pinched) has distinct shape from mode 1", () => {
    const r2_side = harmonicRadius(2, Math.PI / 2)
    const r1_side = harmonicRadius(1, Math.PI / 2)
    // Mode 2 should differ from mode 1 at the equator
    expect(r2_side).not.toBeCloseTo(r1_side, 2)
  })

  test("mode 3 (clover) has four-fold symmetry", () => {
    // |cos(2θ)| has lobes at 0, π/2, π, 3π/2 and nodes at π/4, 3π/4, etc.
    const r0 = harmonicRadius(3, 0)
    const r90 = harmonicRadius(3, Math.PI / 2)
    const r180 = harmonicRadius(3, Math.PI)
    const r270 = harmonicRadius(3, 3 * Math.PI / 2)
    // Four-fold symmetry: all cardinal directions equal
    expect(r0).toBeCloseTo(r90, 4)
    expect(r90).toBeCloseTo(r180, 4)
    expect(r180).toBeCloseTo(r270, 4)
    // Nodes at 45° are smaller than lobes at 0°
    const node = harmonicRadius(3, Math.PI / 4)
    expect(r0).toBeGreaterThan(node)
  })

  test("all modes have radii in (0, 1] — never zero, never exceeds unit", () => {
    for (let mode = 0; mode < MODE_COUNT; mode++) {
      for (let i = 0; i < 256; i++) {
        const theta = (i / 256) * 2 * Math.PI
        const r = harmonicRadius(mode, theta)
        expect(r).toBeGreaterThan(0)
        expect(r).toBeLessThanOrEqual(1.0001) // float tolerance
      }
    }
  })
})

describe("harmonicPath", () => {
  test("produces a closed SVG path starting with M and ending with Z", () => {
    for (let mode = 0; mode < MODE_COUNT; mode++) {
      const path = harmonicPath(mode)
      expect(path.startsWith("M")).toBe(true)
      expect(path.endsWith("Z")).toBe(true)
    }
  })

  test("all modes produce paths with the same number of L commands (HARMONIC_SAMPLES)", () => {
    const counts = Array.from({ length: MODE_COUNT }, (_, mode) => {
      const path = harmonicPath(mode)
      // Count L commands: every point after the first M is an L
      return (path.match(/L/g) || []).length
    })
    // All should be HARMONIC_SAMPLES - 1 (first is M, rest are L, then Z)
    for (const count of counts) {
      expect(count).toBe(HARMONIC_SAMPLES - 1)
    }
  })

  test("identical command structure across modes — required for SMIL interpolation", () => {
    const commandStructures = Array.from({ length: MODE_COUNT }, (_, mode) => {
      const path = harmonicPath(mode)
      // Extract just the command letters
      return path.replace(/[-\d.,\s]/g, "")
    })
    const first = commandStructures[0]
    for (const struct of commandStructures) {
      expect(struct).toBe(first)
    }
  })

  test("all coordinates stay within the viewBox (0, 0, HARMONIC_SIZE, HARMONIC_SIZE)", () => {
    for (let mode = 0; mode < MODE_COUNT; mode++) {
      const path = harmonicPath(mode)
      const coords = path.match(/-?[\d.]+/g)!.map(Number)
      for (let i = 0; i < coords.length; i++) {
        expect(coords[i]).toBeGreaterThanOrEqual(-0.01)
        expect(coords[i]).toBeLessThanOrEqual(HARMONIC_SIZE + 0.01)
      }
    }
  })
})

describe("HARMONIC_PATHS", () => {
  test("pre-computed array has MODE_COUNT entries", () => {
    expect(HARMONIC_PATHS).toHaveLength(MODE_COUNT)
  })

  test("matches harmonicPath() output for each mode", () => {
    for (let mode = 0; mode < MODE_COUNT; mode++) {
      expect(HARMONIC_PATHS[mode]).toBe(harmonicPath(mode))
    }
  })

  test("the SMIL values string (semicolon-joined) can be derived from HARMONIC_PATHS", () => {
    // Verify the paths can form a valid SMIL values attribute
    const smilValues = HARMONIC_PATHS.join(";")
    expect(smilValues.split(";")).toHaveLength(MODE_COUNT)
    // Each segment must start with M and end with Z
    for (const segment of smilValues.split(";")) {
      expect(segment.startsWith("M")).toBe(true)
      expect(segment.endsWith("Z")).toBe(true)
    }
  })
})

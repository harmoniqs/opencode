// packages/ui/src/amicode/harmonic-geometry.test.ts
import { describe, expect, test } from "bun:test"
import {
  HARMONIC_SIZE,
  HARMONIC_SAMPLES,
  SPHERE_HOLD_MS,
  MORPH_MS,
  SHAPE_HOLD_MS,
  PULSE_MS,
  PULSE_COUNT,
  CYCLE_MS,
  MODE_COUNT,
  HARMONIC_PATHS,
  CIRCLE_PATH,
  CIRCLE_DONUT_PATH,
  PULSE_PATHS,
  PULSE_DONUT_PATHS,
  PULSE_SEQUENCE,
  PULSE_MODES,
  PULSE_ROTATIONS,
  SMIL,
  harmonicRadius,
  harmonicPath,
  buildSmil,
} from "./harmonic-geometry"

describe("constants", () => {
  test("HARMONIC_SIZE is 13px — fits inside the 24px content gutter", () => {
    expect(HARMONIC_SIZE).toBe(13)
  })

  test("HARMONIC_SAMPLES is 64 — enough for smooth curves at 13px", () => {
    expect(HARMONIC_SAMPLES).toBe(64)
  })

  test("MODE_COUNT is 14 — circle + 13 shapes", () => {
    expect(MODE_COUNT).toBe(14)
  })
})

describe("pulse timing", () => {
  test("one pulse is sphere-hold + morph-out + shape-hold + morph-back", () => {
    expect(PULSE_MS).toBe(SPHERE_HOLD_MS + MORPH_MS + SHAPE_HOLD_MS + MORPH_MS)
  })

  test("pulse timing is ~1.2s (snappy, energetic)", () => {
    expect(PULSE_MS).toBe(1200)
  })

  test("full cycle is 10 pulses = 12s", () => {
    expect(CYCLE_MS).toBe(PULSE_MS * PULSE_COUNT)
    expect(CYCLE_MS).toBe(12000)
  })

  test("timing breakdown: 350 + 175 + 500 + 175 = 1200", () => {
    expect(SPHERE_HOLD_MS).toBe(350)
    expect(MORPH_MS).toBe(175)
    expect(SHAPE_HOLD_MS).toBe(500)
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

  test("mode 3 (clover) has four-fold symmetry", () => {
    const r0 = harmonicRadius(3, 0)
    const r90 = harmonicRadius(3, Math.PI / 2)
    const r180 = harmonicRadius(3, Math.PI)
    const r270 = harmonicRadius(3, 3 * Math.PI / 2)
    expect(r0).toBeCloseTo(r90, 4)
    expect(r90).toBeCloseTo(r180, 4)
    expect(r180).toBeCloseTo(r270, 4)
    const node = harmonicRadius(3, Math.PI / 4)
    expect(r0).toBeGreaterThan(node)
  })

  test("mode 4 (rosette) has six-fold symmetry", () => {
    const r0 = harmonicRadius(4, 0)
    const r60 = harmonicRadius(4, Math.PI / 3)
    const r120 = harmonicRadius(4, 2 * Math.PI / 3)
    expect(r0).toBeCloseTo(r60, 4)
    expect(r60).toBeCloseTo(r120, 4)
    const node = harmonicRadius(4, Math.PI / 6)
    expect(r0).toBeGreaterThan(node)
  })

  test("mode 6 (star-8) has eight-fold symmetry", () => {
    const r0 = harmonicRadius(6, 0)
    const r45 = harmonicRadius(6, Math.PI / 4)
    const r90 = harmonicRadius(6, Math.PI / 2)
    expect(r0).toBeCloseTo(r45, 4)
    expect(r45).toBeCloseTo(r90, 4)
    const node = harmonicRadius(6, Math.PI / 8)
    expect(r0).toBeGreaterThan(node)
  })

  test("higher l with same lobe formula has deeper valleys (lower base)", () => {
    // m=1 pills: mode 8 (l=2, base 0.35) > mode 9 (l=3, base 0.15) > mode 11 (l=4, base 0.1)
    const minAngle = Math.PI / 2 // minimum for cos²θ
    expect(harmonicRadius(8, minAngle)).toBeGreaterThan(harmonicRadius(9, minAngle))
    expect(harmonicRadius(9, minAngle)).toBeGreaterThan(harmonicRadius(11, minAngle))

    // m=2 clovers: mode 3 (l=2, base 0.2) > mode 10 (l=3, base 0.15) > mode 12 (l=4, base 0.1)
    const cloverMin = Math.PI / 4 // minimum for |cos(2θ)|
    expect(harmonicRadius(3, cloverMin)).toBeGreaterThan(harmonicRadius(10, cloverMin))
    expect(harmonicRadius(10, cloverMin)).toBeGreaterThan(harmonicRadius(12, cloverMin))

    // m=3 rosettes: mode 4 (l=3, base 0.25) > mode 13 (l=4, base 0.15)
    const rosetteMin = Math.PI / 6 // minimum for |cos(3θ)|
    expect(harmonicRadius(4, rosetteMin)).toBeGreaterThan(harmonicRadius(13, rosetteMin))
  })

  test("all modes have radii in (0, 1] — never zero, never exceeds unit", () => {
    for (let mode = 0; mode < MODE_COUNT; mode++) {
      for (let i = 0; i < 256; i++) {
        const theta = (i / 256) * 2 * Math.PI
        const r = harmonicRadius(mode, theta)
        expect(r).toBeGreaterThan(0)
        expect(r).toBeLessThanOrEqual(1.0001)
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

  test("all modes produce paths with HARMONIC_SAMPLES - 1 L commands", () => {
    for (let mode = 0; mode < MODE_COUNT; mode++) {
      const path = harmonicPath(mode)
      expect((path.match(/L/g) || []).length).toBe(HARMONIC_SAMPLES - 1)
    }
  })

  test("identical command structure across modes — required for SMIL interpolation", () => {
    const structures = Array.from({ length: MODE_COUNT }, (_, mode) =>
      harmonicPath(mode).replace(/[-\d.,\s]/g, ""),
    )
    for (const struct of structures) {
      expect(struct).toBe(structures[0])
    }
  })

  test("all coordinates stay within the viewBox (0, 0, SIZE, SIZE)", () => {
    for (let mode = 0; mode < MODE_COUNT; mode++) {
      const coords = harmonicPath(mode).match(/-?[\d.]+/g)!.map(Number)
      for (const c of coords) {
        expect(c).toBeGreaterThanOrEqual(-0.01)
        expect(c).toBeLessThanOrEqual(HARMONIC_SIZE + 0.01)
      }
    }
  })

  test("rotation shifts the shape without changing structure", () => {
    const p0 = harmonicPath(3, 0)
    const p45 = harmonicPath(3, 45)
    expect(p45.replace(/[-\d.,\s]/g, "")).toBe(p0.replace(/[-\d.,\s]/g, ""))
    expect(p45).not.toBe(p0)
  })

  test("circle is invariant under rotation (mode 0)", () => {
    expect(harmonicPath(0, 0)).toBe(harmonicPath(0, 45))
    expect(harmonicPath(0, 0)).toBe(harmonicPath(0, 90))
  })
})

describe("pulse sequence", () => {
  test("has PULSE_COUNT (10) entries", () => {
    expect(PULSE_SEQUENCE).toHaveLength(PULSE_COUNT)
    expect(PULSE_SEQUENCE).toHaveLength(10)
  })

  test("is strictly ascending: l=2 (m=0,1,2), l=3 (m=1,2,3), l=4 (m=0,2,3,4)", () => {
    // Genuine harmonics only — no trefoil (3,0), no redundant (4,1)
    const expected = [2, 8, 3, 9, 10, 4, 7, 12, 13, 6]
    expect([...PULSE_MODES]).toEqual(expected)
  })

  test("uses modes 1–13 only (never circle as a pulse shape)", () => {
    for (const { mode } of PULSE_SEQUENCE) {
      expect(mode).toBeGreaterThanOrEqual(1)
      expect(mode).toBeLessThan(MODE_COUNT)
    }
  })

  test("m=2 shapes (4-lobe) are rotated 45° — X not +", () => {
    // Modes 3, 10, 12 are the m=2 (4-lobe) shapes
    const fourLobes = new Set([3, 10, 12])
    for (let i = 0; i < PULSE_SEQUENCE.length; i++) {
      if (fourLobes.has(PULSE_SEQUENCE[i].mode)) {
        expect(PULSE_SEQUENCE[i].rotation).toBe(45)
      }
    }
  })

  test("all non-m=2 shapes are at 0° rotation", () => {
    const fourLobes = new Set([3, 10, 12])
    for (let i = 0; i < PULSE_SEQUENCE.length; i++) {
      if (!fourLobes.has(PULSE_SEQUENCE[i].mode)) {
        expect(PULSE_SEQUENCE[i].rotation).toBe(0)
      }
    }
  })

  test("consecutive shapes are never identical (mode + rotation)", () => {
    for (let i = 1; i < PULSE_SEQUENCE.length; i++) {
      const prev = PULSE_SEQUENCE[i - 1]
      const curr = PULSE_SEQUENCE[i]
      const same = prev.mode === curr.mode && prev.rotation === curr.rotation
      expect(same).toBe(false)
    }
  })

  test("PULSE_PATHS matches the sequence", () => {
    expect(PULSE_PATHS).toHaveLength(PULSE_COUNT)
    for (let i = 0; i < PULSE_COUNT; i++) {
      const { mode, rotation } = PULSE_SEQUENCE[i]
      expect(PULSE_PATHS[i]).toBe(harmonicPath(mode, rotation))
    }
  })

  test("PULSE_ROTATIONS has same length as PULSE_MODES", () => {
    expect(PULSE_ROTATIONS).toHaveLength(PULSE_MODES.length)
  })
})

describe("SMIL keyframes", () => {
  test("values has PULSE_COUNT*4 + 1 entries (holds + morphs + close)", () => {
    const count = SMIL.values.split(";").length
    expect(count).toBe(PULSE_COUNT * 4 + 1)
  })

  test("keyTimes has same count as values", () => {
    const valCount = SMIL.values.split(";").length
    const timeCount = SMIL.keyTimes.split(";").length
    expect(timeCount).toBe(valCount)
  })

  test("keyTimes starts at 0 and ends at 1", () => {
    const times = SMIL.keyTimes.split(";").map(Number)
    expect(times[0]).toBe(0)
    expect(times[times.length - 1]).toBe(1)
  })

  test("keyTimes are monotonically non-decreasing", () => {
    const times = SMIL.keyTimes.split(";").map(Number)
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1])
    }
  })

  test("dur matches CYCLE_MS", () => {
    expect(SMIL.dur).toBe(`${CYCLE_MS}ms`)
  })

  test("first and last values are both circle donut (seamless loop)", () => {
    const vals = SMIL.values.split(";")
    expect(vals[0]).toBe(CIRCLE_DONUT_PATH)
    expect(vals[vals.length - 1]).toBe(CIRCLE_DONUT_PATH)
  })

  test("every sphere-hold pair is circle donut", () => {
    const vals = SMIL.values.split(";")
    for (let pulse = 0; pulse < PULSE_COUNT; pulse++) {
      const base = pulse * 4
      expect(vals[base]).toBe(CIRCLE_DONUT_PATH)
      expect(vals[base + 1]).toBe(CIRCLE_DONUT_PATH)
    }
  })

  test("shape values match PULSE_DONUT_PATHS at the right positions", () => {
    const vals = SMIL.values.split(";")
    for (let pulse = 0; pulse < PULSE_COUNT; pulse++) {
      const base = pulse * 4
      expect(vals[base + 2]).toBe(PULSE_DONUT_PATHS[pulse])
      expect(vals[base + 3]).toBe(PULSE_DONUT_PATHS[pulse])
    }
  })

  test("all value paths have identical SMIL-compatible structure", () => {
    const vals = SMIL.values.split(";")
    const structure = vals[0].replace(/[-\d.,\s]/g, "")
    for (const v of vals) {
      expect(v.replace(/[-\d.,\s]/g, "")).toBe(structure)
    }
  })
})

import { describe, it, expect } from "bun:test"
import { compactValue, setDiff, modeBadges } from "./facets"

const byKind = (t: { kind: string; label?: string }, i: number) => `${t.kind}:${t.label ?? i}`

describe("compactValue", () => {
  it("passes scalars through unchanged", () => {
    expect(compactValue("gate")).toBe("gate")
    expect(compactValue(3)).toBe("3")
    expect(compactValue(true)).toBe("true")
  })
  it("renders null/undefined as em-dash", () => {
    expect(compactValue(null)).toBe("—")
    expect(compactValue(undefined)).toBe("—")
  })
  it("summarizes arrays by count + head, never raw JSON", () => {
    const out = compactValue([{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }])
    expect(out).not.toContain("{") // no JSON blob
    expect(out).toContain("4") // count present
    expect(out).toContain("q1") // head label present
  })
  it("summarizes objects compactly, never raw JSON", () => {
    const out = compactValue({ arch: "global", n: 2 })
    expect(out).not.toContain('"') // no JSON quotes
    expect(out).toContain("arch")
  })
})

describe("setDiff", () => {
  it("detects added / removed by unique key", () => {
    const d = setDiff([{ kind: "reg_u" }], [{ kind: "reg_u" }, { kind: "reg_du" }], byKind)
    expect(d.added.map((x) => x.kind)).toEqual(["reg_du"])
    expect(d.removed).toEqual([])
  })
  it("does NOT collide two same-kind terms (label disambiguates)", () => {
    const from = [{ kind: "custom", label: "a" }, { kind: "custom", label: "b" }]
    const to = [{ kind: "custom", label: "a" }]
    const d = setDiff(from, to, byKind)
    expect(d.removed).toEqual([{ kind: "custom", label: "b" }])
    expect(d.added).toEqual([])
  })
  it("reports per-field changes for matched keys", () => {
    const d = setDiff([{ kind: "reg_u", params: { R: 1e-4 } }], [{ kind: "reg_u", params: { R: 1e-5 } }], byKind)
    expect(d.changed).toHaveLength(1)
    expect(d.changed[0].changes[0]).toMatchObject({ field: "params.R", from: 1e-4, to: 1e-5 })
  })
})

describe("modeBadges", () => {
  const full = {
    trajectory_type: "gate",
    time_mode: "min_time",
    parameterization: "cubic_spline",
    robustness: { kind: "ensemble" },
    free_phase: true,
    leakage: false,
  }
  it("emits type / time / param / robustness / flag badges", () => {
    const b = modeBadges(full)
    const has = (pred: (x: { label: string; value: string }) => boolean) => b.some(pred)
    expect(has((x) => x.label === "type" && x.value === "gate")).toBe(true)
    expect(has((x) => /min.?time/.test(x.value + x.label))).toBe(true)
    expect(has((x) => x.value === "ensemble")).toBe(true)
    expect(has((x) => /free.?phase/.test(x.label))).toBe(true)
  })
  it("omits false flags, none-robustness, and fixed time", () => {
    const b = modeBadges({ trajectory_type: "ket", time_mode: "fixed", robustness: { kind: "none" }, free_phase: false, leakage: false })
    expect(b.some((x) => /leakage/.test(x.label))).toBe(false)
    expect(b.some((x) => /robust/.test(x.label))).toBe(false)
    expect(b.some((x) => /min.?time/.test(x.value + x.label))).toBe(false)
  })
})

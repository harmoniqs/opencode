import { describe, expect, test } from "bun:test"
import { elapsedLabel, headlineMetric, parseRunSeriesResponse, type RunSeries } from "./run-series"

const okRun = (over: Partial<Record<string, unknown>> = {}) => ({
  ok: true,
  run: {
    run_id: "r20260703-095831Z-e5b7",
    lab: "default",
    status: "finished",
    iteration: 60,
    fidelity: 0.99992,
    best_f: 0.0015,
    last_f: 0.0015,
    elapsed_ms: 77944,
    series: [
      { iter: 0, f: 80.3 },
      { iter: 1, f: 12.5 },
      { iter: 2, f: 0.0015 },
    ],
    pulse: { iter: 60, dt: 0.214, values: [0.1, -0.2, 0.05] },
    pulse_meta: { drives: 2, knots: 50, labels: ["a_1", "a_2"] },
    tail: ["AMICODE_ITER iter=60 f=1.5e-03", "DONE fidelity=0.99992"],
    ...over,
  },
  error: null,
})

describe("parseRunSeriesResponse", () => {
  test("parses a full ok run", () => {
    const view = parseRunSeriesResponse(okRun())
    expect(view.ok).toBe(true)
    if (!view.ok) return
    expect(view.run.runId).toBe("r20260703-095831Z-e5b7")
    expect(view.run.status).toBe("finished")
    expect(view.run.iteration).toBe(60)
    expect(view.run.fidelity).toBe(0.99992)
    expect(view.run.series).toHaveLength(3)
    expect(view.run.pulse?.values).toEqual([0.1, -0.2, 0.05])
    expect(view.run.pulseMeta?.drives).toBe(2)
    expect(view.run.tail).toHaveLength(2)
  })

  test("ok:false response surfaces the error", () => {
    const view = parseRunSeriesResponse({ ok: false, run: null, error: "not_found:x: no such run dir" })
    expect(view.ok).toBe(false)
    if (view.ok) return
    expect(view.error).toContain("not_found")
  })

  test("malformed input never throws", () => {
    expect(parseRunSeriesResponse(undefined).ok).toBe(false)
    expect(parseRunSeriesResponse("nope").ok).toBe(false)
    expect(parseRunSeriesResponse({}).ok).toBe(false)
  })

  test("drops non-finite series/pulse points defensively", () => {
    const view = parseRunSeriesResponse(
      okRun({
        series: [{ iter: 0, f: 1 }, { iter: 1, f: Number.NaN }, { foo: 1 }],
        pulse: { iter: 1, dt: 0.2, values: [1, "x", 3] },
      }),
    )
    expect(view.ok).toBe(true)
    if (!view.ok) return
    expect(view.run.series).toHaveLength(1)
    expect(view.run.pulse?.values).toEqual([1, 3])
  })
})

describe("headlineMetric", () => {
  const base: RunSeries = {
    runId: "r",
    lab: "default",
    status: "solving",
    iteration: 5,
    fidelity: null,
    bestF: null,
    lastF: null,
    elapsedMs: null,
    series: [],
    pulse: null,
    pulseMeta: null,
    tail: [],
  }
  test("finished → authoritative fidelity as F", () => {
    expect(headlineMetric({ ...base, status: "finished", fidelity: 0.99992 })).toEqual({ label: "F", value: "0.99992" })
  })
  test("solving with valid infidelity → derived F = 1 - f", () => {
    expect(headlineMetric({ ...base, lastF: 0.0015 })).toEqual({ label: "F", value: "0.99850" })
  })
  test("solving early (objective ≥ 1) → raw objective f", () => {
    const m = headlineMetric({ ...base, lastF: 80.3 })
    expect(m.label).toBe("f")
    expect(m.value).toBe("8.03e+1")
  })
  test("no data → em dash", () => {
    expect(headlineMetric(base)).toEqual({ label: "F", value: "—" })
  })
})

describe("elapsedLabel", () => {
  test("formats seconds / minutes / hours", () => {
    expect(elapsedLabel(12_000)).toBe("12s")
    expect(elapsedLabel(184_000)).toBe("3m 04s")
    expect(elapsedLabel(4_320_000)).toBe("1h 12m")
  })
  test("null / negative → undefined", () => {
    expect(elapsedLabel(null)).toBeUndefined()
    expect(elapsedLabel(-5)).toBeUndefined()
  })
})

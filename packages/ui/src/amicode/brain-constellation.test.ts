import { describe, expect, test } from "bun:test"
import { createBrainEngine, type BrainEngineOptions } from "./brain-engine"
import { CONSTELLATION_DEFAULTS, buildConstellation } from "./brain-constellation"

/* The latent constellation (landing mode) must run headless like the live
   engine: a recording 2d-context and a hand-driven clock. This suite's stub
   additionally records STYLE PROPERTY SETS (fillStyle/strokeStyle/…) — the
   color law ("zero #fff676 while latent") lives in property assignments the
   engine-test stub does not capture. */

type Call = { method: string; args: unknown[] }
function recordingCtx() {
  const calls: Call[] = []
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args })
      if (method === "measureText") return { width: 42 }
      return undefined
    }
  const ctx: Record<string, unknown> = { calls }
  for (const m of [
    "setTransform",
    "clearRect",
    "fillRect",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
    "fill",
    "arc",
    "setLineDash",
    "drawImage",
    "fillText",
    "measureText",
  ])
    ctx[m] = record(m)
  for (const p of ["fillStyle", "strokeStyle", "globalAlpha", "lineWidth", "font", "textBaseline"]) {
    let value: unknown
    Object.defineProperty(ctx, p, {
      get: () => value,
      set: (v: unknown) => {
        value = v
        calls.push({ method: "set:" + p, args: [v] })
      },
      enumerable: true,
    })
  }
  return ctx as { calls: Call[] } & Record<string, unknown>
}
function stubCanvas(ctx: unknown) {
  return {
    clientWidth: 0,
    clientHeight: 0,
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement
}
function makeEngine(opts: Partial<BrainEngineOptions> = {}) {
  const ctx = recordingCtx()
  const engine = createBrainEngine(stubCanvas(ctx), {
    scheme: "dark",
    reduceMotion: false,
    animate: false,
    size: { width: 800, height: 480 },
    mode: "constellation",
    ...opts,
  })
  return { engine, ctx }
}
function drive(engine: ReturnType<typeof makeEngine>["engine"], fromMs: number, toMs: number) {
  for (let t = fromMs; t <= toMs; t += 16) engine.tick(t)
}
function clears(ctx: ReturnType<typeof recordingCtx>) {
  return ctx.calls.filter((c) => c.method === "clearRect").length
}
/** every color string assigned to fill/stroke style */
function styles(ctx: ReturnType<typeof recordingCtx>) {
  return ctx.calls
    .filter((c) => c.method === "set:fillStyle" || c.method === "set:strokeStyle")
    .map((c) => String(c.args[0]))
}
/** the thought color in every notation the engine could emit, both schemes */
const THOUGHT_INKS = [/fff676/i, /255,\s*246,\s*118/, /8f8000/i, /143,\s*128,\s*0/]
function expectNoThoughtInk(ctx: ReturnType<typeof recordingCtx>) {
  for (const s of styles(ctx)) for (const re of THOUGHT_INKS) expect(s).not.toMatch(re)
}
/** serialized node positions: the arc calls of the LAST painted frame */
function lastFrameArcs(ctx: ReturnType<typeof recordingCtx>) {
  const lastClear = ctx.calls.map((c) => c.method).lastIndexOf("clearRect")
  return JSON.stringify(ctx.calls.slice(lastClear).filter((c) => c.method === "arc"))
}

describe("constellation data (fixed seed)", () => {
  test("the build is deterministic: same target in, byte-equal arrays out", () => {
    const a = buildConstellation()
    const b = buildConstellation()
    for (const key of ["x", "y", "z", "r", "twPhase", "twSpeed", "a", "dist"] as const) {
      expect(Buffer.from(a[key].buffer).equals(Buffer.from(b[key].buffer))).toBe(true)
    }
    expect(Buffer.from(a.catIx.buffer).equals(Buffer.from(b.catIx.buffer))).toBe(true)
    expect(Buffer.from(a.edges.buffer).equals(Buffer.from(b.edges.buffer))).toBe(true)
  })

  test("the design targets hold: ~500 nodes / ~1.5k edges around the curated core", () => {
    const c = buildConstellation()
    expect(c.count).toBe(CONSTELLATION_DEFAULTS.density)
    expect(c.edges.length / 2).toBeGreaterThanOrEqual(1300)
    expect(c.edges.length / 2).toBeLessThanOrEqual(1700)
    // clamps: never below the curated core, never unbounded
    expect(buildConstellation(10).count).toBe(119)
    expect(buildConstellation(50_000).count).toBe(1200)
  })
})

describe("constellation mode — boot", () => {
  test("boots latent with the live seed untouched beneath", () => {
    const { engine } = makeEngine()
    const s = engine.stats()
    expect(s.mode).toBe("constellation")
    expect(s.latent).toBe(CONSTELLATION_DEFAULTS.density)
    // the live graph is still the sparse seed — landing only, sessions unchanged
    expect(s.nodes).toBe(1)
    expect(s.claimed).toBe(0)
    expect(s.cur).toBe("amico")
  })

  test("the default mode is live: no session engine ever sees the constellation", () => {
    const ctx = recordingCtx()
    const engine = createBrainEngine(stubCanvas(ctx), {
      scheme: "dark",
      reduceMotion: true,
      animate: false,
      size: { width: 800, height: 224 },
    })
    expect(engine.stats().mode).toBe("live")
    expect(engine.stats().latent).toBe(0)
  })

  test("the density knob sets the latent population", () => {
    const { engine } = makeEngine({ constellation: { density: 240 } })
    expect(engine.stats().latent).toBe(240)
  })
})

describe("constellation mode — determinism", () => {
  test("two engines paint byte-identical frames under the same driven clock", () => {
    const a = makeEngine()
    const b = makeEngine()
    for (let t = 0; t <= 480; t += 16) {
      a.engine.tick(t)
      b.engine.tick(t)
    }
    expect(a.ctx.calls.length).toBeGreaterThan(0)
    expect(JSON.stringify(a.ctx.calls)).toBe(JSON.stringify(b.ctx.calls))
  })

  test("node positions at t=0 are byte-equal across engines (identical constellation every launch)", () => {
    const a = makeEngine()
    const b = makeEngine()
    a.engine.tick(0)
    b.engine.tick(0)
    const arcsA = lastFrameArcs(a.ctx)
    expect(arcsA.length).toBeGreaterThan(2)
    expect(arcsA).toBe(lastFrameArcs(b.ctx))
  })
})

describe("constellation mode — color law", () => {
  test("dark: the latent web never paints the thought color", () => {
    const { engine, ctx } = makeEngine({ scheme: "dark" })
    drive(engine, 0, 3000)
    expect(clears(ctx)).toBeGreaterThan(100)
    expectNoThoughtInk(ctx)
  })

  test("light: same law — and a mid-run theme flip stays clean", () => {
    const { engine, ctx } = makeEngine({ scheme: "light" })
    drive(engine, 0, 1500)
    engine.setTheme("dark")
    drive(engine, 1516, 3000)
    engine.setTheme("light")
    drive(engine, 3016, 4000)
    expectNoThoughtInk(ctx)
    expect(engine.stats().mode).toBe("constellation")
  })
})

describe("constellation mode — motion", () => {
  test("rotation advances node positions between driven frames", () => {
    const { engine, ctx } = makeEngine()
    engine.tick(0)
    const first = lastFrameArcs(ctx)
    drive(engine, 16, 2000)
    const later = lastFrameArcs(ctx)
    expect(first.length).toBeGreaterThan(2)
    expect(later).not.toBe(first)
  })

  test("the rotating constellation holds full tempo (every driven tick paints)", () => {
    const { engine, ctx } = makeEngine()
    let ticks = 0
    for (let t = 0; t <= 2000; t += 16) {
      engine.tick(t)
      ticks++
    }
    expect(clears(ctx)).toBe(ticks) // no ~8fps rest throttle while latent
  })

  test("pause is still a hard stop in constellation mode", () => {
    const { engine, ctx } = makeEngine()
    engine.tick(16)
    const n = ctx.calls.length
    engine.pause()
    drive(engine, 32, 1000)
    expect(ctx.calls.length).toBe(n)
    engine.resume()
    engine.tick(1016)
    expect(ctx.calls.length).toBeGreaterThan(n)
  })
})

describe("constellation mode — reduced-motion tableau", () => {
  test("one canonical frame paints, then ZERO animation ticks", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: true })
    drive(engine, 16, 6000) // way past any nudge window at any cadence
    expect(clears(ctx)).toBe(1) // the tableau painted exactly once
  })

  test("an explicit repaint (resize) re-renders the SAME canonical pose", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: true })
    engine.tick(16)
    const first = lastFrameArcs(ctx)
    drive(engine, 32, 3000)
    engine.resize(800, 480) // same box — requestRender, not a reflow
    engine.tick(3016)
    expect(clears(ctx)).toBe(2)
    expect(lastFrameArcs(ctx)).toBe(first) // static: no rotation, no twinkle drift
  })
})

describe("ignition handoff (first prompt sent)", () => {
  test("the dissolve completes and exits the mode — live owns the canvas", () => {
    const { engine } = makeEngine()
    drive(engine, 0, 500)
    expect(engine.stats().mode).toBe("constellation")
    engine.ignite()
    drive(engine, 516, 4500) // ease ~1s + dissolve ~1.8s, with margin
    const s = engine.stats()
    expect(s.mode).toBe("live")
    expect(s.latent).toBe(0)
  })

  test("no yellow before the ease completes; the live core ignites #fff676 after", () => {
    const { engine, ctx } = makeEngine()
    drive(engine, 0, 500)
    engine.ignite()
    drive(engine, 516, 1400) // inside the ~1s ease: still yellow-free
    expectNoThoughtInk(ctx)
    drive(engine, 1416, 2200) // past the ease: the first live node ignites
    const inks = styles(ctx)
    expect(inks.some((s) => /fff676/i.test(s) || /255,\s*246,\s*118/.test(s))).toBe(true)
  })

  test("a second ignite never restarts the dissolve; ignite in live mode is a no-op", () => {
    const { engine } = makeEngine()
    drive(engine, 0, 200)
    engine.ignite()
    drive(engine, 216, 1200)
    engine.ignite() // mid-dissolve: must not rewind
    drive(engine, 1216, 4500)
    expect(engine.stats().mode).toBe("live")
    engine.ignite() // already live: no-op
    expect(engine.stats().mode).toBe("live")
    expect(engine.stats().nodes).toBe(1) // the live sparse seed is intact
  })

  test("reduced motion: ignite is an instant swap, no animation", () => {
    const { engine } = makeEngine({ reduceMotion: true })
    engine.tick(16)
    engine.ignite()
    expect(engine.stats().mode).toBe("live") // immediately — no dissolve frames
    expect(engine.stats().latent).toBe(0)
  })

  test("after the handoff the live engine behaves exactly as a live boot (touches claim)", () => {
    const { engine } = makeEngine({ reduceMotion: true })
    engine.tick(16)
    engine.ignite()
    engine.touch({ label: "solve", replay: true })
    const s = engine.stats()
    expect(s.claimed).toBe(1)
    expect(s.cur).toBe("live-solve")
  })
})

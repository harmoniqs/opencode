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
  // The law's boundary (Kate 2026-07-25, "constellation + live thought"): the
  // latent web's OWN ink never uses the thought color — but a REAL session
  // touch flares its node in css.thought, because a flare IS live thought.
  // These two tests drive zero touches, so the canvas must stay yellow-free.
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

describe("constellation mode — live thought", () => {
  /** did any frame paint the scheme's thought ink? */
  function paintedThoughtInk(ctx: ReturnType<typeof recordingCtx>) {
    return styles(ctx).some((s) => THOUGHT_INKS.some((re) => re.test(s)))
  }
  /** a deterministic spread across every lobe — the overfilled cloud culls
      offscreen nodes, so a lone label can hash to a culled spot; a working
      turn touches many, and several always project onscreen */
  const TURN_TOUCHES = [
    { label: "glass-tokens.ts", type: "resource" },
    { label: "session.tsx", type: "resource" },
    { label: "prompt-input.tsx", type: "resource" },
    { label: "piccolo.jl", type: "package" },
    { label: "stretto", type: "package" },
    { label: "amico-vault", type: "skill" },
    { label: "tdd", type: "skill" },
    { label: "adr-0002.md", type: "note" },
    { label: "context.md", type: "charter" },
    { label: "run9", type: "experiment" },
    { label: "pulses", type: "catalog" },
    { label: "orchestrator", type: "agent" },
  ]

  test("a working turn flares its touched nodes in the thought color", () => {
    const { engine, ctx } = makeEngine({ scheme: "dark" })
    drive(engine, 0, 100)
    for (const t of TURN_TOUCHES) engine.touch(t)
    drive(engine, 116, 400)
    expect(engine.stats().latentPulses).toBe(TURN_TOUCHES.length)
    expect(engine.stats().mode).toBe("constellation") // no handoff — the web stays
    expect(paintedThoughtInk(ctx)).toBe(true)
  })

  test("light: the flare uses the derived-dark thought ink, never raw #fff676", () => {
    const { engine, ctx } = makeEngine({ scheme: "light" })
    drive(engine, 0, 100)
    for (const t of TURN_TOUCHES) engine.touch(t)
    drive(engine, 116, 400)
    const inks = styles(ctx)
    expect(inks.some((s) => /143,128,0/.test(s))).toBe(true) // #8f8000
    expect(inks.some((s) => /255,246,118/.test(s))).toBe(false) // yellow never fronts light
  })

  test("replay touches restore silently: zero flares, zero thought ink", () => {
    const { engine, ctx } = makeEngine({ scheme: "dark" })
    drive(engine, 0, 100)
    engine.touch({ label: "session.tsx", type: "resource", replay: true })
    engine.touch({ label: "prompt-input.tsx", type: "resource", replay: true, consider: true })
    drive(engine, 116, 600)
    expect(engine.stats().latentPulses).toBe(0)
    expectNoThoughtInk(ctx)
  })

  test("a re-touch of the same label refreshes its flare instead of stacking a twin", () => {
    const { engine } = makeEngine()
    drive(engine, 0, 100)
    engine.touch({ label: "session.tsx", type: "resource" })
    engine.touch({ label: "session.tsx", type: "resource" })
    expect(engine.stats().latentPulses).toBe(1)
    engine.touch({ label: "amico-vault", type: "skill" })
    expect(engine.stats().latentPulses).toBe(2)
  })

  test("flares decay: the web returns to rest, yellow-free again", () => {
    const { engine } = makeEngine()
    drive(engine, 0, 100)
    engine.touch({ label: "session.tsx", type: "resource" })
    expect(engine.stats().latentPulses).toBe(1)
    drive(engine, 116, 2400) // past the ~1.6s pulse life
    expect(engine.stats().latentPulses).toBe(0)
    expect(engine.stats().mode).toBe("constellation")
  })

  test("reduced motion: the tableau holds ONE statically lit node — the latest touch", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: true })
    engine.tick(0) // the single tableau frame
    const before = clears(ctx)
    engine.touch({ label: "session.tsx", type: "resource" })
    engine.touch({ label: "amico-vault", type: "skill" })
    engine.tick(16) // requestRender beats the tableau stillness for one frame
    expect(engine.stats().latentPulses).toBe(1)
    expect(clears(ctx)).toBe(before + 1)
    expect(paintedThoughtInk(ctx)).toBe(true)
  })

  test("while the session works, the latest flare holds lit; idle lets it decay out", () => {
    const { engine } = makeEngine()
    engine.setActive(true)
    drive(engine, 0, 100)
    engine.touch({ label: "session.tsx", type: "resource" })
    drive(engine, 116, 6000) // far past the ~1.6s pulse life
    expect(engine.stats().latentPulses).toBe(1) // held: amico is HERE
    engine.setActive(false)
    drive(engine, 6016, 9000)
    expect(engine.stats().latentPulses).toBe(0) // idle: decays out normally
  })

  test("flares avoid occluded regions: thought lands in the gutters beside the column", () => {
    const { engine, ctx } = makeEngine({ scheme: "dark" })
    drive(engine, 0, 100)
    // the real session geometry: a centered message column covers the middle
    // band; the Brain stays visible in the gutters on BOTH sides
    engine.occlude([{ x: 250, y: 0, w: 300, h: 480 }])
    for (const t of TURN_TOUCHES) engine.touch(t)
    drive(engine, 116, 400)
    // every thought-colored arc must land clear of the covered band
    let sawThought = false
    let fill = ""
    for (const call of ctx.calls) {
      if (call.method === "set:fillStyle") fill = String(call.args[0])
      if (call.method === "arc" && /255,246,118/.test(fill)) {
        sawThought = true
        const x = call.args[0] as number
        expect(x < 250 || x > 550).toBe(true)
      }
    }
    expect(sawThought).toBe(true)
  })

  test("fully occluded canvas: flares fall back to visible seats rather than vanishing", () => {
    const { engine } = makeEngine()
    drive(engine, 0, 100)
    engine.occlude([{ x: 0, y: 0, w: 800, h: 480 }])
    for (const t of TURN_TOUCHES) engine.touch(t)
    expect(engine.stats().latentPulses).toBe(TURN_TOUCHES.length)
  })

  test("determinism holds under touches: same clock + same touches ⇒ byte-identical frames", () => {
    const a = makeEngine()
    const b = makeEngine()
    for (let t = 0; t <= 800; t += 16) {
      if (t === 96) {
        a.engine.touch({ label: "piccolo.jl", type: "package" })
        b.engine.touch({ label: "piccolo.jl", type: "package" })
      }
      a.engine.tick(t)
      b.engine.tick(t)
    }
    expect(JSON.stringify(a.ctx.calls)).toBe(JSON.stringify(b.ctx.calls))
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

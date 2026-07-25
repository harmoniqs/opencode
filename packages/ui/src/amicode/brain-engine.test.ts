import { describe, expect, test } from "bun:test"
import { createBrainEngine, type BrainEngineOptions } from "./brain-engine"

/* The engine must run headless: bun test has no DOM, no rAF, no matchMedia.
   That is the point — the old /brain.html iframe could only be exercised by
   booting a server and a browser, which is why it broke three times before
   anyone saw it. A recording 2d-context stub is enough to pin the behavior. */

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
    reduceMotion: true,
    animate: false,
    size: { width: 800, height: 224 },
    ...opts,
  })
  return { engine, ctx }
}

describe("boot", () => {
  test("boots the sparse seed: the amico core alone, nothing preloaded", () => {
    // ADR 0002 rejects the "breathing skeleton atlas" — the at-rest seed is
    // the core, and the graph grows only from the session's real touches
    const { engine } = makeEngine()
    const s = engine.stats()
    expect(s.nodes).toBe(1)
    expect(s.edges).toBe(0)
    expect(s.cur).toBe("amico")
    expect(s.claimed).toBe(0)
    expect(s.atlas).toBe(0)
    expect(s.queued).toBe(0)
  })

  test("wears the requested scheme from frame zero — no wrong-theme first frame", () => {
    // the iframe read its theme AFTER load (async in the VS Code webview), so
    // the first frames painted the wrong palette or opaque white; the native
    // engine takes the scheme as a constructor input
    const { engine } = makeEngine({ scheme: "light" })
    expect(engine.stats().scheme).toBe("light")
  })

  test("first frame clears to transparent, never paints an opaque ground", () => {
    const { engine, ctx } = makeEngine()
    engine.tick(16)
    engine.tick(160) // a second rest-cadence frame (past the ~8fps window)
    const clears = ctx.calls.filter((c) => c.method === "clearRect")
    expect(clears.length).toBeGreaterThanOrEqual(2)
    expect(clears[0].args).toEqual([0, 0, 800, 224])
    // the unwanted first frame was the old page's own body { background }
    // fill — a full-canvas fillRect has no business here (label halos are
    // small rects)
    const fullFills = ctx.calls.filter(
      (c) => c.method === "fillRect" && (c.args[2] as number) >= 800 && (c.args[3] as number) >= 224,
    )
    expect(fullFills).toEqual([])
  })
})

describe("live thought", () => {
  test("a replay commit grafts, claims instantly, and moves the cursor", () => {
    const { engine } = makeEngine()
    engine.touch({ label: "solve", replay: true })
    const s = engine.stats()
    expect(s.nodes).toBe(2) // core + the graft — nothing else exists to light
    expect(s.claimed).toBe(1)
    expect(s.cur).toBe("live-solve")
  })

  test("a consider touch is a scout flash — it never claims", () => {
    const { engine } = makeEngine()
    engine.touch({ label: "debugging", consider: true })
    const s = engine.stats()
    expect(s.claimed).toBe(0)
    expect(s.cur).toBe("amico")
  })

  test("every commit label grafts one node over one edge; re-touches add nothing", () => {
    // the sparse seed grows ONLY from activity: N distinct commits ⇒ exactly
    // N grafts (plus the core) and N claims — no node exists unproduced by a touch
    const { engine } = makeEngine()
    const labels = ["scratch/wip-notes.md", "solve.jl", "docs/plan.md", "config.toml", "deep/nested/file.jl"]
    for (const l of labels) engine.touch({ label: l, replay: true })
    const s = engine.stats()
    expect(s.nodes).toBe(1 + labels.length)
    expect(s.edges).toBe(labels.length) // one thought edge per graft, near the current position
    expect(s.claimed).toBe(labels.length)
    for (const l of labels) engine.touch({ label: l, replay: true }) // an already-grafted label adds no node
    expect(engine.stats().nodes).toBe(1 + labels.length)
    expect(engine.stats().edges).toBe(labels.length)
  })

  test("a live commit claims through the reduced-motion pump", () => {
    const { engine } = makeEngine()
    engine.touch({ label: "setup" })
    // reduced motion: no traveling pulses — the claim lands synchronously
    const s = engine.stats()
    expect(s.claimed).toBe(1)
    expect(s.cur).toBe("live-setup")
  })

  test("charting two commits since the last plate yields one constellation", () => {
    const { engine } = makeEngine()
    engine.touch({ label: "solve", replay: true })
    engine.touch({ label: "piccolo-jl", replay: true })
    engine.chart("optimize a fluxonium X gate", true)
    expect(engine.stats().atlas).toBe(1)
  })
})

describe("theme", () => {
  test("setTheme is lossless: the atlas, claims, and cursor all survive a flip", () => {
    // the iframe workaround reloaded the document on every flip and re-flushed
    // the whole event history; the native engine just swaps ink
    const { engine } = makeEngine()
    engine.touch({ label: "solve", replay: true })
    engine.touch({ label: "piccolo-jl", replay: true })
    engine.chart("plate the thought", true)
    const before = engine.stats()
    engine.setTheme("light")
    const after = engine.stats()
    expect(after.scheme).toBe("light")
    expect(after.claimed).toBe(before.claimed)
    expect(after.atlas).toBe(before.atlas)
    expect(after.cur).toBe(before.cur)
    expect(after.nodes).toBe(before.nodes)
  })

  test("setTheme ignores junk", () => {
    const { engine } = makeEngine()
    engine.setTheme("hotdog" as never)
    expect(engine.stats().scheme).toBe("dark")
  })
})

describe("lifecycle", () => {
  test("pause stops the frame loop; resume restarts it", () => {
    const { engine, ctx } = makeEngine()
    engine.tick(16)
    const n = ctx.calls.length
    engine.pause()
    engine.tick(1000)
    expect(ctx.calls.length).toBe(n) // folded away — no frames burned
    engine.resume()
    engine.tick(1016)
    expect(ctx.calls.length).toBeGreaterThan(n)
  })

  test("destroy is terminal: later events and ticks are no-ops", () => {
    const { engine, ctx } = makeEngine()
    engine.destroy()
    const n = ctx.calls.length
    engine.touch({ label: "solve", replay: true })
    engine.resume()
    engine.tick(2000)
    expect(ctx.calls.length).toBe(n)
    expect(engine.stats().claimed).toBe(0)
  })

  test("highlight tolerates unknown labels", () => {
    const { engine } = makeEngine()
    expect(() => {
      engine.highlight("tdd")
      engine.highlight("definitely-not-a-node")
      engine.highlight("")
    }).not.toThrow()
  })
})

describe("hostile input", () => {
  test("a NaN timestamp is a no-op and does not poison the clock", () => {
    const { engine, ctx } = makeEngine()
    engine.tick(Number.NaN)
    engine.tick(Number.POSITIVE_INFINITY)
    expect(ctx.calls.length).toBe(0) // rejected before any drawing
    engine.tick(16)
    engine.touch({ label: "solve", replay: true })
    engine.tick(32) // a poisoned beat would NaN every projection from here on
    expect(ctx.calls.filter((c) => c.method === "clearRect").length).toBe(2)
    expect(engine.stats().claimed).toBe(1)
  })

  test("junk resize falls back instead of zeroing the world scale", () => {
    const { engine, ctx } = makeEngine()
    engine.resize(Number.NaN, -5)
    engine.resize(0, 0)
    engine.tick(16)
    const clears = ctx.calls.filter((c) => c.method === "clearRect")
    expect(clears[0].args).toEqual([0, 0, 800, 224]) // opts.size fallback held
  })

  test("charting fewer than two commits never plates a constellation", () => {
    const { engine } = makeEngine()
    engine.touch({ label: "solve", replay: true })
    engine.chart("one lonely commit", true)
    expect(engine.stats().atlas).toBe(0)
  })

  test("rapid theme flips stay stable and lossless", () => {
    const { engine } = makeEngine()
    engine.touch({ label: "solve", replay: true })
    for (let i = 0; i < 50; i++) engine.setTheme(i % 2 ? "dark" : "light")
    engine.tick(16)
    expect(engine.stats().scheme).toBe("dark") // 50 flips from i=0 end on i=49 → dark
    expect(engine.stats().claimed).toBe(1)
  })

  test("the graft population is capped — marathon sessions cannot grow the graph unboundedly", () => {
    const { engine } = makeEngine()
    const boot = engine.stats().nodes
    for (let i = 0; i < 340; i++) engine.touch({ label: `scratch/probe-${i}.md`, consider: true })
    // 340 unique search patterns grafted, but eviction holds the line at the cap
    expect(engine.stats().nodes).toBeLessThanOrEqual(boot + 300)
    expect(engine.stats().edges).toBeLessThanOrEqual(boot + 300 + 200) // skeleton edges + capped thought edges
    engine.tick(16) // and the survivors still draw
  })

  test("a render error halts the loop instead of spinning half-rendered", () => {
    const ctx = recordingCtx()
    let arcs = 0
    ctx.arc = (..._args: unknown[]) => {
      if (++arcs > 2) throw new Error("boom") // the sparse first frame draws few arcs — trip early
    }
    const canvas = stubCanvas(ctx)
    const engine = createBrainEngine(canvas, {
      scheme: "dark",
      reduceMotion: true,
      animate: false,
      size: { width: 800, height: 224 },
    })
    engine.tick(16) // throws internally → halts, no propagation
    const n = ctx.calls.length
    engine.tick(32) // halted: no further drawing
    expect(ctx.calls.length).toBe(n)
    engine.resume() // re-arms after e.g. a session switch
    arcs = -1e9
    engine.tick(48)
    expect(ctx.calls.length).toBeGreaterThan(n)
  })
})

describe("background mount (derived session stream)", () => {
  // the chat-wide atmosphere drives the engine with the session's derived
  // event stream (brain-events): completed turns arrive as replay touches +
  // a silent chart, the busy turn arrives live. Pin the mount contract:
  // touches light nodes (data-true), a replay-only first flush restores the
  // atlas quietly — claims land with nothing queued, no traveling pulse.
  const replayedTurn = [
    { label: "solve.jl", type: "package", consider: false, replay: true },
    { label: "notes.md", type: "note", consider: false, replay: true },
    { label: "saveat", type: "resource", consider: true, replay: true },
  ]

  test("feeding a derived stream grows the claimed-node count — touches light nodes", () => {
    const { engine } = makeEngine({ reduceMotion: false })
    const before = engine.stats()
    for (const t of replayedTurn) engine.touch(t)
    const after = engine.stats()
    expect(after.claimed).toBe(before.claimed + 2) // commits claim; the consider scouts
    expect(after.cur).toBe("live-notes") // the cursor walked the turn in order (extension stripped)
  })

  test("a replay-only first flush restores prior turns quietly — no live pulse travel", () => {
    // full motion on purpose: a LIVE commit would queue and travel; a replay
    // commit must land instantly with nothing queued, even with motion on
    const { engine } = makeEngine({ reduceMotion: false })
    for (const t of replayedTurn) engine.touch(t)
    engine.chart("optimize an X gate", true) // silent restore, not a ceremony
    const s = engine.stats()
    expect(s.claimed).toBe(2)
    expect(s.queued).toBe(0) // nothing waiting on the pump
    expect(s.atlas).toBe(1) // the plate restored without a tick ever running
  })

  test("a theme swap mid-session preserves the restored atlas (lossless repaint)", () => {
    const { engine } = makeEngine({ reduceMotion: false })
    for (const t of replayedTurn) engine.touch(t)
    engine.chart("optimize an X gate", true)
    const before = engine.stats()
    engine.setTheme("light")
    engine.setTheme("dark")
    const after = engine.stats()
    expect(after.claimed).toBe(before.claimed)
    expect(after.atlas).toBe(before.atlas)
    expect(after.cur).toBe(before.cur)
  })
})

describe("sparse seed & isolation", () => {
  test("two independently created engines share no state; a fresh engine always boots the seed", () => {
    // one engine per session, no cross-session persistence: no module-scope
    // graph, no persistent store — every byte lives in the engine closure
    const a = makeEngine()
    a.engine.touch({ label: "alpha.md", replay: true })
    a.engine.touch({ label: "beta.md", replay: true })
    const b = makeEngine()
    expect(b.engine.stats().nodes).toBe(1) // boots sparse despite a's prior activity
    expect(b.engine.stats().claimed).toBe(0)
    expect(b.engine.stats().cur).toBe("amico")
    b.engine.touch({ label: "gamma.md", replay: true })
    expect(a.engine.stats().nodes).toBe(3) // b's touch is invisible to a
    expect(b.engine.stats().nodes).toBe(2) // and a's history never leaked into b
  })

  test("the camera scale holds fixed while the graph grows — densify in place, no zoom-out", () => {
    const { engine } = makeEngine({ reduceMotion: false })
    const drive = (fromMs: number, toMs: number) => {
      for (let t = fromMs; t <= toMs; t += 16) engine.tick(t)
    }
    drive(0, 500)
    engine.touch({ label: "seed-a.md", replay: true })
    engine.touch({ label: "seed-b.md", replay: true })
    drive(516, 1000)
    const small = engine.stats().scale
    expect(Number.isFinite(small)).toBe(true)
    expect(small).toBeGreaterThan(0)
    // grow a few hundred grafts (replay considers: synchronous, star-shaped)
    for (let i = 0; i < 290; i++) engine.touch({ label: `grow/probe-${i}.md`, replay: true, consider: true })
    drive(1016, 2000) // any per-frame fit-to-farthest would ease the zoom out here
    expect(engine.stats().scale).toBeCloseTo(small, 6)
  })
})

describe("heartbeat cadence (shared draw-gate)", () => {
  // the adaptive heartbeat (#62): full musical tempo while the session is
  // active / anything is in flight / the boot unfurl runs; ~8fps breathing at
  // rest. One draw-gate, honored by the manual tick() exactly as by the rAF
  // loop — cadence is asserted by counting clearRect calls over a driven
  // ~60fps clock. Beat budget per test stays under 8 so the ambient ghost
  // (nextGhost) never fires a pulse into a rest-cadence window.
  const drive = (engine: ReturnType<typeof makeEngine>["engine"], fromMs: number, toMs: number) => {
    for (let t = fromMs; t <= toMs; t += 16) engine.tick(t)
  }
  const clears = (ctx: ReturnType<typeof recordingCtx>) => ctx.calls.filter((c) => c.method === "clearRect").length

  test("an active engine draws on every tick — full musical tempo", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: false })
    engine.setActive(true)
    let ticks = 0
    for (let t = 0; t <= 1000; t += 16) {
      engine.tick(t)
      ticks++
    }
    expect(clears(ctx)).toBe(ticks)
    expect(engine.stats().active).toBe(true)
  })

  test("an at-rest engine breathes at ~8fps, not once per tick", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: false })
    drive(engine, 0, 2000) // boot unfurl (~1400ms) runs full tempo — let it finish
    const settled = clears(ctx)
    drive(engine, 2016, 4016) // 2s at rest, 60fps ticks
    const restDraws = clears(ctx) - settled
    expect(restDraws).toBeGreaterThanOrEqual(14) // ≈8/s over 2s, with window rounding
    expect(restDraws).toBeLessThanOrEqual(17) // at most once per 125ms rest window
    expect(engine.stats().active).toBe(false)
  })

  test("setActive flips the tempo both ways", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: false })
    drive(engine, 0, 2000) // past the unfurl
    engine.setActive(true)
    const beforeActive = clears(ctx)
    let activeTicks = 0
    for (let t = 2016; t <= 2516; t += 16) {
      engine.tick(t)
      activeTicks++
    }
    expect(clears(ctx) - beforeActive).toBe(activeTicks) // busy: every tick draws
    engine.setActive(false)
    const beforeRest = clears(ctx)
    drive(engine, 2532, 3532) // 1s back at rest
    const restDraws = clears(ctx) - beforeRest
    expect(restDraws).toBeGreaterThanOrEqual(6)
    expect(restDraws).toBeLessThanOrEqual(9) // rest cadence restored, not per-tick
  })

  test("a pulse in flight forces full tempo on a not-active engine until it resolves", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: false })
    drive(engine, 0, 2000) // past the unfurl, at rest
    engine.touch({ label: "scratch/wip.md" }) // live commit: one pulse, one beat over the graft edge
    const beforeFlight = clears(ctx)
    let flightTicks = 0
    for (let t = 2016; t <= 2416; t += 16) {
      engine.tick(t) // 400ms < the ~476ms one-beat flight: in flight throughout
      flightTicks++
    }
    expect(clears(ctx) - beforeFlight).toBe(flightTicks) // full tempo while the pulse travels
    drive(engine, 2432, 3100) // pulse arrives + due-queue drains
    const beforeRest = clears(ctx)
    drive(engine, 3116, 4116) // 1s later: back at the rest cadence
    const restDraws = clears(ctx) - beforeRest
    expect(restDraws).toBeGreaterThanOrEqual(6)
    expect(restDraws).toBeLessThanOrEqual(9)
    expect(engine.stats().claimed).toBe(1) // the commit landed
  })
})

describe("animated pipeline (manual clock)", () => {
  // full motion: reduceMotion off, clock driven by hand — a commit is a pulse
  // that must physically travel the skeleton before its node claims
  const drive = (engine: ReturnType<typeof makeEngine>["engine"], fromMs: number, toMs: number) => {
    for (let t = fromMs; t <= toMs; t += 16) engine.tick(t)
    return toMs
  }

  test("a live commit claims only after its pulse arrives", () => {
    const { engine } = makeEngine({ reduceMotion: false })
    engine.tick(0)
    engine.touch({ label: "setup" }) // grafts beside the core; one beat over the thought edge
    expect(engine.stats().claimed).toBe(0) // departure is not arrival
    drive(engine, 16, 4000) // allegro q=126: plenty of beats for the hop
    const s = engine.stats()
    expect(s.claimed).toBeGreaterThanOrEqual(1)
    expect(s.cur).toBe("live-setup")
  })

  test("a chart waits for the pump to drain, then plates every commit", () => {
    const { engine } = makeEngine({ reduceMotion: false })
    engine.tick(0)
    engine.touch({ label: "setup" })
    engine.touch({ label: "solve" })
    engine.chart("the whole thought", false) // arrives while commits are in flight
    expect(engine.stats().atlas).toBe(0) // a plate never misses its own commits
    drive(engine, 16, 8000)
    const s = engine.stats()
    expect(s.atlas).toBe(1)
    expect(s.claimed).toBeGreaterThanOrEqual(2)
    expect(s.queued).toBe(0)
  })

  test("destroy with pulses in flight is safe", () => {
    const { engine } = makeEngine({ reduceMotion: false })
    engine.tick(0)
    engine.touch({ label: "setup" })
    drive(engine, 16, 200) // pulse mid-edge
    expect(() => engine.destroy()).not.toThrow()
    engine.tick(300) // halted — no draw, no arrival callbacks
    expect(engine.stats().cur).toBe("amico")
  })
})

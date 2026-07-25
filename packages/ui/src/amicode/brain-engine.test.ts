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
/** drive the manual clock at ~60fps between two timestamps */
function drive(engine: ReturnType<typeof makeEngine>["engine"], fromMs: number, toMs: number) {
  for (let t = fromMs; t <= toMs; t += 16) engine.tick(t)
}
/** the cadence observable: one clearRect per drawn frame */
function clears(ctx: ReturnType<typeof recordingCtx>) {
  return ctx.calls.filter((c) => c.method === "clearRect").length
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
  test("pause is a hard stop — hidden means ZERO draws; resume restores drawing", () => {
    // the host's visibilitychange/IntersectionObserver wiring (#59) drives
    // this pause()/resume() primitive; the engine-side guarantee is that a
    // paused engine draws nothing at all, however hard it is ticked
    const { engine, ctx } = makeEngine()
    engine.tick(16)
    const n = ctx.calls.length
    const drawn = ctx.calls.filter((c) => c.method === "clearRect").length
    engine.pause()
    for (let t = 200; t <= 2000; t += 150) engine.tick(t) // well past every rest window
    expect(ctx.calls.length).toBe(n) // no context call of any kind while hidden
    expect(ctx.calls.filter((c) => c.method === "clearRect").length).toBe(drawn) // zero draws
    engine.resume()
    engine.tick(2016)
    expect(ctx.calls.filter((c) => c.method === "clearRect").length).toBe(drawn + 1) // drawing restored
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

  test("the TOTAL population is hard-capped with recency eviction — no exemptions, no edge leaks", () => {
    // stats() exposes no node enumeration by design: recency is observed via
    // re-touch deltas and eviction victims (claimed counts), the same
    // "grows only from activity" observable
    const { engine } = makeEngine()
    // fill well past the cap (replay considers: synchronous, no debounce)
    for (let i = 1; i <= 320; i++) engine.touch({ label: `probe-${i}.md`, replay: true, consider: true })
    expect(engine.stats().nodes).toBe(1 + 300) // core + cap: the ceiling, never beyond
    expect(engine.stats().edges).toBeLessThanOrEqual(300) // victims' edges went with them
    // survivors are the most-recently-touched (probes 21..320); 1..20 evicted
    engine.touch({ label: "probe-21.md", replay: true }) // survivor: claims in place, no growth
    expect(engine.stats().nodes).toBe(301)
    expect(engine.stats().claimed).toBe(1)
    engine.touch({ label: "probe-1.md", replay: true }) // evicted label: re-grafts (evicting the LRU) + claims
    expect(engine.stats().nodes).toBe(301)
    expect(engine.stats().claimed).toBe(2)
    engine.touch({ label: "probe-23.md", replay: true }) // survivor: claims
    expect(engine.stats().claimed).toBe(3)
    // a new label evicts the least-recently-TOUCHED (an old unclaimed consider),
    // never the just-refreshed claimed nodes — re-touching refreshed their recency
    engine.touch({ label: "probe-321.md", replay: true, consider: true })
    expect(engine.stats().nodes).toBe(301)
    expect(engine.stats().claimed).toBe(3)
    // NO exemption: charting the claims onto the atlas grants no immunity —
    // an arbitrarily long touch stream still evicts them (recency always wins).
    // Only the current live node (where amico stands) is never evicted.
    engine.chart("a plate that must not pin its nodes", true)
    expect(engine.stats().atlas).toBe(1)
    engine.touch({ label: "flood-anchor.md", replay: true }) // move the cursor off the atlas claims
    for (let i = 400; i < 720; i++) engine.touch({ label: `flood-${i}.md`, replay: true, consider: true })
    expect(engine.stats().nodes).toBe(301) // population still pinned at the ceiling
    expect(engine.stats().claimed).toBe(1) // sole survivor: the cursor — every atlas-kept claim was evicted
    expect(engine.stats().cur).toBe("live-flood-anchor")
    expect(engine.stats().edges).toBeLessThanOrEqual(300)
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
    drive(engine, 0, 500)
    engine.touch({ label: "seed-a.md", replay: true })
    engine.touch({ label: "seed-b.md", replay: true })
    drive(engine, 516, 1000)
    const small = engine.stats().scale
    expect(Number.isFinite(small)).toBe(true)
    expect(small).toBeGreaterThan(0)
    // grow a few hundred grafts (replay considers: synchronous, star-shaped)
    for (let i = 0; i < 290; i++) engine.touch({ label: `grow/probe-${i}.md`, replay: true, consider: true })
    drive(engine, 1016, 2000) // any per-frame fit-to-farthest would ease the zoom out here
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

describe("reduced-motion hard-pause", () => {
  // the accessibility terminal (ADR 0002): with reduced motion set there is
  // no idle breathing and no continuous loop at rest — the engine draws one
  // bounded burst around events (the nudge window, rebased onto the frame
  // clock), then goes still until the next touch. This terminal is DISTINCT
  // from any frame-time perf ease (slice #63) — no budget is consulted.
  test("after the boot burst elapses with nothing in flight, ticks produce no draws", () => {
    const { engine, ctx } = makeEngine() // reduceMotion: true
    drive(engine, 16, 3100) // the boot burst window (~3s), rest cadence inside it
    const burst = clears(ctx)
    expect(burst).toBeGreaterThan(0) // the burst painted
    drive(engine, 3216, 6000) // long past the window: still — zero draws, ticks are no-ops
    expect(clears(ctx)).toBe(burst)
  })

  test("a touch re-arms one bounded burst that draws, then settles back to still", () => {
    const { engine, ctx } = makeEngine()
    drive(engine, 16, 4000) // exhaust the boot burst, reach the still state
    const still = clears(ctx)
    engine.touch({ label: "wake.md", replay: true })
    drive(engine, 4016, 5000) // inside the re-armed window (4016 + ~3s)
    const burst = clears(ctx)
    expect(burst).toBeGreaterThan(still) // the event woke a bounded burst
    drive(engine, 7100, 9000) // the window has elapsed, nothing in flight
    expect(clears(ctx)).toBe(burst) // still again — no continuous loop ever
  })
})

describe("perf governor steering (#63)", () => {
  // the release valve (ADR 0002): the governor observes THIS loop's frame
  // intervals and steers the SAME tempo control the heartbeat (#62) exposes —
  // no second render loop, no second clock. Motion is the only give; the
  // cadence observable stays clearRect counts over a driven manual clock.
  // Timing law (see brain-perf-governor.test.ts): a steady 20ms over-budget
  // stream steps down at fed-frame ~101/202/303/404 (the first tick only
  // sets the measurement baseline).
  const OVER = 20

  /** drive over-budget ticks until stats().motion reaches `level` */
  function stepTo(engine: ReturnType<typeof makeEngine>["engine"], level: string, t: number, cap = 3000): number {
    for (let i = 0; engine.stats().motion !== level && i < cap; i++) engine.tick((t += OVER))
    expect(engine.stats().motion).toBe(level as never)
    return t
  }

  test("sustained over-budget intervals ease the paint cadence one level at a time", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: false })
    expect(engine.stats().motion).toBe("full") // boots at full fidelity
    engine.setActive(true)
    let t = 0
    for (let i = 0; i < 100; i++) engine.tick((t += 16)) // a healthy minute-long budget is met
    expect(engine.stats().motion).toBe("full")
    expect(clears(ctx)).toBe(100) // busy + healthy: every tick draws

    t = stepTo(engine, "eased-1", t)
    let before = clears(ctx)
    for (let i = 0; i < 40; i++) engine.tick((t += OVER))
    const easedDraws = clears(ctx) - before
    expect(easedDraws).toBeGreaterThanOrEqual(15) // ~every 2nd tick at the 33ms cap
    expect(easedDraws).toBeLessThanOrEqual(25) // motion eased — while active stays true
    expect(engine.stats().active).toBe(true)

    t = stepTo(engine, "eased-2", t)
    before = clears(ctx)
    for (let i = 0; i < 40; i++) engine.tick((t += OVER))
    const calmDraws = clears(ctx) - before
    expect(calmDraws).toBeGreaterThanOrEqual(7) // ~every 4th tick at the 67ms cap
    expect(calmDraws).toBeLessThanOrEqual(13)
  })

  test("the eased level steers the musical tempo itself — a pulse travels slower", () => {
    // "extends slice 4 test surface": the governor acts through the ONE tempo
    // control. At full tempo a one-beat commit pulse lands in ~476ms; eased
    // two steps (largo) the same flight takes several seconds of wall time.
    const { engine } = makeEngine({ reduceMotion: false })
    engine.setActive(true)
    let t = stepTo(engine, "eased-2", 0)
    engine.touch({ label: "slow-boat.md" })
    for (let i = 0; i < 30; i++) engine.tick((t += OVER)) // 600ms — full tempo would have claimed
    expect(engine.stats().claimed).toBe(0) // still in flight at largo
    expect(engine.stats().motion).toBe("eased-2")
  })

  test("full-stop stops time-driven painting; discrete events still land one static frame", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: false })
    engine.setActive(true)
    let t = stepTo(engine, "full-stop", 0)
    const frozen = clears(ctx)
    for (let i = 0; i < 40; i++) engine.tick((t += OVER))
    expect(clears(ctx)).toBe(frozen) // no cadence paints at all
    engine.resize(800, 224) // an explicit event (requestRender) …
    engine.tick((t += OVER))
    expect(clears(ctx)).toBe(frozen + 1) // … lands exactly one static frame
  })

  test("the terminal valve hard-pauses to a static blurred field — nothing paints, ever", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: false })
    engine.setActive(true)
    let t = stepTo(engine, "hard-paused", 0)
    const frozen = clears(ctx)
    for (let i = 0; i < 60; i++) engine.tick((t += OVER))
    expect(clears(ctx)).toBe(frozen) // the canvas froze — the glass above it is untouched
    engine.resize(800, 224)
    engine.touch({ label: "wake-attempt.md", replay: true })
    engine.tick((t += OVER))
    expect(clears(ctx)).toBe(frozen) // even events cannot paint past the terminal
    for (let i = 0; i < 200; i++) engine.tick((t += OVER))
    expect(engine.stats().motion).toBe("hard-paused") // no state exists past it
  })

  test("recovery is hysteretic: clear air reopens the valve one level per clear window", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: false })
    engine.setActive(true)
    let t = stepTo(engine, "full-stop", 0)
    // clear air at 10ms — under the 13ms restore threshold
    for (let i = 0; i < 300; i++) engine.tick((t += 10)) // 3s: not yet a full ~4s clear window
    expect(engine.stats().motion).toBe("full-stop")
    for (let i = 0; i < 150; i++) engine.tick((t += 10))
    expect(engine.stats().motion).toBe("eased-2") // one level up — never a jump
    for (let i = 0; i < 850; i++) engine.tick((t += 10))
    expect(engine.stats().motion).toBe("full") // …and the ladder climbs home
    const before = clears(ctx)
    for (let i = 0; i < 30; i++) engine.tick((t += 10))
    expect(clears(ctx) - before).toBe(30) // full fidelity restored: every tick draws
  })

  test("a paused stretch never feeds phantom over-budget frames", () => {
    const { engine } = makeEngine({ reduceMotion: false })
    engine.setActive(true)
    let t = 0
    for (let i = 0; i < 100; i++) engine.tick((t += 16))
    engine.pause() // hidden / off-screen: the governor's measurement pauses too
    t += 60_000 // a minute of stalled wall clock
    engine.tick(t) // a stray tick while halted is a no-op
    engine.resume()
    for (let i = 0; i < 300; i++) engine.tick((t += 16))
    expect(engine.stats().motion).toBe("full") // the stall registered nothing
  })

  test("reduced motion wins: the governor never engages under the accessibility terminal", () => {
    // independent code paths (#62 vs #63): reduced-motion is a terminal that
    // consults no budget; with it set, over-budget intervals must not ease,
    // and the bounded-burst behavior stays exactly as shipped.
    const { engine, ctx } = makeEngine() // reduceMotion: true
    let t = 0
    for (let i = 0; i < 300; i++) engine.tick((t += OVER)) // 6s of "over-budget" intervals
    expect(engine.stats().motion).toBe("full") // the perf valve stays out of it
    const still = clears(ctx)
    for (let i = 0; i < 200; i++) engine.tick((t += OVER))
    expect(clears(ctx)).toBe(still) // the terminal's stillness is undisturbed
  })

  test("governed:false (the dev force-full-tempo hook) pins full tempo and never eases", () => {
    const { engine, ctx } = makeEngine({ reduceMotion: false, governed: false })
    engine.setActive(true)
    let t = 0
    for (let i = 0; i < 600; i++) engine.tick((t += OVER)) // 12s sustained over-budget
    expect(clears(ctx)).toBe(600) // the un-eased worst case, on purpose
    expect(engine.stats().motion).toBe("full")
  })
})

describe("animated pipeline (manual clock)", () => {
  // full motion: reduceMotion off, clock driven by hand — a commit is a pulse
  // that must physically travel the graph before its node claims
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

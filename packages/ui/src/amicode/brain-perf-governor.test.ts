import { describe, expect, test } from "bun:test"
import { createBrainEngine, createPerfGovernor, PALETTES, type MotionLevel, type PerfGovernor } from "./brain-engine"
import { deriveGlassTiers, GLASS_BLUR_PX } from "./glass-tokens"

/* The perf governor (#63): a frame-time state machine that observes the ONE
   render loop and eases MOTION — never blur, never tint — when the p95 frame
   time stays over the 16.7ms budget for a sustained window. Dual-guard
   hysteresis (restore threshold BELOW budget + a longer clear window) keeps
   it from oscillating; the terminal valve past motion-full-stop is a hard
   pause to a static blurred field. It is INDEPENDENT of the reduced-motion
   accessibility terminal (#62) — that one consults no budget, this one
   consults no media query.

   Everything here drives synthetic frame durations through an injected
   frame-time source — no real rAF, no wall clock (the same headless law as
   brain-engine.test.ts).

   Trip math used below (defaults: budget 16.7, restore 13, window 2s,
   trip 2s, clear 4s): a steady 20ms stream puts p95 over budget from frame 1,
   so the first step lands at frame 101 (t=2020: 2020-20 >= 2000) and each
   further step needs its own full 2s window — steps at ~101/201/301/401. */

const OVER = 20 // ms — over the 16.7ms budget
const HEALTHY = 16 // ms — under budget (a met 60fps frame)
const BAND = 14 // ms — the hysteresis dead band: under budget, above restore
const CLEAR = 12 // ms — at/below the 13ms restore threshold

function feed(gov: PerfGovernor, durMs: number, count: number, paused = false): MotionLevel {
  let lv = gov.level()
  for (let i = 0; i < count; i++) lv = gov.frame(durMs, { active: true, paused })
  return lv
}

describe("perf governor: trip + ease ladder", () => {
  test("sustained over-budget p95 steps motion down one level per trip window, to full-stop", () => {
    const gov = createPerfGovernor()
    expect(gov.level()).toBe("full")
    expect(feed(gov, OVER, 90)).toBe("full") // over budget but not yet a full sustained window
    expect(feed(gov, OVER, 20)).toBe("eased-1") // ~2s sustained: one step down, no jump
    expect(feed(gov, OVER, 100)).toBe("eased-2") // each further step earns its own window
    expect(feed(gov, OVER, 100)).toBe("full-stop")
  })

  test("below-budget input never steps down — rest stays full fidelity", () => {
    const gov = createPerfGovernor()
    expect(feed(gov, HEALTHY, 1000)).toBe("full")
    expect(feed(gov, BAND, 1000)).toBe("full") // even hugging the budget from below
    expect(feed(gov, CLEAR, 1000)).toBe("full")
  })

  test("a healthy prelude does not blunt the trip; a later sustained miss still eases", () => {
    const gov = createPerfGovernor()
    expect(feed(gov, HEALTHY, 200)).toBe("full")
    expect(feed(gov, OVER, 120)).toBe("eased-1") // p95 crosses once >5% of the window misses
  })
})

describe("perf governor: terminal valve", () => {
  test("still over budget at full-stop hard-pauses; it never steps past hard-paused", () => {
    const gov = createPerfGovernor()
    expect(feed(gov, OVER, 310)).toBe("full-stop")
    expect(feed(gov, OVER, 100)).toBe("hard-paused") // the terminal valve
    expect(feed(gov, OVER, 500)).toBe("hard-paused") // no state past it exists
  })
})

describe("perf governor: dual-guard hysteresis", () => {
  test("the dead band (under budget, above restore) neither trips nor restores — no flapping", () => {
    const gov = createPerfGovernor()
    expect(feed(gov, OVER, 101)).toBe("eased-1")
    // boundary-hovering input: under the 16.7 budget but above the 13 restore
    // threshold — the level must hold across MANY windows, never flip per-window
    expect(feed(gov, BAND, 400)).toBe("eased-1")
    expect(feed(gov, BAND, 3000)).toBe("eased-1")
  })

  test("a single under-threshold window never restores; the clear window is ~2x the trip window", () => {
    const gov = createPerfGovernor()
    expect(feed(gov, OVER, 101)).toBe("eased-1")
    expect(feed(gov, CLEAR, 300)).toBe("eased-1") // one trip-window's worth of clear air: not enough
    expect(feed(gov, CLEAR, 250)).toBe("full") // the full ~4s clear window restores one level
  })

  test("restoration climbs one level per clear window — never a jump straight back to full", () => {
    const gov = createPerfGovernor()
    expect(feed(gov, OVER, 310)).toBe("full-stop")
    expect(feed(gov, CLEAR, 600)).toBe("eased-2") // first clear window: ONE level up
    expect(feed(gov, CLEAR, 340)).toBe("eased-1")
    expect(feed(gov, CLEAR, 340)).toBe("full")
  })
})

describe("perf governor: paused-loop measurement guard", () => {
  test("frames tagged paused are discarded — a stalled loop never registers phantom over-budget", () => {
    const gov = createPerfGovernor()
    expect(feed(gov, HEALTHY, 200)).toBe("full")
    // window hidden / off-screen / reduced-motion: multi-second stalled gaps
    expect(feed(gov, 5000, 5, true)).toBe("full")
    expect(feed(gov, HEALTHY, 50)).toBe("full") // resume: still full, no trip
  })

  test("paused gaps arriving mid-trip neither advance nor reset the measurement", () => {
    const gov = createPerfGovernor()
    expect(feed(gov, OVER, 90)).toBe("full") // almost tripped
    expect(feed(gov, 8000, 3, true)).toBe("full") // the stall itself must not finish the trip
    expect(feed(gov, OVER, 20)).toBe("eased-1") // the real over-budget stream still does
  })

  test("junk durations are discarded", () => {
    const gov = createPerfGovernor()
    feed(gov, HEALTHY, 100)
    gov.frame(Number.NaN)
    gov.frame(Number.POSITIVE_INFINITY)
    gov.frame(-5)
    gov.frame(0)
    expect(gov.level()).toBe("full")
  })
})

describe("perf governor: motion is the ONLY lever", () => {
  test("the governor's surface is tempo-only — no path writes a style, token, or CSS value", () => {
    const gov = createPerfGovernor()
    expect(Object.keys(gov).sort()).toEqual(["frame", "level"])
    // and everything it ever emits is a discrete motion level
    const seen = new Set<string>()
    for (let i = 0; i < 600; i++) seen.add(gov.frame(OVER))
    for (let i = 0; i < 2000; i++) seen.add(gov.frame(CLEAR))
    for (const lv of seen) expect(["full", "eased-1", "eased-2", "full-stop", "hard-paused"]).toContain(lv)
  })

  test("glass blur/tint inputs are byte-identical across a full trip + restore cycle", () => {
    // the invariant (ADR 0002): blur radius and tint opacity are NEVER reduced
    // by the governor — its levers are tempo and the terminal pause, and the
    // glass derivation inputs (engine palettes) must survive a whole cycle
    // untouched, as must the host canvas element's style surface.
    const tokens = {
      "background-base": "#131312",
      "surface-base": "#1d1d1c",
      "text-strong": "#e8e6da",
      "syntax-keyword": "#3794ff",
      "surface-diff-add-base": "#1e3a1e",
      "surface-diff-delete-base": "#3a1e1e",
      "v2-icon-icon-accent": "#fff676",
    }
    const palettesBefore = JSON.stringify(PALETTES)
    const glassBefore = JSON.stringify(deriveGlassTiers(tokens, PALETTES.dark.thought))
    const blurBefore = GLASS_BLUR_PX

    const style: Record<string, unknown> = {}
    const canvas = {
      clientWidth: 0,
      clientHeight: 0,
      width: 0,
      height: 0,
      style,
      getContext: () => recordingCtx(),
    } as unknown as HTMLCanvasElement
    const engine = createBrainEngine(canvas, {
      scheme: "dark",
      reduceMotion: false,
      animate: false,
      size: { width: 800, height: 224 },
    })
    engine.setActive(true)
    let t = 0
    // walk the whole ladder down to the terminal…
    for (let i = 0; i < 500; i++) engine.tick((t += OVER))
    expect(engine.stats().motion).toBe("hard-paused")
    // …and climb all the way back up
    for (let i = 0; i < 2600; i++) engine.tick((t += CLEAR))
    expect(engine.stats().motion).toBe("full")

    expect(JSON.stringify(PALETTES)).toBe(palettesBefore)
    expect(JSON.stringify(deriveGlassTiers(tokens, PALETTES.dark.thought))).toBe(glassBefore)
    expect(GLASS_BLUR_PX).toBe(blurBefore)
    expect(Object.keys(style)).toEqual([]) // the engine never wrote a style
    engine.destroy()
  })
})

/* minimal recording 2d-context (the brain-engine.test.ts harness, local copy) */
function recordingCtx() {
  const record =
    (method: string) =>
    (..._args: unknown[]) => {
      if (method === "measureText") return { width: 42 }
      return undefined
    }
  const ctx: Record<string, unknown> = {}
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
  return ctx
}

/* ================================================================
   amico is thinking — the shape of a thought (native engine)

   A charted fugue over the session's real thought-graph, rendered on a
   canvas that lives IN the host document. This is the live-embed half of
   the retired /brain.html iframe prototype, ported to a framework-free
   module so the chat's brain atmosphere can drive it with direct calls
   instead of a postMessage bridge. Since ADR 0002 it boots a SPARSE SEED
   (the amico core alone) and grows only from real touches, breathing with
   the session via an adaptive heartbeat.

   Why native (2026-07-20): the iframe boundary broke this animation three
   independent ways — document requests can't carry server auth (armed
   password ⇒ 401 ⇒ blank strip), a parent/child color-scheme mismatch
   makes the browser composite the transparent frame OPAQUE WHITE (async
   webview theming ⇒ white box, and theme flips forced a full reload), and
   the page painted its own stylesheet ground + prototype chrome for the
   first frames before script could hide them. In-document there is no
   fetch, no second color-scheme, no boot chrome: the canvas ground is
   transparent from frame zero and setTheme() repaints without losing the
   atlas.

   Timing law:   every event snaps to a musical grid (allegro, q=126).
   Mechanics:    integrate-and-fire — arrival is not firing; scouts charge
                 nodes that may leak back to dark; refractory periods gate
                 re-firing; warm-start edges conduct saltatory.
   Brand law:    circles only; #fff676 belongs to live thought alone; the
                 embed is monochrome + brand yellow; glow budget: pulse +
                 active node only.

   Latent constellation (landing mode, Kate 2026-07-25): with
   `mode: "constellation"` the engine opens on the full latent network —
   the curated+densified cloud from brain-constellation.ts — rotating in
   3D on a gently tilted vertical axis (~75s/rev), perspective-projected
   with depth fog and size/alpha attenuation. Dim monochrome + whisper
   cluster tints; ZERO #fff676 while latent (yellow stays exclusive to
   live thought). ignite() runs the handoff: rotation eases to a stop
   (~1s), the live core ignites #fff676, the web dissolves edges-first
   with distant clusters last (~1.8s), then the mode exits and the live
   graph owns the canvas. Under reduced motion the constellation is a
   static canonical ¾-angle tableau (zero animation ticks) and ignite()
   is an instant swap. The live-graph physics above are UNTOUCHED — the
   constellation is a separate data + draw path sharing the same rAF
   loop, pause law, theme re-key, and perf governor.
   ================================================================ */

import {
  CONSTELLATION_CANONICAL_ANGLE,
  CONSTELLATION_CATS,
  CONSTELLATION_DEFAULTS,
  CONSTELLATION_TILT_X,
  CONSTELLATION_TILT_Z,
  buildConstellation,
  type Constellation as LatentConstellation,
} from "./brain-constellation"

export type BrainScheme = "dark" | "light"

export type BrainMode = "live" | "constellation"

/** Live-tuning knobs for the landing constellation (Kate iterates at :5990).
    Every field defaults to the design value (brain-constellation.ts). */
export interface BrainConstellationTuning {
  /** seconds per revolution (default 75) */
  speedSec?: number
  /** densification node target (default ~500) */
  density?: number
  /** cluster tint strength 0..1 (default whisper 0.15) */
  tint?: number
  /** depth fog strength 0..1 (default 0.5) */
  fog?: number
}

export type BrainTouchEvent = {
  label: string
  type?: string
  /** scout flash (search/glob) — may leak back to dark, never claims */
  consider?: boolean
  /** a prior turn's step: restore instantly and quietly, no pulses */
  replay?: boolean
}

export interface BrainEngineOptions {
  scheme?: BrainScheme
  /** override prefers-reduced-motion (tests) */
  reduceMotion?: boolean
  /** drive the render loop via requestAnimationFrame (default true; tests call tick()) */
  animate?: boolean
  /** layout fallback when the canvas has no measured size yet */
  size?: { width: number; height: number }
  /** false disables the perf governor — the dev force-full-tempo hook (#63),
      so a gated perf run measures the un-eased worst case (default true) */
  governed?: boolean
  /** "constellation" boots the latent landing cloud instead of the sparse
      live seed's empty stage; ignite() hands off to live (default "live") */
  mode?: BrainMode
  /** landing-constellation tuning knobs; inert in live mode */
  constellation?: BrainConstellationTuning
}

export interface BrainEngineStats {
  scheme: BrainScheme
  nodes: number
  edges: number
  claimed: number
  atlas: number
  queued: number
  cur: string
  /** the host's session-busy signal, as the engine currently holds it */
  active: boolean
  /** the fixed viewport-anchored camera zoom (constant — never fit-to-farthest) */
  scale: number
  /** the perf governor's emitted motion level (#63) — "full" whenever the
      governor is disabled or the reduced-motion terminal is in charge */
  motion: MotionLevel
  /** which draw path owns the canvas — flips to "live" when the ignition
      dissolve completes (or instantly under reduced motion) */
  mode: BrainMode
  /** latent constellation population still on the canvas (0 in live mode) */
  latent: number
  /** live-thought flares currently lit over the latent web (0 in live mode) */
  latentPulses: number
}

export interface BrainEngine {
  touch(ev: BrainTouchEvent): void
  /** chart the commits since the last plate as a named constellation */
  chart(title: string, replay?: boolean): void
  /** host busy signal: full musical tempo while a turn works, ~8fps breathing at rest */
  setActive(active: boolean): void
  /** landing handoff (first prompt sent): ease rotation to a stop, ignite the
      live core #fff676, dissolve the latent web edges-first (distant clusters
      last), then exit constellation mode. Instant swap under reduced motion.
      No-op in live mode or while a dissolve is already running. */
  ignite(): void
  /** a glance from the log: ring the node and turn the camera to it */
  highlight(label: string): void
  /** lossless: swaps the palette and repaints — the atlas persists */
  setTheme(scheme: BrainScheme): void
  /** omit both to re-measure from the canvas box (e.g. after mount/layout) */
  resize(width?: number, height?: number): void
  /** advance one frame; the rAF loop calls this when animate is on */
  tick(nowMs: number): void
  /** folded away — stop burning frames */
  pause(): void
  resume(): void
  destroy(): void
  stats(): BrainEngineStats
}

/* ---------- category mapping (fixed, never cycled) ---------- */
const CAT_OF_TYPE: Record<string, string> = {
  note: "knowledge",
  insight: "knowledge",
  charter: "knowledge",
  experiment: "results",
  catalog: "results",
  skill: "skills",
  package: "code",
  resource: "code",
  agent: "agents",
  core: "core",
}

/* ---------- tokens ----------
   The iframe read these from its own stylesheet with getComputedStyle; the
   native engine carries both palettes (ported verbatim from brain.html's
   :root blocks) so a theme flip is a repaint, never a reload. */
type Palette = {
  fg: string
  edgeRest: string
  nodeFill: string
  nodeBorder: string
  thought: string
  ember: string
  labelHalo: string
  accent: string
  cat: Record<string, string>
}
/** Exported as the glass tiers' reference-frame source (#60): the worst-case
    backdrop the Brain actually paints per scheme is `thought` — peak bloom
    #fff676 on dark, the derived-dark #8f8000 on light. Data seam only. */
export const PALETTES: Record<BrainScheme, Palette> = {
  dark: {
    fg: "#d6d6d2",
    edgeRest: "rgba(255, 255, 255, 0.13)",
    nodeFill: "#242423",
    nodeBorder: "rgba(255, 255, 255, 0.24)",
    thought: "#fff676",
    ember: "rgba(232, 230, 218, 1)",
    labelHalo: "rgba(19, 19, 18, 0.72)",
    accent: "#fff676",
    cat: {
      knowledge: "#3794ff",
      results: "#c17800",
      skills: "#9b6bc4",
      code: "#4d9e51",
      agents: "#c9c9c4",
    },
  },
  light: {
    fg: "#22221f",
    edgeRest: "rgba(0, 0, 0, 0.15)",
    nodeFill: "#eae7dd",
    nodeBorder: "rgba(0, 0, 0, 0.26)",
    thought: "#8f8000",
    ember: "rgba(64, 62, 50, 1)",
    labelHalo: "rgba(250, 249, 246, 0.78)",
    accent: "#fff676",
    cat: {
      knowledge: "#1866c9",
      results: "#8f5800",
      skills: "#7b4fa8",
      code: "#33753a",
      agents: "#4a4a44",
    },
  },
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  )
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgba(color: string, a: number): string {
  if (color.startsWith("rgba") || color.startsWith("rgb")) return color
  const [r, g, b] = hexToRgb(color)
  return `rgba(${r},${g},${b},${a})`
}

/* ---------- graph shapes ---------- */
interface BNode {
  id: string
  label: string
  type: string
  cat: string
  x: number
  y: number
  fx: number
  fy: number
  deg: number
  half: number
  claimed: boolean
  flash: number
  consider: number
  labelA: number
  refractUntil: number
  ringT: number
  touchedAt: number
  uses: number
  breathe: number
  atlasKeep: boolean
}
interface BEdge {
  s: BNode
  t: BNode
  kind: string
  passes: number
  ember: number
  myelin: boolean
  liveT: number
  ghost: boolean
  atlasKeep: boolean
}
interface Pulse {
  e: BEdge
  rev: boolean
  kind: string
  t0: number
  dur: number
  onArrive: (() => void) | null
  trail: { x: number; y: number }[]
  lastSample: number
}
interface Constellation {
  pts: BNode[]
  title: string
  plate: string
  progress: number
  alpha: number
  born: number
}

const ROMAN = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
]

const TEMPI = [
  { bpm: 42, name: "largo" },
  { bpm: 84, name: "andante" },
  { bpm: 126, name: "allegro" },
  { bpm: 168, name: "presto" },
]

/* ================================================================
   Perf governor (#63) — the pre-agreed release valve (ADR 0002).

   A frame-time state machine observing the ONE render loop: when the p95
   frame time over a rolling ~2s window stays over the 16.7ms budget for a
   sustained ~2s trip window, motion steps down one ease level — down the
   tempo ladder, to a full motion stop, and terminally to a hard-pause on a
   static blurred field. Motion is the ONLY give: the governor's levers are
   tempo and the terminal pause. It has no access to glass blur/tint by
   construction — it emits a MotionLevel and nothing else.

   Dual-guard hysteresis: restoring one level requires p95 AT OR BELOW a
   restore threshold set a margin below budget (~13ms) for a LONGER clear
   window (~2x the trip window). Between the thresholds is a dead band where
   the level holds — no per-window oscillation, ever. Restoration is one
   level per clear window, never a jump back to full.

   The governor is INDEPENDENT of the reduced-motion hard-pause (#62): that
   is an accessibility terminal consulting no budget; this is a perf valve
   consulting no media query. While the engine is paused (hidden, off-screen,
   reduced-motion still) measurement pauses too — stalled inter-frame gaps
   arrive tagged `paused` and are discarded, so a stalled loop never
   registers phantom over-budget frames and never false-trips the valve.
   ================================================================ */

export type MotionLevel = "full" | "eased-1" | "eased-2" | "full-stop" | "hard-paused"

export interface PerfGovernorState {
  /** the host's session-busy signal, informational */
  active?: boolean
  /** the engine is paused (hidden / off-screen / reduced-motion): discard */
  paused?: boolean
}

export interface PerfGovernor {
  /** feed one frame interval from the render loop; returns the motion level */
  frame(durMs: number, state?: PerfGovernorState): MotionLevel
  level(): MotionLevel
}

/** budget + windows (fixed by the issue-#63 decision record) */
const GOV_BUDGET_MS = 16.7 // p95 target: one 60fps frame
const GOV_RESTORE_MS = 13 // restore threshold: a fixed margin BELOW budget
const GOV_WINDOW_MS = 2000 // rolling p95 window
const GOV_TRIP_MS = 2000 // sustained over-budget before one step down
const GOV_CLEAR_MS = 4000 // sustained at/below restore before one step up (~2x trip)

const GOV_LADDER: MotionLevel[] = ["full", "eased-1", "eased-2", "full-stop", "hard-paused"]

export function createPerfGovernor(): PerfGovernor {
  let t = 0 // internal clock: the sum of ACCEPTED frame durations — paused
  //           gaps never advance it, so a stall cannot ripen a trip window
  const samples: { t: number; dur: number }[] = []
  let ix = 0
  let overSince = -1
  let clearSince = -1
  function p95(): number {
    const durs = samples.map((s) => s.dur).sort((a, b) => a - b)
    return durs.length ? durs[Math.min(durs.length - 1, Math.ceil(durs.length * 0.95) - 1)] : 0
  }
  function step() {
    // a step changes the painting regime, so frames sampled under the OLD
    // level cannot judge the new one: the window resets and both sustain
    // timers restart. This is what pins "one level per window" — stale
    // over-budget samples can never cascade an unearned extra step.
    samples.length = 0
    overSince = -1
    clearSince = -1
  }
  function frame(durMs: number, state?: PerfGovernorState): MotionLevel {
    // paused-loop guard: measurement pauses with the engine; junk is junk
    if (state?.paused || !Number.isFinite(durMs) || durMs <= 0) return GOV_LADDER[ix]
    t += durMs
    samples.push({ t, dur: durMs })
    while (samples.length && samples[0].t < t - GOV_WINDOW_MS) samples.shift()
    const p = p95()
    if (p > GOV_BUDGET_MS) {
      clearSince = -1
      if (overSince < 0) overSince = t
      else if (t - overSince >= GOV_TRIP_MS) {
        if (ix < GOV_LADDER.length - 1) ix++ // never past hard-paused
        step() // each further step earns its own full sustained window
      }
    } else if (p <= GOV_RESTORE_MS) {
      overSince = -1
      if (clearSince < 0) clearSince = t
      else if (t - clearSince >= GOV_CLEAR_MS) {
        if (ix > 0) ix--
        step() // one level per clear window — never a jump back to full
      }
    } else {
      // the hysteresis dead band: under budget (no trip) but above the
      // restore threshold (no restore) — the level holds, no oscillation
      overSince = -1
      clearSince = -1
    }
    return GOV_LADDER[ix]
  }
  return { frame, level: () => GOV_LADDER[ix] }
}

/** eased paint-cadence caps (min ms between draws while the host is busy) */
function easeCapMs(lv: MotionLevel): number {
  return lv === "eased-1" ? 33 : lv === "eased-2" ? 67 : 0
}
/** eased steps down the TEMPI ladder (allegro → andante → largo) */
function easeTempoSteps(lv: MotionLevel): number {
  return lv === "eased-1" ? 1 : lv === "eased-2" ? 2 : 0
}

export function createBrainEngine(canvas: HTMLCanvasElement, opts: BrainEngineOptions = {}): BrainEngine {
  let scheme: BrainScheme = opts.scheme === "light" ? "light" : "dark"
  let css: Palette = PALETTES[scheme]
  // live: honors mid-session OS toggles (the iframe only re-read it on reload)
  let reduceMotion =
    opts.reduceMotion ?? (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches)
  let motionQuery: MediaQueryList | null = null
  const onMotionChange = (e: MediaQueryListEvent) => {
    reduceMotion = e.matches
    if (e.matches) unfurl = 1 // never animate the unfurl under reduced motion
    nudge() // one bounded repaint burst either way (both fns bind later in this closure; events fire after construction)
  }
  if (opts.reduceMotion === undefined && typeof matchMedia !== "undefined") {
    motionQuery = matchMedia("(prefers-reduced-motion: reduce)")
    motionQuery.addEventListener("change", onMotionChange)
  }
  const animate = opts.animate ?? true
  const ctx = canvas.getContext("2d")

  /* ---------- square-bloom sprites (glow budget: live things only) ---------- */
  let bloom: HTMLCanvasElement | null = null
  function buildSprites() {
    if (typeof document === "undefined") return // test env: draw guards on null
    const S = 64
    const c = document.createElement("canvas")
    c.width = c.height = S
    const x = c.getContext("2d")
    if (!x) return
    // stacked circles, not a radial gradient: the bloom keeps the round motif
    const steps: [number, number][] = [
      [30, 0.28],
      [22, 0.35],
      [14, 0.5],
    ]
    for (const [half, a] of steps) {
      x.fillStyle = rgba(css.thought, a * 0.35)
      x.beginPath()
      x.arc(S / 2, S / 2, half, 0, Math.PI * 2)
      x.fill()
    }
    bloom = c
  }
  buildSprites()

  /* ---------- graph construction ---------- */
  const nodes: BNode[] = []
  const byId = new Map<string, BNode>()
  const edges: BEdge[] = []
  const adj = new Map<string, { to: string; e: BEdge }[]>()
  const edgeSeen = new Map<string, BEdge>()
  function addNode(n: { id: string; label: string; type: string }): BNode {
    const prior = byId.get(n.id)
    if (prior) return prior
    const node: BNode = {
      id: n.id,
      label: n.label,
      type: n.type,
      cat: CAT_OF_TYPE[n.type] || "knowledge",
      x: 0,
      y: 0,
      fx: 0,
      fy: 0,
      deg: 0,
      half: 3,
      claimed: false,
      flash: 0,
      consider: 0,
      labelA: 0,
      refractUntil: -1,
      ringT: -1,
      touchedAt: -1,
      uses: 0,
      breathe: Math.random() * 6.28,
      atlasKeep: false,
    }
    nodes.push(node)
    byId.set(n.id, node)
    return node
  }
  function addEdge(s: string, t: string, kind: string): BEdge | null {
    if (s === t || !byId.has(s) || !byId.has(t)) return null
    const key = s < t ? s + "|" + t : t + "|" + s
    const prior = edgeSeen.get(key)
    if (prior) return prior
    const e: BEdge = {
      s: byId.get(s)!,
      t: byId.get(t)!,
      kind: kind || "wikilink",
      passes: 0,
      ember: 0,
      myelin: false,
      liveT: -1,
      ghost: kind === "thought",
      atlasKeep: false,
    }
    edgeSeen.set(key, e)
    edges.push(e)
    byId.get(s)!.deg++
    byId.get(t)!.deg++
    if (!adj.has(s)) adj.set(s, [])
    if (!adj.has(t)) adj.set(t, [])
    adj.get(s)!.push({ to: t, e })
    adj.get(t)!.push({ to: s, e })
    return e
  }
  function bfs(a: string, b: string, maxHops?: number): string[] | null {
    if (a === b) return [a]
    const q: string[][] = [[a]]
    const seen = new Set([a])
    while (q.length) {
      const path = q.shift()!
      if (path.length > (maxHops || 6)) continue
      for (const { to } of adj.get(path[path.length - 1]) || []) {
        if (seen.has(to)) continue
        const np = path.concat(to)
        if (to === b) return np
        seen.add(to)
        q.push(np)
      }
    }
    return null
  }

  /* ---------- sparse seed (ADR 0002) ----------
     Boot is the amico core alone — no vault skeleton, no demo traces, no
     force-settled atlas layout (the rejected "breathing skeleton"). The core
     IS the center of the world at (0,0); the graph grows ONLY from the
     session's real touches (liveNode grafts beside the current position),
     and every byte of state lives in this closure — nothing persists across
     engines, sessions, or any store. */
  const core = addNode({ id: "amico", label: "amico", type: "core" })
  core.half = 8

  /* ---------- canvas & camera ---------- */
  let W = 0,
    H = 0,
    DPR = 1,
    worldScale = 1
  function resize(width?: number, height?: number) {
    DPR = Math.min((typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1, 2)
    W = width ?? canvas.clientWidth ?? 0
    H = height ?? canvas.clientHeight ?? 0
    // junk-proof: a NaN/negative box would poison every projection this frame
    // and a zero worldScale divides the camera fit by 0 — fall back instead
    if (!Number.isFinite(W) || !Number.isFinite(H) || W < 1 || H < 1) {
      W = opts.size?.width ?? 800
      H = opts.size?.height ?? 224
    }
    canvas.width = W * DPR
    canvas.height = H * DPR
    worldScale = Math.min(W, H) * 0.86
  }
  resize()
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") {
    // the strip breathes 72px ↔ 224px; track the real box, not a boot snapshot
    ro = new ResizeObserver(() => resize())
    ro.observe(canvas)
  }

  /* fixed viewport-anchored camera (ADR 0002): a constant, core-centered zoom.
     No per-frame fit-to-farthest and no close-up follow — auto-zoom-to-fit
     visually SHRINKS growth instead of densifying it. Growth fills the frame;
     the recency-bounded, near-source graft population keeps nodes in view. */
  const cam = { x: 0, y: 0, k: 1 }
  function nx(n: BNode) {
    return (n.x * worldScale - cam.x) * cam.k + W / 2
  }
  function ny(n: BNode) {
    return (n.y * worldScale - cam.y) * cam.k + H / 2
  }

  /* ---------- latent constellation (landing mode) ----------
     A parallel, read-only scenography layer: fixed-seed data from
     brain-constellation.ts, rotated/projected here every frame. It never
     touches the live graph structures above — nodes/edges/pulses/atlas stay
     exactly the sparse live seed until the ignition dissolve hands over. */
  const clamp01 = (v: number, d: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : d)
  const conTuning = {
    speedSec: Number.isFinite(opts.constellation?.speedSec as number)
      ? Math.min(Math.max(opts.constellation!.speedSec!, 5), 600)
      : CONSTELLATION_DEFAULTS.speedSec,
    density: opts.constellation?.density ?? CONSTELLATION_DEFAULTS.density,
    tint: clamp01(opts.constellation?.tint as number, CONSTELLATION_DEFAULTS.tint),
    fog: clamp01(opts.constellation?.fog as number, CONSTELLATION_DEFAULTS.fog),
  }
  let con: LatentConstellation | null = opts.mode === "constellation" ? buildConstellation(conTuning.density) : null
  // scratch: rotated screen coords + painter's order, reused every frame
  const conPx = con ? new Float32Array(con.count) : null
  const conPy = con ? new Float32Array(con.count) : null
  const conRz = con ? new Float32Array(con.count) : null
  const conOrder = con ? Uint32Array.from({ length: con.count }, (_, i) => i) : null
  let conAngle = CONSTELLATION_CANONICAL_ANGLE // boot pose = the canonical ¾ frame
  let conT = 0 // drawn-frame milliseconds — the twinkle/breath/dissolve clock
  let igniteAt = -1 // conT stamp of the handoff; -1 = latent
  let coreIgnited = false
  // ignition timeline (ms after ignite()): ease → edges out → clusters out
  const IGNITE_EASE_MS = 1000
  const IGNITE_EDGE_MS = 600
  const IGNITE_NODE_LAG_MS = 350 // after the ease: nearest tissue lets go first
  const IGNITE_NODE_SPREAD_MS = 950 // …distant clusters last
  const IGNITE_NODE_FADE_MS = 500
  const IGNITE_TOTAL_MS = IGNITE_EASE_MS + IGNITE_NODE_LAG_MS + IGNITE_NODE_SPREAD_MS + IGNITE_NODE_FADE_MS
  // whisper cluster inks: fg pulled a breath toward the categorical color —
  // NEVER the thought color (#fff676 stays exclusive to live thought)
  let conInk: { scheme: BrainScheme; rgb: [number, number, number][] } | null = null
  function conInks(): [number, number, number][] {
    if (conInk && conInk.scheme === scheme) return conInk.rgb
    const fg = hexToRgb(css.fg)
    const rgb = CONSTELLATION_CATS.map((cat) => {
      const c = hexToRgb(css.cat[cat] ?? css.fg)
      return [0, 1, 2].map((i) => Math.round(fg[i] + (c[i] - fg[i]) * conTuning.tint)) as [number, number, number]
    })
    conInk = { scheme, rgb }
    return rgb
  }
  // quantized rgba strings — bounded cache, kills per-edge string churn
  const conRgbaCache = new Map<string, string>()
  function conRgba(rgb: [number, number, number], alpha: number): string {
    const q = Math.min(Math.round(alpha * 40), 40)
    const key = rgb[0] + "," + rgb[1] + "," + rgb[2] + ":" + q
    let s = conRgbaCache.get(key)
    if (!s) {
      s = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${q / 40})`
      conRgbaCache.set(key, s)
    }
    return s
  }
  const conTiltCosX = Math.cos(CONSTELLATION_TILT_X)
  const conTiltSinX = Math.sin(CONSTELLATION_TILT_X)
  const conTiltCosZ = Math.cos(CONSTELLATION_TILT_Z)
  const conTiltSinZ = Math.sin(CONSTELLATION_TILT_Z)
  /* live thought over the latent web (Kate 2026-07-25, "constellation + live
     thought"): a REAL session touch flares a constellation node in css.thought
     — the one place the latent canvas ever shows the thought color, because a
     flare IS live thought, not the constellation's own ink. The label hashes
     deterministically into the touch's category lobe (file work lights the
     code lobe, skills the skills lobe…), so the same label always flares the
     same node and re-touches read as the same concept firing again. Replays
     (history restored on mount) stay silent, per the touch contract. */
  type ConPulse = { ix: number; t0: number; gain: number; label: string }
  const conPulses: ConPulse[] = []
  const CON_PULSE_MS = 1600
  const CON_PULSE_RISE_MS = 150
  const CON_PULSE_CAP = 24 // a torrent of touches stays a shimmer, not a floodlight
  let conCatNodes: number[][] | null = null // node indices per CONSTELLATION_CATS lobe
  let conIncident: Map<number, number[]> | null = null // node ix → flat-edge offsets
  function conNodeFor(label: string, type?: string): number {
    const c = con!
    if (!conCatNodes) {
      conCatNodes = CONSTELLATION_CATS.map(() => [])
      for (let i = 0; i < c.count; i++) conCatNodes[c.catIx[i]].push(i)
    }
    const norm = label.toLowerCase().replace(/\.(md|jl|json|toml)$/, "")
    let h = 0x811c9dc5 // FNV-1a: deterministic, no Math.random on this path
    for (let i = 0; i < norm.length; i++) {
      h ^= norm.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    h >>>= 0
    const catIx = CONSTELLATION_CATS.indexOf((CAT_OF_TYPE[type || ""] ?? "") as (typeof CONSTELLATION_CATS)[number])
    const pool = catIx >= 0 && conCatNodes[catIx].length ? conCatNodes[catIx] : null
    // the overfilled cloud projects many nodes outside the pane — a flare the
    // user can't see isn't thought. From the hashed seat, walk the pool (in
    // deterministic order, last-drawn projection) to the first VISIBLE node;
    // same label at the same pose always lands the same seat.
    const size = pool ? pool.length : c.count
    const at = (k: number) => (pool ? pool[(h + k) % size] : (h + k) % size)
    const margin = 24
    for (let k = 0; k < Math.min(size, 96); k++) {
      const ix = at(k)
      const x = conPx![ix]
      const y = conPy![ix]
      if (x >= margin && x <= W - margin && y >= margin && y <= H - margin) return ix
    }
    return at(0)
  }
  function conFlare(ev: BrainTouchEvent) {
    if (!con || igniteAt >= 0) return // dissolving or live: the live graph owns thought
    if (ev.replay) return // history restores silently — no fireworks on mount
    const label = String(ev.label || "").trim()
    if (!label) return
    const ix = conNodeFor(label, ev.type)
    const gain = ev.consider ? 0.55 : 1 // scouts glow, real work flares
    const existing = conPulses.find((p) => p.ix === ix)
    if (existing) {
      existing.t0 = conT // a re-touch refreshes the flare instead of stacking a twin
      existing.gain = Math.max(existing.gain, gain)
    } else {
      if (reduceMotion) conPulses.length = 0 // tableau: one lit node — where amico is now
      conPulses.push({ ix, t0: conT, gain, label: label.slice(0, 24) })
      if (conPulses.length > CON_PULSE_CAP) conPulses.shift()
    }
    requestRender()
  }
  function exitConstellation() {
    con = null
    conPulses.length = 0 // live thought moves to the live graph with the handoff
    requestRender() // live mode owns the canvas from the very next frame
  }
  /** Paint the latent web. Returns true once the live layer should co-paint
      (the ignition reached the core) — the caller falls through to the live
      draw path so the first node ignites #fff676 beneath the dissolving web. */
  function drawConstellation(dt: number): boolean {
    const c = con!
    if (!ctx) return false
    if (!reduceMotion) conT += dt
    const it = igniteAt >= 0 ? conT - igniteAt : -1
    if (it >= IGNITE_TOTAL_MS) {
      exitConstellation()
      return true
    }
    // rotation eases to a stop over ~1s once the handoff lands
    const rot = it < 0 ? 1 : Math.pow(Math.max(1 - it / IGNITE_EASE_MS, 0), 2)
    if (!reduceMotion) conAngle += (((dt / 1000) * (Math.PI * 2)) / conTuning.speedSec) * rot
    const showLive = it >= IGNITE_EASE_MS
    if (showLive && !coreIgnited) {
      // the live graph's first node ignites — this is live thought beginning,
      // not the constellation's ink (which stays yellow-free to the last frame)
      coreIgnited = true
      core.flash = 1
      core.ringT = clock.beat
      core.labelA = 1
    }
    const breath = reduceMotion ? 1 : 1 + 0.01 * Math.sin((Math.PI * 2 * conT) / 10000) // ±1% @ ~10s
    const cosY = Math.cos(conAngle)
    const sinY = Math.sin(conAngle)
    const F = 3.2 // perspective camera distance (world units)
    const k = Math.hypot(W, H) * 0.42 * breath // full-bleed: the cloud overfills the pane
    const cx = W / 2
    const cy = H / 2
    const px = conPx!
    const py = conPy!
    const rz = conRz!
    for (let i = 0; i < c.count; i++) {
      // R = Rz(tilt) · Rx(tilt) · Ry(θ) — spin on a gently tilted vertical axis
      const x1 = c.x[i] * cosY + c.z[i] * sinY
      const z1 = -c.x[i] * sinY + c.z[i] * cosY
      const y2 = c.y[i] * conTiltCosX - z1 * conTiltSinX
      const z2 = c.y[i] * conTiltSinX + z1 * conTiltCosX
      const x3 = x1 * conTiltCosZ - y2 * conTiltSinZ
      const y3 = x1 * conTiltSinZ + y2 * conTiltCosZ
      const persp = F / (F - z2)
      px[i] = cx + x3 * k * persp
      py[i] = cy + y3 * k * persp
      rz[i] = z2
    }
    const inks = conInks()
    const edgeK = it < 0 ? 1 : Math.max(1 - Math.max(it - IGNITE_EASE_MS, 0) / IGNITE_EDGE_MS, 0)
    const near = (i: number) => Math.min(Math.max((rz[i] / 1.4 + 1) / 2, 0), 1)
    const fogMul = (i: number) => 1 - conTuning.fog * (1 - near(i))
    // ---- edges first: the dim web (no pulses, no traveling signals)
    if (edgeK > 0.01) {
      ctx.lineWidth = 1
      const e = c.edges
      for (let i = 0; i < e.length; i += 2) {
        const p = e[i]
        const q = e[i + 1]
        const x1 = px[p]
        const y1 = py[p]
        const x2 = px[q]
        const y2 = py[q]
        if ((x1 < -40 && x2 < -40) || (x1 > W + 40 && x2 > W + 40) || (y1 < -40 && y2 < -40) || (y1 > H + 40 && y2 > H + 40))
          continue
        // Kate 2026-07-25: more contrast against the background — brighter web
        const alpha = 0.17 * Math.min(fogMul(p), fogMul(q)) * edgeK
        if (alpha < 0.012) continue
        ctx.strokeStyle = conRgba(inks[c.catIx[p]], alpha)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }
    // ---- nodes, far → near (stable painter's order)
    const order = conOrder!
    order.sort((a, b) => rz[a] - rz[b] || a - b)
    const nodeStart = IGNITE_EASE_MS + IGNITE_NODE_LAG_MS
    for (let oi = 0; oi < order.length; oi++) {
      const i = order[oi]
      const x = px[i]
      const y = py[i]
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue
      let nodeK = 1
      if (it >= 0) {
        nodeK = 1 - Math.min(Math.max((it - (nodeStart + c.dist[i] * IGNITE_NODE_SPREAD_MS)) / IGNITE_NODE_FADE_MS, 0), 1)
        if (nodeK <= 0) continue
      }
      // seeded slow twinkle — per-node phase, no edge pulses
      const tw = reduceMotion ? 1 : 0.78 + 0.22 * Math.sin(conT * c.twSpeed[i] + c.twPhase[i])
      // Kate 2026-07-25: brighter nodes for contrast against the background
      const alpha = Math.min(1, c.a[i] * 1.4) * fogMul(i) * tw * nodeK
      if (alpha < 0.015) continue
      const persp = F / (F - rz[i])
      const half = c.r[i] * persp * (0.75 + 0.25 * near(i))
      ctx.fillStyle = conRgba(inks[c.catIx[i]], alpha)
      ctx.beginPath()
      ctx.arc(x, y, half, 0, Math.PI * 2)
      ctx.fill()
    }
    // ---- live thought: real touches flare their node in css.thought — rise
    // fast, decay easing out, an expanding ring naming the spot, incident
    // edges glinting so the web reads as tissue firing. Unfogged: thought is
    // the foreground signal. Under reduced motion the clock (conT) is frozen,
    // so the latest touch holds as a single statically lit node in the tableau.
    if (conPulses.length && it < 0) {
      const thought = hexToRgb(css.thought)
      for (let pi = conPulses.length - 1; pi >= 0; pi--) {
        const p = conPulses[pi]
        const age = reduceMotion ? CON_PULSE_RISE_MS : conT - p.t0
        if (age >= CON_PULSE_MS) {
          conPulses.splice(pi, 1)
          continue
        }
        const i = p.ix
        const x = px[i]
        const y = py[i]
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue
        const rise = Math.min(age / CON_PULSE_RISE_MS, 1)
        const fall = 1 - Math.max((age - CON_PULSE_RISE_MS) / (CON_PULSE_MS - CON_PULSE_RISE_MS), 0)
        const env = rise * fall * fall * p.gain
        if (env < 0.02) continue
        const persp = F / (F - rz[i])
        // size floor: a satellite's thought flares as visibly as a concept's
        const base = Math.max(c.r[i] * persp * (0.75 + 0.25 * near(i)), 2.6)
        if (conIncident === null) {
          conIncident = new Map()
          const e = c.edges
          for (let k = 0; k < e.length; k += 2) {
            for (const n of [e[k], e[k + 1]]) {
              let list = conIncident.get(n)
              if (!list) conIncident.set(n, (list = []))
              list.push(k)
            }
          }
        }
        ctx.lineWidth = 1
        for (const k of conIncident.get(i) ?? []) {
          const q = c.edges[k] === i ? c.edges[k + 1] : c.edges[k]
          ctx.strokeStyle = conRgba(thought, 0.2 * env)
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(px[q], py[q])
          ctx.stroke()
        }
        // soft bloom under the core: the flare must read instantly against
        // ~500 latent nodes — a thought is unmistakable, never a twinkle
        ctx.fillStyle = conRgba(thought, 0.12 * env)
        ctx.beginPath()
        ctx.arc(x, y, base + 9, 0, Math.PI * 2)
        ctx.fill()
        const ringR = base + 3 + (1 - fall) * 14 // names the touch, then lets go
        ctx.strokeStyle = conRgba(thought, 0.55 * env * fall)
        ctx.beginPath()
        ctx.arc(x, y, ringR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = conRgba(thought, Math.min(env * 1.2, 1))
        ctx.beginPath()
        ctx.arc(x, y, base * 1.3 + 1.2, 0, Math.PI * 2)
        ctx.fill()
        // the touched label names the thought — the readable layer of "live".
        // fg ink + halo (the live graph's label recipe): legible both themes;
        // the dot already carries the thought color. Scouts stay nameless.
        if (p.gain >= 1 && env > 0.18) {
          ctx.font = "10px JuliaMono, ui-monospace, SFMono-Regular, Menlo, monospace"
          ctx.textBaseline = "middle"
          const tw = ctx.measureText(p.label).width
          const lx = x + base + 8
          ctx.fillStyle = css.labelHalo
          ctx.fillRect(lx - 2, y - 7, tw + 4, 14)
          ctx.fillStyle = rgba(css.fg, Math.min(env * 1.3, 0.9))
          ctx.fillText(p.label, lx, y)
        }
      }
    }
    return showLive
  }

  /* ---------- musical clock ---------- */
  const clock = { beat: 0, tempoIx: 2, lastMs: 0 } // allegro — an embedded moment earns a brisker thought
  function bpmNow() {
    // the governor's eased levels step down the tempo ladder toward largo
    const eased = governed && !reduceMotion ? easeTempoSteps(governor.level()) : 0
    return TEMPI[Math.max(0, clock.tempoIx - eased)].bpm
  }
  const dueQueue: { t: number; fn: () => void }[] = []
  function at(beatsFromNow: number, fn: () => void) {
    dueQueue.push({ t: clock.beat + beatsFromNow, fn })
  }
  function runDue() {
    for (let i = dueQueue.length - 1; i >= 0; i--) {
      if (dueQueue[i].t <= clock.beat) {
        const q = dueQueue.splice(i, 1)[0]
        q.fn()
      }
    }
  }

  /* ---------- pulses ---------- */
  const pulses: Pulse[] = []
  function firePulse(e: BEdge, from: BNode, kind: string, durBeats: number, onArrive: (() => void) | null) {
    pulses.push({ e, rev: e.s !== from, kind, t0: clock.beat, dur: durBeats, onArrive, trail: [], lastSample: -1 })
    e.liveT = clock.beat
  }
  function pulsePos(p: Pulse, tNorm: number) {
    let q = tNorm
    if (p.e.myelin) {
      // saltatory: three staccato leaps, dwell between
      const seg = Math.min(2, Math.floor(q * 3))
      const local = q * 3 - seg
      const eased = local < 0.55 ? local / 0.55 : 1 // fast leap, brief dwell
      q = (seg + eased) / 3
    } else if (p.kind === "commit") {
      q = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2 // on-beat depart/arrive
    } // scouts stay linear: constant conduction velocity, feel the geometry
    const a = p.rev ? p.e.t : p.e.s,
      b = p.rev ? p.e.s : p.e.t
    return { x: nx(a) + (nx(b) - nx(a)) * q, y: ny(a) + (ny(b) - ny(a)) * q }
  }

  /* ---------- atlas ---------- */
  const atlas: Constellation[] = [] // charted constellations, permanent for the session
  let plate = 0

  function claim(node: BNode) {
    node.claimed = true
    node.flash = 1
    node.ringT = clock.beat
    node.labelA = 1
    node.uses++
    node.refractUntil = clock.beat + 2
    // recency (touchedAt) is stamped by liveNode, in touch order — the beat
    // clock stalls at rest, so it cannot order a recency window
  }
  function conduct(node: BNode) {
    // pass-through: signal conducts, node does not claim
    node.consider = Math.max(node.consider, 0.55)
  }
  function potentiate(e: BEdge) {
    e.passes++
    e.ember = Math.min(0.15 + 0.175 * e.passes, 0.5)
  }

  /* ---------- live thought: the host streams the REAL session ----------
     Reads and skill invocations COMMIT — a pulse travels the graph and the
     node claims its color. Searches/globs CONSIDER — a scout flash that may
     leak back to dark. Every label grafts a node beside the current position
     over a dashed thought-edge (or resolves to its existing graft): the
     sparse seed grows only from these touches. */
  const live = {
    cur: "amico",
    queue: [] as BNode[],
    pumping: false,
    recent: new Map<string, number>(),
    sinceChart: [] as BNode[],
    pendingChart: null as { title: string; replay: boolean } | null,
  }
  function maybeChart() {
    // charts wait for the queue to drain so a plate never misses its own
    // in-flight commits
    if (!live.pendingChart || live.pumping || live.queue.length) return
    const { title, replay } = live.pendingChart
    live.pendingChart = null
    const pts = live.sinceChart.slice()
    live.sinceChart = []
    if (pts.length >= 2) liveChart(pts, title, replay)
  }
  function liveChart(pts: BNode[], title: string, instant: boolean) {
    // the quiet ceremony: survey lines draw at rest tone, the cartouche names
    // the thought "plate N · <prompt excerpt>" — no camera theatrics
    plate++
    const con: Constellation = {
      pts,
      title: title || "thought",
      plate: ROMAN[(plate - 1) % ROMAN.length],
      progress: instant || reduceMotion ? 1 : 0,
      alpha: 1,
      born: clock.beat,
    }
    atlas.push(con)
    for (const n of pts) {
      n.atlasKeep = true
      n.labelA = Math.max(n.labelA, 0.7)
    }
    if (con.progress >= 1) return
    for (const n of pts) n.consider = Math.max(n.consider, 0.4) // collective acknowledgment
    const t0 = clock.beat
    const dur = Math.min(pts.length * 0.3, 3)
    const tickChart = () => {
      con.progress = Math.min((clock.beat - t0) / dur, 1)
      if (con.progress < 1) at(0.06, tickChart)
    }
    tickChart()
  }
  function spreadActivation(n: BNode) {
    // activation ripples: a real touch charges its skeleton neighbors — most
    // leak back to dark, some flash a sub-threshold scout. One event reads as
    // tissue responding, not a lone blip.
    if (reduceMotion) return
    let fired = 0
    for (const rec of adj.get(n.id) || []) {
      if (fired >= 4) break
      if (Math.random() < 0.45) continue
      const nb = byId.get(rec.to)
      if (!nb || nb.id === live.cur) continue
      nb.consider = Math.max(nb.consider, 0.45 + Math.random() * 0.35)
      if (Math.random() < 0.7) firePulse(rec.e, n, "scout", 0.4 + Math.random() * 0.4, null)
      fired++
    }
  }
  function findLiveNode(label: string): BNode | undefined {
    const norm = label.toLowerCase().replace(/\.(md|jl|json|toml)$/, "")
    const id = "live-" + norm.replace(/[^a-z0-9]+/g, "-").slice(0, 48)
    return byId.get(norm) || byId.get(id) || nodes.find((x) => x.label.toLowerCase() === norm)
  }
  // marathon sessions: every unique file AND every unique search pattern
  // grafts a node + edge, and the render loop is O(nodes+edges) per frame —
  // so the TOTAL population is hard-capped at core + GRAFT_CAP (ADR 0002).
  // When a new graft would exceed it, evict the least-recently-touched node
  // that is not where amico stands and not referenced by an in-flight pulse.
  // NO path exempts a node from the recency window — replay, charting, atlas
  // keep: recency always wins, so an arbitrarily long touch stream can never
  // grow the node set or the per-frame draw count without limit.
  const GRAFT_CAP = 300
  let touchStamp = 0 // monotonic recency, advanced by liveNode on every touch
  function evictGraft() {
    if (nodes.length < 1 + GRAFT_CAP) return // total population: core + cap
    const pulseRefs = new Set<string>()
    for (const p of pulses) {
      pulseRefs.add(p.e.s.id)
      pulseRefs.add(p.e.t.id)
    }
    let oldest: BNode | null = null
    for (const n of nodes) {
      if (n.type === "core") continue
      if (n.id === live.cur || pulseRefs.has(n.id)) continue
      if (!oldest || n.touchedAt < oldest.touchedAt) oldest = n
    }
    if (!oldest) return
    const dead = oldest
    byId.delete(dead.id)
    nodes.splice(nodes.indexOf(dead), 1)
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = edges[i]
      if (e.s !== dead && e.t !== dead) continue
      edges.splice(i, 1)
      edgeSeen.delete(e.s.id < e.t.id ? e.s.id + "|" + e.t.id : e.t.id + "|" + e.s.id)
    }
    adj.delete(dead.id)
    for (const [k, list] of adj) {
      const filtered = list.filter((r) => r.to !== dead.id)
      if (filtered.length !== list.length) adj.set(k, filtered)
    }
    // an in-flight pulse may still reference the orphan; its arrival mutates
    // a detached object and every lookup path tolerates the missing id
  }
  function liveNode(label: string, type?: string): BNode {
    const found = findLiveNode(label)
    if (found) {
      found.touchedAt = ++touchStamp // a re-touch refreshes the recency window
      return found
    }
    evictGraft()
    const norm = label.toLowerCase().replace(/\.(md|jl|json|toml)$/, "")
    const id = "live-" + norm.replace(/[^a-z0-9]+/g, "-").slice(0, 48)
    const src = byId.get(live.cur) || byId.get("amico")!
    const n = addNode({ id, label: label.slice(0, 28), type: type || "resource" })
    n.touchedAt = ++touchStamp
    n.half = 4
    const a = Math.random() * Math.PI * 2,
      r = 0.07 + Math.random() * 0.05
    n.x = src.x + Math.cos(a) * r
    n.y = src.y + Math.sin(a) * r
    addEdge(src.id, n.id, "thought")
    return n
  }
  function liveTouch(msg: BrainTouchEvent) {
    const label = String(msg.label || "").trim()
    if (!label) return
    nudge() // every real event earns a bounded reduced-motion burst
    if (msg.replay) {
      // a prior turn's step: restore it to the atlas instantly and quietly —
      // the session's whole thought-path persists across turns
      const n = liveNode(label, msg.type)
      if (!msg.consider) {
        let path = bfs(live.cur, n.id, 4)
        if (!path) {
          addEdge(live.cur, n.id, "thought")
          path = [live.cur, n.id]
        }
        for (let i = 0; i + 1 < path.length; i++) {
          const rec = (adj.get(path[i]) || []).find((a) => a.to === path[i + 1])
          if (rec) potentiate(rec.e)
        }
        if (!n.claimed) {
          claim(n)
          n.flash = 0.25 // an ember of a past firing, not a live one
        } else n.uses++
        if (!live.sinceChart.includes(n)) live.sinceChart.push(n)
        live.cur = n.id
      } else n.consider = Math.max(n.consider, 0.3)
      requestRender()
      return
    }
    const key = label + (msg.consider ? "?" : "!")
    if ((live.recent.get(key) ?? -9) > clock.beat - 2) return // debounce repeats
    live.recent.set(key, clock.beat)
    // marathon sessions: entries past the debounce window are dead weight
    if (live.recent.size > 512) {
      for (const [k, t] of live.recent) if (t <= clock.beat - 2) live.recent.delete(k)
    }
    const n = liveNode(label, msg.type)
    if (msg.consider) {
      n.consider = 1 // the flash itself is a fade — fine under reduced motion
      const rec = (adj.get(live.cur) || []).find((a) => a.to === n.id)
      if (rec && !reduceMotion) firePulse(rec.e, byId.get(live.cur)!, "scout", 0.5, null)
      requestRender()
      return
    }
    live.queue.push(n)
    livePump()
  }
  function livePump() {
    if (live.pumping) return
    const n = live.queue.shift()
    if (!n) return
    live.pumping = true
    let path = bfs(live.cur, n.id, 4)
    if (path && path.length === 1) {
      // re-touching where we already are: make the repeat visible — a pulse
      // from the core out to the node (amico consulting it again)
      path = bfs("amico", n.id, 4)
    }
    if (!path) {
      addEdge(live.cur, n.id, "thought")
      path = [live.cur, n.id]
    }
    if (reduceMotion) {
      // no traveling pulses — the path still potentiates, fades only
      for (let i = 0; i + 1 < path.length; i++) {
        const rec = (adj.get(path[i]) || []).find((a) => a.to === path[i + 1])
        if (rec) potentiate(rec.e)
      }
      if (n.refractUntil > clock.beat && n.claimed) {
        n.ringT = clock.beat
        n.uses++
      } else claim(n)
      if (!live.sinceChart.includes(n)) live.sinceChart.push(n)
      live.cur = n.id
      live.pumping = false
      at(0.25, () => {
        livePump()
        maybeChart()
      })
      return
    }
    const done = () => {
      if (n.refractUntil > clock.beat && n.claimed) {
        n.ringT = clock.beat
        n.uses++
      } else claim(n)
      if (!live.sinceChart.includes(n)) live.sinceChart.push(n)
      spreadActivation(n)
      live.cur = n.id
      live.pumping = false
      at(0.25, () => {
        livePump()
        maybeChart()
      })
    }
    const hop = (i: number) => {
      if (i + 1 >= path.length) return done()
      const rec = (adj.get(path[i]) || []).find((a) => a.to === path[i + 1])
      if (!rec) return done()
      firePulse(rec.e, byId.get(path[i])!, "commit", rec.e.myelin ? 0.5 : 1, () => {
        potentiate(rec.e)
        if (i + 2 >= path.length) done()
        else {
          conduct(byId.get(path[i + 1])!)
          hop(i + 1)
        }
      })
    }
    hop(0)
  }

  /* ---------- ambient: tacet, not silence ---------- */
  let nextTwinkle = 2,
    nextGhost = 8
  function ambient() {
    if (reduceMotion) return
    if (clock.beat > nextTwinkle) {
      nextTwinkle = clock.beat + 1.5 + Math.random() * 2.5
      const n = nodes[(Math.random() * nodes.length) | 0]
      n.consider = Math.max(n.consider, 0.3) // scintillation
    }
    if (clock.beat > nextGhost) {
      nextGhost = clock.beat + 4 + Math.random() * 4
      const e = edges[(Math.random() * edges.length) | 0]
      if (e && !e.ghost) firePulse(e, e.s, "ghost", 1.5, null) // sparse seed: there may be no edges yet
    }
  }

  /* ---------- render: the adaptive heartbeat ----------
     One shared draw-gate (ADR 0002), honored by the rAF loop and the manual
     tick() alike: full musical tempo while the host says busy, anything is in
     flight, or the boot unfurl runs; ~8fps breathing at rest. The clock only
     advances on drawn frames (dt cap 50ms), so ambient scintillation slows
     with the frame rate — the port source's shipped behavior. */
  const REST_FRAME_MS = 125 // ~8fps breathing at rest
  const NUDGE_MS = 3000 // reduced motion: draw this long around an event, then still
  let halted = false
  let destroyed = false
  let rafId = 0
  let rafScheduled = false
  let unfurl = reduceMotion ? 1 : 0
  let active = false // the host's session-busy signal
  let lastRender = -Infinity // first tick always paints
  let nudgeUntil = -Infinity // reduced-motion burst deadline, in the FRAME timebase
  let nudgePending = false // deadline armed, awaiting the next tick's clock to rebase
  // perf governor (#63): observes THIS loop's frame intervals — no second
  // clock, no second loop. Disabled by the dev force-full-tempo hook.
  const governed = opts.governed ?? true
  const governor = createPerfGovernor()
  let govLastMs = 0 // measurement baseline; 0 = discard the next interval
  //                   (set after any paused stretch, so stalled gaps never feed)
  const inFlight = () => pulses.length > 0 || live.queue.length > 0 || live.pumping || dueQueue.length > 0
  function requestRender() {
    lastRender = -Infinity // beat the rest throttle: the next tick must paint
  }
  function scheduleFrame() {
    if (halted || destroyed || !animate || typeof requestAnimationFrame === "undefined") return
    if (rafScheduled) return
    rafScheduled = true
    rafId = requestAnimationFrame((nowMs) => {
      rafScheduled = false
      tick(nowMs)
    })
  }
  function nudge() {
    // an event happened: arm one bounded reduced-motion burst. The deadline is
    // rebased onto the NEXT tick's nowMs — the manual/rAF frame clock — never
    // performance.now(), so the headless drive() clock crosses it deterministically
    nudgePending = true
    scheduleFrame() // re-arm the chain if the reduced-motion terminal ended it
  }
  function tick(nowMs: number) {
    if (halted || !ctx) return
    if (!Number.isFinite(nowMs)) return // a NaN timestamp would poison clock.beat permanently
    if (nudgePending) {
      nudgePending = false
      nudgeUntil = nowMs + NUDGE_MS
    }
    // reduced-motion hard terminal (ADR 0002): once the post-event burst
    // window elapses with nothing in flight, ticks draw NOTHING and the
    // animation-frame chain below ends — no continuous loop at rest. This is
    // the accessibility terminal; it consults no frame-time budget (slice #63).
    // Constellation mode is STRICTER: the tableau is one canonical ¾-angle
    // frame — after the first paint, ticks draw nothing at all (zero animation
    // ticks); only an explicit requestRender (theme/resize) repaints the same
    // static pose.
    const still = reduceMotion && (con ? lastRender !== -Infinity : nowMs > nudgeUntil && !inFlight())
    // perf-governor measurement (#63): intervals of THIS loop alone. It is an
    // independent path from the reduced-motion terminal above — under reduced
    // motion (or any paused stretch) measurement stops and the baseline
    // resets, so a stalled gap is discarded, never fed as a phantom
    // over-budget frame.
    if (governed && !reduceMotion) {
      if (govLastMs > 0) governor.frame(nowMs - govLastMs, { active, paused: false })
      govLastMs = nowMs
    } else {
      govLastMs = 0
    }
    const motion: MotionLevel = governed && !reduceMotion ? governor.level() : "full"
    // the rotating constellation is continuous motion — it holds full tempo
    // (the governor's eased caps still apply; reduced motion is the tableau)
    const fullTempo = active || inFlight() || unfurl < 1 || (!!con && !reduceMotion)
    // the governor's only levers are the paint cadence (motion tempo, via
    // bpmNow + the eased caps here) and the terminal hard-pause. Blur and
    // tint live in glass.css — this module has no path to them.
    const requested = lastRender === -Infinity // an explicit requestRender event
    let mayDraw = true
    let minGap = fullTempo ? 0 : REST_FRAME_MS
    if (motion === "hard-paused") {
      mayDraw = false // terminal valve: the canvas freezes to a static blurred field
    } else if (motion === "full-stop") {
      mayDraw = requested // motion stopped; a discrete event still lands ONE static frame
    } else {
      minGap = Math.max(minGap, easeCapMs(motion))
    }
    if (!still && mayDraw && nowMs - lastRender >= minGap) {
      lastRender = nowMs
      try {
        drawFrame(nowMs)
      } catch (err) {
        // a corrupt frame must not spin the rAF chain half-rendered forever —
        // halt visibly (resume() re-arms after e.g. a session switch)
        halted = true
        console.error("[amico-brain] halted on render error:", err)
        return
      }
    }
    // re-check halted: a dueQueue callback may have paused us mid-frame — and
    // track the id so pause() can cancel an already-scheduled frame (otherwise
    // pause→resume inside one frame breeds parallel rAF chains). Under the
    // governor's hard-pause the chain keeps idling WITHOUT painting: the
    // frame-time source must survive so the hysteresis can reopen the valve.
    if (!halted && !still) scheduleFrame()
  }
  function drawFrame(nowMs: number) {
    if (!ctx) return
    const dt = Math.min(nowMs - (clock.lastMs || nowMs), 50)
    clock.lastMs = nowMs
    clock.beat += (dt / 60000) * bpmNow()
    runDue()
    if (!con) ambient() // ambient scintillation belongs to the live graph alone
    if (unfurl < 1) unfurl = Math.min(unfurl + dt / 1400, 1)
    const uf = 1 - Math.pow(1 - unfurl, 3)

    // camera: fixed — constant zoom, amico core dead center (see cam above)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.clearRect(0, 0, W, H) // transparent ground — the host surface shows through

    // latent constellation: while latent it owns the frame entirely (the live
    // seed stays unpainted beneath); once the ignition reaches the core the
    // live path co-paints — the first node ignites #fff676 under the
    // dissolving web, and when the dissolve completes con is null for good
    if (con && !drawConstellation(dt)) return

    const breathe = reduceMotion ? 0 : Math.sin(nowMs / 4800) * 0.04 // 0.1 Hz field respiration

    // ---- charted constellations (the atlas — survey lines at rest tone)
    for (const con of atlas) {
      const total = con.pts.length - 1
      const upto = con.progress * total
      ctx.lineWidth = 1
      for (let i = 0; i < total; i++) {
        const a = con.pts[i],
          b = con.pts[i + 1]
        const segT = Math.max(Math.min(upto - i, 1), 0)
        if (segT <= 0) break
        ctx.strokeStyle = rgba(css.fg, 0.16 * con.alpha)
        ctx.beginPath()
        ctx.moveTo(nx(a), ny(a))
        ctx.lineTo(nx(a) + (nx(b) - nx(a)) * segT, ny(a) + (ny(b) - ny(a)) * segT)
        ctx.stroke()
      }
    }

    // ---- edges
    for (const e of edges) {
      const x1 = nx(e.s),
        y1 = ny(e.s),
        x2 = nx(e.t),
        y2 = ny(e.t)
      if ((x1 < -40 && x2 < -40) || (x1 > W + 40 && x2 > W + 40) || (y1 < -40 && y2 < -40) || (y1 > H + 40 && y2 > H + 40))
        continue
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      let width = 1
      if (e.ember > 0) {
        if (e.passes >= 3) width = 2
        ctx.strokeStyle = rgba(css.ember, e.ember * (0.55 + breathe))
      } else {
        // skeleton: the embed shows ALL possible pathways clearly, not as a
        // whisper — ghosts too, just dimmer
        ctx.strokeStyle = rgba(css.fg, 0.2)
        if (e.ghost) ctx.globalAlpha = 0.55
      }
      ctx.lineWidth = width
      if (e.ghost) ctx.setLineDash([3, 4])
      else if (e.myelin) ctx.setLineDash([7, 2]) // segmented sheath: nodes of Ranvier
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    // ---- pulses (trails are the last six 32nd positions)
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]
      const tN = (clock.beat - p.t0) / p.dur
      if (tN >= 1) {
        pulses.splice(i, 1)
        if (p.onArrive) p.onArrive()
        continue
      }
      const pos = pulsePos(p, Math.max(tN, 0))
      const dim = p.kind === "scout" ? 0.5 : p.kind === "ghost" ? 0.14 : 1
      const size = p.kind === "replay" ? 5 : p.kind === "scout" ? 3 : 4
      // trail: sample on the 32nd grid
      if (p.lastSample < 0 || clock.beat - p.lastSample >= 0.125) {
        p.lastSample = clock.beat
        p.trail.unshift({ x: pos.x, y: pos.y })
        if (p.trail.length > 6) p.trail.pop()
      }
      p.trail.forEach((tp, k) => {
        const a = dim * 0.4 * (1 - k / 6)
        const s = size * (1 - k / 8)
        ctx.fillStyle = rgba(css.thought, a)
        ctx.beginPath()
        ctx.arc(tp.x, tp.y, s / 2, 0, Math.PI * 2)
        ctx.fill()
      })
      if (p.kind !== "ghost" && bloom) {
        ctx.globalAlpha = 0.5 * dim
        ctx.drawImage(bloom, pos.x - 16, pos.y - 16, 32, 32)
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = rgba(css.thought, Math.min(dim + 0.15, 1))
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // ---- nodes: the embed is monochrome + brand yellow — every claimed node
    // wears the thought color (the categorical palette belonged to the
    // standalone demo, where a legend explained it)
    ctx.textBaseline = "middle"
    for (const n of nodes) {
      const x = nx(n),
        y = ny(n)
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue
      const catColor = css.thought
      let half = n.half * (0.6 + 0.4 * uf) * (n.uses > 1 ? 1 + Math.min(n.uses, 4) * 0.08 : 1)
      if (n.flash > 0) {
        half *= 1 + n.flash * 0.35
        n.flash = Math.max(n.flash - dt / 420, 0)
      }
      if (n.consider > 0) n.consider = Math.max(n.consider - dt / 2600, 0)
      const isCore = n.type === "core"
      const coreBr = isCore && !reduceMotion ? (Math.sin(nowMs / 2500 + 1) * 0.5 + 0.5) * 0.35 : 0

      // glow budget: flash only
      if (n.flash > 0.02 && bloom) {
        ctx.globalAlpha = n.flash
        ctx.drawImage(bloom, x - half * 4, y - half * 4, half * 8, half * 8)
        ctx.globalAlpha = 1
      }

      ctx.beginPath()
      ctx.arc(x, y, half, 0, Math.PI * 2)

      if (n.flash > 0.55) {
        ctx.fillStyle = css.thought // all-or-nothing: the attack is pure accent
        ctx.fill()
      } else if (n.claimed) {
        const sustain = n.atlasKeep ? 0.55 : 0.85
        ctx.fillStyle = rgba(catColor, sustain * (n.flash > 0 ? 1 : 0.9) + coreBr)
        ctx.fill()
        ctx.strokeStyle = rgba(catColor, 0.9)
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        // untraversed tissue recedes — the traversed path owns the contrast;
        // anything live (considered, the core) stays bright
        const chargeGlow = Math.max(n.consider, isCore ? 0.5 + coreBr : 0)
        const restDim = chargeGlow <= 0.05 ? 0.42 : 1
        ctx.globalAlpha = restDim
        ctx.fillStyle = css.nodeFill
        ctx.fill()
        ctx.strokeStyle = chargeGlow > 0 ? rgba(css.thought, 0.25 + chargeGlow * 0.6) : css.nodeBorder
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      if (n.cat === "agents") {
        // agents wear a double border — same circle, framed
        ctx.beginPath()
        ctx.arc(x, y, half + 2.5, 0, Math.PI * 2)
        ctx.strokeStyle = rgba(catColor, n.claimed ? 0.8 : 0.16)
        ctx.lineWidth = 1
        ctx.stroke()
      }
      // survey ring: an expanding circle, emitted on fire
      if (n.ringT >= 0) {
        const rt = (clock.beat - n.ringT) / 0.7
        if (rt < 1) {
          const rh = half + rt * half * 2.6
          ctx.beginPath()
          ctx.arc(x, y, rh, 0, Math.PI * 2)
          ctx.strokeStyle = rgba(css.thought, (1 - rt) * 0.8)
          ctx.lineWidth = 1
          ctx.stroke()
        } else n.ringT = -1
      }
      // labels: LOD — touched or considered; halo for legibility
      let la = n.labelA
      if (n.consider > 0.4) la = Math.max(la, 0.5)
      if (n.labelA > 0 && !n.atlasKeep) n.labelA = Math.max(n.labelA - dt / 9000, 0)
      if (n.atlasKeep) n.labelA = Math.max(n.labelA - dt / 12000, 0.5)
      if (la > 0.03) {
        ctx.font = "10px JuliaMono, ui-monospace, SFMono-Regular, Menlo, monospace"
        const tw = ctx.measureText(n.label).width
        const lx = x + half + 6,
          ly = y
        ctx.fillStyle = css.labelHalo
        ctx.fillRect(lx - 2, ly - 7, tw + 4, 14)
        ctx.fillStyle = rgba(css.fg, Math.min(la, 1) * (n.atlasKeep ? 0.8 : 0.65))
        ctx.fillText(n.label, lx, ly)
      }
    }

    // where-we-are cursor: an always-visible ring on the current node — the
    // flare fades and glows are faint on the light surface, so position gets
    // its own explicit marker in the thought color (legible in both themes)
    const curNode = byId.get(live.cur)
    if (curNode) {
      const cxp = nx(curNode),
        cyp = ny(curNode)
      const rr = curNode.half + 5 + (reduceMotion ? 0 : Math.sin(nowMs / 600) * 1.5)
      ctx.beginPath()
      ctx.arc(cxp, cyp, rr, 0, Math.PI * 2)
      ctx.strokeStyle = rgba(css.thought, 0.85)
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cxp, cyp, rr + 3.5, 0, Math.PI * 2)
      ctx.strokeStyle = rgba(css.thought, 0.3)
      ctx.lineWidth = 1
      ctx.stroke()
      curNode.labelA = 1 // the name of where we are stays readable
    }
  }

  // waking — the thought begins here; the wake is itself a nudged event, so a
  // reduced-motion boot paints one bounded burst and then rests still
  core.flash = 1
  core.ringT = clock.beat
  nudge()

  return {
    touch: (ev) => {
      if (destroyed) return
      conFlare(ev) // latent web: live thought flares over the constellation
      liveTouch(ev) // the live graph still records the session beneath
    },
    chart: (title, replay) => {
      if (destroyed) return
      nudge()
      live.pendingChart = { title: String(title || ""), replay: !!replay }
      maybeChart()
      requestRender()
    },
    setActive: (a) => {
      if (destroyed) return
      active = a
    },
    ignite: () => {
      if (destroyed || !con) return // live mode / already handed off: no-op
      nudge() // re-arm the frame chain (and the reduced-motion burst) either way
      if (reduceMotion) {
        // instant swap — no ease, no dissolve, no animation
        coreIgnited = true
        core.flash = 1
        core.ringT = clock.beat
        core.labelA = 1
        exitConstellation()
        return
      }
      if (igniteAt < 0) igniteAt = conT // a second call never restarts the dissolve
      requestRender()
    },
    highlight: (label) => {
      if (destroyed) return
      // a glance from the log: ring the node — the background camera holds
      // the whole frame, so no steering (that was the close-up strip's need)
      const n = findLiveNode(String(label || ""))
      if (n) {
        nudge()
        n.ringT = clock.beat
        n.consider = Math.max(n.consider, 0.9)
        n.labelA = 1
        requestRender()
      }
    },
    setTheme: (next) => {
      if (next !== "dark" && next !== "light") return
      scheme = next
      css = PALETTES[scheme]
      buildSprites() // the atlas, claims, and clock all persist — only ink changes
      requestRender() // the new ink must not wait out the rest throttle
    },
    resize: (width, height) => {
      resize(width, height)
      requestRender()
    },
    tick,
    pause: () => {
      halted = true // folded away / hidden — the hard pause: no ticks draw, no frame stays scheduled
      rafScheduled = false
      govLastMs = 0 // the governor pauses its measurement with the engine —
      //               the stalled gap across pause→resume is discarded (#63)
      if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(rafId)
    },
    resume: () => {
      if (destroyed || !halted) return
      halted = false
      clock.lastMs = 0 // dt is capped, so the gap doesn't lurch the clock
      govLastMs = 0 // a render-error halt skips pause(): reset the baseline here too
      requestRender() // unfolding must repaint now, not wait out the rest window
      nudge() // under reduced motion: one bounded repaint burst, then still again
    },
    destroy: () => {
      destroyed = true
      halted = true
      rafScheduled = false
      if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(rafId)
      ro?.disconnect()
      motionQuery?.removeEventListener("change", onMotionChange)
    },
    stats: () => ({
      scheme,
      nodes: nodes.length,
      edges: edges.length,
      claimed: nodes.filter((n) => n.claimed).length,
      atlas: atlas.length,
      queued: live.queue.length,
      cur: live.cur,
      active,
      scale: cam.k,
      motion: governed && !reduceMotion ? governor.level() : "full",
      mode: con ? "constellation" : "live",
      latent: con ? con.count : 0,
      latentPulses: con ? conPulses.length : 0,
    }),
  }
}

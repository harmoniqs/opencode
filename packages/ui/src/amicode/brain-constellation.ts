/* ================================================================
   Latent constellation — the landing's at-rest Brain (design of record,
   Kate 2026-07-25).

   The EMPTY landing shows the full latent network — "everything amico
   could think" — as a clustered ellipsoid cloud rotating in 3D. This
   module builds that cloud: the curated 119-node / 178-edge latent graph
   (brain-data.ts) is the core, and a FIXED-SEED deterministic PRNG
   (mulberry32) densifies around the curated concepts to the node target.
   Identical constellation every launch, byte-equal positions — asserted
   by brain-constellation.test.ts.

   Pure data + math: no canvas, no DOM, no Math.random anywhere. The
   engine (brain-engine.ts, mode: "constellation") owns rotation,
   projection, fog, twinkle, and the ignition dissolve.
   ================================================================ */

import { BRAIN_DATA } from "./brain-data"

/* ---------- design defaults (the live-tuning knobs' resting values) ---------- */
export const CONSTELLATION_DEFAULTS = {
  /** seconds per revolution around the tilted vertical axis */
  speedSec: 75,
  /** procedural densification node target (curated core included) */
  density: 500,
  /** whisper categorical cluster tint strength, 0..1 */
  tint: 0.15,
  /** depth fog strength, 0..1 */
  fog: 0.5,
} as const

/** The one fixed literal seed — the constellation is identical every launch. */
export const CONSTELLATION_SEED = 0xa111c0
/** The canonical ¾-angle pose: the reduced-motion tableau and the boot frame. */
export const CONSTELLATION_CANONICAL_ANGLE = 2.15
/** Gentle tilt of the rotation axis (radians): pitch toward the viewer + lean. */
export const CONSTELLATION_TILT_X = -0.22
export const CONSTELLATION_TILT_Z = 0.09

/** mulberry32 — tiny deterministic PRNG, plenty for scenography. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------- category mapping (mirrors the engine's CAT_OF_TYPE) ---------- */
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
}

/** Cluster palette keys, index-stable: catIx indexes into this list and the
    engine maps each entry onto PALETTES[scheme].cat for the whisper tint. */
export const CONSTELLATION_CATS = ["knowledge", "results", "skills", "code", "agents"] as const

/** Hand-placed lobe directions (unit-ish) — five organic lobes, no two on an
    axis, so the cloud reads as lobed tissue rather than a placed diagram. */
const LOBES: Record<(typeof CONSTELLATION_CATS)[number], [number, number, number]> = {
  knowledge: [-0.62, 0.3, 0.35],
  results: [0.66, 0.34, -0.2],
  skills: [0.1, -0.5, 0.55],
  code: [0.5, -0.25, -0.6],
  agents: [-0.35, 0.55, -0.5],
}

/** Overall ellipsoid shaping (applied last): wider than tall, organic. */
const SHAPE_X = 1.18
const SHAPE_Y = 0.82
const SHAPE_Z = 1.0

export interface Constellation {
  count: number
  /** 3D positions on the shaped ellipsoid cloud (world units, radius ≲ 1.3) */
  x: Float32Array
  y: Float32Array
  z: Float32Array
  /** base draw radius (px at unit projection) */
  r: Float32Array
  /** seeded per-node twinkle phase (rad) and speed (rad/ms) */
  twPhase: Float32Array
  twSpeed: Float32Array
  /** base alpha before fog/twinkle */
  a: Float32Array
  /** cluster index into CONSTELLATION_CATS */
  catIx: Uint8Array
  /** normalized distance from the cloud center, 0..1 — the dissolve order */
  dist: Float32Array
  /** edge endpoint index pairs, flat [a0,b0,a1,b1,…] */
  edges: Uint32Array
}

/**
 * Build the latent constellation. Deterministic: same `density` in, byte-equal
 * arrays out, every call, every launch — the PRNG seed is a fixed literal.
 */
export function buildConstellation(density: number = CONSTELLATION_DEFAULTS.density): Constellation {
  const curated = BRAIN_DATA.nodes
  const target = Math.max(curated.length, Math.min(Math.floor(density) || 0, 1200))
  const rnd = mulberry32(CONSTELLATION_SEED)
  /** Box–Muller gaussian over the seeded PRNG */
  const gauss = () => {
    const u = Math.max(rnd(), 1e-9)
    const v = rnd()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  const count = target
  const x = new Float32Array(count)
  const y = new Float32Array(count)
  const z = new Float32Array(count)
  const r = new Float32Array(count)
  const twPhase = new Float32Array(count)
  const twSpeed = new Float32Array(count)
  const a = new Float32Array(count)
  const catIx = new Uint8Array(count)
  const dist = new Float32Array(count)

  // ---- curated core: indexed first, positions = lobe center + gaussian cloud
  const indexOf = new Map<string, number>()
  const degree = new Uint16Array(curated.length)
  for (const e of BRAIN_DATA.edges) {
    // degree drives curated node prominence — count before placing
    const s = curated.findIndex((n) => n.id === e.s)
    const t = curated.findIndex((n) => n.id === e.t)
    if (s >= 0) degree[s]++
    if (t >= 0) degree[t]++
  }
  for (let i = 0; i < curated.length; i++) {
    const node = curated[i]
    indexOf.set(node.id, i)
    const cat = (CAT_OF_TYPE[node.type] ?? "knowledge") as (typeof CONSTELLATION_CATS)[number]
    const ci = CONSTELLATION_CATS.indexOf(cat)
    catIx[i] = ci < 0 ? 0 : ci
    const lobe = LOBES[CONSTELLATION_CATS[catIx[i]]]
    x[i] = lobe[0] + gauss() * 0.3
    y[i] = lobe[1] + gauss() * 0.3
    z[i] = lobe[2] + gauss() * 0.3
    r[i] = 1.5 + Math.min(degree[i], 9) * 0.2
    a[i] = 0.55 + Math.min(degree[i], 9) * 0.035
    twPhase[i] = rnd() * Math.PI * 2
    twSpeed[i] = (Math.PI * 2) / (6500 + rnd() * 4500) // one twinkle per ~6.5–11s
  }

  // ---- seeded densification: satellites cluster around curated concepts
  const anchor = new Uint32Array(count) // satellite → its curated concept
  for (let i = curated.length; i < count; i++) {
    const anc = Math.floor(rnd() * curated.length)
    anchor[i] = anc
    catIx[i] = catIx[anc]
    x[i] = x[anc] + gauss() * 0.13
    y[i] = y[anc] + gauss() * 0.13
    z[i] = z[anc] + gauss() * 0.13
    r[i] = 0.7 + rnd() * 0.7
    a[i] = 0.3 + rnd() * 0.18
    twPhase[i] = rnd() * Math.PI * 2
    twSpeed[i] = (Math.PI * 2) / (6500 + rnd() * 4500)
  }

  // ---- ellipsoid shaping + dissolve-order distances
  let maxD = 1e-6
  for (let i = 0; i < count; i++) {
    x[i] *= SHAPE_X
    y[i] *= SHAPE_Y
    z[i] *= SHAPE_Z
    const d = Math.sqrt(x[i] * x[i] + y[i] * y[i] + z[i] * z[i])
    dist[i] = d
    if (d > maxD) maxD = d
  }
  for (let i = 0; i < count; i++) dist[i] /= maxD

  // ---- edges: curated + trace latents + satellite anchors + local weave
  const pairs: number[] = []
  const seen = new Set<number>()
  const link = (p: number, q: number) => {
    if (p === q) return
    const key = p < q ? p * count + q : q * count + p
    if (seen.has(key)) return
    seen.add(key)
    pairs.push(p, q)
  }
  for (const e of BRAIN_DATA.edges) {
    const s = indexOf.get(e.s)
    const t = indexOf.get(e.t)
    if (s !== undefined && t !== undefined) link(s, t)
  }
  // trace step-sequences: latent links between consecutively-visited concepts
  for (const trace of BRAIN_DATA.traces) {
    for (let i = 0; i + 1 < trace.steps.length; i++) {
      const s = indexOf.get(trace.steps[i].node)
      const t = indexOf.get(trace.steps[i + 1].node)
      if (s !== undefined && t !== undefined) link(s, t)
    }
  }
  for (let i = curated.length; i < count; i++) link(i, anchor[i])
  // nearest same-cluster neighbor per node: the web reads as tissue, not spokes
  for (let i = 0; i < count; i++) {
    let best = -1
    let bestD = Infinity
    for (let j = 0; j < count; j++) {
      if (j === i || catIx[j] !== catIx[i]) continue
      const dx = x[i] - x[j]
      const dy = y[i] - y[j]
      const dz = z[i] - z[j]
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestD) {
        bestD = d
        best = j
      }
    }
    if (best >= 0) link(i, best)
  }
  // seeded local weave up to the edge target (~3 per node ⇒ ~1.5k at 500)
  const edgeTarget = Math.round(count * 3)
  for (let tries = 0; tries < edgeTarget * 24 && pairs.length / 2 < edgeTarget; tries++) {
    const p = Math.floor(rnd() * count)
    const q = Math.floor(rnd() * count)
    if (p === q || catIx[p] !== catIx[q]) continue
    const dx = x[p] - x[q]
    const dy = y[p] - y[q]
    const dz = z[p] - z[q]
    if (dx * dx + dy * dy + dz * dz > 0.45 * 0.45) continue // local: no cross-cloud chords
    link(p, q)
  }

  return { count, x, y, z, r, twPhase, twSpeed, a, catIx, dist, edges: Uint32Array.from(pairs) }
}

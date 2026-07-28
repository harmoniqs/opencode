// system-render.ts — pure schematic + table models for the System hero
// (spec-20260709 §6.1 / plan Task 4). Consumes the existing systemProjection;
// no SolidJS. Never throws.
import { systemProjection, type SystemProjection } from "./problem"
import { formatSci } from "./facets"

/** The component-count claim the card is making — "2 atoms × 3 levels", or
 *  undefined when there are none. Rendered as its own badge so N is something
 *  the researcher can read and correct, not something they have to infer from
 *  the card's shape (an unanswered "how many atoms?" used to look like "one"). */
export function systemCountLabel(proj: SystemProjection): string | undefined {
  const comps = proj.components ?? []
  if (comps.length === 0) return undefined
  const roles = new Set(comps.map((c) => c.role))
  const levels = new Set(comps.map((c) => c.levels).filter((l): l is number => typeof l === "number"))
  const role = roles.size === 1 ? [...roles][0] : "component"
  const seg = `${comps.length} ${comps.length === 1 ? role : `${role}s`}`
  return levels.size === 1 ? `${seg} × ${[...levels][0]} levels` : seg
}

/** One-line "what is this system" identity: platform · N role(s) × L levels ·
 *  <arch> drive. e.g. "rydberg · 2 atoms × 3 levels · global drive". Collapses
 *  the schematic+table into a scannable header line. Never throws. */
export function systemIdentityLine(proj: SystemProjection): string {
  return [proj.platform, systemCountLabel(proj), proj.driveArch ? `${proj.driveArch} drive` : undefined]
    .filter((p): p is string => p !== undefined && p !== "")
    .join(" · ")
}

export type SchematicNode = { id: string; label: string; levels?: number }
export type SchematicEdge = { a: string; b: string; label: string }
export type SchematicModel = {
  nodes: SchematicNode[]
  edges: SchematicEdge[]
  looseCouplings: { between: string[]; kind: string }[]
  topology?: string
}

/** Nodes = components; an edge is drawn only for a 2-id coupling between
 *  components ADJACENT in the components array (covers single-pair + linear-
 *  chain). Non-adjacent / >2-id / hyperedge couplings go to looseCouplings
 *  (listed, not drawn — no graph-layout engine). N=1 → single node, no edges. */
export function systemSchematicModel(proj: SystemProjection): SchematicModel {
  const nodes: SchematicNode[] = proj.components.map((c) => ({
    id: c.id,
    label: c.role,
    ...(typeof c.levels === "number" ? { levels: c.levels } : {}),
  }))
  const index = new Map(proj.components.map((c, i) => [c.id, i]))
  const edges: SchematicEdge[] = []
  const looseCouplings: { between: string[]; kind: string }[] = []
  for (const cp of proj.couplings) {
    const ids = cp.between
    if (ids.length === 2) {
      const i = index.get(ids[0])
      const j = index.get(ids[1])
      if (i !== undefined && j !== undefined && Math.abs(i - j) === 1) {
        edges.push({ a: ids[0], b: ids[1], label: cp.kind })
        continue
      }
    }
    looseCouplings.push({ between: ids, kind: cp.kind })
  }
  return { nodes, edges, looseCouplings, ...(proj.topology ? { topology: proj.topology } : {}) }
}

export type ComponentRow = { id: string; role: string; levels?: number; params: Record<string, number> }
export type CouplingRow = { between: string[]; kind: string; params: Record<string, number> }
export type TableModel = { components: ComponentRow[]; couplings: CouplingRow[] }

// Composite Hamiltonian LaTeX (spec §6.1 "show the system"): drift per distinct
// component role + interaction per distinct coupling kind + a drive term.
// Illustrative (authoring-aware bookkeeping spirit), not an exact derivation.
const COUPLING_TERM: Record<string, string> = {
  "dispersive-chi": "\\tfrac{\\chi}{2}\\,\\hat a^\\dagger \\hat a\\,\\hat\\sigma_z",
  ZZ: "J\\,\\hat\\sigma_z^{(1)}\\hat\\sigma_z^{(2)}",
  "cross-resonance": "\\Omega\\,\\hat\\sigma_x^{(1)}\\hat\\sigma_z^{(2)}",
  exchange: "g\\,(\\hat a^\\dagger \\hat b + \\hat a \\hat b^\\dagger)",
  vdW: "\\tfrac{C_6}{r^6}\\,\\hat n_1 \\hat n_2",
  "mode-mediated": "g\\,(\\hat a^\\dagger \\hat b + \\mathrm{h.c.})",
}

function driftTerm(c: { role: string; levels?: number; params: Record<string, number> }): string {
  switch (c.role) {
    case "qubit":
      // Keyed off LEVELS, not off whether δ happens to be filled in yet: a
      // 3-level transmon whose params are still empty is an anharmonic ladder,
      // and rendering it as a bare spin misstates the model the solve will use.
      return c.levels === 2
        ? "\\tfrac{\\omega}{2}\\,\\hat\\sigma_z"
        : "\\omega\\,\\hat a^\\dagger \\hat a + \\tfrac{\\delta}{2}\\,\\hat a^\\dagger \\hat a^\\dagger \\hat a \\hat a"
    case "cavity":
    case "resonator":
    case "mode":
      // A mode's Kerr is genuinely optional (a linear cavity has none), so here
      // the recorded params ARE the evidence.
      return ["K", "K_c", "K_c_Hz", "kerr"].some((k) => k in c.params)
        ? "\\omega_c\\,\\hat a^\\dagger \\hat a + \\tfrac{K}{2}\\,\\hat a^{\\dagger 2}\\hat a^2"
        : "\\omega_c\\,\\hat a^\\dagger \\hat a"
    case "atom":
      return "-\\Delta\\,|r\\rangle\\langle r|"
    default:
      return "\\hat H_{\\mathrm{drift}}"
  }
}

/** Drive term per component. Atoms are laser-driven on the |1⟩↔|r⟩ transition
 *  (3-level Rydberg convention: |0⟩ dark); a strictly two-level component is
 *  driven in the Pauli basis its drift already uses; everything bosonic or
 *  bosonic-truncated keeps the quadrature drive. */
function driveTerm(c: { role: string; levels?: number }): string {
  if (c.role === "atom") return "\\tfrac{\\Omega(t)}{2}\\,(|r\\rangle\\langle 1| + \\mathrm{h.c.})"
  if (c.role === "qubit" && c.levels === 2) return "u_1(t)\\,\\hat\\sigma_x + u_2(t)\\,\\hat\\sigma_y"
  return "\\varepsilon(t)\\,(\\hat a + \\hat a^\\dagger)"
}

/** Compose an illustrative Hamiltonian for ANY composite system. undefined when
 *  there are no components. Distinct role drifts + distinct coupling terms + drive. */
export function systemHamiltonianLatex(proj: SystemProjection): string | undefined {
  const terms: string[] = []
  const seen = new Set<string>()
  for (const c of proj.components) {
    const t = driftTerm(c)
    if (!seen.has(t)) { seen.add(t); terms.push(t) }
  }
  for (const cp of proj.couplings) {
    const t = COUPLING_TERM[cp.kind]
    if (t && !seen.has(cp.kind)) { seen.add(cp.kind); terms.push(t) }
  }
  if (terms.length === 0) return undefined
  for (const c of proj.components) {
    const t = driveTerm(c)
    if (!seen.has(t)) {
      seen.add(t)
      terms.push(t)
    }
  }
  return "\\hat H/\\hbar = " + terms.join(" + ")
}

// --- physics rows -------------------------------------------------------------
// The card must never invent a slot the model doesn't have. It used to emit a
// fixed transmon spec (frequency · anharmonicity · drive bound · decay) for
// EVERY component, so a Rydberg atom was asked for its anharmonicity while the
// Hamiltonian directly above it — which IS role-aware — showed a 3-level ladder
// with no such term. The row list is derived from the role here, next to the
// Hamiltonian tables, because split sources are why the two halves disagreed.

/** Unitless params get a math symbol; unit-suffixed keys (chi_kHz, K_c_Hz,
 *  N_fock) keep their name so the unit isn't lost. */
export const PARAM_SYMBOL: Record<string, string> = {
  omega: "ω",
  delta: "δ",
  chi: "χ",
  strength: "J",
  drive_max: "|u|",
  du_bound: "|u̇|",
  Delta: "Δ",
  Omega: "Ω",
  kappa: "κ",
}

export type PhysicsRow = {
  label: string
  sym?: string
  /** Formatted number (+ unit when the recorded key spells one), or "not set". */
  value: string
  /** recorded = on file · missing = this role HAS this param, nobody has said
   *  what it is yet. Params the role doesn't have are absent, not "missing". */
  state: "recorded" | "missing"
}

type ParamSpec = {
  /** Accepted keys, canonical first. A `_GHz`-style suffix is matched
   *  automatically, so list only bare forms. Case-sensitive: an atom's `Delta`
   *  (detuning) must not silently absorb a transmon's `delta` (anharmonicity). */
  keys: string[]
  label: string
  sym: string
  /** Rendered before the number ("≤ " for a bound). */
  prefix?: string
  /** False → the param does not exist in THIS component; the row is dropped
   *  entirely rather than shown as an unanswered question. */
  applies?: (c: ComponentRow) => boolean
}

/** Units are never assumed: transmon params are GHz, the Rydberg templates work
 *  in rad/μs, and a bare `omega` says which only by convention. So a unit is
 *  shown only when the recorded key spells it out. */
const UNIT_SUFFIX = /_(Hz|kHz|MHz|GHz|THz|s|ms|us|µs|ns|rad|deg)$/

const MODE_PARAMS: ParamSpec[] = [
  { keys: ["omega_c", "omega", "frequency"], label: "frequency", sym: "ω" },
  { keys: ["K", "K_c", "kerr"], label: "kerr", sym: "K" },
  { keys: ["kappa"], label: "linewidth", sym: "κ" },
]

/** Params each ROLE actually has, in card order. An unrecognized role expects
 *  NOTHING — it shows only what was recorded, which is the honest floor for a
 *  platform we have no model for. */
const ROLE_PARAMS: Record<string, ParamSpec[]> = {
  qubit: [
    { keys: ["omega", "frequency", "f01"], label: "frequency", sym: "ω" },
    {
      keys: ["delta", "alpha", "anharmonicity"],
      label: "anharmonicity",
      sym: "δ",
      // A two-level qubit has no third level to be anharmonic against.
      applies: (c) => c.levels === undefined || c.levels > 2,
    },
    { keys: ["drive_max"], label: "drive bound", sym: "|u|", prefix: "≤ " },
  ],
  atom: [
    { keys: ["Delta", "detuning", "Delta_max"], label: "detuning", sym: "Δ" },
    { keys: ["Omega", "Omega_max", "rabi", "drive_max"], label: "rabi drive", sym: "Ω", prefix: "≤ " },
  ],
  cavity: MODE_PARAMS,
  resonator: MODE_PARAMS,
  mode: MODE_PARAMS,
}

/** First recorded key matching any alias. A zero keeps the old "0 means unset"
 *  reading — an all-zeros seed shouldn't look like a specified device. */
function matchParam(params: Record<string, number>, keys: string[]) {
  for (const key of keys)
    for (const [k, v] of Object.entries(params)) {
      if (typeof v !== "number" || v === 0) continue
      if (k === key || k.replace(UNIT_SUFFIX, "") === key) {
        const unit = k.match(UNIT_SUFFIX)?.[1]
        return { key: k, text: unit ? `${formatSci(v)} ${unit}` : formatSci(v) }
      }
    }
  return undefined
}

/** Rows for ONE component: levels, the params its role actually has (unanswered
 *  ones read "not set" — that list doubles as the interview's to-do), then
 *  anything else recorded, so nothing on file is dropped. Never throws. */
export function componentPhysicsRows(c: ComponentRow): PhysicsRow[] {
  const spec = ROLE_PARAMS[c.role] ?? []
  const claimed = new Set<string>()
  const rows: PhysicsRow[] =
    c.levels === undefined
      ? [{ label: "levels", value: "not set", state: "missing" }]
      : [{ label: "levels", value: String(c.levels), state: "recorded" }]
  for (const s of spec) {
    if (s.applies && !s.applies(c)) continue
    const hit = matchParam(c.params, s.keys)
    if (hit) claimed.add(hit.key)
    rows.push({
      label: s.label,
      sym: s.sym,
      value: hit ? `${s.prefix ?? ""}${hit.text}` : "not set",
      state: hit ? "recorded" : "missing",
    })
  }
  // Decay belongs to the environment rather than to any one role's Hamiltonian,
  // so it is asked for every role we model — and never invented for one we don't.
  if (spec.length > 0) {
    const t1 = matchParam(c.params, ["T1", "t1"])
    const t2 = matchParam(c.params, ["T2", "t2"])
    if (t1) claimed.add(t1.key)
    if (t2) claimed.add(t2.key)
    const decay = [t1 ? `T₁ ${t1.text}` : undefined, t2 ? `T₂ ${t2.text}` : undefined].filter(Boolean).join(" · ")
    rows.push({ label: "decay", sym: "T₁/T₂", value: decay || "not set", state: decay ? "recorded" : "missing" })
  }
  for (const [k, v] of Object.entries(c.params)) {
    if (claimed.has(k) || typeof v !== "number" || v === 0) continue
    const unit = k.match(UNIT_SUFFIX)?.[1]
    rows.push({
      label: k.replace(UNIT_SUFFIX, ""),
      ...(PARAM_SYMBOL[k] ? { sym: PARAM_SYMBOL[k] } : {}),
      value: unit ? `${formatSci(v)} ${unit}` : formatSci(v),
      state: "recorded",
    })
  }
  return rows
}

export function systemTableModel(proj: SystemProjection): TableModel {
  return {
    components: proj.components.map((c) => ({
      id: c.id,
      role: c.role,
      ...(typeof c.levels === "number" ? { levels: c.levels } : {}),
      params: c.params,
    })),
    couplings: proj.couplings.map((cp) => ({ between: cp.between, kind: cp.kind, params: cp.params })),
  }
}

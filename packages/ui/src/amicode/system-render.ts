// system-render.ts — pure schematic + table models for the System hero
// (spec-20260709 §6.1 / plan Task 4). Consumes the existing systemProjection;
// no SolidJS. Never throws.
import { systemProjection, type SystemProjection } from "./problem"

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

function driftTerm(role: string, params: Record<string, number>): string {
  const anharmonic = ["delta", "K_q", "anharmonicity", "K_c", "K_c_Hz", "kerr"].some((k) => k in params)
  switch (role) {
    case "qubit":
      return anharmonic
        ? "\\omega\\,\\hat a^\\dagger \\hat a + \\tfrac{\\delta}{2}\\,\\hat a^\\dagger \\hat a^\\dagger \\hat a \\hat a"
        : "\\tfrac{\\omega}{2}\\,\\hat\\sigma_z"
    case "cavity":
    case "resonator":
    case "mode":
      return anharmonic ? "\\omega_c\\,\\hat a^\\dagger \\hat a + \\tfrac{K}{2}\\,\\hat a^{\\dagger 2}\\hat a^2" : "\\omega_c\\,\\hat a^\\dagger \\hat a"
    case "atom":
      return "-\\Delta\\,\\hat n"
    default:
      return "\\hat H_{\\mathrm{drift}}"
  }
}

/** Compose an illustrative Hamiltonian for ANY composite system. undefined when
 *  there are no components. Distinct role drifts + distinct coupling terms + drive. */
export function systemHamiltonianLatex(proj: SystemProjection): string | undefined {
  const terms: string[] = []
  const seen = new Set<string>()
  for (const c of proj.components) {
    const t = driftTerm(c.role, c.params)
    if (!seen.has(t)) { seen.add(t); terms.push(t) }
  }
  for (const cp of proj.couplings) {
    const t = COUPLING_TERM[cp.kind]
    if (t && !seen.has(cp.kind)) { seen.add(cp.kind); terms.push(t) }
  }
  if (terms.length === 0) return undefined
  terms.push("\\varepsilon(t)\\,(\\hat a + \\hat a^\\dagger)")
  return "\\hat H/\\hbar = " + terms.join(" + ")
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

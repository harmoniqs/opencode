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

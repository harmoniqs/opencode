import { describe, it, expect } from "bun:test"
import { systemProjection } from "./problem"
import { systemSchematicModel, systemTableModel } from "./system-render"

const twoTransmon = {
  platform: "transmon",
  drive: { arch: "per-component" },
  topology: "linear-chain",
  components: [
    { id: "q1", role: "qubit", levels: 3, params: { omega: 4.0, delta: -0.2 } },
    { id: "q2", role: "qubit", levels: 3, params: { omega: 4.1, delta: -0.2 } },
  ],
  couplings: [{ between: ["q1", "q2"], kind: "ZZ", params: { strength: 0.1 } }],
}

describe("systemSchematicModel", () => {
  it("nodes + adjacent 2-id edge + topology for a linear chain", () => {
    const s = systemSchematicModel(systemProjection(twoTransmon))
    expect(s.nodes.map((n) => n.id)).toEqual(["q1", "q2"])
    expect(s.nodes[0].levels).toBe(3)
    expect(s.edges).toEqual([{ a: "q1", b: "q2", label: "ZZ" }])
    expect(s.looseCouplings).toEqual([])
    expect(s.topology).toBe("linear-chain")
  })
  it("N=1 → single node, no edges", () => {
    const single = {
      platform: "transmon",
      drive: { arch: "per-component" },
      components: [{ id: "q1", role: "qubit", levels: 3, params: {} }],
      couplings: [],
    }
    const s = systemSchematicModel(systemProjection(single))
    expect(s.nodes).toHaveLength(1)
    expect(s.edges).toEqual([])
  })
  it("non-adjacent / hyperedge coupling → looseCouplings, not drawn", () => {
    const hyper = {
      platform: "rydberg",
      drive: { arch: "global" },
      components: [
        { id: "q1", role: "atom", levels: 3, params: {} },
        { id: "q2", role: "atom", levels: 3, params: {} },
        { id: "q3", role: "atom", levels: 3, params: {} },
      ],
      couplings: [{ between: ["q1", "q3"], kind: "vdW", params: {} }], // indices 0,2 — non-adjacent
    }
    const s = systemSchematicModel(systemProjection(hyper))
    expect(s.edges).toEqual([])
    expect(s.looseCouplings).toEqual([{ between: ["q1", "q3"], kind: "vdW" }])
  })
})

describe("systemTableModel", () => {
  it("component + coupling rows", () => {
    const t = systemTableModel(systemProjection(twoTransmon))
    expect(t.components).toHaveLength(2)
    expect(t.components[0]).toMatchObject({ id: "q1", role: "qubit", levels: 3 })
    expect(t.components[0].params).toMatchObject({ omega: 4.0, delta: -0.2 })
    expect(t.couplings[0]).toMatchObject({ between: ["q1", "q2"], kind: "ZZ" })
  })
})

import { describe, it, expect } from "bun:test"
import { systemProjection } from "./problem"
import {
  systemSchematicModel,
  systemTableModel,
  systemHamiltonianLatex,
  systemIdentityLine,
  systemCountLabel,
  componentPhysicsRows,
} from "./system-render"

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

describe("systemHamiltonianLatex", () => {
  it("composes drift + coupling + drive for a cavity+qubit dispersive system", () => {
    const cavQubit = {
      platform: "cavity",
      drive: { arch: "per-component" },
      components: [
        { id: "q1", role: "qubit", levels: 3, params: { omega: 4, delta: -0.2 } },
        { id: "c1", role: "cavity", levels: 10, params: { K_c_Hz: 3.25 } },
      ],
      couplings: [{ between: ["q1", "c1"], kind: "dispersive-chi", params: { chi_kHz: 32.8 } }],
    }
    const h = systemHamiltonianLatex(systemProjection(cavQubit))!
    expect(h).toContain("\\hat H/\\hbar")
    expect(h).toContain("\\chi") // the dispersive interaction term
    expect(h).toContain("\\varepsilon(t)") // drive term
  })
  it("returns undefined for a system with no components", () => {
    expect(systemHamiltonianLatex(systemProjection({ platform: "x", components: [], couplings: [] }))).toBeUndefined()
  })
  it("rydberg atom → Rabi drive on |1⟩↔|r⟩, NO bosonic quadrature drive", () => {
    const rydberg = {
      platform: "rydberg",
      drive: { arch: "global" },
      components: [{ id: "q1", role: "atom", levels: 3, params: {} }],
      couplings: [],
    }
    const h = systemHamiltonianLatex(systemProjection(rydberg))!
    expect(h).toContain("-\\Delta\\,|r\\rangle\\langle r|") // detuning on the Rydberg level, not -Δ n̂
    expect(h).toContain("\\Omega(t)") // laser Rabi drive
    expect(h).toContain("|r\\rangle\\langle 1|")
    expect(h).not.toContain("\\varepsilon(t)") // no cavity-style drive on a bare atom
    expect(h).not.toContain("\\hat a") // no bosonic ladder operators at all
  })
  it("two rydberg atoms + vdW → single deduped drift/drive pair + blockade term", () => {
    const pair = {
      platform: "rydberg",
      drive: { arch: "global" },
      components: [
        { id: "q1", role: "atom", levels: 3, params: {} },
        { id: "q2", role: "atom", levels: 3, params: {} },
      ],
      couplings: [{ between: ["q1", "q2"], kind: "vdW", params: {} }],
    }
    const h = systemHamiltonianLatex(systemProjection(pair))!
    expect(h).toContain("C_6") // blockade interaction
    expect(h.split("\\Omega(t)")).toHaveLength(2) // drive appears exactly once
  })
  it("levels, not param presence, picks the qubit model: 3-level ladder vs 2-level spin", () => {
    const ladder = {
      platform: "transmon",
      drive: { arch: "per-component" },
      // params still empty — the model is a 3-level ladder regardless
      components: [{ id: "q1", role: "qubit", levels: 3, params: {} }],
      couplings: [],
    }
    const h = systemHamiltonianLatex(systemProjection(ladder))!
    expect(h).toContain("\\tfrac{\\delta}{2}")
    expect(h).not.toContain("\\hat\\sigma_z")

    const spin = systemHamiltonianLatex(
      systemProjection({ ...ladder, components: [{ id: "q1", role: "qubit", levels: 2, params: {} }] }),
    )!
    expect(spin).toContain("\\hat\\sigma_z")
    expect(spin).toContain("\\hat\\sigma_x") // driven in the Pauli basis…
    expect(spin).not.toContain("\\hat a") // …not on a bosonic quadrature
  })
  it("mixed atom + cavity → both drive flavors", () => {
    const mixed = {
      platform: "hybrid",
      drive: { arch: "per-component" },
      components: [
        { id: "q1", role: "atom", levels: 3, params: {} },
        { id: "c1", role: "cavity", levels: 10, params: {} },
      ],
      couplings: [],
    }
    const h = systemHamiltonianLatex(systemProjection(mixed))!
    expect(h).toContain("\\Omega(t)")
    expect(h).toContain("\\varepsilon(t)")
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

describe("componentPhysicsRows", () => {
  const labels = (c: any) => componentPhysicsRows(c).map((r) => r.label)
  const row = (c: any, label: string) => componentPhysicsRows(c).find((r) => r.label === label)

  it("a rydberg atom is never asked for an anharmonicity — it gets detuning + Rabi", () => {
    const atom = { id: "q1", role: "atom", levels: 3, params: {} }
    expect(labels(atom)).not.toContain("anharmonicity")
    expect(labels(atom)).not.toContain("frequency")
    expect(labels(atom)).toEqual(["levels", "detuning", "rabi drive", "decay"])
    expect(row(atom, "detuning")!.state).toBe("missing")
  })

  it("a transmon keeps the frequency/anharmonicity/drive-bound spec", () => {
    const q = { id: "q1", role: "qubit", levels: 3, params: { omega: 4.8, delta: -0.2 } }
    expect(labels(q)).toEqual(["levels", "frequency", "anharmonicity", "drive bound", "decay"])
    expect(row(q, "frequency")).toMatchObject({ value: "4.8", state: "recorded" })
    expect(row(q, "drive bound")).toMatchObject({ value: "not set", state: "missing" })
  })

  it("a TWO-level qubit has no anharmonicity row at all", () => {
    expect(labels({ id: "q1", role: "qubit", levels: 2, params: {} })).not.toContain("anharmonicity")
  })

  it("an unrecognized role expects nothing — only what was recorded shows", () => {
    const spin = { id: "s1", role: "spin", params: { J_MHz: 12 } }
    expect(labels(spin)).toEqual(["levels", "J"])
    expect(row(spin, "levels")!.state).toBe("missing")
    expect(row(spin, "J")).toMatchObject({ value: "12 MHz", state: "recorded" })
  })

  it("unit-suffixed keys render their unit; bare keys never get an assumed one", () => {
    const c = { id: "q1", role: "qubit", levels: 3, params: { omega_GHz: 4.8, drive_max: 0.2 } }
    expect(row(c, "frequency")!.value).toBe("4.8 GHz")
    expect(row(c, "drive bound")!.value).toBe("≤ 0.2")
  })

  it("an atom's Δ does not absorb a transmon's δ — a stray delta stays unclaimed", () => {
    const atom = { id: "q1", role: "atom", levels: 3, params: { delta: 0.2 } }
    expect(row(atom, "detuning")!.state).toBe("missing")
    expect(row(atom, "delta")).toMatchObject({ sym: "δ", value: "0.2", state: "recorded" })
  })

  it("levels reads 'not set' rather than being silently omitted", () => {
    expect(row({ id: "q1", role: "qubit", params: {} }, "levels")).toMatchObject({
      value: "not set",
      state: "missing",
    })
  })

  it("a cavity gets frequency/kerr/linewidth, not a drive bound", () => {
    const cav = { id: "c1", role: "cavity", levels: 10, params: { K_c_Hz: 3.25 } }
    expect(labels(cav)).toEqual(["levels", "frequency", "kerr", "linewidth", "decay"])
    expect(row(cav, "kerr")!.value).toBe("3.25 Hz")
  })

  it("zero still reads as unset, and recorded T₁/T₂ collapse into one decay row", () => {
    const c = { id: "q1", role: "qubit", levels: 3, params: { omega: 0, T1: 30, T2: 20 } }
    expect(row(c, "frequency")!.state).toBe("missing")
    expect(row(c, "decay")).toMatchObject({ value: "T₁ 30 · T₂ 20", state: "recorded" })
  })
})

describe("systemCountLabel", () => {
  it("names N so an unanswered structure question can't read as 'one'", () => {
    expect(systemCountLabel(systemProjection(twoTransmon))).toBe("2 qubits × 3 levels")
    expect(systemCountLabel(systemProjection({ platform: "rydberg", params: {} }))).toBe("1 atom")
    expect(systemCountLabel(systemProjection({ platform: "x", components: [], couplings: [] }))).toBeUndefined()
  })
})

describe("systemIdentityLine", () => {
  it("summarizes platform · N role(s) × levels · arch", () => {
    expect(systemIdentityLine(systemProjection(twoTransmon))).toBe(
      "transmon · 2 qubits × 3 levels · per-component drive",
    )
  })
  it("singular role + global drive for a legacy flat rydberg (N=1)", () => {
    const p = systemProjection({ platform: "rydberg", levels: 3, params: {} })
    expect(systemIdentityLine(p)).toBe("rydberg · 1 atom × 3 levels · global drive")
  })
  it("omits the levels segment when components disagree", () => {
    const p = systemProjection({
      platform: "transmon",
      drive: { arch: "global" },
      components: [
        { id: "q1", role: "qubit", levels: 3, params: {} },
        { id: "c1", role: "cavity", levels: 10, params: {} },
      ],
      couplings: [],
    })
    // mixed roles → "component", mixed levels → no "× L levels"
    expect(systemIdentityLine(p)).toBe("transmon · 2 components · global drive")
  })
})

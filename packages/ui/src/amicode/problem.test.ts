import { describe, expect, test } from "bun:test"
import {
  parseProblemsResponse,
  parseProblemResponse,
  parseRunStatusResponse,
  chipText,
  mergeChips,
  runChipText,
  railState,
  entityRows,
  historyRows,
  editPromptText,
  compositeChip,
  compositeSystemRows,
  systemProjection,
} from "./problem"

describe("wire parsers are tolerant and never throw", () => {
  test("problems: happy + failure + garbage", () => {
    const ok = parseProblemsResponse({
      ok: true,
      active: "a",
      problems: [{ slug: "a", name: "A", status: "designing", recorded: "t", entity_kinds: ["system"] }],
      error: null,
    })
    expect(ok.ok).toBe(true)
    expect(ok.problems[0]).toMatchObject({ slug: "a", name: "A", entityKinds: ["system"] })
    expect(
      parseProblemsResponse({ ok: false, active: null, problems: [], error: "no_problems_dir: x" }).error,
    ).toContain("no_problems_dir")
    expect(parseProblemsResponse(null).ok).toBe(false)
    expect(parseProblemsResponse("garbage").ok).toBe(false)
  })
  test("problem: entities/events/runs/score_stages survive partial garbage", () => {
    const view = parseProblemResponse({
      ok: true,
      problem: { name: "X", slug: "x", status: "designing" },
      entities: { system: { platform: "transmon", levels: 4 }, junk: null },
      score_stages: ["system", "formulation", 3],
      events: [{ seq: 1, entity: "system", action: "created" }, "garbage"],
      runs: [{ run_id: "r1", lab: "default", tier: "free" }],
      error: null,
    })
    expect(view.ok).toBe(true)
    expect(Object.keys(view.entities)).toEqual(["system", "junk"])
    expect(view.scoreStages).toEqual(["system", "formulation"])
    expect(view.events).toHaveLength(1)
    expect(view.runs[0]).toMatchObject({ runId: "r1", tier: "free" })
  })
  test("run-status: happy + garbage", () => {
    const runs = parseRunStatusResponse({
      ok: true,
      runs: [{ run_id: "r1", status: "solving", fidelity: 0.03, iteration: 5 }, "junk"],
      error: null,
    })
    expect(runs).toEqual([{ runId: "r1", status: "solving", fidelity: 0.03, iteration: 5 }])
    expect(parseRunStatusResponse(null)).toEqual([])
    expect(parseRunStatusResponse({ ok: false, runs: [], error: "x" })).toEqual([])
  })
})

describe("chipText per-kind compact renderers", () => {
  test("system: structured fields", () => {
    expect(chipText("system", { platform: "transmon", levels: 4, params: { drive_max: 0.2 } })).toBe(
      "transmon · 4 lvl · cap 0.2",
    )
    expect(chipText("system", { platform: "rydberg" })).toBe("rydberg")
  })
  test("formulation: structured mode facets (NOT the phantom problem_type)", () => {
    expect(
      chipText("formulation", {
        trajectory_type: "gate",
        time_mode: "min_time",
        robustness: { kind: "ensemble" },
        free_phase: true,
      }),
    ).toBe("gate · min-time · ensemble · free-phase")
    // legacy free-form maps through the projection:
    expect(chipText("formulation", { problem: "state_prep", target: "|1>" })).toBe("ket")
    // an entity carrying ONLY the phantom problem_type is ignored → default gate:
    expect(chipText("formulation", { problem_type: "gate_synthesis" })).toBe("gate")
  })
  test("unknown kind: generic key=value join, nested flattened bare, notes skipped", () => {
    expect(chipText("pulse", { format: "jld2", knots: 51, notes: "long text" })).toBe("format=jld2 · knots=51")
  })
})

describe("mergeChips: present entities × score_stages pending", () => {
  test("orders known kinds, appends pending for missing score stages", () => {
    const chips = mergeChips({ system: { platform: "transmon" } }, ["system", "formulation", "run"])
    expect(chips.map((c) => `${c.kind}:${c.pending}`)).toEqual(["system:false", "formulation:true", "run:true"])
  })
  test("no score → only present entities, no pending, canonical order", () => {
    const chips = mergeChips({ formulation: { target: "X" }, system: {} }, [])
    expect(chips.map((c) => c.kind)).toEqual(["system", "formulation"])
    expect(chips.every((c) => !c.pending)).toBe(true)
  })
})

describe("runChipText", () => {
  test("solving with live f renders F = 1 - f; finished renders fidelity", () => {
    expect(runChipText([{ runId: "r", status: "solving", fidelity: 0.032, iteration: 12 }])).toBe("solving… F=0.968")
    expect(runChipText([{ runId: "r", status: "solving", fidelity: null, iteration: null }])).toBe("solving…")
    expect(runChipText([{ runId: "r", status: "finished", fidelity: 0.9998, iteration: 60 }])).toBe(
      "F=0.9998 · 60 iter",
    )
    expect(runChipText([{ runId: "r", status: "failed", fidelity: null, iteration: null }])).toBe("failed")
    expect(runChipText([])).toBeUndefined()
  })
  test("solving f outside [0,1] renders no F readout (objective ≠ fidelity)", () => {
    expect(runChipText([{ runId: "r", status: "solving", fidelity: 79.3, iteration: 0 }])).toBe("solving…")
  })
})

describe("railState", () => {
  test("loading / ready / stale-last-good / unavailable", () => {
    expect(railState(undefined, undefined).kind).toBe("loading")
    const good = parseProblemResponse({
      ok: true,
      problem: { name: "X", slug: "x" },
      entities: {},
      score_stages: [],
      events: [],
      runs: [],
      error: null,
    })
    expect(railState(good, undefined).kind).toBe("ready")
    const bad = parseProblemResponse({
      ok: false,
      problem: null,
      entities: {},
      score_stages: [],
      events: [],
      runs: [],
      error: "bad_json: x",
    })
    expect(railState(bad, good)).toMatchObject({ kind: "ready", stale: true }) // last-good wins
    expect(railState(bad, undefined).kind).toBe("unavailable")
  })
})

describe("entity view helpers", () => {
  test("entityRows flattens one nesting level to dotted keys", () => {
    expect(entityRows({ platform: "transmon", params: { omega: 4.8 }, notes: "n" })).toEqual([
      { key: "platform", value: "transmon" },
      { key: "params.omega", value: "4.8" },
      { key: "notes", value: "n" },
    ])
  })
  test("historyRows filters kind newest-first", () => {
    const events = [
      { seq: 1, entity: "system", action: "created", ts: "t1" },
      { seq: 2, entity: "formulation", action: "created", ts: "t2" },
      { seq: 3, entity: "system", action: "updated", ts: "t3" },
    ]
    expect(historyRows(events as any, "system").map((e) => e.seq)).toEqual([3, 1])
  })
  test("editPromptText names the entity and field, trailing space for the new value", () => {
    expect(editPromptText("system", "levels", 4)).toBe("Change the system levels (currently 4) to ")
    expect(editPromptText("system", "params.omega", 4.8)).toBe("Change the system omega (currently 4.8) to ")
  })
})

describe("composite system display derivations (spec-20260709)", () => {
  const flat = { platform: "transmon", levels: 3, params: { omega: 4.8, drive_max: 0.2 } }
  const n1 = {
    platform: "transmon",
    components: [{ id: "q1", role: "qubit", levels: 3, params: { omega: 4.8, drive_max: 0.2 } }],
    couplings: [],
    drive: { arch: "per-component" },
  }
  const cz = {
    platform: "transmon",
    components: [
      { id: "q1", role: "qubit", levels: 3, params: { omega: 4.8 } },
      { id: "q2", role: "qubit", levels: 3, params: { omega: 4.9 } },
    ],
    couplings: [{ between: ["q1", "q2"], kind: "cross-resonance", params: { g: 0.005 } }],
    topology: "single-pair",
    drive: { arch: "per-component" },
  }

  test("chipText: N=1 composite matches the legacy flat look; N>1 summarizes components/coupling/arch", () => {
    expect(chipText("system", flat as any)).toBe("transmon · 3 lvl · cap 0.2")
    expect(chipText("system", n1 as any)).toBe("transmon · 3 lvl · cap 0.2") // N=1 back-compat
    expect(chipText("system", cz as any)).toBe("transmon · 2×qubit · cross-resonance · per-component")
  })

  test("legacy flat entity still renders (defensive dual-shape)", () => {
    expect(chipText("system", flat as any)).toBeDefined()
    expect(entityRows(flat as any).some((r) => r.key === "levels")).toBe(true) // generic flat path
  })

  test("entityRows: composite → component-table + coupling-list rows, not a JSON blob", () => {
    const rows = compositeSystemRows(cz as any)
    expect(rows.find((r) => r.key === "platform")?.value).toBe("transmon")
    expect(rows.find((r) => r.key === "drive")?.value).toBe("per-component")
    expect(rows.find((r) => r.key === "topology")?.value).toBe("single-pair")
    expect(rows.find((r) => r.key === "component q1")?.value).toContain("qubit")
    expect(rows.find((r) => r.key === "component q1")?.value).toContain("omega=4.8")
    const cpRow = rows.find((r) => r.key.startsWith("coupling"))
    expect(cpRow?.key).toBe("coupling q1↔q2")
    expect(cpRow?.value).toContain("cross-resonance")
    // and entityRows routes composites here (no raw array blob)
    expect(entityRows(cz as any).some((r) => r.value.startsWith("["))).toBe(false)
  })

  test("systemProjection: composite read-through; flat collapses to N=1 (isComposite flag)", () => {
    const p = systemProjection(cz as any)
    expect(p.isComposite).toBe(true)
    expect(p.components.map((c) => c.id)).toEqual(["q1", "q2"])
    expect(p.couplings[0].between).toEqual(["q1", "q2"])
    expect(p.driveArch).toBe("per-component")
    const pf = systemProjection(flat as any)
    expect(pf.isComposite).toBe(false)
    expect(pf.components).toHaveLength(1)
    expect(pf.components[0]).toMatchObject({ id: "q1", role: "qubit", levels: 3 })
    expect(pf.couplings).toEqual([])
    // rydberg flat → atom role + global arch (mirrors normalizeSystem)
    const pr = systemProjection({ platform: "rydberg", levels: 3, params: {} } as any)
    expect(pr.components[0].role).toBe("atom")
    expect(pr.driveArch).toBe("global")
  })

  test("compositeChip is defensive on garbage (never throws)", () => {
    expect(() => compositeChip({} as any)).not.toThrow()
    expect(() => compositeSystemRows({ components: "nope" } as any)).not.toThrow()
    expect(() => systemProjection(null as any)).not.toThrow()
  })
})

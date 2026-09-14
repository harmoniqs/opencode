import { describe, expect, test } from "bun:test"
import { ProvenanceMatrix } from "../src/provenance-matrix"

/**
 * The adversarial full-provenance matrix (amicode#1084) is a VERSIONED manifest
 * of case IDs, and the release gate that consumes it. These tests prove the
 * shared source of truth: the manifest COVERS every required dimension (AC1–AC7),
 * is versioned, and the gate emits `all_required_passed` only when every required
 * case is green while default enablement stays OFF (AC8). The E2E fixtures in the
 * opencode + app harnesses prove each row RUNS and produces its declared result.
 */

const requiredIDs = () => ProvenanceMatrix.requiredCaseIDs()

describe("ProvenanceMatrix.MANIFEST — a versioned manifest of case IDs (deliberation)", () => {
  test("is versioned", () => {
    expect(ProvenanceMatrix.VERSION).toBeGreaterThan(0)
    expect(ProvenanceMatrix.MANIFEST.version).toBe(ProvenanceMatrix.VERSION)
  })

  test("every case id is unique and non-empty", () => {
    const ids = ProvenanceMatrix.MANIFEST.cases.map((row) => row.id)
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("every row declares the full case schema (fixture/setup/trigger/expectation/cleanup/mode/authorization)", () => {
    for (const row of ProvenanceMatrix.MANIFEST.cases) {
      expect(row.fixture.length).toBeGreaterThan(0)
      expect(row.setup.length).toBeGreaterThan(0)
      expect(row.trigger.length).toBeGreaterThan(0)
      expect(row.expectation.length).toBeGreaterThan(0)
      expect(row.cleanup.length).toBeGreaterThan(0)
      expect(ProvenanceMatrix.Modes).toContain(row.requiredMode)
      expect(["authorized", "denied", "not_applicable"]).toContain(row.expectedAuthorization)
    }
  })

  test("no fixture is a real user directory — every resource row is an isolated/sandboxed fixture", () => {
    for (const row of ProvenanceMatrix.MANIFEST.cases) {
      // The constraint: the matrix cannot mutate a real external user directory.
      expect(row.fixture.toLowerCase()).toMatch(/isolated|sandbox|temp|contained|disposable|in-memory|projected|synthetic|pure/)
    }
  })
})

describe("ProvenanceMatrix coverage — the matrix COVERS every required dimension (AC1–AC7)", () => {
  const rowsByDimension = (dimension: ProvenanceMatrix.Dimension) =>
    ProvenanceMatrix.MANIFEST.cases.filter((row) => row.dimension === dimension)

  test("AC1: agent, child-agent, user, system, opaque origins across full, partial, legacy modes", () => {
    const origins = rowsByDimension("origin")
    for (const origin of ProvenanceMatrix.Origins)
      expect(origins.some((row) => row.origin === origin)).toBe(true)
    // Every (origin, mode) pair is present — the full cross product.
    for (const origin of ProvenanceMatrix.Origins)
      for (const mode of ProvenanceMatrix.Modes)
        expect(origins.some((row) => row.origin === origin && row.requiredMode === mode)).toBe(true)
  })

  test("AC2: every filesystem resource class is covered", () => {
    const resources = rowsByDimension("resource")
    for (const cls of ProvenanceMatrix.ResourceClasses)
      expect(resources.some((row) => row.resourceClass === cls)).toBe(true)
  })

  test("AC3: every outcome is covered", () => {
    const outcomes = rowsByDimension("outcome")
    for (const outcome of ProvenanceMatrix.Outcomes)
      expect(outcomes.some((row) => row.expectedOutcome === outcome)).toBe(true)
  })

  test("AC4: unrelated concurrent writes are covered", () => {
    expect(rowsByDimension("concurrency").length).toBeGreaterThanOrEqual(1)
  })

  test("AC5: capability, evidence, and protected metadata are prohibited at every egress boundary", () => {
    const privacy = rowsByDimension("privacy")
    for (const boundary of ProvenanceMatrix.EgressBoundaries)
      expect(privacy.some((row) => row.prohibitedEgress.some((p) => p.boundary === boundary))).toBe(true)
    // Every egress boundary must prohibit a capability field, an evidence field, and a protected-metadata field.
    for (const boundary of ProvenanceMatrix.EgressBoundaries) {
      const prohibited = privacy.flatMap((row) => row.prohibitedEgress.filter((p) => p.boundary === boundary).map((p) => p.field))
      expect(prohibited).toContain("context.capability")
      expect(prohibited).toContain("evidence.content")
      expect(prohibited.some((field) => field.startsWith("operation.") || field.startsWith("context.") || field === "assessment.id")).toBe(true)
    }
  })

  test("AC6: every task/spawn/fork/archival/deletion/legacy/epoch/mixed-binary/rollback concern is covered", () => {
    const versions = rowsByDimension("version")
    for (const concern of ProvenanceMatrix.VersionConcerns)
      expect(versions.some((row) => row.concern === concern)).toBe(true)
  })

  test("AC7: keyboard operation and both-theme legibility are covered on the ui harness", () => {
    const accessibility = rowsByDimension("accessibility")
    expect(accessibility.length).toBeGreaterThanOrEqual(2)
    expect(accessibility.every((row) => row.harness === "ui")).toBe(true)
    expect(accessibility.some((row) => /keyboard/i.test(row.trigger + row.expectation))).toBe(true)
    expect(accessibility.some((row) => /theme/i.test(row.trigger + row.expectation))).toBe(true)
  })

  test("assertCoverage fails closed on an incomplete manifest", () => {
    const incomplete: ProvenanceMatrix.Manifest = {
      version: ProvenanceMatrix.VERSION,
      cases: ProvenanceMatrix.MANIFEST.cases.filter((row) => row.origin !== "system"),
    }
    expect(() => ProvenanceMatrix.assertCoverage(incomplete)).toThrow(/system/i)
  })
})

describe("ProvenanceMatrix.gate — all_required_passed only when every required case is green (AC8)", () => {
  test("a fully-green required set passes, and default enablement is STILL off", () => {
    const green = new Set(requiredIDs())
    const result = ProvenanceMatrix.gate(ProvenanceMatrix.MANIFEST, green)
    expect(result.all_required_passed).toBe(true)
    expect(result.missingRequired).toEqual([])
    // AC8: the matrix reports readiness — it never flips enablement on (human-only).
    expect(result.defaultEnablement).toBe("off")
  })

  test("a single missing required case blocks the gate and names it", () => {
    const all = requiredIDs()
    const dropped = all[0]
    const green = new Set(all.slice(1))
    const result = ProvenanceMatrix.gate(ProvenanceMatrix.MANIFEST, green)
    expect(result.all_required_passed).toBe(false)
    expect(result.missingRequired).toContain(dropped)
    expect(result.defaultEnablement).toBe("off")
  })

  test("an empty green set blocks the gate (a passing happy path cannot substitute for coverage)", () => {
    const result = ProvenanceMatrix.gate(ProvenanceMatrix.MANIFEST, new Set())
    expect(result.all_required_passed).toBe(false)
    expect(result.defaultEnablement).toBe("off")
  })

  test("a product-denied case that ran green still counts toward all_required_passed (denied is an expected result)", () => {
    // Denied-authorization rows are asserted expected results, not failed tests: their ids are in the required set.
    const deniedRows = ProvenanceMatrix.MANIFEST.cases.filter((row) => row.expectedAuthorization === "denied" && row.required)
    expect(deniedRows.length).toBeGreaterThan(0)
    const green = new Set(requiredIDs())
    expect(ProvenanceMatrix.gate(ProvenanceMatrix.MANIFEST, green).all_required_passed).toBe(true)
    // Dropping a denied case (as if it had "failed") blocks the gate — the denial itself is the required green result.
    green.delete(deniedRows[0].id)
    expect(ProvenanceMatrix.gate(ProvenanceMatrix.MANIFEST, green).all_required_passed).toBe(false)
  })

  test("the gate never reports enablement on for any green set", () => {
    for (const green of [new Set<string>(), new Set(requiredIDs()), new Set(requiredIDs().slice(2))])
      expect(ProvenanceMatrix.gate(ProvenanceMatrix.MANIFEST, green).defaultEnablement).toBe("off")
  })
})

describe("ProvenanceMatrix per-harness selectors — each harness owns a boundary subset", () => {
  test("engine and ui subsets partition the manifest", () => {
    const engine = ProvenanceMatrix.subset("engine").cases.map((row) => row.id)
    const ui = ProvenanceMatrix.subset("ui").cases.map((row) => row.id)
    expect(new Set([...engine, ...ui]).size).toBe(ProvenanceMatrix.MANIFEST.cases.length)
    expect(engine.some((id) => ui.includes(id))).toBe(false)
    expect(engine.length).toBeGreaterThan(0)
    expect(ui.length).toBeGreaterThan(0)
  })

  test("the required matrix case IDs are the mandatory set for the #1083 release evaluator", () => {
    // Every required matrix id feeds SessionRollout.Release.evaluate as a mandatory matrix case.
    expect(requiredIDs().length).toBe(ProvenanceMatrix.MANIFEST.cases.filter((row) => row.required).length)
    expect(requiredIDs().length).toBeGreaterThan(0)
  })
})

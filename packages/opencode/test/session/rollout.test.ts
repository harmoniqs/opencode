import { describe, expect, test } from "bun:test"
import { SessionMutation } from "@/session/mutation"
import { SessionRollout } from "@/session/rollout"

/**
 * Contract tests for the gate-migration + coordinated-release deterministic
 * surface (amicode#1083). Every test here is pure data/logic — no filesystem,
 * no probing of a mutation route, and NOTHING that performs a release act.
 */

const fullRoot = { mode: "full" as const }
const partialRoot = { mode: "partial" as const, epochStartedAt: 1_700_000_000 }
const legacyRoot = { mode: "legacy" as const }

describe("SessionRollout.Capability.discover — versioned, deterministic (AC1)", () => {
  test("carries protocol_version, mode, and migration_boundary", () => {
    const cap = SessionRollout.Capability.discover({ supported: [SessionRollout.PROTOCOL_VERSION], requested: SessionRollout.PROTOCOL_VERSION, root: fullRoot })
    expect(cap.protocol_version).toBe(SessionRollout.PROTOCOL_VERSION)
    expect(cap.mode).toBe("full")
    expect(cap.migration_boundary).toEqual({ kind: "none" })
  })

  test("protocol_version tracks the #1077 mutation registry generation (reuse, not a parallel constant)", () => {
    expect(SessionRollout.PROTOCOL_VERSION).toBe(SessionMutation.Registry.version)
  })

  test("a full-native root on a supported engine selects full with no migration boundary", () => {
    const cap = SessionRollout.Capability.discover({ supported: [4], requested: 4, root: fullRoot })
    expect(cap).toEqual({ protocol_version: 4, mode: "full", migration_boundary: { kind: "none" } })
  })

  test("an opted-in post-upgrade epoch selects partial with an epoch boundary", () => {
    const cap = SessionRollout.Capability.discover({ supported: [4], requested: 4, root: partialRoot })
    expect(cap).toEqual({ protocol_version: 4, mode: "partial", migration_boundary: { kind: "epoch", startedAt: 1_700_000_000 } })
  })

  test("a pre-existing root without an epoch selects legacy (never an inferred partial)", () => {
    const cap = SessionRollout.Capability.discover({ supported: [4], requested: 4, root: legacyRoot })
    expect(cap).toEqual({ protocol_version: 4, mode: "legacy", migration_boundary: { kind: "unmigrated" } })
  })

  test("a partial root that carries NO epoch marker collapses to legacy — no background inference", () => {
    const cap = SessionRollout.Capability.discover({ supported: [4], requested: 4, root: { mode: "partial" } })
    expect(cap.mode).toBe("legacy")
    expect(cap.migration_boundary).toEqual({ kind: "unmigrated" })
  })

  test("an unsupported (old) engine forces legacy regardless of root mode", () => {
    for (const root of [fullRoot, partialRoot, legacyRoot]) {
      const cap = SessionRollout.Capability.discover({ supported: [4], requested: 5, root })
      expect(cap.mode).toBe("legacy")
      expect(cap.migration_boundary).toEqual({ kind: "unmigrated" })
      expect(cap.protocol_version).toBe(5)
    }
  })

  test("is a pure function — identical inputs yield identical outputs (deterministic, no probing)", () => {
    const input = { supported: [4], requested: 4, root: partialRoot }
    expect(SessionRollout.Capability.discover(input)).toEqual(SessionRollout.Capability.discover(input))
  })
})

describe("SessionRollout.Matrix.resolve — mixed-version matrix, visibly labelled (AC2)", () => {
  const engineNew = { supported: [4], requested: 4 }
  const engineOld = { supported: [4], requested: 5 }

  test("old engine + new client → legacy, labelled", () => {
    const out = SessionRollout.Matrix.resolve({ engine: engineOld, client: "new", root: fullRoot })
    expect(out.mode).toBe("legacy")
    expect(out.label).toBe("legacy")
  })

  test("new engine + old client → pre-ledger view, never a ledger mode, labelled", () => {
    const out = SessionRollout.Matrix.resolve({ engine: engineNew, client: "old", root: fullRoot })
    expect(out.mode).toBe("legacy")
    expect(out.label).toBe("pre_ledger")
    expect(out.migration_boundary).toEqual({ kind: "unmigrated" })
  })

  test("new engine + new client on a full root → full", () => {
    const out = SessionRollout.Matrix.resolve({ engine: engineNew, client: "new", root: fullRoot })
    expect(out.mode).toBe("full")
    expect(out.label).toBe("full")
  })

  test("new engine + new client on a partial root → labelled partial", () => {
    const out = SessionRollout.Matrix.resolve({ engine: engineNew, client: "new", root: partialRoot })
    expect(out.mode).toBe("partial")
    expect(out.label).toBe("partial")
  })

  test("new engine + new client on a legacy root → labelled legacy", () => {
    const out = SessionRollout.Matrix.resolve({ engine: engineNew, client: "new", root: legacyRoot })
    expect(out.mode).toBe("legacy")
    expect(out.label).toBe("legacy")
  })

  test("no matrix outcome ever claims full provenance except the true full case (invariant)", () => {
    const cases = [
      { engine: engineOld, client: "new" as const, root: fullRoot },
      { engine: engineNew, client: "old" as const, root: fullRoot },
      { engine: engineNew, client: "new" as const, root: partialRoot },
      { engine: engineNew, client: "new" as const, root: legacyRoot },
    ]
    for (const c of cases) expect(SessionRollout.Matrix.resolve(c).mode).not.toBe("full")
  })
})

describe("SessionRollout.Migration — transitions are explicit only (AC3)", () => {
  test("legacy → partial only through an explicit epoch start", () => {
    const out = SessionRollout.Migration.startEpoch({ current: "legacy", boundary: 42 })
    expect(out).toEqual({ kind: "started", mode: "partial", migration_boundary: { kind: "epoch", startedAt: 42 } })
  })

  test("a full session cannot 'start an epoch' — rejected, never re-labelled", () => {
    expect(SessionRollout.Migration.startEpoch({ current: "full", boundary: 42 }).kind).toBe("rejected")
  })

  test("a session already in a partial epoch cannot restart it", () => {
    expect(SessionRollout.Migration.startEpoch({ current: "partial", boundary: 42 }).kind).toBe("rejected")
  })

  test("pre-existing sessions stay legacy until an explicit epoch is opened", () => {
    // Discovery of an untouched legacy root never yields partial…
    expect(SessionRollout.Capability.discover({ supported: [4], requested: 4, root: legacyRoot }).mode).toBe("legacy")
    // …and the ONLY path to partial is the explicit start above (there is no infer/backfill fn).
    expect((SessionRollout.Migration as Record<string, unknown>)["inferEpoch"]).toBeUndefined()
  })
})

describe("SessionRollout.resolveReservation — in-flight v1 reservations (AC4)", () => {
  test("a v1 (pre-ledger) reservation resolves as legacy, never adopted into a ledger op", () => {
    const out = SessionRollout.resolveReservation({ reservation: { generation: 1 }, ledgerGeneration: SessionRollout.LEDGER_GENERATION })
    expect(out).toEqual({ kind: "legacy", label: "legacy" })
  })

  test("a reservation at or after the ledger generation resolves as a ledger reservation", () => {
    const out = SessionRollout.resolveReservation({ reservation: { generation: SessionRollout.LEDGER_GENERATION }, ledgerGeneration: SessionRollout.LEDGER_GENERATION })
    expect(out).toEqual({ kind: "ledger", generation: SessionRollout.LEDGER_GENERATION })
  })

  test("the ledger generation is strictly after v1", () => {
    expect(SessionRollout.LEDGER_GENERATION).toBeGreaterThan(1)
  })
})

describe("SessionRollout.Rollback — cannot authorize an uncontextualized full mutation (AC5)", () => {
  test("with full discovery disabled, a full root downgrades to legacy — never authorizes full provenance", () => {
    const cap = SessionRollout.Capability.discover({ supported: [4], requested: 4, root: fullRoot, fullDiscoveryEnabled: false })
    expect(cap.mode).toBe("legacy")
    expect(cap.migration_boundary).toEqual({ kind: "unmigrated" })
  })

  test("full discovery defaults enabled (steady state)", () => {
    expect(SessionRollout.Capability.discover({ supported: [4], requested: 4, root: fullRoot }).mode).toBe("full")
  })

  test("the danger window is full-discovery-live while client routes are gone", () => {
    expect(SessionRollout.Rollback.unsafe({ fullDiscovery: true, clientRoutes: false })).toBe(true)
    expect(SessionRollout.Rollback.unsafe({ fullDiscovery: false, clientRoutes: false })).toBe(false)
    expect(SessionRollout.Rollback.unsafe({ fullDiscovery: true, clientRoutes: true })).toBe(false)
  })

  test("the correct rollback plan disables full discovery BEFORE withdrawing client routes — no unsafe step", () => {
    const plan = SessionRollout.Rollback.plan()
    expect(plan[0]).toEqual({ fullDiscovery: true, clientRoutes: true })
    expect(plan.at(-1)).toEqual({ fullDiscovery: false, clientRoutes: false })
    for (const step of plan) expect(SessionRollout.Rollback.unsafe(step)).toBe(false)
  })

  test("withdrawing client routes first (wrong order) produces an unsafe intermediate state", () => {
    const wrongOrder = { fullDiscovery: true, clientRoutes: false }
    expect(SessionRollout.Rollback.unsafe(wrongOrder)).toBe(true)
  })
})

// ── Release manifest schema/parsing + all-required-passed gate (AC6 evaluator, AC7) ──

const validManifestObject = () => ({
  forkTag: "opencode-v1.18.12-amicode.3",
  binaryChecksums: { "darwin-arm64": "sha256:aaa", "linux-x64": "sha256:bbb" },
  lockPin: "opencode.lock:deadbeef",
  extensionVersion: "0.0.3",
  overlayProvenance: { verified: true },
  rehearsalCaseIDs: ["upgrade", "rollback", "active-session", "in-flight-reservation"],
  matrixCaseIDs: ["old-engine-new-client", "new-engine-old-client", "new-new-full", "new-new-partial", "new-new-legacy"],
  completion: { forkAt: 100, binaryPinAt: 200, extensionAt: 300 },
  gates: [
    { id: "rehearsal:upgrade", required: true, passed: true },
    { id: "matrix:old-engine-new-client", required: true, passed: true },
  ],
})

describe("SessionRollout.Release.parse — manifest schema/parsing", () => {
  test("parses a well-formed manifest object", () => {
    const parsed = SessionRollout.Release.parse(validManifestObject())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.manifest.forkTag).toBe("opencode-v1.18.12-amicode.3")
      expect(parsed.manifest.rehearsalCaseIDs).toContain("rollback")
      expect(parsed.manifest.matrixCaseIDs.length).toBe(5)
    }
  })

  test("rejects a non-object", () => {
    expect(SessionRollout.Release.parse(null).ok).toBe(false)
    expect(SessionRollout.Release.parse("nope").ok).toBe(false)
  })

  test("reports each missing required field by name", () => {
    const { forkTag, ...missingForkTag } = validManifestObject()
    void forkTag
    const parsed = SessionRollout.Release.parse(missingForkTag)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.errors.join(" ")).toContain("forkTag")
  })

  test("rejects an unverifiable overlay-provenance shape", () => {
    const bad = { ...validManifestObject(), overlayProvenance: { verified: "yes" } }
    expect(SessionRollout.Release.parse(bad).ok).toBe(false)
  })
})

describe("SessionRollout.Release.evaluate — all-required-passed gate, enablement stays off (AC6, AC7)", () => {
  const mandatory = {
    rehearsalCaseIDs: ["upgrade", "rollback", "active-session", "in-flight-reservation"],
    matrixCaseIDs: ["old-engine-new-client", "new-engine-old-client", "new-new-full", "new-new-partial", "new-new-legacy"],
  }

  test("a fully-passing manifest reports ready, and default enablement is STILL off (only reports readiness)", () => {
    const parsed = SessionRollout.Release.parse(validManifestObject())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const readiness = SessionRollout.Release.evaluate(parsed.manifest, mandatory)
    expect(readiness.ready).toBe(true)
    expect(readiness.missing).toEqual([])
    // AC7: the evaluator NEVER enables — it reports. Default enablement is off, always.
    expect(readiness.defaultEnablement).toBe("off")
  })

  test("a missing mandatory rehearsal case blocks readiness and names it", () => {
    const parsed = SessionRollout.Release.parse({ ...validManifestObject(), rehearsalCaseIDs: ["upgrade"] })
    if (!parsed.ok) throw new Error("fixture should parse")
    const readiness = SessionRollout.Release.evaluate(parsed.manifest, mandatory)
    expect(readiness.ready).toBe(false)
    expect(readiness.missing.join(" ")).toContain("rollback")
    expect(readiness.defaultEnablement).toBe("off")
  })

  test("a missing mandatory matrix case blocks readiness", () => {
    const parsed = SessionRollout.Release.parse({ ...validManifestObject(), matrixCaseIDs: ["new-new-full"] })
    if (!parsed.ok) throw new Error("fixture should parse")
    const readiness = SessionRollout.Release.evaluate(parsed.manifest, mandatory)
    expect(readiness.ready).toBe(false)
  })

  test("a failed required gate blocks readiness", () => {
    const parsed = SessionRollout.Release.parse({
      ...validManifestObject(),
      gates: [{ id: "rehearsal:upgrade", required: true, passed: false }],
    })
    if (!parsed.ok) throw new Error("fixture should parse")
    const readiness = SessionRollout.Release.evaluate(parsed.manifest, mandatory)
    expect(readiness.ready).toBe(false)
    expect(readiness.missing.join(" ")).toContain("rehearsal:upgrade")
  })

  test("an unverified overlay-provenance blocks readiness", () => {
    const parsed = SessionRollout.Release.parse({ ...validManifestObject(), overlayProvenance: { verified: false } })
    if (!parsed.ok) throw new Error("fixture should parse")
    const readiness = SessionRollout.Release.evaluate(parsed.manifest, mandatory)
    expect(readiness.ready).toBe(false)
    expect(readiness.missing.join(" ")).toContain("overlay")
  })

  test("empty binary checksums block readiness", () => {
    const parsed = SessionRollout.Release.parse({ ...validManifestObject(), binaryChecksums: {} })
    if (!parsed.ok) throw new Error("fixture should parse")
    expect(SessionRollout.Release.evaluate(parsed.manifest, mandatory).ready).toBe(false)
  })
})

describe("SessionRollout.Release.orderingSatisfied — fork → binary pin → extension (AC6 evaluator)", () => {
  const mandatory = {
    rehearsalCaseIDs: ["upgrade", "rollback", "active-session", "in-flight-reservation"],
    matrixCaseIDs: ["old-engine-new-client", "new-engine-old-client", "new-new-full", "new-new-partial", "new-new-legacy"],
  }

  test("fork completes before the binary pin, which completes before extension release", () => {
    const parsed = SessionRollout.Release.parse(validManifestObject())
    if (!parsed.ok) throw new Error("fixture should parse")
    expect(SessionRollout.Release.orderingSatisfied(parsed.manifest)).toBe(true)
  })

  test("a binary pin BEFORE the fork release violates the ordering", () => {
    const parsed = SessionRollout.Release.parse({
      ...validManifestObject(),
      completion: { forkAt: 300, binaryPinAt: 200, extensionAt: 400 },
    })
    if (!parsed.ok) throw new Error("fixture should parse")
    expect(SessionRollout.Release.orderingSatisfied(parsed.manifest)).toBe(false)
  })

  test("an extension release BEFORE the binary pin violates the ordering", () => {
    const parsed = SessionRollout.Release.parse({
      ...validManifestObject(),
      completion: { forkAt: 100, binaryPinAt: 300, extensionAt: 200 },
    })
    if (!parsed.ok) throw new Error("fixture should parse")
    expect(SessionRollout.Release.orderingSatisfied(parsed.manifest)).toBe(false)
  })

  test("ordering evaluation only READS the manifest — it never performs a release act", () => {
    const parsed = SessionRollout.Release.parse(validManifestObject())
    if (!parsed.ok) throw new Error("fixture should parse")
    const before = JSON.stringify(parsed.manifest)
    SessionRollout.Release.orderingSatisfied(parsed.manifest)
    SessionRollout.Release.evaluate(parsed.manifest, mandatory)
    expect(JSON.stringify(parsed.manifest)).toBe(before)
  })
})

import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@opencode-ai/core/database/database"
import { SessionLineageTable } from "@opencode-ai/core/session/sql"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProvenanceMatrix } from "@opencode-ai/schema/provenance-matrix"
import { SessionMutation } from "@/session/mutation"
import { SessionReceipt } from "@/session/receipt"
import { SessionEvidence } from "@/session/evidence"
import { SessionReceiptPrivacy } from "@/session/receipt-privacy"
import { SessionRollout } from "@/session/rollout"
import { ExternalDiff } from "@/session/external-diff"
import { Session as SessionNs } from "@/session/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceStore } from "@/project/instance-store"
import { InstanceBootstrap } from "@/project/bootstrap"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { testEffect } from "../lib/effect"

/**
 * The engine harness of the adversarial full-provenance matrix (amicode#1084).
 *
 * This cross-harness E2E fixture RUNS every engine-owned matrix row against the
 * REAL merged contracts — the mutation gate + identity (#1077), lineage (#1075),
 * receipt/evidence/budget storage (#1088/#1090/#1103/#1104), the privacy
 * serializers (#1078), the external-diff boundary, and the rollout resolver
 * (#1083) — and records each row that produced its declared observable result as
 * green. The final gate assertion feeds the green set to `ProvenanceMatrix.gate`
 * and proves `all_required_passed` is true only when every required engine case is
 * green (product-denied outcomes are asserted expected results, not failures), and
 * composes with the #1083 `SessionRollout.Release` readiness evaluator.
 *
 * Isolation: every mutated file lives in an isolated `mkdtemp` root that is removed
 * with a containment assertion; receipt/evidence/external-diff storage and the
 * database are sandboxed by test/preload.ts (temp XDG_DATA_HOME + in-memory SQLite).
 * No case touches a real user directory.
 */

// Case IDs that ran green, collected across every per-row test below. The final
// gate test consumes this set — a row whose assertions throw never lands here.
const green = new Set<string>()

const engine = ProvenanceMatrix.subset("engine")
const isDBRow = (row: ProvenanceMatrix.Row) =>
  (row.dimension === "outcome" && (row.expectedOutcome === "aborted" || row.expectedOutcome === "unavailable")) ||
  (row.dimension === "version" && row.concern !== "mixed_binaries" && row.concern !== "rollback") ||
  (row.dimension === "concurrency" && row.id === "concurrency:non-attribution")

// ── In-memory mutation-gate helpers (pure boundaries) ────────────────────────

const SESSION = "ses_1084_root"
const ROOT = "ses_1084_root"
const makeGate = (now = 1_000) =>
  SessionMutation.create({
    rootForSession: (s) => (s === SESSION ? ROOT : undefined),
    now: () => now,
    operations: SessionMutation.OperationStore.memory(),
  })

type Endpoint = { value: string; kind: "file" | "directory" }
const fileEndpoint = (value: string): Endpoint => ({ value, kind: "file" })

const declaredResource = (id: string, value: string): SessionMutation.DeclaredResource => ({
  id,
  endpoint: fileEndpoint(value),
  operation: "write",
  role: "target",
})

// ── Origin dimension (AC1): agent/child-agent/user/system/opaque × modes ─────

const hostReceiptWithOrigin = (origin: string): SessionReceiptPrivacy.HostReceipt => ({
  operation: { id: "op-priv", rootID: "root-priv", sessionID: "ses-priv", origin, state: "committed" },
  receipt: { id: "r1", sequence: 1, resource: "src/a.ts", operation: "write", outcome: "applied", timeCreated: 1 },
  assessment: {
    id: "assess-priv",
    receiptID: "r1",
    confidence: "observed",
    netState: "modified",
    evidenceState: "available",
    revision: 1,
    timeCreated: 2,
  },
})

function runOrigin(row: ProvenanceMatrix.Row): void {
  const origin = row.origin!
  if (origin === "opaque") {
    const gate = makeGate()
    const ctx = gate.issue({
      routeID: "shell-action",
      kind: "opaque",
      panelID: "p",
      sessionID: SESSION,
      rootID: ROOT,
      origin: "opaque",
      operation: "shell",
      expiresAt: 5_000,
    })!
    expect(ctx).toBeDefined()
    const result = gate.executeOpaque({
      context: ctx,
      request: {
        routeID: "shell-action",
        panelID: "p",
        sessionID: SESSION,
        rootID: ROOT,
        origin: "opaque",
        operation: "shell",
        operationID: `op-opaque-${row.requiredMode}`,
      },
    })
    expect(result.kind).toBe("executed")
    if (result.kind !== "executed") return
    expect(result.result.outcome).toBe("unknown")
    expect((result.result as SessionMutation.OpaqueResult).receipt.origin).toBe("opaque")
    return
  }

  if (row.requiredMode === "legacy") {
    const legacy = { version: 1, note: "pre-ledger" }
    const out = SessionReceiptPrivacy.display({ legacy, receipt: hostReceiptWithOrigin(origin) }, { mode: "legacy" })
    // Legacy mode retains the pre-ledger payload — never a full-provenance claim.
    expect(out).toBe(legacy)
    return
  }

  // full / partial: the capability-selected projection carries the origin, attributed to the active root.
  const projection = SessionReceiptPrivacy.display(
    { legacy: { version: 1 }, receipt: hostReceiptWithOrigin(origin) },
    { mode: "full", version: 1 },
  )
  expect(projection).toEqual(SessionReceiptPrivacy.project(hostReceiptWithOrigin(origin), "files_changed"))
  expect((projection as SessionReceiptPrivacy.Projection).operation?.origin).toBe(origin)
}

// ── Resource dimension (AC2): every filesystem resource class ────────────────

function withTmp(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amc1084-res-"))
  try {
    fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    // Containment: the isolated fixture is gone; nothing escaped it.
    expect(fs.existsSync(dir)).toBe(false)
  }
}

const identity = (target: string, kind: "file" | "directory") => SessionMutation.ResourceIdentity.resolve(target, kind)

function runExternalDiff(sessionID: string, git: boolean): void {
  withTmp((dir) => {
    if (git) Bun.spawnSync(["git", "init", "-q", dir])
    const file = path.join(dir, "external.txt")
    fs.writeFileSync(file, "baseline\n")
    const reservation = ExternalDiff.prepare({ sessionID, files: [file] })
    expect(reservation).toBeDefined()
    fs.writeFileSync(file, "changed\n")
    expect(ExternalDiff.commit({ sessionID, reservation: reservation! })).toBe(true)

    const canonical = path.resolve(file)
    const assessment = ExternalDiff.assessed(sessionID).assessments.find((a) => a.file === canonical)
    expect(assessment?.state).toBe("changed")
    // The generated patch never crosses this boundary by default — host-local only.
    expect(assessment).not.toHaveProperty("patch")
    const detail = ExternalDiff.assessed(sessionID, { patch: true }).assessments.find((a) => a.file === canonical)
    expect(typeof (detail as { patch?: string }).patch).toBe("string")
    ExternalDiff.remove(sessionID)
  })
}

function runResource(row: ProvenanceMatrix.Row): void {
  switch (row.resourceClass) {
    case "workspace":
      return withTmp((dir) => {
        const file = path.join(dir, "w.ts")
        fs.writeFileSync(file, "x")
        const id = identity(file, "file")
        expect(id?.value.startsWith("local:existing:")).toBe(true)
        expect(identity(file, "file")!.value).toBe(id!.value)
      })
    case "symlink":
      return withTmp((dir) => {
        const target = path.join(dir, "t.ts")
        fs.writeFileSync(target, "x")
        const link = path.join(dir, "l.ts")
        fs.symlinkSync(target, link)
        // A symlink binds the SAME physical identity as its target — the path is discarded.
        expect(identity(link, "file")!.value).toBe(identity(target, "file")!.value)
      })
    case "alias":
      return withTmp((dir) => {
        const target = path.join(dir, "t.ts")
        fs.writeFileSync(target, "x")
        const hard = path.join(dir, "h.ts")
        fs.linkSync(target, hard)
        expect(identity(hard, "file")!.value).toBe(identity(target, "file")!.value)
      })
    case "directory":
      return withTmp((dir) => {
        const sub = path.join(dir, "sub")
        fs.mkdirSync(sub)
        expect(identity(sub, "directory")?.kind).toBe("directory")
        expect(identity(sub, "file")).toBeUndefined()
      })
    case "binary":
      return withTmp((dir) => {
        const file = path.join(dir, "b.bin")
        fs.writeFileSync(file, Buffer.from([0, 1, 2, 255, 254, 0, 3]))
        // Identity is by physical inode, content-agnostic — the bytes never enter it.
        expect(identity(file, "file")?.value.startsWith("local:existing:")).toBe(true)
      })
    case "trash":
      return withTmp((dir) => {
        const file = path.join(dir, "f.ts")
        fs.writeFileSync(file, "x")
        expect(identity(file, "file")!.value.startsWith("local:existing:")).toBe(true)
        const trash = path.join(dir, "Trash")
        fs.mkdirSync(trash)
        fs.renameSync(file, path.join(trash, "f.ts"))
        // The original path is now missing — the delete is captured as an identity change.
        expect(identity(file, "file")!.value.startsWith("local:missing:")).toBe(true)
      })
    case "restore":
      return withTmp((dir) => {
        const file = path.join(dir, "f.ts")
        expect(identity(file, "file")!.value.startsWith("local:missing:")).toBe(true)
        fs.writeFileSync(file, "x")
        expect(identity(file, "file")!.value.startsWith("local:existing:")).toBe(true)
      })
    case "internal": {
      // An internal (out-of-scope) store is never a ledger route → no context is issued.
      expect(SessionMutation.Registry.require("credential-store")?.kind).toBe("out_of_scope")
      const gate = makeGate()
      const ctx = gate.issue({
        routeID: "credential-store",
        kind: "local",
        panelID: "p",
        sessionID: SESSION,
        rootID: ROOT,
        origin: "system",
        operation: "write",
        source: fileEndpoint("local:existing:1:1"),
        expiresAt: 5_000,
      })
      expect(ctx).toBeUndefined()
      return
    }
    case "unsupported_provider": {
      const gate = makeGate()
      const source = fileEndpoint("local:existing:1:1")
      const ctx = gate.issue({
        routeID: "local-file-write",
        kind: "local",
        panelID: "p",
        sessionID: SESSION,
        rootID: ROOT,
        origin: "agent",
        operation: "write",
        source,
        expiresAt: 5_000,
      })!
      const result = gate.executeLocal({
        context: ctx,
        request: {
          routeID: "local-file-write",
          panelID: "p",
          sessionID: SESSION,
          rootID: ROOT,
          origin: "agent",
          operation: "write",
          operationID: "op-unsafe",
          source,
        },
        provider: {
          capabilities: { safeResolve: false, noFollowWrite: false },
          safeResolve: (e) => e,
          noFollowWrite: () => ({ groupID: "g", outcome: "applied" }),
        },
      })
      // A provider lacking the safe-resolve / no-follow-write capability is DENIED (expected product-denial).
      expect(result.kind).toBe("denied")
      if (result.kind === "denied") expect(result.reason).toBe("unsafe_provider")
      return
    }
    case "non_git_external":
      return runExternalDiff("ext_non_git_1084", false)
    case "external_repo":
      return runExternalDiff("ext_repo_1084", true)
    case "artifact":
      return runExternalDiff("ext_artifact_1084", false)
    default:
      throw new Error(`unhandled resource class: ${row.resourceClass}`)
  }
}

// ── Outcome dimension (AC3): pure gate outcomes ──────────────────────────────

function runGateOutcome(outcome: ProvenanceMatrix.Outcome): void {
  const source = fileEndpoint("local:existing:9:900")
  const localRequest = {
    routeID: "local-file-write" as const,
    panelID: "p",
    sessionID: SESSION,
    rootID: ROOT,
    origin: "agent",
    operation: "write",
  }
  switch (outcome) {
    case "success": {
      const gate = makeGate()
      const ctx = gate.issue({ ...localRequest, kind: "local", source, expiresAt: 5_000 })!
      const result = gate.executeLocal({
        context: ctx,
        request: { ...localRequest, operationID: "op-ok", source },
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          safeResolve: (e) => e,
          noFollowWrite: () => ({ groupID: "op-ok", outcome: "applied" }),
        },
      })
      expect(result.kind).toBe("executed")
      if (result.kind === "executed") expect(result.result.outcome).toBe("applied")
      return
    }
    case "denied": {
      const gate = makeGate()
      const result = gate.executeLocal({
        request: { ...localRequest, operationID: "op-denied", source },
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          safeResolve: (e) => e,
          noFollowWrite: () => ({ groupID: "op-denied", outcome: "applied" }),
        },
      })
      expect(result.kind).toBe("denied")
      if (result.kind === "denied") expect(result.reason).toBe("missing_context")
      return
    }
    case "expiry": {
      const gate = makeGate(1_000)
      const ctx = gate.issue({ ...localRequest, kind: "local", source, expiresAt: 1_000 })!
      const result = gate.executeLocal({
        context: ctx,
        request: { ...localRequest, operationID: "op-exp", source },
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          safeResolve: (e) => e,
          noFollowWrite: () => ({ groupID: "op-exp", outcome: "applied" }),
        },
      })
      expect(result.kind).toBe("denied")
      if (result.kind === "denied") expect(result.reason).toBe("expired_context")
      return
    }
    case "conflict": {
      const gate = makeGate()
      const ctx = gate.issue({ ...localRequest, kind: "local", source, expiresAt: 5_000 })!
      const result = gate.executeLocal({
        context: ctx,
        request: { ...localRequest, operationID: "op-conflict", source },
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          // The source resolved to a DIFFERENT physical identity between issue and execute — a conflict.
          safeResolve: () => fileEndpoint("local:existing:9:999"),
          noFollowWrite: () => ({ groupID: "op-conflict", outcome: "applied" }),
        },
      })
      expect(result.kind).toBe("denied")
      if (result.kind === "denied") expect(result.reason).toBe("identity_changed")
      return
    }
    case "opaque": {
      const gate = makeGate()
      const ctx = gate.issue({
        routeID: "shell-action",
        kind: "opaque",
        panelID: "p",
        sessionID: SESSION,
        rootID: ROOT,
        origin: "agent",
        operation: "shell",
        expiresAt: 5_000,
      })!
      const result = gate.executeOpaque({
        context: ctx,
        request: {
          routeID: "shell-action",
          panelID: "p",
          sessionID: SESSION,
          rootID: ROOT,
          origin: "agent",
          operation: "shell",
          operationID: "op-opaque-outcome",
        },
      })
      expect(result.kind).toBe("executed")
      if (result.kind === "executed") expect(result.result.outcome).toBe("unknown")
      return
    }
    case "failed": {
      const gate = makeGate()
      const resources = [declaredResource("r1", "local:existing:1:1")]
      const groupRequest = {
        routeID: "tool-write" as const,
        panelID: "p",
        sessionID: SESSION,
        rootID: ROOT,
        origin: "agent",
        operation: "write",
        resources,
      }
      const ctx = gate.issueGroup({ ...groupRequest, expiresAt: 5_000 })!
      const result = gate.executeGroup({
        context: ctx,
        request: { ...groupRequest, operationID: "op-failed" },
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          // A resource's identity no longer resolves to what was reserved → the group fails, nothing started.
          safeResolve: (e) => ({ value: `${e.value}X`, kind: e.kind }),
          execute: () => "applied",
        },
      })
      expect(result.kind).toBe("executed")
      if (result.kind === "executed") {
        expect(result.result.outcome).toBe("failed")
        expect(result.result.receipts.every((r) => r.outcome === "not_started")).toBe(true)
      }
      return
    }
    case "partial": {
      const gate = makeGate()
      const resources = [
        declaredResource("r1", "local:existing:1:1"),
        declaredResource("r2", "local:existing:1:2"),
      ]
      const groupRequest = {
        routeID: "tool-write" as const,
        panelID: "p",
        sessionID: SESSION,
        rootID: ROOT,
        origin: "agent",
        operation: "write",
        resources,
      }
      const ctx = gate.issueGroup({ ...groupRequest, expiresAt: 5_000 })!
      const result = gate.executeGroup({
        context: ctx,
        request: { ...groupRequest, operationID: "op-partial" },
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          safeResolve: (e) => e,
          execute: (resource) => (resource.id === "r1" ? "applied" : "failed"),
        },
      })
      expect(result.kind).toBe("executed")
      if (result.kind === "executed") expect(result.result.outcome).toBe("partial")
      return
    }
    case "quota": {
      const gate = makeGate()
      const resources = [
        declaredResource("r1", "local:existing:1:1"),
        declaredResource("r2", "local:existing:1:2"),
      ]
      const groupRequest = {
        routeID: "tool-write" as const,
        panelID: "p",
        sessionID: SESSION,
        rootID: ROOT,
        origin: "agent",
        operation: "write",
        resources,
        recursive: { maxResources: 1 },
      }
      const ctx = gate.issueGroup({ ...groupRequest, expiresAt: 5_000 })!
      const result = gate.executeGroup({
        context: ctx,
        request: { ...groupRequest, operationID: "op-quota" },
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          safeResolve: (e) => e,
          execute: () => "applied",
        },
      })
      // The recursive group exceeded its resource budget → DENIED (quota).
      expect(result.kind).toBe("denied")
      if (result.kind === "denied") expect(result.reason).toBe("resource_budget_exceeded")
      return
    }
    default:
      throw new Error(`unhandled pure outcome: ${outcome}`)
  }
}

// ── Privacy dimension (AC5): capability/evidence/protected metadata never egress

const FIELD_SENTINEL: Partial<Record<string, string>> = {
  "context.capability": "__CAPABILITY_1084__",
  "evidence.content": "__EVIDENCE_BYTES_1084__",
  "operation.id": "__OPERATION_ID_1084__",
  "operation.rootID": "__ROOT_ID_1084__",
  "operation.sessionID": "__SESSION_ID_1084__",
  "assessment.id": "__ASSESSMENT_ID_1084__",
  "context.canonicalPath": "__CANONICAL_PATH_1084__",
  "context.rawHash": "__RAW_HASH_1084__",
  "context.baseline": "__BASELINE_1084__",
  "context.redactionDecision": "__REDACTION_1084__",
}

const sentinelHostReceipt = (): SessionReceiptPrivacy.HostReceipt => ({
  operation: {
    id: FIELD_SENTINEL["operation.id"],
    rootID: FIELD_SENTINEL["operation.rootID"],
    sessionID: FIELD_SENTINEL["operation.sessionID"],
    origin: "agent",
    state: "committed",
  },
  receipt: { id: "r1", sequence: 1, resource: "src/a.ts", operation: "write", outcome: "applied", timeCreated: 1 },
  assessment: {
    id: FIELD_SENTINEL["assessment.id"],
    receiptID: "r1",
    confidence: "observed",
    netState: "modified",
    evidenceState: "available",
    revision: 1,
    timeCreated: 2,
  },
  evidence: { receiptID: "r1", content: FIELD_SENTINEL["evidence.content"] },
  context: {
    capability: FIELD_SENTINEL["context.capability"],
    canonicalPath: FIELD_SENTINEL["context.canonicalPath"],
    rawHash: FIELD_SENTINEL["context.rawHash"],
    baseline: FIELD_SENTINEL["context.baseline"],
    redactionDecision: FIELD_SENTINEL["context.redactionDecision"],
  },
  derived: { patch: FIELD_SENTINEL["evidence.content"], additions: 1, deletions: 1 },
})

function runPrivacy(row: ProvenanceMatrix.Row): void {
  const boundary = row.prohibitedEgress[0]!.boundary
  const projection = SessionReceiptPrivacy.project(sentinelHostReceipt(), boundary)
  const serialized = JSON.stringify(projection)
  // Every field the row declares prohibited at this boundary is absent from the projection.
  for (const prohibited of row.prohibitedEgress) {
    const sentinel = FIELD_SENTINEL[prohibited.field]
    if (sentinel) expect(serialized).not.toContain(sentinel)
  }
  // The browser boundary still surfaces the display-safe fields; other egress carries only redacted markers.
  if (boundary === "browser") {
    expect((projection as SessionReceiptPrivacy.Projection).receipt?.resource).toBe("src/a.ts")
    expect((projection as SessionReceiptPrivacy.Projection).operation?.origin).toBe("agent")
  }
}

// ── Concurrency dimension (AC4): cross-root context is denied (pure) ──────────

function runCrossRootDenied(): void {
  const store = SessionMutation.OperationStore.memory()
  // The session maps to root A at issue time, but resolves to root B at execute time.
  let mapped = "root-A"
  const gate = SessionMutation.create({
    rootForSession: () => mapped,
    now: () => 1_000,
    operations: store,
  })
  const source = fileEndpoint("local:existing:2:2")
  const base = { routeID: "local-file-write" as const, panelID: "p", sessionID: "ses-x", origin: "agent", operation: "write" }
  const ctx = gate.issue({ ...base, rootID: "root-A", kind: "local", source, expiresAt: 5_000 })!
  expect(ctx).toBeDefined()
  mapped = "root-B"
  const result = gate.executeLocal({
    context: ctx,
    request: { ...base, rootID: "root-A", operationID: "op-x", source },
    provider: {
      capabilities: { safeResolve: true, noFollowWrite: true },
      safeResolve: (e) => e,
      noFollowWrite: () => ({ groupID: "op-x", outcome: "applied" }),
    },
  })
  // A context is bound to one root; a session that now resolves elsewhere can never use it.
  expect(result.kind).toBe("denied")
  if (result.kind === "denied") expect(result.reason).toBe("invalid_context")
}

// ── Version dimension (AC6): pure rollout concerns ───────────────────────────

function runRolloutConcern(concern: ProvenanceMatrix.VersionConcern): void {
  const v = SessionRollout.PROTOCOL_VERSION
  if (concern === "mixed_binaries") {
    const oldEngine = SessionRollout.Matrix.resolve({
      engine: { supported: [v], requested: v + 1 },
      client: "new",
      root: { mode: "full" },
    })
    expect(oldEngine.mode).toBe("legacy")
    const oldClient = SessionRollout.Matrix.resolve({
      engine: { supported: [v], requested: v },
      client: "old",
      root: { mode: "full" },
    })
    // A new engine + old client keeps its pre-ledger view — a visibly-labelled non-full claim.
    expect(oldClient.mode).toBe("legacy")
    expect(oldClient.label).toBe("pre_ledger")
    return
  }
  // rollback: full discovery is disabled BEFORE client routes are withdrawn — no uncontextualized window.
  expect(
    SessionRollout.Capability.discover({ supported: [v], requested: v, root: { mode: "full" }, fullDiscoveryEnabled: false }).mode,
  ).toBe("legacy")
  expect(SessionRollout.Rollback.unsafe({ fullDiscovery: true, clientRoutes: false })).toBe(true)
  for (const step of SessionRollout.Rollback.plan()) expect(SessionRollout.Rollback.unsafe(step)).toBe(false)
}

// ── Register the pure per-row tests, grouped by dimension ────────────────────

const enginePure = engine.cases.filter((row) => !isDBRow(row))

describe("adversarial matrix — engine harness, pure boundaries", () => {
  for (const row of enginePure) {
    test(row.id, () => {
      switch (row.dimension) {
        case "origin":
          runOrigin(row)
          break
        case "resource":
          runResource(row)
          break
        case "outcome":
          runGateOutcome(row.expectedOutcome!)
          break
        case "privacy":
          runPrivacy(row)
          break
        case "concurrency":
          runCrossRootDenied()
          break
        case "version":
          runRolloutConcern(row.concern!)
          break
        default:
          throw new Error(`no pure executor for dimension ${row.dimension}`)
      }
      green.add(row.id)
    })
  }
})

// ── Register the database-backed rows via the shared session harness ─────────

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      SessionNs.node,
      Database.node,
      EventV2Bridge.node,
      SessionProjector.node,
      CrossSpawnSpawner.node,
      InstanceStore.node,
    ]),
    [
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalWorkspaces: false })],
      [InstanceBootstrap.node, Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))],
    ],
  ),
)

const budget = { maxReceipts: 4, maxMetadataBytes: 100_000 }

describe("adversarial matrix — engine harness, database-backed boundaries", () => {
  it.instance("outcome:aborted", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const database = yield* Database.Service
      const root = yield* session.create({ title: "aborted" })
      yield* SessionReceipt.reserve(database, {
        id: "op-abort",
        sessionID: root.id,
        origin: "agent",
        receipts: [{ id: "r-abort", resource: "file:///a", operation: "write", outcome: "applied", timeCreated: 1 }],
        budget: { maxReceipts: 1, maxMetadataBytes: 1_000 },
      })
      yield* SessionReceipt.abort(database, "op-abort")
      expect(yield* SessionReceipt.committed(database, root.id)).toEqual([])
      yield* session.remove(root.id)
      green.add("outcome:aborted")
    }),
  )

  it.instance("outcome:unavailable", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const database = yield* Database.Service
      const root = yield* session.create({ title: "unavailable" })
      yield* SessionReceipt.publish(database, {
        id: "op-unavail",
        sessionID: root.id,
        origin: "agent",
        budget: { maxReceipts: 1, maxMetadataBytes: 1_000, maxEvidenceBytes: 1_000 },
        receipts: [{ id: "r-unavail", resource: "file:///u", operation: "write", outcome: "applied", timeCreated: 1 }],
        evidence: [{ receiptID: "r-unavail", content: "baseline" }],
      })
      SessionEvidence.removeRoot(root.id)
      yield* SessionReceipt.assessEvidence(database, { receiptID: "r-unavail", timeCreated: 2 })
      const assessments = yield* SessionReceipt.assessments(database, "r-unavail")
      const latest = assessments.at(-1)!
      expect(latest.evidenceState).toBe("unavailable")
      expect(latest).not.toHaveProperty("patch")
      yield* session.remove(root.id)
      green.add("outcome:unavailable")
    }),
  )

  it.instance("concurrency:non-attribution", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const database = yield* Database.Service
      const [a, b] = yield* Effect.all([session.create({ title: "root-a" }), session.create({ title: "root-b" })], {
        concurrency: "unbounded",
      })
      yield* Effect.all(
        [
          SessionReceipt.publish(database, {
            id: "op-a",
            sessionID: a.id,
            origin: "agent",
            budget,
            receipts: [{ id: "r-a", resource: "file:///a", operation: "write", outcome: "applied", timeCreated: 1 }],
          }),
          SessionReceipt.publish(database, {
            id: "op-b",
            sessionID: b.id,
            origin: "agent",
            budget,
            receipts: [{ id: "r-b", resource: "file:///b", operation: "write", outcome: "applied", timeCreated: 1 }],
          }),
        ],
        { concurrency: "unbounded" },
      )
      const aCommitted = yield* SessionReceipt.committed(database, a.id)
      const bCommitted = yield* SessionReceipt.committed(database, b.id)
      // The active root sees ONLY its own receipts — the unrelated concurrent writer is never attributed to it.
      expect(aCommitted.flatMap((o) => o.receipts.map((r) => r.id))).toEqual(["r-a"])
      expect(bCommitted.flatMap((o) => o.receipts.map((r) => r.id))).toEqual(["r-b"])
      expect(aCommitted.some((o) => o.rootID === b.id)).toBe(false)
      yield* session.remove(a.id)
      yield* session.remove(b.id)
      green.add("concurrency:non-attribution")
    }),
  )

  it.instance("version:task_aggregation", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const parent = yield* session.create({ title: "parent" })
      const task = yield* session.create({ parentID: parent.id, lineageEdgeKind: "task_spawn", title: "task" })
      const lineage = yield* session.lineage(task.id)
      expect(lineage.rootID).toBe(parent.id)
      expect(lineage.descendants.some((d) => d.sessionID === task.id && d.edgeKind === "task_spawn")).toBe(true)
      green.add("version:task_aggregation")
    }),
  )

  it.instance("version:spawn_aggregation", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const parent = yield* session.create({ title: "parent" })
      const spawn = yield* session.create({ parentID: parent.id, title: "spawn" })
      const lineage = yield* session.lineage(spawn.id)
      expect(lineage.rootID).toBe(parent.id)
      expect(lineage.descendants.some((d) => d.sessionID === spawn.id && d.edgeKind === "session_spawn")).toBe(true)
      green.add("version:spawn_aggregation")
    }),
  )

  it.instance("version:fork_separation", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const parent = yield* session.create({ title: "source" })
      yield* session.create({ parentID: parent.id, title: "source child" })
      const fork = yield* session.fork({ sessionID: parent.id })
      const lineage = yield* session.lineage(fork.id)
      // A fork is its own root and inherits no descendants.
      expect(lineage.rootID).toBe(fork.id)
      expect(lineage.descendants).toEqual([])
      green.add("version:fork_separation")
    }),
  )

  it.instance("version:child_archival", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const root = yield* session.create({ title: "root" })
      const child = yield* session.create({ parentID: root.id, title: "child" })
      yield* session.setArchived({ sessionID: child.id, time: 1 })
      expect((yield* session.lineage(root.id)).descendants).toEqual([])
      green.add("version:child_archival")
    }),
  )

  it.instance("version:child_deletion", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const root = yield* session.create({ title: "root" })
      const child = yield* session.create({
        parentID: root.id,
        title: "child",
        metadata: { private: "do not retain" },
      })
      yield* session.setArchived({ sessionID: child.id, time: 1 })
      yield* session.remove(child.id)
      const lineage = yield* session.lineage(root.id, { retainedOrigins: true })
      const retained = lineage.retainedOrigins.find((o) => o.sessionID === child.id)
      // Only the root-owned origin projection is retained — no private metadata survives.
      expect(retained?.title).toBe("child")
      expect(retained).not.toHaveProperty("metadata")
      green.add("version:child_deletion")
    }),
  )

  it.instance("version:legacy_session", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const database = yield* Database.Service
      const legacy = yield* session.create({ title: "before rollout" })
      yield* database.db.delete(SessionLineageTable).where(eq(SessionLineageTable.session_id, legacy.id)).run()
      const lineage = yield* session.lineage(legacy.id)
      expect(lineage.mode).toBe("legacy")
      expect(lineage.rootID).toBeUndefined()
      green.add("version:legacy_session")
    }),
  )

  it.instance("version:upgrade_epoch", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const database = yield* Database.Service
      const legacy = yield* session.create({ title: "before" })
      yield* database.db.delete(SessionLineageTable).where(eq(SessionLineageTable.session_id, legacy.id)).run()
      yield* session.beginPartialLineage(legacy.id, 42)
      const after = yield* session.create({ parentID: legacy.id, title: "tracked" })
      const lineage = yield* session.lineage(after.id)
      // The epoch tracks spawns after the boundary as partial; pre-epoch history is never backfilled.
      expect(lineage.mode).toBe("partial")
      expect(lineage.rootID).toBe(legacy.id)
      expect(lineage.descendants.some((d) => d.sessionID === after.id && d.mode === "partial")).toBe(true)
      green.add("version:upgrade_epoch")
    }),
  )
})

// ── The engine-subset gate (AC8) + composition with the #1083 release evaluator

describe("adversarial matrix — the release gate (AC8)", () => {
  test("every required engine case ran green — all_required_passed, enablement STILL off", () => {
    const result = ProvenanceMatrix.gate(engine, green)
    expect(result.missingRequired).toEqual([])
    expect(result.all_required_passed).toBe(true)
    // AC8: the matrix reports readiness only — it NEVER flips default enablement (human-only).
    expect(result.defaultEnablement).toBe("off")
  })

  test("dropping any one required engine case blocks the gate", () => {
    const dropped = ProvenanceMatrix.requiredCaseIDs(engine)[0]
    const minusOne = new Set(green)
    minusOne.delete(dropped)
    const result = ProvenanceMatrix.gate(engine, minusOne)
    expect(result.all_required_passed).toBe(false)
    expect(result.missingRequired).toContain(dropped)
  })

  test("the green engine matrix IDs satisfy the #1083 SessionRollout.Release evaluator (enablement off)", () => {
    const mandatory = { rehearsalCaseIDs: ["upgrade"], matrixCaseIDs: ProvenanceMatrix.requiredCaseIDs(engine) }
    const parsed = SessionRollout.Release.parse({
      forkTag: "opencode-v1.18.12-amicode.3",
      binaryChecksums: { "darwin-arm64": "sha256:aaa" },
      lockPin: "opencode.lock:deadbeef",
      extensionVersion: "0.0.3",
      overlayProvenance: { verified: true },
      rehearsalCaseIDs: ["upgrade"],
      matrixCaseIDs: [...green],
      completion: { forkAt: 100, binaryPinAt: 200, extensionAt: 300 },
      gates: [{ id: "matrix", required: true, passed: true }],
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const readiness = SessionRollout.Release.evaluate(parsed.manifest, mandatory)
    expect(readiness.ready).toBe(true)
    expect(readiness.defaultEnablement).toBe("off")
    // A missing matrix case blocks the release evaluator too.
    const short = SessionRollout.Release.parse({ ...parsed.manifest, matrixCaseIDs: [...green].slice(1) })
    if (short.ok) expect(SessionRollout.Release.evaluate(short.manifest, mandatory).ready).toBe(false)
  })
})

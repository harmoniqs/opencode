import { describe, expect, test } from "bun:test"
import { SessionMutation } from "@/session/mutation"
import { SessionUserMutation } from "@/session/user-mutation"

const lineage = (rootID: string, sessionID: string) => (candidate: string) =>
  candidate === sessionID ? rootID : undefined

const gateFor = (input: {
  rootForSession: (sessionID: string) => string | undefined
  now?: () => number
  operations?: SessionMutation.OperationStore
}) =>
  SessionMutation.create({
    rootForSession: input.rootForSession,
    now: input.now ?? (() => 10),
    operations: input.operations ?? SessionMutation.OperationStore.memory(),
  })

/** A host provider that resolves display targets to stable physical identities and applies every write. */
const hostProvider = (record?: (id: string) => void): SessionUserMutation.HostProvider => ({
  capabilities: { safeResolve: true, noFollowWrite: true },
  resolveTarget: (display) => ({ value: `local:existing:1:${display}`, kind: display.endsWith("/") ? "directory" : "file" }),
  safeResolve: (endpoint) => endpoint,
  execute: (resource) => {
    record?.(resource.id)
    return "applied"
  },
})

const snapshot = (over?: Partial<SessionUserMutation.PanelSnapshot>): SessionUserMutation.PanelSnapshot => ({
  panelID: "panel-sidebar",
  sessionID: "session-1",
  rootID: "root-1",
  origin: "user",
  ...over,
})

const full: SessionUserMutation.Capability = { mode: "full", version: 1 }

describe("session user-mutation registry", () => {
  test("registers user sidebar, preview, and review routes as ledger writers and bumps the manifest version", () => {
    for (const routeID of ["user-sidebar-op", "user-preview-edit", "user-review-edit"] as const)
      expect(SessionMutation.Registry.require(routeID)).toEqual({ id: routeID, kind: "ledger" })
    expect(SessionUserMutation.Routes).toEqual({
      sidebar: "user-sidebar-op",
      preview: "user-preview-edit",
      review: "user-review-edit",
    })
    // The registry version advances so mixed clients negotiate the same generation.
    expect(SessionMutation.Registry.manifest().version).toBeGreaterThanOrEqual(4)
  })
})

describe("session user-mutation capability discovery", () => {
  test("resolves full, partial, legacy, and unavailable outcomes deterministically", () => {
    expect(SessionUserMutation.Capability.discover({ supported: [1], requested: 1, hostReachable: true, sessionEpoch: "full" })).toEqual({
      mode: "full",
      version: 1,
    })
    expect(
      SessionUserMutation.Capability.discover({ supported: [1], requested: 1, hostReachable: true, sessionEpoch: "post_upgrade" }),
    ).toEqual({ mode: "partial", version: 1, label: "post_upgrade_partial" })
    // Server does not advertise a supported generation -> legacy display with a visible label.
    expect(
      SessionUserMutation.Capability.discover({ supported: [1], requested: 2, hostReachable: true, sessionEpoch: "full" }),
    ).toEqual({ mode: "legacy", label: "legacy" })
    // No host mediation reachable at all -> unavailable, never a silent untracked mutation.
    expect(
      SessionUserMutation.Capability.discover({ supported: [1], requested: 1, hostReachable: false, sessionEpoch: "full" }),
    ).toEqual({ mode: "unavailable" })
  })
})

describe("session user-mutation origin", () => {
  test("keeps user receipts distinguishable from agent, child-agent, and system", () => {
    expect(SessionUserMutation.distinguish("user")).toBe("user")
    expect(SessionUserMutation.distinguish("agent")).toBe("agent")
    expect(SessionUserMutation.distinguish("child_agent")).toBe("child_agent")
    expect(SessionUserMutation.distinguish("system")).toBe("system")
    expect(SessionUserMutation.distinguish("mystery")).toBeUndefined()
    // A user route mediated with a non-user origin snapshot is refused before any storage work.
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })
    let writes = 0
    const result = SessionUserMutation.mediate({
      intent: { operation: "create", panel: "sidebar", target: { display: "notes.md" }, idempotencyKey: "op-origin" },
      capability: full,
      snapshot: snapshot({ origin: "agent" }),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: hostProvider(() => writes++),
    })
    expect(result).toEqual({ kind: "denied", reason: "non_user_origin" })
    expect(writes).toBe(0)
  })
})

describe("session user-mutation intent transport", () => {
  test("the browser intent and the display-safe result never carry host-only paths, hashes, evidence, or capabilities", () => {
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })
    const intent: SessionUserMutation.MutationIntent = {
      operation: "create",
      panel: "sidebar",
      target: { display: "notes.md" },
      idempotencyKey: "op-transport",
    }
    // The intent shape carries only display-safe user selections.
    expect(Object.keys(intent).sort()).toEqual(["idempotencyKey", "operation", "panel", "target"])
    expect(JSON.stringify(intent)).not.toContain("local:existing")

    const result = SessionUserMutation.mediate({
      intent,
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: hostProvider(),
    })
    // Only display-safe operation facts survive; the physical endpoint identity never leaves the host.
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("local:existing")
    expect(serialized).not.toContain("panel-sidebar")
    expect(serialized).not.toContain("root-1")
    expect(result).toMatchObject({ kind: "applied" })
  })
})

describe("session user-mutation panel and session binding", () => {
  test("binds the initiating panel and active session snapshot before any storage work begins", () => {
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })
    const order: string[] = []
    const result = SessionUserMutation.mediate({
      intent: { operation: "create", panel: "sidebar", target: { display: "notes.md" }, idempotencyKey: "op-bind" },
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: {
        capabilities: { safeResolve: true, noFollowWrite: true },
        resolveTarget: (display) => {
          order.push(`resolve:${display}`)
          return { value: `local:existing:1:${display}`, kind: "file" }
        },
        safeResolve: (endpoint) => endpoint,
        execute: (resource) => {
          order.push(`write:${resource.id}`)
          return "applied"
        },
      },
    })
    expect(result).toMatchObject({ kind: "applied", panel: "sidebar" })
    // Identity is resolved (bound) before the write is executed.
    expect(order).toEqual(["resolve:notes.md", "write:target"])

    // A snapshot whose session is not the active lineage root is refused, never mis-attributed.
    expect(
      SessionUserMutation.mediate({
        intent: { operation: "create", panel: "sidebar", target: { display: "notes.md" }, idempotencyKey: "op-bind-2" },
        capability: full,
        snapshot: snapshot({ rootID: "root-mismatch" }),
        rootForSession: lineage("root-1", "session-1"),
        gate,
        provider: hostProvider(),
      }),
    ).toEqual({ kind: "denied", reason: "context_unavailable" })
  })
})

describe("session user-mutation sidebar operations", () => {
  test("create, move, trash, restore, directory, and recursive operations run through a registered group context", () => {
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })
    const provider = hostProvider()

    const create = SessionUserMutation.mediate({
      intent: { operation: "create", panel: "sidebar", target: { display: "notes.md" }, idempotencyKey: "op-create" },
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider,
    })
    expect(create).toMatchObject({ kind: "applied", resources: [{ operation: "write", role: "target", outcome: "applied" }] })

    const move = SessionUserMutation.mediate({
      intent: {
        operation: "move",
        panel: "sidebar",
        target: { display: "notes.md" },
        destination: { display: "archive/notes.md" },
        idempotencyKey: "op-move",
      },
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider,
    })
    expect(move).toMatchObject({
      kind: "applied",
      resources: [
        { operation: "move", role: "source", outcome: "applied" },
        { operation: "move", role: "destination", outcome: "applied" },
      ],
    })

    for (const operation of ["trash", "restore"] as const) {
      const result = SessionUserMutation.mediate({
        intent: {
          operation,
          panel: "sidebar",
          target: { display: "notes.md" },
          destination: { display: `${operation}/notes.md` },
          idempotencyKey: `op-${operation}`,
        },
        capability: full,
        snapshot: snapshot(),
        rootForSession: lineage("root-1", "session-1"),
        gate,
        provider,
      })
      expect(result).toMatchObject({ kind: "applied" })
    }

    const directory = SessionUserMutation.mediate({
      intent: { operation: "directory", panel: "sidebar", target: { display: "new-folder/" }, idempotencyKey: "op-dir" },
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider,
    })
    expect(directory).toMatchObject({
      kind: "applied",
      resources: [{ operation: "create_parent", role: "implicit_parent", outcome: "applied" }],
    })

    const recursive = SessionUserMutation.mediate({
      intent: {
        operation: "recursive_delete",
        panel: "sidebar",
        targets: [{ display: "dir/a.md" }, { display: "dir/b.md" }],
        idempotencyKey: "op-recursive",
        recursive: { maxResources: 8 },
      },
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider,
    })
    expect(recursive).toMatchObject({
      kind: "applied",
      resources: [
        { operation: "delete", role: "target", outcome: "applied" },
        { operation: "delete", role: "target", outcome: "applied" },
      ],
    })
  })

  test("a recursive operation over its resource budget fails closed before mutation instead of silently omitting descendants", () => {
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })
    let writes = 0
    const result = SessionUserMutation.mediate({
      intent: {
        operation: "recursive_delete",
        panel: "sidebar",
        targets: [{ display: "dir/a.md" }, { display: "dir/b.md" }],
        idempotencyKey: "op-over-budget",
        recursive: { maxResources: 1 },
      },
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: hostProvider(() => writes++),
    })
    expect(result).toEqual({ kind: "denied", reason: "resource_budget_exceeded" })
    expect(writes).toBe(0)
  })
})

describe("session user-mutation preview and review editing", () => {
  test("preview and files-changed editing cannot bypass host-mediated context validation", () => {
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })
    for (const panel of ["preview", "review"] as const) {
      const provider = hostProvider()
      const applied = SessionUserMutation.mediate({
        intent: { operation: "edit", panel, target: { display: "src/app.ts" }, idempotencyKey: `op-edit-${panel}` },
        capability: full,
        snapshot: snapshot({ panelID: `panel-${panel}` }),
        rootForSession: lineage("root-1", "session-1"),
        gate,
        provider,
      })
      expect(applied).toMatchObject({ kind: "applied", panel, resources: [{ operation: "edit", role: "target" }] })

      // An editing route whose target cannot be resolved to a physical identity denies before mutation.
      let writes = 0
      const denied = SessionUserMutation.mediate({
        intent: { operation: "edit", panel, target: { display: "src/ghost.ts" }, idempotencyKey: `op-edit-ghost-${panel}` },
        capability: full,
        snapshot: snapshot({ panelID: `panel-${panel}` }),
        rootForSession: lineage("root-1", "session-1"),
        gate,
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          resolveTarget: () => undefined,
          safeResolve: (endpoint) => endpoint,
          execute: () => {
            writes++
            return "applied"
          },
        },
      })
      expect(denied).toEqual({ kind: "denied", reason: "unresolved_target" })
      expect(writes).toBe(0)
    }
  })
})

describe("session user-mutation capability gating", () => {
  test("legacy preserves existing behavior with a visible label and creates no ledger context", () => {
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })
    let writes = 0
    const result = SessionUserMutation.mediate({
      intent: { operation: "create", panel: "sidebar", target: { display: "notes.md" }, idempotencyKey: "op-legacy" },
      capability: { mode: "legacy", label: "legacy" },
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: hostProvider(() => writes++),
    })
    expect(result).toEqual({ kind: "legacy", label: "legacy" })
    // Legacy display selection performs no ledger-mediated storage work here.
    expect(writes).toBe(0)
  })

  test("a partial epoch mediates through the ledger but stamps the labelled post-upgrade epoch", () => {
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })
    const result = SessionUserMutation.mediate({
      intent: { operation: "create", panel: "sidebar", target: { display: "notes.md" }, idempotencyKey: "op-partial" },
      capability: { mode: "partial", version: 1, label: "post_upgrade_partial" },
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: hostProvider(),
    })
    expect(result).toMatchObject({ kind: "applied", epoch: "post_upgrade_partial" })
  })

  test("an unavailable capability denies without falling back to an untracked mutation", () => {
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })
    let writes = 0
    const result = SessionUserMutation.mediate({
      intent: { operation: "create", panel: "sidebar", target: { display: "notes.md" }, idempotencyKey: "op-unavailable" },
      capability: { mode: "unavailable" },
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: hostProvider(() => writes++),
    })
    expect(result).toEqual({ kind: "denied", reason: "unavailable" })
    expect(writes).toBe(0)
  })
})

describe("session user-mutation operation-group contract", () => {
  test("an invalid mutation context denies before mutation instead of an untracked write", () => {
    // Full mode, but the active lineage no longer maps the session to the snapshot root.
    const gate = gateFor({ rootForSession: () => "root-live" })
    let writes = 0
    const result = SessionUserMutation.mediate({
      intent: { operation: "create", panel: "sidebar", target: { display: "notes.md" }, idempotencyKey: "op-invalid" },
      capability: full,
      snapshot: snapshot({ rootID: "root-stale" }),
      rootForSession: () => "root-live",
      gate,
      provider: hostProvider(() => writes++),
    })
    expect(result).toEqual({ kind: "denied", reason: "context_unavailable" })
    expect(writes).toBe(0)
  })

  test("an exact idempotent retry returns the recorded operation-group result without a second mutation", () => {
    const operations = SessionMutation.OperationStore.memory()
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1"), operations })
    let writes = 0
    const intent: SessionUserMutation.MutationIntent = {
      operation: "create",
      panel: "sidebar",
      target: { display: "notes.md" },
      idempotencyKey: "op-idempotent",
    }
    const first = SessionUserMutation.mediate({
      intent,
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: hostProvider(() => writes++),
    })
    expect(first).toMatchObject({ kind: "applied" })
    expect(writes).toBe(1)

    const retry = SessionUserMutation.mediate({
      intent,
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: hostProvider(() => writes++),
    })
    expect(retry).toEqual(first)
    expect(writes).toBe(1)
  })

  test("a preflight failure applies no resources and an execution failure returns explicit partial outcomes", () => {
    const gate = gateFor({ rootForSession: lineage("root-1", "session-1") })

    // Preflight: the second resource fails safe-resolution before any write -> nothing applied.
    let preflightWrites = 0
    const preflight = SessionUserMutation.mediate({
      intent: {
        operation: "recursive_delete",
        panel: "sidebar",
        targets: [{ display: "dir/a.md" }, { display: "dir/b.md" }],
        idempotencyKey: "op-preflight",
        recursive: { maxResources: 8 },
      },
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: {
        capabilities: { safeResolve: true, noFollowWrite: true },
        resolveTarget: (display) => ({ value: `local:existing:1:${display}`, kind: "file" }),
        safeResolve: (endpoint) => (endpoint.value.endsWith("dir/b.md") ? undefined : endpoint),
        execute: () => {
          preflightWrites++
          return "applied"
        },
      },
    })
    expect(preflight).toMatchObject({ kind: "failed" })
    expect(preflight).toMatchObject({ resources: [{ outcome: "not_started" }, { outcome: "not_started" }] })
    expect(preflightWrites).toBe(0)

    // Execution: the first write applies, the second fails -> explicit partial with truthful per-resource outcomes.
    const partial = SessionUserMutation.mediate({
      intent: {
        operation: "recursive_delete",
        panel: "sidebar",
        targets: [{ display: "dir/a.md" }, { display: "dir/b.md" }],
        idempotencyKey: "op-partial-exec",
        recursive: { maxResources: 8 },
      },
      capability: full,
      snapshot: snapshot(),
      rootForSession: lineage("root-1", "session-1"),
      gate,
      provider: {
        capabilities: { safeResolve: true, noFollowWrite: true },
        resolveTarget: (display) => ({ value: `local:existing:1:${display}`, kind: "file" }),
        safeResolve: (endpoint) => endpoint,
        execute: (resource) => (resource.id === "target-1" ? "failed" : "applied"),
      },
    })
    expect(partial).toMatchObject({
      kind: "partial",
      resources: [
        { role: "target", outcome: "applied" },
        { role: "target", outcome: "failed" },
      ],
    })
  })
})

describe("session user-mutation watcher revalidation", () => {
  test("watchers revalidate only server-owned receipt references and cannot determine ownership or lifecycle locally", () => {
    const known = new Map<string, number>([
      ["receipt-a", 1],
      ["receipt-b", 4],
    ])
    // An advanced assessment revision on a known receipt emits invalidation only.
    expect(SessionUserMutation.Watcher.revalidate(known, { receiptRef: "receipt-a", assessmentRevision: 2 })).toEqual({
      kind: "invalidate",
      receiptRef: "receipt-a",
    })
    // A stale or equal revision is ignored — the watcher never rewrites lifecycle.
    expect(SessionUserMutation.Watcher.revalidate(known, { receiptRef: "receipt-b", assessmentRevision: 4 })).toEqual({
      kind: "ignore",
    })
    // An unknown reference cannot be adopted or attributed locally.
    expect(SessionUserMutation.Watcher.revalidate(known, { receiptRef: "unowned", assessmentRevision: 9 })).toEqual({
      kind: "ignore",
    })
    // The watcher signal vocabulary is references and revisions only — no ownership, paths, hashes, or evidence.
    const signal: SessionUserMutation.Watcher.Signal = { receiptRef: "receipt-a", assessmentRevision: 3 }
    expect(Object.keys(signal).sort()).toEqual(["assessmentRevision", "receiptRef"])
  })
})

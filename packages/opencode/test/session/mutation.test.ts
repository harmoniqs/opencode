import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { SessionMutation } from "@/session/mutation"

const localProvider = (run: () => SessionMutation.Result): SessionMutation.LocalProvider => ({
  capabilities: { safeResolve: true, noFollowWrite: true },
  safeResolve: (endpoint) => endpoint,
  noFollowWrite: () => run(),
})

const mutationGate = (input: {
  rootForSession: (sessionID: string) => string | undefined
  now: () => number
  operations?: SessionMutation.OperationStore
}) =>
  SessionMutation.create({
    ...input,
    operations: input.operations ?? SessionMutation.OperationStore.memory(),
  })

describe("session mutation registry", () => {
  test("classifies every registered route before storage is available", () => {
    expect(SessionMutation.Registry.manifest()).toEqual({
      version: 1,
      routes: [
        { id: "local-file-write", kind: "ledger" },
        { id: "shell-action", kind: "opaque" },
        { id: "mcp-action", kind: "opaque" },
        { id: "custom-tool-action", kind: "opaque" },
        { id: "ledger-infrastructure", kind: "out_of_scope" },
      ],
    })
    expect(SessionMutation.Registry.require("unregistered-storage-route")).toBeUndefined()
    const gate = mutationGate({ rootForSession: () => "root", now: () => 10 })
    expect(
      gate.issue({
        kind: "local",
        routeID: "unregistered-storage-route",
        panelID: "panel",
        sessionID: "session",
        rootID: "root",
        origin: "agent",
        operation: "write",
        source: { value: "provider:1", kind: "file" },
        expiresAt: 20,
      }),
    ).toBeUndefined()
  })

  test("denies an uncontextualized protected write before invoking storage", () => {
    const gate = mutationGate({ rootForSession: () => "root", now: () => 10 })
    let writes = 0

    expect(
      gate.executeLocal({
        request: {
          routeID: "local-file-write",
          panelID: "panel",
          sessionID: "session",
          rootID: "root",
          origin: "agent",
          operation: "write",
          operationID: "operation",
          source: { value: "provider:1", kind: "file" },
        },
        provider: localProvider(() => {
          writes++
          return { groupID: "operation", outcome: "applied" }
        }),
      }),
    ).toEqual({ kind: "denied", reason: "missing_context" })
    expect(writes).toBe(0)
  })

  test("binds a local context to one authenticated panel, session root, operation, and endpoint", () => {
    const gate = mutationGate({
      rootForSession: (sessionID) => (sessionID === "session" ? "root" : undefined),
      now: () => 10,
    })
    const source = { value: "provider:1", kind: "file" } as const
    const destination = { value: "provider:2", kind: "file" } as const
    const context = gate.issue({
      kind: "local",
      routeID: "local-file-write",
      panelID: "panel",
      sessionID: "session",
      rootID: "root",
      origin: "agent",
      operation: "write",
      source,
      destination,
      expiresAt: 20,
    })

    expect(context).toBeDefined()
    expect(JSON.stringify(context)).toBe("{}")
    expect(
      gate.executeLocal({
        context,
        request: {
          routeID: "local-file-write",
          panelID: "panel",
          sessionID: "session",
          rootID: "root",
          origin: "agent",
          operation: "write",
          operationID: "operation",
          source,
          destination,
        },
        provider: localProvider(() => ({ groupID: "operation", outcome: "applied" })),
      }),
    ).toEqual({ kind: "executed", result: { groupID: "operation", outcome: "applied" } })
  })

  test("denies expired, revoked, wrong-owner, and wrong-endpoint contexts before storage", () => {
    let now = 10
    const source = { value: "provider:1", kind: "file" } as const
    const request = {
      routeID: "local-file-write" as const,
      panelID: "panel",
      sessionID: "session",
      rootID: "root",
      origin: "agent",
      operation: "write",
      operationID: "operation",
      source,
    }
    const setup = () => {
      const gate = mutationGate({ rootForSession: () => "root", now: () => now })
      const context = gate.issue({ kind: "local", ...request, expiresAt: 20 })!
      return { gate, context }
    }
    const cases = [
      {
        name: "expired",
        run: () => {
          const { gate, context } = setup()
          now = 20
          return gate.executeLocal({
            context,
            request,
            provider: localProvider(() => ({ groupID: "operation", outcome: "applied" })),
          })
        },
      },
      {
        name: "revoked",
        run: () => {
          now = 10
          const { gate, context } = setup()
          gate.revoke(context)
          return gate.executeLocal({
            context,
            request,
            provider: localProvider(() => ({ groupID: "operation", outcome: "applied" })),
          })
        },
      },
      {
        name: "wrong panel",
        run: () => {
          now = 10
          const { gate, context } = setup()
          return gate.executeLocal({
            context,
            request: { ...request, panelID: "other-panel" },
            provider: localProvider(() => ({ groupID: "operation", outcome: "applied" })),
          })
        },
      },
      {
        name: "wrong session",
        run: () => {
          now = 10
          const { gate, context } = setup()
          return gate.executeLocal({
            context,
            request: { ...request, sessionID: "other-session" },
            provider: localProvider(() => ({ groupID: "operation", outcome: "applied" })),
          })
        },
      },
      {
        name: "wrong endpoint",
        run: () => {
          now = 10
          const { gate, context } = setup()
          return gate.executeLocal({
            context,
            request: { ...request, source: { value: "provider:2", kind: "file" } },
            provider: localProvider(() => ({ groupID: "operation", outcome: "applied" })),
          })
        },
      },
    ]

    for (const item of cases)
      expect(item.run()).toEqual({
        kind: "denied",
        reason: item.name === "expired" ? "expired_context" : "invalid_context",
      })
  })

  test("replays an exact root-bound operation result without a second mutation and rejects changed replays", () => {
    const gate = mutationGate({ rootForSession: () => "root", now: () => 10 })
    const source = { value: "provider:1", kind: "file" } as const
    const request = {
      routeID: "local-file-write" as const,
      panelID: "panel",
      sessionID: "session",
      rootID: "root",
      origin: "agent",
      operation: "write",
      operationID: "operation",
      source,
    }
    const context = gate.issue({ kind: "local", ...request, expiresAt: 20 })!
    let writes = 0

    expect(
      gate.executeLocal({
        context,
        request,
        provider: localProvider(() => ({ groupID: "operation", outcome: `${++writes}` })),
      }),
    ).toEqual({ kind: "executed", result: { groupID: "operation", outcome: "1" } })
    expect(
      gate.executeLocal({
        context,
        request,
        provider: localProvider(() => ({ groupID: "operation", outcome: `${++writes}` })),
      }),
    ).toEqual({ kind: "replayed", result: { groupID: "operation", outcome: "1" } })
    expect(writes).toBe(1)

    const changedContext = gate.issue({ kind: "local", ...request, operation: "delete", expiresAt: 20 })!
    expect(
      gate.executeLocal({
        context: changedContext,
        request: { ...request, operation: "delete" },
        provider: localProvider(() => ({ groupID: "operation", outcome: `${++writes}` })),
      }),
    ).toEqual({ kind: "denied", reason: "invalid_replay" })
    expect(writes).toBe(1)
  })

  test("uses root-owned operation storage so retries survive a gate restart", () => {
    const operations = SessionMutation.OperationStore.memory()
    const source = { value: "provider:1", kind: "file" } as const
    const request = {
      routeID: "local-file-write" as const,
      panelID: "panel",
      sessionID: "session",
      rootID: "root",
      origin: "agent",
      operation: "write",
      operationID: "operation",
      source,
    }
    const first = mutationGate({ rootForSession: () => "root", now: () => 10, operations })
    const firstContext = first.issue({ kind: "local", ...request, expiresAt: 20 })!
    let writes = 0
    expect(
      first.executeLocal({
        context: firstContext,
        request,
        provider: localProvider(() => ({ groupID: "operation", outcome: `${++writes}` })),
      }),
    ).toEqual({ kind: "executed", result: { groupID: "operation", outcome: "1" } })

    const restarted = mutationGate({ rootForSession: () => "root", now: () => 10, operations })
    const restartedContext = restarted.issue({ kind: "local", ...request, expiresAt: 20 })!
    expect(
      restarted.executeLocal({
        context: restartedContext,
        request,
        provider: localProvider(() => ({ groupID: "operation", outcome: `${++writes}` })),
      }),
    ).toEqual({ kind: "replayed", result: { groupID: "operation", outcome: "1" } })
    expect(writes).toBe(1)
  })

  test("confines opaque contexts to an operation-level unknown receipt", () => {
    const gate = mutationGate({ rootForSession: () => "root", now: () => 10 })
    expect(
      gate.issue({
        kind: "opaque",
        routeID: "shell-action",
        panelID: "panel",
        sessionID: "session",
        rootID: "root",
        origin: "agent",
        operation: "shell",
        source: { value: "provider:1", kind: "file" },
        expiresAt: 20,
      }),
    ).toBeUndefined()
    const opaque = gate.issue({
      kind: "opaque",
      routeID: "shell-action",
      panelID: "panel",
      sessionID: "session",
      rootID: "root",
      origin: "agent",
      operation: "shell",
      expiresAt: 20,
    })!
    let writes = 0

    expect(
      gate.executeLocal({
        context: opaque,
        request: {
          routeID: "local-file-write",
          panelID: "panel",
          sessionID: "session",
          rootID: "root",
          origin: "agent",
          operation: "write",
          operationID: "local-operation",
          source: { value: "provider:1", kind: "file" },
        },
        provider: localProvider(() => {
          writes++
          return { groupID: "local-operation", outcome: "applied" }
        }),
      }),
    ).toEqual({ kind: "denied", reason: "invalid_context" })
    expect(writes).toBe(0)

    const result = gate.executeOpaque({
      context: opaque,
      request: {
        routeID: "shell-action",
        panelID: "panel",
        sessionID: "session",
        rootID: "root",
        origin: "agent",
        operation: "shell",
        operationID: "opaque-operation",
      },
    })
    expect(result).toEqual({
      kind: "executed",
      result: {
        groupID: "opaque-operation",
        outcome: "unknown",
        receipt: {
          kind: "unknown_mutation",
          operationID: "opaque-operation",
          origin: "agent",
          operation: "shell",
        },
      },
    })
    expect(result.kind === "executed" && result.result.receipt).not.toHaveProperty("resource")
    expect(result.kind === "executed" && result.result.receipt).not.toHaveProperty("patch")
  })

  test("denies known local mutation when a provider cannot guarantee safe resolution and no-follow writes", () => {
    const gate = mutationGate({ rootForSession: () => "root", now: () => 10 })
    const source = { value: "provider:1", kind: "file" } as const
    const request = {
      routeID: "local-file-write" as const,
      panelID: "panel",
      sessionID: "session",
      rootID: "root",
      origin: "agent",
      operation: "write",
      operationID: "operation",
      source,
    }
    const context = gate.issue({ kind: "local", ...request, expiresAt: 20 })!
    let accessed = false

    expect(
      gate.executeLocal({
        context,
        request,
        provider: {
          capabilities: { safeResolve: false, noFollowWrite: false },
          safeResolve: () => {
            accessed = true
            return source
          },
          noFollowWrite: () => {
            accessed = true
            return { groupID: "operation", outcome: "applied" }
          },
        },
      }),
    ).toEqual({ kind: "denied", reason: "unsafe_provider" })
    expect(accessed).toBe(false)
  })

  test("re-resolves bound local identities and delegates the write through the provider's no-follow gate", () => {
    const gate = mutationGate({ rootForSession: () => "root", now: () => 10 })
    const source = { value: "provider:1", kind: "file" } as const
    const request = {
      routeID: "local-file-write" as const,
      panelID: "panel",
      sessionID: "session",
      rootID: "root",
      origin: "agent",
      operation: "write",
      operationID: "operation",
      source,
    }
    const context = gate.issue({ kind: "local", ...request, expiresAt: 20 })!
    let resolves = 0
    let writes = 0
    let verified: { source: SessionMutation.Endpoint; destination?: SessionMutation.Endpoint } | undefined

    expect(
      gate.executeLocal({
        context,
        request,
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          safeResolve: (endpoint) => {
            resolves++
            return endpoint
          },
          noFollowWrite: (input) => {
            verified = input
            return { groupID: "operation", outcome: `${++writes}` }
          },
        },
      }),
    ).toEqual({ kind: "executed", result: { groupID: "operation", outcome: "1" } })
    expect(resolves).toBe(1)
    expect(writes).toBe(1)
    expect(verified).toEqual({ source })
  })

  test("fails closed when a symlink-race re-resolution changes the physical identity", () => {
    const gate = mutationGate({ rootForSession: () => "root", now: () => 10 })
    const source = { value: "local:existing:1:1", kind: "file" } as const
    const request = {
      routeID: "local-file-write" as const,
      panelID: "panel",
      sessionID: "session",
      rootID: "root",
      origin: "agent",
      operation: "write",
      operationID: "operation",
      source,
    }
    const context = gate.issue({ kind: "local", ...request, expiresAt: 20 })!
    let writes = 0

    expect(
      gate.executeLocal({
        context,
        request,
        provider: {
          capabilities: { safeResolve: true, noFollowWrite: true },
          safeResolve: () => ({ value: "local:existing:1:2", kind: "file" }),
          noFollowWrite: () => {
            writes++
            return { groupID: "operation", outcome: "applied" }
          },
        },
      }),
    ).toEqual({ kind: "denied", reason: "identity_changed" })
    expect(writes).toBe(0)
  })

  test("canonicalizes existing aliases and nonexistent leaves without retaining path strings", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "opencode-mutation-identity-"))
    try {
      const target = path.join(directory, "target.txt")
      const alias = path.join(directory, "alias.txt")
      writeFileSync(target, "target")
      symlinkSync(target, alias)

      const existing = SessionMutation.ResourceIdentity.resolve(target, "file")
      const linked = SessionMutation.ResourceIdentity.resolve(alias, "file")
      const missing = SessionMutation.ResourceIdentity.resolve(path.join(directory, "new.txt"), "file")

      expect(linked).toEqual(existing)
      expect(missing).toEqual(expect.objectContaining({ kind: "file" }))
      expect(missing?.value).not.toContain(directory)
      expect(missing?.value).toContain("missing")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("capability discovery selects legacy display only for unsupported protocol versions", () => {
    expect(SessionMutation.Capability.discover({ supported: [1], requested: 1 })).toEqual({ mode: "full", version: 1 })
    expect(SessionMutation.Capability.discover({ supported: [1], requested: 2 })).toEqual({ mode: "legacy" })
    expect(SessionMutation.Capability.discover({ supported: [], requested: 1 })).toEqual({ mode: "legacy" })
  })
})

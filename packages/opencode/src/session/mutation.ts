import { existsSync, statSync } from "node:fs"
import { basename, dirname, isAbsolute, join } from "node:path"

const contextHandle: unique symbol = Symbol("session-mutation-context")

export namespace SessionMutation {
  export type Route =
    | { id: "local-file-write"; kind: "ledger" }
    | { id: "shell-action" | "mcp-action" | "custom-tool-action"; kind: "opaque" }
    | { id: "ledger-infrastructure"; kind: "out_of_scope" }

  const routes = [
    { id: "local-file-write", kind: "ledger" },
    { id: "shell-action", kind: "opaque" },
    { id: "mcp-action", kind: "opaque" },
    { id: "custom-tool-action", kind: "opaque" },
    { id: "ledger-infrastructure", kind: "out_of_scope" },
  ] as const satisfies ReadonlyArray<Route>

  export namespace Registry {
    export const version = 1

    export function manifest() {
      return { version, routes: [...routes] }
    }

    export function require(id: string) {
      return routes.find((route) => route.id === id)
    }
  }

  export type Endpoint = { value: string; kind: "file" | "directory" }

  /**
   * Physical identity only. Paths are intentionally discarded before a context
   * is issued, so aliases and symlinks bind the same existing resource.
   */
  export namespace ResourceIdentity {
    export function resolve(input: string, kind: Endpoint["kind"]): Endpoint | undefined {
      try {
        const target = isAbsolute(input) ? input : join(process.cwd(), input)
        if (existsSync(target)) {
          const stat = statSync(target)
          if ((kind === "file" && !stat.isFile()) || (kind === "directory" && !stat.isDirectory())) return
          return { value: `local:existing:${stat.dev}:${stat.ino}`, kind }
        }
        const leaves: string[] = []
        let parent = target
        while (!existsSync(parent)) {
          leaves.unshift(basename(parent).normalize("NFC"))
          const next = dirname(parent)
          if (next === parent) return
          parent = next
        }
        const stat = statSync(parent)
        if (!stat.isDirectory() || leaves.length === 0) return
        return { value: `local:missing:${stat.dev}:${stat.ino}:${leaves.join("/")}:${kind}`, kind }
      } catch {
        return
      }
    }
  }

  export namespace Capability {
    export function discover(input: { supported: readonly number[]; requested: number }) {
      if (input.supported.includes(input.requested)) return { mode: "full" as const, version: input.requested }
      return { mode: "legacy" as const }
    }
  }

  export type Request = {
    routeID: string
    panelID: string
    sessionID: string
    rootID: string
    origin: string
    operation: string
    operationID: string
    source?: Endpoint
    destination?: Endpoint
  }

  export type Result = { groupID: string; outcome: string }
  export type UnknownReceipt = {
    kind: "unknown_mutation"
    operationID: string
    origin: string
    operation: string
  }
  export type OpaqueResult = { groupID: string; outcome: "unknown"; receipt: UnknownReceipt }
  export type OperationRecord = { fingerprint: string; result: Result | OpaqueResult }
  /** Root-owned #1076 operation storage; retention removes all keys for an expired root. */
  export type OperationStore = {
    get: (key: string) => OperationRecord | undefined
    set: (key: string, record: OperationRecord) => void
  }

  export namespace OperationStore {
    export function memory(): OperationStore {
      return new Map<string, OperationRecord>()
    }
  }

  export type LocalProvider = {
    capabilities: { safeResolve: boolean; noFollowWrite: boolean }
    safeResolve: (endpoint: Endpoint) => Endpoint | undefined
    noFollowWrite: (input: { source: Endpoint; destination?: Endpoint }) => Result | undefined
  }

  type StoredContext =
    | {
        kind: "local"
        routeID: "local-file-write"
        panelID: string
        sessionID: string
        rootID: string
        origin: string
        operation: string
        source: Endpoint
        destination?: Endpoint
        expiresAt: number
        idempotency: "exact"
      }
    | {
        kind: "opaque"
        routeID: "shell-action" | "mcp-action" | "custom-tool-action"
        panelID: string
        sessionID: string
        rootID: string
        origin: string
        operation: string
        expiresAt: number
        idempotency: "exact"
      }

  type Context = { readonly [contextHandle]: true }
  type Issue = Omit<Request, "operationID"> & { kind: StoredContext["kind"]; expiresAt: number }
  type OpaqueRequest = Omit<Request, "source" | "destination"> & {
    routeID: "shell-action" | "mcp-action" | "custom-tool-action"
  }
  export function create(input: {
    rootForSession: (sessionID: string) => string | undefined
    now: () => number
    operations: OperationStore
  }) {
    const contexts = new Map<Context, StoredContext>()
    const operations = input.operations

    const same = (left: Endpoint | undefined, right: Endpoint | undefined) =>
      left?.value === right?.value && left?.kind === right?.kind
    const operationKey = (rootID: string, operationID: string) => JSON.stringify([rootID, operationID])
    const fingerprint = (request: Request) =>
      JSON.stringify({
        routeID: request.routeID,
        operation: request.operation,
        source: request.source,
        destination: request.destination,
        rootID: request.rootID,
        origin: request.origin,
      })
    const validateLocal = (execution: { context?: Context; request: Request }) => {
      if (!execution.context) return { reason: "missing_context" as const }
      const context = contexts.get(execution.context)
      if (!context) return { reason: "invalid_context" as const }
      if (context.expiresAt <= input.now()) return { reason: "expired_context" as const }
      if (input.rootForSession(context.sessionID) !== context.rootID) return { reason: "invalid_context" as const }
      if (
        context.kind !== "local" ||
        execution.request.routeID !== context.routeID ||
        execution.request.panelID !== context.panelID ||
        execution.request.sessionID !== context.sessionID ||
        execution.request.rootID !== context.rootID ||
        execution.request.origin !== context.origin ||
        execution.request.operation !== context.operation ||
        !same(execution.request.source, context.source) ||
        !same(execution.request.destination, context.destination)
      )
        return { reason: "invalid_context" as const }
      return { context }
    }

    return {
      issue(request: Issue): Context | undefined {
        const route = Registry.require(request.routeID)
        if (!route || input.rootForSession(request.sessionID) !== request.rootID) return
        if (request.kind === "local") {
          if (route.kind !== "ledger" || !request.source) return
          const stored: StoredContext = {
            kind: "local",
            routeID: route.id,
            panelID: request.panelID,
            sessionID: request.sessionID,
            rootID: request.rootID,
            origin: request.origin,
            operation: request.operation,
            source: request.source,
            ...(request.destination ? { destination: request.destination } : {}),
            expiresAt: request.expiresAt,
            idempotency: "exact",
          }
          const context: Context = { [contextHandle]: true }
          contexts.set(context, stored)
          return context
        }
        if (route.kind !== "opaque") return
        if (request.source || request.destination) return
        const stored: StoredContext = {
          kind: "opaque",
          routeID: route.id,
          panelID: request.panelID,
          sessionID: request.sessionID,
          rootID: request.rootID,
          origin: request.origin,
          operation: request.operation,
          expiresAt: request.expiresAt,
          idempotency: "exact",
        }
        const context: Context = { [contextHandle]: true }
        contexts.set(context, stored)
        return context
      },
      revoke(context: Context) {
        return contexts.delete(context)
      },
      executeOpaque(execution: { context?: Context; request: OpaqueRequest }) {
        if (!execution.context) return { kind: "denied" as const, reason: "missing_context" as const }
        const context = contexts.get(execution.context)
        if (!context) return { kind: "denied" as const, reason: "invalid_context" as const }
        if (context.expiresAt <= input.now()) return { kind: "denied" as const, reason: "expired_context" as const }
        if (input.rootForSession(context.sessionID) !== context.rootID)
          return { kind: "denied" as const, reason: "invalid_context" as const }
        if (
          context.kind !== "opaque" ||
          execution.request.routeID !== context.routeID ||
          execution.request.panelID !== context.panelID ||
          execution.request.sessionID !== context.sessionID ||
          execution.request.rootID !== context.rootID ||
          execution.request.origin !== context.origin ||
          execution.request.operation !== context.operation
        )
          return { kind: "denied" as const, reason: "invalid_context" as const }
        const key = operationKey(context.rootID, execution.request.operationID)
        const normalized = fingerprint(execution.request)
        const previous = operations.get(key)
        if (previous && previous.fingerprint !== normalized)
          return { kind: "denied" as const, reason: "invalid_replay" as const }
        if (previous) return { kind: "replayed" as const, result: previous.result }
        const result: OpaqueResult = {
          groupID: execution.request.operationID,
          outcome: "unknown",
          receipt: {
            kind: "unknown_mutation",
            operationID: execution.request.operationID,
            origin: context.origin,
            operation: context.operation,
          },
        }
        operations.set(key, { fingerprint: normalized, result })
        return { kind: "executed" as const, result }
      },
      executeLocal(execution: { context?: Context; request: Request; provider: LocalProvider }) {
        const validation = validateLocal(execution)
        if ("reason" in validation) return { kind: "denied" as const, reason: validation.reason }
        const context = validation.context
        if (!execution.provider.capabilities.safeResolve || !execution.provider.capabilities.noFollowWrite)
          return { kind: "denied" as const, reason: "unsafe_provider" as const }
        const key = operationKey(context.rootID, execution.request.operationID)
        const normalized = fingerprint(execution.request)
        const previous = operations.get(key)
        if (previous && previous.fingerprint !== normalized)
          return { kind: "denied" as const, reason: "invalid_replay" as const }
        if (previous) return { kind: "replayed" as const, result: previous.result }
        if (!execution.request.source) return { kind: "denied" as const, reason: "invalid_context" as const }
        const source = execution.provider.safeResolve(execution.request.source)
        const destination =
          execution.request.destination && execution.provider.safeResolve(execution.request.destination)
        if (
          !source ||
          (context.destination && !destination) ||
          !same(source, context.source) ||
          !same(destination, context.destination)
        )
          return { kind: "denied" as const, reason: "identity_changed" as const }
        const result = execution.provider.noFollowWrite({
          source,
          ...(destination ? { destination } : {}),
        })
        if (!result) return { kind: "denied" as const, reason: "identity_changed" as const }
        operations.set(key, { fingerprint: normalized, result })
        return { kind: "executed" as const, result }
      },
    }
  }
}

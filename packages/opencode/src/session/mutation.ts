import { existsSync, statSync } from "node:fs"
import { basename, dirname, isAbsolute, join } from "node:path"

const contextHandle: unique symbol = Symbol("session-mutation-context")

export namespace SessionMutation {
  export type Route =
    | {
        id:
          | "local-file-write"
          | "tool-write"
          | "tool-edit"
          | "tool-apply-patch"
          | "direct-file-write"
          | "plugin-problem-record"
          | "runner-run-metadata"
          | "runner-artifact"
          | "user-sidebar-op"
          | "user-preview-edit"
          | "user-review-edit"
        kind: "ledger"
      }
    | { id: "shell-action" | "mcp-action" | "custom-tool-action" | "cli-action"; kind: "opaque" }
    | {
        id:
          | "ledger-infrastructure"
          | "credential-store"
          | "cache-store"
          | "queue-store"
          | "updater-state"
          | "telemetry-store"
          | "retention-state"
        kind: "out_of_scope"
      }

  export type LedgerRouteID = Extract<Route, { kind: "ledger" }>["id"]
  export type OpaqueRouteID = Extract<Route, { kind: "opaque" }>["id"]

  const routes = [
    { id: "local-file-write", kind: "ledger" },
    { id: "tool-write", kind: "ledger" },
    { id: "tool-edit", kind: "ledger" },
    { id: "tool-apply-patch", kind: "ledger" },
    { id: "direct-file-write", kind: "ledger" },
    { id: "plugin-problem-record", kind: "ledger" },
    { id: "runner-run-metadata", kind: "ledger" },
    { id: "runner-artifact", kind: "ledger" },
    { id: "user-sidebar-op", kind: "ledger" },
    { id: "user-preview-edit", kind: "ledger" },
    { id: "user-review-edit", kind: "ledger" },
    { id: "shell-action", kind: "opaque" },
    { id: "mcp-action", kind: "opaque" },
    { id: "custom-tool-action", kind: "opaque" },
    { id: "cli-action", kind: "opaque" },
    { id: "ledger-infrastructure", kind: "out_of_scope" },
    { id: "credential-store", kind: "out_of_scope" },
    { id: "cache-store", kind: "out_of_scope" },
    { id: "queue-store", kind: "out_of_scope" },
    { id: "updater-state", kind: "out_of_scope" },
    { id: "telemetry-store", kind: "out_of_scope" },
    { id: "retention-state", kind: "out_of_scope" },
  ] as const satisfies ReadonlyArray<Route>

  export namespace Registry {
    export const version = 4

    export function manifest() {
      return { version, routes: [...routes] }
    }

    export function require(id: string) {
      return routes.find((route) => route.id === id)
    }
  }

  export type Endpoint = { value: string; kind: "file" | "directory" }

  export type ResourceOperation = "write" | "edit" | "patch" | "move" | "delete" | "create_parent" | "format"
  export type ResourceRole = "target" | "source" | "destination" | "implicit_parent" | "formatter"
  export type DeclaredResource = {
    id: string
    endpoint: Endpoint
    operation: ResourceOperation
    role: ResourceRole
  }
  export type ResourceReceipt = DeclaredResource & { outcome: "applied" | "failed" | "not_started" }

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
  export type GroupResult = Result & {
    outcome: "applied" | "partial" | "failed" | "denied"
    receipts: ReadonlyArray<ResourceReceipt>
  }
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
  export type GroupProvider = {
    capabilities: { safeResolve: boolean; noFollowWrite: boolean }
    safeResolve: (endpoint: Endpoint) => Endpoint | undefined
    execute: (resource: DeclaredResource) => "applied" | "failed"
  }

  export type GroupRequest = {
    routeID: LedgerRouteID
    panelID: string
    sessionID: string
    rootID: string
    origin: string
    operation: string
    operationID: string
    resources: ReadonlyArray<DeclaredResource>
    recursive?: { maxResources: number }
  }

  type StoredContext =
    | {
        kind: "local"
        routeID: LedgerRouteID
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
        kind: "group"
        routeID: LedgerRouteID
        panelID: string
        sessionID: string
        rootID: string
        origin: string
        operation: string
        resources: ReadonlyArray<DeclaredResource>
        recursive?: { maxResources: number }
        expiresAt: number
        idempotency: "exact"
      }
    | {
        kind: "opaque"
        routeID: OpaqueRouteID
        panelID: string
        sessionID: string
        rootID: string
        origin: string
        operation: string
        expiresAt: number
        idempotency: "exact"
      }

  type Context = { readonly [contextHandle]: true }
  type Issue = Omit<Request, "operationID"> & { kind: "local" | "opaque"; expiresAt: number }
  type GroupIssue = Omit<GroupRequest, "operationID"> & { expiresAt: number }
  type OpaqueRequest = Omit<Request, "source" | "destination"> & {
    routeID: OpaqueRouteID
    resources?: ReadonlyArray<DeclaredResource>
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
    const sameResources = (left: ReadonlyArray<DeclaredResource>, right: ReadonlyArray<DeclaredResource>) =>
      left.length === right.length &&
      left.every(
        (resource, index) =>
          resource.id === right[index]?.id &&
          resource.operation === right[index]?.operation &&
          resource.role === right[index]?.role &&
          same(resource.endpoint, right[index]?.endpoint),
      )
    const validResources = (resources: ReadonlyArray<DeclaredResource>) =>
      resources.length > 0 &&
      resources.every((resource) => resource.id.length > 0) &&
      new Set(resources.map((resource) => resource.id)).size === resources.length
    const operationKey = (rootID: string, operationID: string) => JSON.stringify([rootID, operationID])
    const fingerprint = (request: Request & { resources?: ReadonlyArray<DeclaredResource> }) =>
      JSON.stringify({
        routeID: request.routeID,
        operation: request.operation,
        source: request.source,
        destination: request.destination,
        resources: request.resources,
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
    const validateGroup = (execution: { context?: Context; request: GroupRequest }) => {
      if (!execution.context) return { reason: "missing_context" as const }
      const context = contexts.get(execution.context)
      if (!context) return { reason: "invalid_context" as const }
      if (context.expiresAt <= input.now()) return { reason: "expired_context" as const }
      if (input.rootForSession(context.sessionID) !== context.rootID) return { reason: "invalid_context" as const }
      if (
        context.kind !== "group" ||
        execution.request.routeID !== context.routeID ||
        execution.request.panelID !== context.panelID ||
        execution.request.sessionID !== context.sessionID ||
        execution.request.rootID !== context.rootID ||
        execution.request.origin !== context.origin ||
        execution.request.operation !== context.operation ||
        execution.request.recursive?.maxResources !== context.recursive?.maxResources ||
        !sameResources(execution.request.resources, context.resources)
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
      issueGroup(request: GroupIssue): Context | undefined {
        const route = Registry.require(request.routeID)
        if (
          !route ||
          route.kind !== "ledger" ||
          !validResources(request.resources) ||
          (request.recursive &&
            (!Number.isSafeInteger(request.recursive.maxResources) || request.recursive.maxResources < 1)) ||
          input.rootForSession(request.sessionID) !== request.rootID
        )
          return
        const context: Context = { [contextHandle]: true }
        contexts.set(context, {
          kind: "group",
          routeID: route.id,
          panelID: request.panelID,
          sessionID: request.sessionID,
          rootID: request.rootID,
          origin: request.origin,
          operation: request.operation,
          resources: request.resources,
          ...(request.recursive ? { recursive: request.recursive } : {}),
          expiresAt: request.expiresAt,
          idempotency: "exact",
        })
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
        if (execution.request.resources && validResources(execution.request.resources)) {
          const result: GroupResult = {
            groupID: execution.request.operationID,
            outcome: "applied",
            receipts: execution.request.resources.map((resource) => ({ ...resource, outcome: "applied" })),
          }
          operations.set(key, { fingerprint: normalized, result })
          return { kind: "executed" as const, result }
        }
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
      executeGroup(execution: { context?: Context; request: GroupRequest; provider: GroupProvider }) {
        const validation = validateGroup(execution)
        if ("reason" in validation) return { kind: "denied" as const, reason: validation.reason }
        const context = validation.context
        if (!execution.provider.capabilities.safeResolve || !execution.provider.capabilities.noFollowWrite)
          return { kind: "denied" as const, reason: "unsafe_provider" as const }
        const key = operationKey(context.rootID, execution.request.operationID)
        const normalized = JSON.stringify({
          routeID: execution.request.routeID,
          operation: execution.request.operation,
          resources: execution.request.resources,
          recursive: execution.request.recursive,
          rootID: execution.request.rootID,
          origin: execution.request.origin,
        })
        const previous = operations.get(key)
        if (previous && previous.fingerprint !== normalized)
          return { kind: "denied" as const, reason: "invalid_replay" as const }
        if (previous) return { kind: "replayed" as const, result: previous.result }
        if (context.recursive && context.resources.length > context.recursive.maxResources) {
          const result: GroupResult = { groupID: execution.request.operationID, outcome: "denied", receipts: [] }
          operations.set(key, { fingerprint: normalized, result })
          return { kind: "denied" as const, reason: "resource_budget_exceeded" as const, result }
        }
        if (
          context.resources.some(
            (resource) => !same(execution.provider.safeResolve(resource.endpoint), resource.endpoint),
          )
        ) {
          const result: GroupResult = {
            groupID: execution.request.operationID,
            outcome: "failed",
            receipts: context.resources.map((resource) => ({ ...resource, outcome: "not_started" })),
          }
          operations.set(key, { fingerprint: normalized, result })
          return { kind: "executed" as const, result }
        }
        const receipts: ResourceReceipt[] = []
        for (const resource of context.resources) {
          let outcome: "applied" | "failed"
          try {
            outcome = execution.provider.execute(resource)
          } catch {
            outcome = "failed"
          }
          receipts.push({ ...resource, outcome })
          if (outcome === "failed") {
            receipts.push(
              ...context.resources.slice(receipts.length).map((next) => ({ ...next, outcome: "not_started" as const })),
            )
            break
          }
        }
        const result: GroupResult = {
          groupID: execution.request.operationID,
          outcome: receipts.some((receipt) => receipt.outcome === "failed")
            ? receipts.some((receipt) => receipt.outcome === "applied")
              ? "partial"
              : "failed"
            : "applied",
          receipts,
        }
        operations.set(key, { fingerprint: normalized, result })
        return { kind: "executed" as const, result }
      },
    }
  }
}

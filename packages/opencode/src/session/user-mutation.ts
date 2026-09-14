import { SessionMutation } from "./mutation"

/**
 * Adopts user-initiated Sidebar, Preview, and Files Changed file operations as
 * host-mediated mutation intents. The browser sends a display-safe
 * {@link SessionUserMutation.MutationIntent} — an operation, a user-selected
 * display target, and an idempotency key. The extension host resolves resource
 * identity, snapshots the initiating panel and active session BEFORE input,
 * obtains a #1077 operation-group context, and returns only a display-safe
 * result. Browser code never receives a mutation capability, a canonical path,
 * a hash, or evidence, and never determines externality.
 *
 * The registry (#1077) is the single source of truth for route identity and
 * every user operation consumes its operation-group contract (idempotent retry,
 * preflight-no-applied, explicit execution partials). This layer neither adopts
 * engine tool routes (#1079) nor renders the unified UI (#1082).
 */
export namespace SessionUserMutation {
  /** The panel a user operation originates from, mapped to its registered ledger route. */
  export const Routes = {
    sidebar: "user-sidebar-op",
    preview: "user-preview-edit",
    review: "user-review-edit",
  } as const
  export type Panel = keyof typeof Routes
  export type RouteID = (typeof Routes)[Panel]

  /** User actions are first-class session origins, distinct from agent, child-agent, and system events. */
  export const Origins = ["user", "agent", "child_agent", "system"] as const
  export type Origin = (typeof Origins)[number]

  export function distinguish(origin: string): Origin | undefined {
    return (Origins as ReadonlyArray<string>).includes(origin) ? (origin as Origin) : undefined
  }

  export type Capability =
    | { mode: "full"; version: number }
    | { mode: "partial"; version: number; label: "post_upgrade_partial" }
    | { mode: "legacy"; label: "legacy" }
    | { mode: "unavailable" }

  /**
   * The four-outcome discovery for user mutation surfaces. Only `legacy` selects
   * existing behavior; `partial` records a labelled post-upgrade epoch; `full`
   * mediates a fresh full-provenance session; `unavailable` denies rather than
   * letting a user operation proceed untracked.
   */
  export namespace Capability {
    export function discover(input: {
      supported: readonly number[]
      requested: number
      hostReachable: boolean
      sessionEpoch: "full" | "post_upgrade"
    }): Capability {
      if (!input.hostReachable) return { mode: "unavailable" }
      if (!input.supported.includes(input.requested)) return { mode: "legacy", label: "legacy" }
      if (input.sessionEpoch === "post_upgrade")
        return { mode: "partial", version: input.requested, label: "post_upgrade_partial" }
      return { mode: "full", version: input.requested }
    }
  }

  /** A display-safe intent — the ONLY thing the browser sends. No capability, path, hash, or evidence. */
  export type MutationIntent =
    | { operation: "create" | "directory" | "edit"; panel: Panel; target: { display: string }; idempotencyKey: string }
    | {
        operation: "move" | "trash" | "restore"
        panel: Panel
        target: { display: string }
        destination: { display: string }
        idempotencyKey: string
      }
    | {
        operation: "recursive_delete"
        panel: Panel
        targets: ReadonlyArray<{ display: string }>
        idempotencyKey: string
        recursive: { maxResources: number }
      }

  /**
   * The host's authenticated view of the initiating panel and active session,
   * snapshotted before the user's input or confirmation. This never crosses to
   * the browser.
   */
  export type PanelSnapshot = {
    panelID: string
    sessionID: string
    rootID: string
    origin: Origin | string
  }

  /**
   * The host-side capability: it resolves a display target to a physical
   * identity and applies verified writes through a no-follow gate. It stays on
   * the host — the browser never holds one.
   */
  export type HostProvider = {
    capabilities: { safeResolve: boolean; noFollowWrite: boolean }
    resolveTarget: (display: string) => SessionMutation.Endpoint | undefined
    safeResolve: (endpoint: SessionMutation.Endpoint) => SessionMutation.Endpoint | undefined
    execute: (resource: SessionMutation.DeclaredResource) => "applied" | "failed"
  }

  /** A display-safe receipt reference: logical facts only, never the physical endpoint identity. */
  export type DisplayResource = {
    operation: SessionMutation.ResourceOperation
    role: SessionMutation.ResourceRole
    outcome: "applied" | "failed" | "not_started"
  }

  export type DenyReason =
    | "unavailable"
    | "non_user_origin"
    | "unresolved_target"
    | "context_unavailable"
    | "resource_budget_exceeded"
    | "unsafe_provider"
    | "invalid_context"

  export type MediationResult =
    | { kind: "applied" | "partial" | "failed"; panel: Panel; resources: ReadonlyArray<DisplayResource>; epoch?: "post_upgrade_partial" }
    | { kind: "legacy"; label: "legacy" }
    | { kind: "denied"; reason: DenyReason }

  type Plan = { resources: SessionMutation.DeclaredResource[]; recursive?: { maxResources: number } }

  /** Resolve every logical target to a physical identity host-side and shape the declared group. */
  function planResources(intent: MutationIntent, resolveTarget: HostProvider["resolveTarget"]): Plan | undefined {
    if (intent.operation === "recursive_delete") {
      const resources: SessionMutation.DeclaredResource[] = []
      intent.targets.forEach((entry, index) => {
        const endpoint = resolveTarget(entry.display)
        if (endpoint) resources.push({ id: `target-${index}`, endpoint, operation: "delete", role: "target" })
      })
      if (resources.length !== intent.targets.length || resources.length === 0) return
      return { resources, recursive: intent.recursive }
    }
    if (intent.operation === "move" || intent.operation === "trash" || intent.operation === "restore") {
      const source = resolveTarget(intent.target.display)
      const destination = resolveTarget(intent.destination.display)
      if (!source || !destination) return
      return {
        resources: [
          { id: "source", endpoint: source, operation: "move", role: "source" },
          { id: "destination", endpoint: destination, operation: "move", role: "destination" },
        ],
      }
    }
    const endpoint = resolveTarget(intent.target.display)
    if (!endpoint) return
    if (intent.operation === "directory")
      return { resources: [{ id: "target", endpoint, operation: "create_parent", role: "implicit_parent" }] }
    if (intent.operation === "edit")
      return { resources: [{ id: "target", endpoint, operation: "edit", role: "target" }] }
    return { resources: [{ id: "target", endpoint, operation: "write", role: "target" }] }
  }

  const display = (resource: SessionMutation.ResourceReceipt): DisplayResource => ({
    operation: resource.operation,
    role: resource.role,
    outcome: resource.outcome,
  })

  /**
   * Mediate one user file operation host-side. Capability gates first (legacy is
   * a labelled passthrough, unavailable denies); a non-user origin is refused; a
   * registered operation-group context is obtained bound to the panel/session
   * snapshot, and the write runs through #1077's group contract. An invalid or
   * unresolvable context denies before any filesystem access — never an
   * untracked mutation — and only display-safe facts are returned.
   */
  export function mediate(input: {
    intent: MutationIntent
    capability: Capability
    snapshot: PanelSnapshot
    rootForSession: (sessionID: string) => string | undefined
    gate: ReturnType<typeof SessionMutation.create>
    provider: HostProvider
    now?: () => number
    ttl?: number
  }): MediationResult {
    const { capability } = input
    if (capability.mode === "legacy") return { kind: "legacy", label: capability.label }
    if (capability.mode === "unavailable") return { kind: "denied", reason: "unavailable" }
    const epoch = capability.mode === "partial" ? capability.label : undefined

    // The snapshot is captured before input; a non-user origin never adopts a user route.
    if (input.snapshot.origin !== "user") return { kind: "denied", reason: "non_user_origin" }

    const routeID = Routes[input.intent.panel]
    const plan = planResources(input.intent, input.provider.resolveTarget)
    if (!plan) return { kind: "denied", reason: "unresolved_target" }

    const now = input.now ?? (() => Date.now())
    const expiresAt = now() + (input.ttl ?? 30_000)
    const context = input.gate.issueGroup({
      routeID,
      panelID: input.snapshot.panelID,
      sessionID: input.snapshot.sessionID,
      rootID: input.snapshot.rootID,
      origin: input.snapshot.origin,
      operation: input.intent.operation,
      resources: plan.resources,
      ...(plan.recursive ? { recursive: plan.recursive } : {}),
      expiresAt,
    })
    if (!context) return { kind: "denied", reason: "context_unavailable" }

    const request: SessionMutation.GroupRequest = {
      routeID,
      panelID: input.snapshot.panelID,
      sessionID: input.snapshot.sessionID,
      rootID: input.snapshot.rootID,
      origin: input.snapshot.origin,
      operation: input.intent.operation,
      operationID: input.intent.idempotencyKey,
      resources: plan.resources,
      ...(plan.recursive ? { recursive: plan.recursive } : {}),
    }
    const execution = input.gate.executeGroup({
      context,
      request,
      provider: {
        capabilities: input.provider.capabilities,
        safeResolve: input.provider.safeResolve,
        execute: input.provider.execute,
      },
    })

    if (execution.kind === "denied") {
      if (execution.reason === "resource_budget_exceeded")
        return { kind: "denied", reason: "resource_budget_exceeded" }
      if (execution.reason === "unsafe_provider") return { kind: "denied", reason: "unsafe_provider" }
      return { kind: "denied", reason: "invalid_context" }
    }

    const result = execution.result as SessionMutation.GroupResult
    const kind = result.outcome === "applied" ? "applied" : result.outcome === "partial" ? "partial" : "failed"
    return {
      kind,
      panel: input.intent.panel,
      resources: result.receipts.map(display),
      ...(epoch ? { epoch } : {}),
    }
  }

  /**
   * Watchers only revalidate server-owned receipts. They receive receipt
   * references and assessment revisions, emit invalidation, and can never derive
   * ownership, lifecycle, canonical paths, hashes, or evidence locally. An
   * unknown reference is ignored — never adopted or attributed.
   */
  export namespace Watcher {
    export type Signal = { receiptRef: string; assessmentRevision: number }
    export type Outcome = { kind: "invalidate"; receiptRef: string } | { kind: "ignore" }

    export function revalidate(known: ReadonlyMap<string, number>, signal: Signal): Outcome {
      const current = known.get(signal.receiptRef)
      if (current === undefined) return { kind: "ignore" }
      if (signal.assessmentRevision > current) return { kind: "invalidate", receiptRef: signal.receiptRef }
      return { kind: "ignore" }
    }
  }
}

import { SessionEvidence } from "./evidence"
import { SessionMutation } from "./mutation"
import { SessionReceiptPrivacy } from "./receipt-privacy"

/**
 * Adopts plugin bookkeeping and runner-originated writes as system-origin
 * business receipts. A business record is a durable problem, run, or artifact
 * record referenced by a researcher-facing surface; credentials, caches,
 * queues, updater state, telemetry, ledger storage, and retention transitions
 * are operational machinery and never become receipts.
 *
 * The registry (#1077) is the single source of truth for route identity; the
 * exposure matrix (#1078) is the single serializer for display projection.
 * This layer neither adopts engine tool routes (#1079) nor edits the UI.
 */
export namespace SessionBusinessRecord {
  /** Registered plugin/runner writers, each mapped to its resource classification. */
  export const Routes = {
    "plugin-problem-record": "problem_record",
    "runner-run-metadata": "run_metadata",
    "runner-artifact": "artifact",
  } as const
  export type Route = keyof typeof Routes
  export type Classification = (typeof Routes)[Route]

  /** Operational machinery — explicitly out of scope, cannot recurse into a receipt. */
  export const OperationalRoutes = [
    "credential-store",
    "cache-store",
    "queue-store",
    "updater-state",
    "telemetry-store",
    "ledger-infrastructure",
    "retention-state",
  ] as const
  export type OperationalRoute = (typeof OperationalRoutes)[number]

  export type ResourceInput = {
    id: string
    resource: string
    outcome: "applied" | "failed"
    /** A link to a large generated output — preferred over copying content into evidence. */
    artifact?: { ref: string }
    /** Small display-safe evidence recorded inline. */
    evidence?: { content: string }
  }

  export type ResourceReceipt = {
    id: string
    resource: string
    outcome: "applied" | "failed"
    evidence: "artifact_link" | "inline" | "none"
  }

  export type SystemReceipt = {
    origin: "system"
    rootID: string
    sessionID: string
    routeID: Route
    operationID: string
    operation: string
    classification: Classification
    outcome: "applied" | "failed"
    resources: ReadonlyArray<ResourceReceipt>
  }

  export type RefusalReason =
    | "unregistered_route"
    | "operational_resource"
    | "requires_opaque_receipt"
    | "not_business_route"
    | "lineage_mismatch"
    | "no_resources"

  export type Adoption = { kind: "adopted"; receipt: SystemReceipt } | { kind: "refused"; reason: RefusalReason }

  export type UnknownReceipt = SessionMutation.UnknownReceipt

  /**
   * Where a route sits relative to this adopter. `business` routes adopt here;
   * `operational` are out of scope; `opaque` (shell/CLI/MCP) carry only an
   * Unknown Mutation Receipt; `engine` file routes belong to #1079.
   */
  export function classify(routeID: string): "business" | "operational" | "opaque" | "engine" | undefined {
    if (routeID in Routes) return "business"
    if ((OperationalRoutes as ReadonlyArray<string>).includes(routeID)) return "operational"
    const route = SessionMutation.Registry.require(routeID)
    if (!route) return undefined
    if (route.kind === "opaque") return "opaque"
    return "engine"
  }

  export function adopt(input: {
    rootForSession: (sessionID: string) => string | undefined
    routeID: string
    sessionID: string
    rootID: string
    operation: string
    operationID: string
    resources: ReadonlyArray<ResourceInput>
  }): Adoption {
    const kind = classify(input.routeID)
    if (kind === undefined) return { kind: "refused", reason: "unregistered_route" }
    if (kind === "operational") return { kind: "refused", reason: "operational_resource" }
    if (kind === "opaque") return { kind: "refused", reason: "requires_opaque_receipt" }
    if (kind === "engine") return { kind: "refused", reason: "not_business_route" }
    if (input.rootForSession(input.sessionID) !== input.rootID) return { kind: "refused", reason: "lineage_mismatch" }
    if (input.resources.length === 0) return { kind: "refused", reason: "no_resources" }

    const routeID = input.routeID as Route
    const resources = input.resources.map((resource) => ({
      id: resource.id,
      resource: resource.resource,
      outcome: resource.outcome,
      evidence: resource.artifact ? ("artifact_link" as const) : resource.evidence ? ("inline" as const) : ("none" as const),
    }))
    return {
      kind: "adopted",
      receipt: {
        origin: "system",
        rootID: input.rootID,
        sessionID: input.sessionID,
        routeID,
        operationID: input.operationID,
        operation: input.operation,
        classification: Routes[routeID],
        outcome: resources.some((resource) => resource.outcome === "failed") ? "failed" : "applied",
        resources,
      },
    }
  }

  /** A contextless CLI or shell launch adopts no filesystem effects — only an operation-level unknown receipt. */
  export function unknown(input: { operationID: string; origin: string; operation: string }): UnknownReceipt {
    return {
      kind: "unknown_mutation",
      operationID: input.operationID,
      origin: input.origin,
      operation: input.operation,
    }
  }

  /**
   * Display-safe projection through the #1078 exposure matrix. Protected internal
   * values (canonical path, raw hash, baseline) are carried on the host record and
   * denied by the matrix; the artifact link survives only as a display-safe
   * receipt reference, reauthorized against the same root and policy when opened.
   */
  export function project(
    input: {
      receipt: SystemReceipt
      resource: ResourceReceipt
      sequence: number
      timeCreated: number
      artifactRef?: string
      internal?: { canonicalPath?: string; rawHash?: string; baseline?: string }
    },
    boundary: SessionReceiptPrivacy.DisplayBoundary,
  ): SessionReceiptPrivacy.Projection {
    const host: SessionReceiptPrivacy.HostReceipt = {
      operation: {
        id: input.receipt.operationID,
        rootID: input.receipt.rootID,
        sessionID: input.receipt.sessionID,
        origin: input.receipt.origin,
        state: "committed",
      },
      receipt: {
        id: input.artifactRef ?? input.receipt.operationID,
        sequence: input.sequence,
        resource: input.resource.resource,
        operation: input.receipt.operation,
        outcome: input.resource.outcome,
        timeCreated: input.timeCreated,
      },
      ...(input.artifactRef ? { evidence: { receiptID: input.artifactRef } } : {}),
      ...(input.internal
        ? {
            context: {
              ...(input.internal.canonicalPath ? { canonicalPath: input.internal.canonicalPath } : {}),
              ...(input.internal.rawHash ? { rawHash: input.internal.rawHash } : {}),
              ...(input.internal.baseline ? { baseline: input.internal.baseline } : {}),
            },
          }
        : {}),
    }
    return SessionReceiptPrivacy.project(host, boundary)
  }

  /** Deleting a lineage root removes its plugin and runner host-local evidence together. */
  export function removeRootEvidence(rootID: string) {
    SessionEvidence.removeRoot(rootID)
  }
}

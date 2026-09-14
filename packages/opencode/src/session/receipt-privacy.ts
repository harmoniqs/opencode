import { SessionReceipt as ReceiptSchema } from "@opencode-ai/schema/session-receipt"
import { SessionMutation } from "./mutation"

export namespace SessionReceiptPrivacy {
  export type HostReceipt = {
    operation?: {
      id?: string
      rootID?: string
      sessionID?: string
      origin?: string
      state?: string
    }
    receipt?: {
      id?: string
      sequence?: number
      resource?: string
      operation?: string
      outcome?: string
      timeCreated?: number
    }
    assessment?: {
      id?: string
      receiptID?: string
      confidence?: string
      netState?: string
      evidenceState?: string
      revision?: number
      expiresAt?: number
      timeCreated?: number
    }
    evidence?: { receiptID?: string; content?: string }
    context?: {
      capability?: string
      canonicalPath?: string
      rawHash?: string
      baseline?: string
      redactionDecision?: string
    }
    derived?: { patch?: string; additions?: number; deletions?: number }
  }

  export type DisplayBoundary = Exclude<ReceiptSchema.Boundary, "external_detail">
  export type Projection = Partial<
    Record<"operation" | "receipt" | "assessment" | "evidence" | "derived", Record<string, unknown>>
  >
  export type DetailAccess = {
    authenticated: boolean
    receiptReferenceAuthorized: boolean
    evidencePolicy: "allow" | "deny"
    now: number
    expiresAt?: number
    redirected?: boolean
  }
  export type ExternalDetail = {
    status: 200 | 307 | 401 | 403 | 410
    headers: { "cache-control": "no-store" }
    body: Projection | { error: "unauthorized" | "forbidden" | "redirected" | "evidence_denied" | "evidence_expired" }
  }
  export type DisplayCapability = ReturnType<typeof SessionMutation.Capability.discover>

  export function marker(field: ReceiptSchema.Field) {
    return `[redacted:${field}]`
  }

  /**
   * The only general receipt serializer. It enumerates schema fields rather
   * than spreading host records, so host-only additions cannot leak by default.
   */
  export function project(input: HostReceipt, boundary: DisplayBoundary): Projection {
    return projectBoundary(input, boundary)
  }

  /**
   * Evidence bytes are available only through this authenticated detail gate;
   * ordinary serializers cannot select the external-detail boundary.
   */
  export function externalDetail(input: HostReceipt, access: DetailAccess): ExternalDetail {
    const headers = { "cache-control": "no-store" } as const
    if (!access.authenticated) return { status: 401, headers, body: { error: "unauthorized" } }
    if (!access.receiptReferenceAuthorized) return { status: 403, headers, body: { error: "forbidden" } }
    if (access.redirected) return { status: 307, headers, body: { error: "redirected" } }
    if (access.evidencePolicy !== "allow") return { status: 403, headers, body: { error: "evidence_denied" } }
    if (input.assessment?.evidenceState !== "available")
      return { status: 403, headers, body: { error: "evidence_denied" } }
    if (access.expiresAt !== undefined && access.expiresAt <= access.now)
      return { status: 410, headers, body: { error: "evidence_expired" } }
    return { status: 200, headers, body: projectBoundary(input, "external_detail") }
  }

  /** The capability result from #1077 is the sole legacy/full selection point. */
  export function display<T>(
    input: { legacy: T; receipt: HostReceipt },
    capability: DisplayCapability,
  ): T | Projection {
    return capability.mode === "legacy" ? input.legacy : project(input.receipt, "files_changed")
  }

  function projectBoundary(input: HostReceipt, boundary: ReceiptSchema.Boundary): Projection {
    const output: Projection = {}
    for (const field of ReceiptSchema.Fields) {
      const [group, key] = field.split(".") as [keyof HostReceipt, string]
      const value = input[group]?.[key as never]
      if (value === undefined) continue

      const decision = ReceiptSchema.Exposure[field][boundary]
      if (decision === "deny") continue

      const displayGroup = group as keyof Projection
      const target = (output[displayGroup] ??= {})
      target[key] = decision === "allow" ? value : marker(field)
    }
    return output
  }
}

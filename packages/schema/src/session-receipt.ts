export * as SessionReceipt from "./session-receipt"

import { Schema } from "effect"

/** Every serializer that can carry receipt-derived data. */
export const Boundaries = [
  "files_changed",
  "browser",
  "transcript",
  "session_metadata",
  "export",
  "share",
  "telemetry",
  "log",
  "error",
  "external_detail",
] as const
export const Boundary = Schema.Literals(Boundaries)
export type Boundary = typeof Boundary.Type

export const Decision = Schema.Literals(["allow", "redact", "deny"])
export type Decision = typeof Decision.Type

/**
 * This inventory is the source of truth. Adding a host receipt, assessment,
 * evidence, context, or derived value requires an egress decision below.
 */
export const Fields = [
  "operation.id",
  "operation.rootID",
  "operation.sessionID",
  "operation.origin",
  "operation.state",
  "receipt.id",
  "receipt.sequence",
  "receipt.resource",
  "receipt.operation",
  "receipt.outcome",
  "receipt.timeCreated",
  "assessment.id",
  "assessment.receiptID",
  "assessment.confidence",
  "assessment.netState",
  "assessment.evidenceState",
  "assessment.revision",
  "assessment.expiresAt",
  "assessment.timeCreated",
  "evidence.receiptID",
  "evidence.content",
  "context.capability",
  "context.canonicalPath",
  "context.rawHash",
  "context.baseline",
  "context.redactionDecision",
  "derived.patch",
  "derived.additions",
  "derived.deletions",
] as const
export const Field = Schema.Literals(Fields)
export type Field = (typeof Fields)[number]

export type Exposure = { readonly [field in Field]: Readonly<Record<Boundary, Decision>> }

const every = (decision: Decision): Readonly<Record<Boundary, Decision>> =>
  Object.fromEntries(Boundaries.map((boundary) => [boundary, decision])) as Readonly<Record<Boundary, Decision>>

const display = (): Readonly<Record<Boundary, Decision>> => ({
  ...every("deny"),
  files_changed: "allow",
  browser: "allow",
  external_detail: "allow",
})

const redactedEgress = (): Readonly<Record<Boundary, Decision>> => ({
  ...display(),
  export: "redact",
  share: "redact",
  telemetry: "redact",
  log: "redact",
  error: "redact",
})

/**
 * Browser-safe egress policy for the complete receipt vocabulary. `redact`
 * retains a stable marker; `deny` omits a value altogether.
 */
export const Exposure = {
  "operation.id": every("deny"),
  "operation.rootID": every("deny"),
  "operation.sessionID": every("deny"),
  "operation.origin": redactedEgress(),
  "operation.state": display(),
  "receipt.id": display(),
  "receipt.sequence": display(),
  "receipt.resource": redactedEgress(),
  "receipt.operation": display(),
  "receipt.outcome": display(),
  "receipt.timeCreated": display(),
  "assessment.id": every("deny"),
  "assessment.receiptID": display(),
  "assessment.confidence": display(),
  "assessment.netState": display(),
  "assessment.evidenceState": display(),
  "assessment.revision": display(),
  "assessment.expiresAt": display(),
  "assessment.timeCreated": display(),
  "evidence.receiptID": display(),
  "evidence.content": { ...every("deny"), external_detail: "allow" },
  "context.capability": every("deny"),
  "context.canonicalPath": every("deny"),
  "context.rawHash": every("deny"),
  "context.baseline": every("deny"),
  "context.redactionDecision": every("deny"),
  "derived.patch": { ...every("deny"), external_detail: "allow" },
  "derived.additions": display(),
  "derived.deletions": display(),
} as const satisfies Exposure

/** Fails closed when a field or a serializer boundary lacks an explicit decision. */
export function assertExposureCoverage(matrix: Partial<Record<Field, Partial<Record<Boundary, Decision>>>>) {
  for (const field of Fields) {
    const row = matrix[field]
    if (!row) throw new Error(`Missing receipt exposure classification for ${field}`)
    for (const boundary of Boundaries) {
      if (row[boundary] === undefined)
        throw new Error(`Missing receipt exposure classification for ${field} at ${boundary}`)
    }
  }
}

assertExposureCoverage(Exposure)

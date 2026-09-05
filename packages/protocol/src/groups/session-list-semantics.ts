export * as SessionListSemantics from "./session-list-semantics"

import { SessionsQuery } from "./session"

export { SessionsQuery }

/**
 * D6 (spec spec-20260905-045114-session-device-lifecycle): the query semantics
 * of session-list endpoints are declared, frozen surface. This manifest IS the
 * companion update — a PR that changes what a query means must update it in
 * the same change, or the drift-gate fixture (test/session-list-semantics)
 * goes red. Additive optional fields with base defaults are permitted without
 * a companion update; semantic changes (removals, requiredness flips, default
 * changes, kind changes) are not. The 2026-09-05 v1-route semantics change
 * (directory-filtered → project-scoped) is the founding incident.
 *
 * The server's handlers import `defaults` from here, so the declared defaults
 * are load-bearing, not documentation.
 */

export interface QueryField {
  readonly name: string
  readonly kind: "scope" | "filter" | "cursor"
  readonly required: boolean
  readonly default: number | string | undefined
}

export const queryFields = [
  { name: "workspace", kind: "scope", required: false, default: undefined },
  { name: "directory", kind: "scope", required: false, default: undefined },
  { name: "project", kind: "scope", required: false, default: undefined },
  { name: "subpath", kind: "scope", required: false, default: undefined },
  { name: "cursor", kind: "cursor", required: false, default: undefined },
  { name: "limit", kind: "filter", required: false, default: 50 },
  { name: "order", kind: "filter", required: false, default: "desc" },
  { name: "search", kind: "filter", required: false, default: undefined },
] as const satisfies readonly QueryField[]

export const defaults = {
  limit: queryFields.find((field) => field.name === "limit")!.default as number,
  order: queryFields.find((field) => field.name === "order")!.default as "asc" | "desc",
}

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/** Classify a candidate change against the frozen semantics. Additive
 *  optional fields (with or without a base default) pass; everything that
 *  changes what an existing query means fails. */
export function classify(previous: readonly QueryField[], current: readonly QueryField[]): Verdict {
  const previousByName = new Map(previous.map((field) => [field.name, field]))
  for (const field of current) {
    const before = previousByName.get(field.name)
    if (!before) {
      if (field.required)
        return { ok: false, reason: `new field ${field.name} is required — additive fields must be optional with a base default` }
      continue
    }
    if (field.required !== before.required)
      return { ok: false, reason: `field ${field.name} changed requiredness ${before.required} → ${field.required}` }
    if (field.kind !== before.kind)
      return { ok: false, reason: `field ${field.name} changed kind ${before.kind} → ${field.kind}` }
    if (field.default !== before.default)
      return { ok: false, reason: `field ${field.name} changed default ${JSON.stringify(before.default)} → ${JSON.stringify(field.default)}` }
  }
  const currentByName = new Map(current.map((field) => [field.name, field]))
  for (const field of previous) {
    if (!currentByName.has(field.name)) return { ok: false, reason: `field ${field.name} was removed` }
  }
  return { ok: true }
}

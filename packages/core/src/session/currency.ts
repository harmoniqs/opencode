export * as SessionCurrency from "./currency"

import { DateTime } from "effect"
import { InstallationVersion } from "../installation/version"
import { SessionSchema } from "./schema"

/**
 * D2 (spec spec-20260905-045114-session-device-lifecycle): the list-currency
 * token is DERIVED from the session-table projection the client renders —
 * (count, max time_updated, sum of time_updated) over the rows the list
 * returns, plus the hub build id. Never hand-bumped: any write that changes
 * the rendered projection — same-tick touches, archive churn, out-of-band SQL
 * — changes the token by construction, because it is recomputed from the rows
 * on every list response.
 */

export interface Projection {
  readonly count: number
  readonly maxUpdated: number
  readonly sumUpdated: number
}

export function projection(rows: readonly Pick<SessionSchema.Info, "time">[]): Projection {
  let maxUpdated = 0
  let sumUpdated = 0
  for (const row of rows) {
    const updated = DateTime.toEpochMillis(row.time.updated)
    if (updated > maxUpdated) maxUpdated = updated
    sumUpdated += updated
  }
  return { count: rows.length, maxUpdated, sumUpdated }
}

export function token(input: Projection, build: string = InstallationVersion): string {
  return `v1.${input.count}.${input.maxUpdated}.${input.sumUpdated}.${build}`
}

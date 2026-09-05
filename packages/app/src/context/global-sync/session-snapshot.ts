import type { Session } from "@opencode-ai/sdk/v2/client"

/**
 * D2 (spec spec-20260905-045114-session-device-lifecycle): the persisted
 * session snapshot is a render accelerator, never an authority. Every boot
 * compares the snapshot's derived currency token against the server's; a
 * stale or absent token marks the snapshot for invalidation, so the #293
 * stale-storage shape self-heals with zero manual action.
 */

export type SessionSnapshot = {
  sessions: Session[]
  currency?: string
}

export type BootCurrencyDecision = {
  /** The fetched response is always adopted — it is the authority. */
  adopt: boolean
  /** The persisted snapshot contradicts the server (stale or tokenless) and
   *  must be invalidated (overwritten by the fetched state). */
  stale: boolean
  /** The token to persist alongside the adopted rows; undefined when the hub
   *  does not yet supply one (additive base default — cannot be verified). */
  currency: string | undefined
}

export function bootCurrencyDecision(input: {
  snapshot?: SessionSnapshot
  response: { sessions: Session[]; currency?: string | null }
}): BootCurrencyDecision {
  const currency = input.response.currency ?? undefined
  // A mismatch requires the server to have asserted a token: a hub without
  // one (additive base default absent) cannot be verified either way. A
  // tokenless snapshot was written by a hub that could not prove its own
  // currency — the founding #293 shape — and reads as stale on first proof.
  const stale =
    currency !== undefined &&
    input.snapshot !== undefined &&
    (input.snapshot.currency === undefined || input.snapshot.currency !== currency)
  return { adopt: true, stale, currency }
}

export function toSnapshot(sessions: Session[], currency: string | undefined): SessionSnapshot {
  return { sessions, currency }
}

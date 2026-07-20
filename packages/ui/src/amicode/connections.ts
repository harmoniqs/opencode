// AMICODE: pure, tolerant parsing + card logic for the Connections panel tab
// (amicode#166 / parent #159). The wire shape is the #165 status contract
// served by GET /amicode/connections ({ok, connections:[…]}) and the three
// POST mutations ({ok, connection, error}) — packages/opencode
// src/server/amicode/connections.ts is the producer. This module is the
// SINGLE consumer of the wire shape (vaults.ts idiom: one schema, one place
// to update). It must never throw on malformed input; unknown fields are
// dropped and unknown states collapse to a safe "unknown" fallback, so a
// poisoned or future-shaped response can neither crash the card nor carry a
// secret into the DOM.

export const CONNECTION_WIRE_STATES = ["connected", "needs-key", "invalid", "unreachable", "validating"] as const
export type ConnectionWireState = (typeof CONNECTION_WIRE_STATES)[number]
/** Everything the wire might say beyond the five contract states renders via
 *  the "unknown" fallback (expired / unentitled land in later slices). */
export type ConnectionCardState = ConnectionWireState | "unknown"

export type ConnectionView = {
  id: string
  state: ConnectionCardState
  /** what the wire actually said — shown verbatim when state is "unknown" */
  rawState: string
  identity?: string
  /** server-offered prefill for the key form (forward-compatible) */
  baseUrl?: string
  /** display string: locale-formatted timestamp or an em dash */
  validatedAt: string
  stale: boolean
}

export type ConnectionsView = { ok: boolean; connections: ConnectionView[]; error?: string }
export type ConnectionActionView = { ok: boolean; connection?: ConnectionView; error?: string }

export const COMPANY_COMPUTE_ID = "company-compute"

const WIRE_STATES: ReadonlySet<string> = new Set(CONNECTION_WIRE_STATES)

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined
}

export function validatedAtDisplay(value: unknown): string {
  const raw = str(value)
  if (!raw) return "—"
  const at = Date.parse(raw)
  if (!Number.isFinite(at)) return "—"
  return new Date(at).toLocaleString()
}

function parseConnectionEntry(raw: unknown): ConnectionView {
  const entry = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const rawState = str(entry.state) ?? "unknown"
  return {
    id: str(entry.id) ?? "(unknown)",
    state: WIRE_STATES.has(rawState) ? (rawState as ConnectionWireState) : "unknown",
    rawState,
    identity: str(entry.identity),
    baseUrl: str(entry.base_url),
    validatedAt: validatedAtDisplay(entry.validated_at),
    stale: entry.stale === true,
  }
}

export function parseConnectionsResponse(raw: unknown): ConnectionsView {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, connections: [], error: "bad_shape: response is not an object" }
  const data = raw as Record<string, unknown>
  if (data.ok !== true) {
    const error = str(data.error) ?? "connection status reported a failure"
    return { ok: false, connections: [], error }
  }
  if (!Array.isArray(data.connections))
    return { ok: false, connections: [], error: "bad_shape: connections missing or not a list" }
  return { ok: true, connections: data.connections.map(parseConnectionEntry) }
}

// --- card model (AC1): the pure state→props mapping the tab renders from.
// The tsx component is a thin projection of this — with no component harness
// in the repo, this mapping carries the behavioral contract and its tests.

export type ConnectionStateLabels = Record<ConnectionCardState, string>

/** Distinct copy per state; anything unrecognized reads the "unknown" line. */
export function stateCopy(view: ConnectionView, labels: ConnectionStateLabels): string {
  return labels[view.state]
}

export type ConnectionCardModel = {
  state: ConnectionCardState
  tone: "success" | "critical" | "warning" | "pending" | "neutral"
  /** key-entry form (base_url + masked token) */
  showForm: boolean
  /** true only while validating — the in-flight render keeps the form frozen */
  formDisabled: boolean
  /** disconnect + revalidate */
  showActions: boolean
  showValidatedAt: boolean
  showIdentity: boolean
  showStale: boolean
  /** unknown states show the wire's raw word beside the fallback copy */
  showRawState: boolean
}

export function cardModel(view: ConnectionView): ConnectionCardModel {
  const base = {
    state: view.state,
    formDisabled: false,
    showValidatedAt: false,
    showIdentity: false,
    showStale: false,
    showRawState: false,
  }
  switch (view.state) {
    case "connected":
      return {
        ...base,
        tone: "success",
        showForm: false,
        showActions: true,
        showValidatedAt: true,
        showIdentity: view.identity !== undefined,
        showStale: view.stale,
      }
    case "needs-key":
      return { ...base, tone: "neutral", showForm: true, showActions: false }
    case "invalid":
      return { ...base, tone: "critical", showForm: true, showActions: false }
    case "unreachable":
      return { ...base, tone: "warning", showForm: true, showActions: false }
    case "validating":
      return { ...base, tone: "pending", showForm: true, formDisabled: true, showActions: false }
    default:
      // safe fallback (AC4): keep every exit open — re-key, disconnect, or
      // revalidate — and surface whatever the wire said as a raw badge.
      return {
        ...base,
        tone: "neutral",
        showForm: true,
        showActions: true,
        showRawState: true,
        showValidatedAt: view.validatedAt !== "—",
        showIdentity: view.identity !== undefined,
      }
  }
}

export function parseConnectionActionResponse(raw: unknown): ConnectionActionView {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, error: "bad_shape: response is not an object" }
  const data = raw as Record<string, unknown>
  if (data.ok !== true) {
    const error = str(data.error) ?? "connection update failed"
    return { ok: false, error }
  }
  if (typeof data.connection !== "object" || data.connection === null || Array.isArray(data.connection))
    return { ok: false, error: "bad_shape: connection missing" }
  return { ok: true, connection: parseConnectionEntry(data.connection) }
}

// --- submit gate (AC3): an empty submission yields NO payload — the card
// fires no request and changes no state when this returns undefined.

export type CredentialSubmitPayload = { id: string; base_url: string; token: string }

export function submitPayload(id: string, baseUrl: string, token: string): CredentialSubmitPayload | undefined {
  const base = baseUrl.trim()
  const key = token.trim()
  if (base === "" || key === "") return undefined
  return { id, base_url: base, token: key }
}

// --- action overlay (AC2): the app layer wraps ONE round trip with this —
// {validating: id} while the POST is in flight, then {terminal: connection}
// parsed from the SAME response. Pure and non-mutating; no polling loop.

export type ConnectionOverlay = {
  /** connection id whose card renders "validating" while a request runs */
  validating?: string
  /** terminal connection from the mutation response; replaces the card */
  terminal?: ConnectionView
}

function replaceConnection(base: ConnectionsView | undefined, entry: ConnectionView): ConnectionsView {
  if (!base || !base.ok) return { ok: true, connections: [entry] }
  const found = base.connections.some((conn) => conn.id === entry.id)
  return {
    ok: true,
    connections: found
      ? base.connections.map((conn) => (conn.id === entry.id ? entry : conn))
      : [...base.connections, entry],
  }
}

function validatingEntry(base: ConnectionsView | undefined, id: string): ConnectionView {
  const existing = base?.ok ? base.connections.find((conn) => conn.id === id) : undefined
  if (existing) return { ...existing, state: "validating", rawState: "validating" }
  return { id, state: "validating", rawState: "validating", validatedAt: "—", stale: false }
}

export function applyConnectionOverlay(
  base: ConnectionsView | undefined,
  overlay: ConnectionOverlay,
): ConnectionsView | undefined {
  let view = base
  if (overlay.terminal) view = replaceConnection(view, overlay.terminal)
  // applied last: a request in flight outranks any previously stored terminal
  if (overlay.validating !== undefined) view = replaceConnection(view, validatingEntry(view, overlay.validating))
  return view
}

// AMICODE: Connections routes data source (amicode#165 / parent #159, ADR
// 0002) — Company Compute connect path. Probe-first validation: a submitted
// key is classified against the solve service's fake-task status route BEFORE
// anything touches disk; only auth-passed classes write through the #162
// CredentialStore seam. SECURITY: secrets ride POST bodies and Authorization
// headers ONLY — never URLs, never query params, never error messages or
// logs. Every status response is built through a redacting whitelist parser,
// so no input (cache file, in-memory state) can leak a token into a body.
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { readCredential, type ConnectionType } from "./credentials"

// --- status contract (parent #159 data contract; secret-free by construction) ---

/** This slice only ever produces connected / needs-key / invalid /
 *  unreachable / validating for company-compute; expired + unentitled are
 *  forward-compatible states later slices fill in. */
export type ConnectionState =
  | "connected"
  | "needs-key"
  | "invalid"
  | "expired"
  | "unreachable"
  | "unentitled"
  | "validating"

export interface ConnectionDevice {
  id?: string
  name?: string
  state?: string
}

export interface ConnectionStatus {
  id: ConnectionType
  state: ConnectionState
  identity?: string
  entitlements?: string[]
  expires_at?: string
  devices?: ConnectionDevice[]
  validated_at: string | null
  stale: boolean
}

/** The connection cards this slice serves. Later slices append "pasqal-cloud". */
export const CONNECTION_IDS: ConnectionType[] = ["company-compute"]

/** A connected claim older than this renders stale:true — the UI's cue to
 *  offer revalidation. Freshness metadata only; never blocks anything. */
export const STALE_MS = 24 * 60 * 60 * 1000

/** Non-secret status cache — the ops-dir env-override idiom the siblings use
 *  (problems.ts / profile.ts / credentials.ts): $AMICODE_CONNECTIONS_FILE
 *  overrides, default lives beside cloud.json under ~/.amico. Holds ONLY
 *  whitelisted status fields; credentials live in the #162 store. */
export function connectionsFile(): string {
  const env = process.env.AMICODE_CONNECTIONS_FILE
  if (env && env.trim() !== "") return env
  return path.join(homedir(), ".amico", "connections.json")
}

/** In-memory in-flight state: while a submit/revalidate probe runs, its id
 *  maps to an entry here and concurrent GETs render "validating". Exported as
 *  the in-memory seam the poison test seeds — whatever lands in an entry, only
 *  the whitelist below can reach a response. */
export const inflightOverlay = new Map<string, Record<string, unknown>>()

// --- the redacting whitelist parser: the ONLY way status inputs become a
// response. It builds a FRESH object from declared fields with type checks —
// unknown keys (token, password, anything) have no path into the output.

const KNOWN_STATES: ReadonlySet<string> = new Set([
  "connected",
  "needs-key",
  "invalid",
  "expired",
  "unreachable",
  "unentitled",
  "validating",
])

function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined
}

function whitelistDevices(v: unknown): ConnectionDevice[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: ConnectionDevice[] = []
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue
    const d = raw as Record<string, unknown>
    const device: ConnectionDevice = {}
    if (str(d.id)) device.id = d.id as string
    if (str(d.name)) device.name = d.name as string
    if (str(d.state)) device.state = d.state as string
    if (Object.keys(device).length > 0) out.push(device)
  }
  return out.length > 0 ? out : undefined
}

/** Whitelist one persisted cache entry: only known-safe fields survive, each
 *  type-checked and rebuilt. Everything else — poisoned or not — is dropped. */
function whitelistPersisted(raw: unknown): Partial<ConnectionStatus> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {}
  const d = raw as Record<string, unknown>
  const out: Partial<ConnectionStatus> = {}
  const state = str(d.state)
  if (state && KNOWN_STATES.has(state)) out.state = state as ConnectionState
  if (str(d.identity)) out.identity = d.identity as string
  if (Array.isArray(d.entitlements)) {
    const entitlements = d.entitlements.filter((e): e is string => typeof e === "string" && e !== "")
    if (entitlements.length > 0) out.entitlements = entitlements
  }
  if (str(d.expires_at)) out.expires_at = d.expires_at as string
  const devices = whitelistDevices(d.devices)
  if (devices) out.devices = devices
  if (str(d.validated_at)) out.validated_at = d.validated_at as string
  return out
}

function computeStale(state: ConnectionState, validated_at: string | null, now: number): boolean {
  if (state !== "connected") return false
  if (!validated_at) return true
  const at = Date.parse(validated_at)
  if (!Number.isFinite(at)) return true
  return now - at > STALE_MS
}

/** Derive the rendered status for one connection from its whitelisted cache
 *  entry, the in-flight overlay, and credential presence (the truth for
 *  "connected"). Output carries ONLY whitelisted fields. */
function renderStatus(
  id: ConnectionType,
  persisted: Partial<ConnectionStatus>,
  input: { inflight: boolean; credential: boolean; now: number },
): ConnectionStatus {
  let state: ConnectionState
  if (input.inflight) state = "validating"
  else if (persisted.state === "connected") state = input.credential ? "connected" : "needs-key"
  else if (persisted.state) state = persisted.state
  else state = input.credential ? "connected" : "needs-key"

  const validated_at = state === "needs-key" ? null : (persisted.validated_at ?? null)
  const out: ConnectionStatus = { id, state, validated_at, stale: computeStale(state, validated_at, input.now) }
  if (state !== "needs-key") {
    if (persisted.identity) out.identity = persisted.identity
    if (persisted.entitlements) out.entitlements = persisted.entitlements
    if (persisted.expires_at) out.expires_at = persisted.expires_at
    if (persisted.devices) out.devices = persisted.devices
  }
  return out
}

function readCacheFile(file: string): Record<string, unknown> {
  try {
    if (!existsSync(file)) return {}
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"))
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {}
    return raw as Record<string, unknown>
  } catch {
    return {} // missing/unreadable/unparseable → empty, never a throw
  }
}

export function synthesizeConnections(code: string, detail: string): string {
  return JSON.stringify({ ok: false, connections: [], error: `${code}: ${detail}` })
}

export interface StatusInput {
  file: string
  overlay: ReadonlyMap<string, Record<string, unknown>>
  hasCredential: (id: ConnectionType) => boolean
  now?: number
}

/** Pure body-builder over injectable inputs (profile.ts idiom); the route
 *  entrypoint below binds the real file/overlay/credential store. */
export function statusBody(input: StatusInput): string {
  const cache = readCacheFile(input.file)
  const now = input.now ?? Date.now()
  const connections = CONNECTION_IDS.map((id) =>
    renderStatus(id, whitelistPersisted(cache[id]), {
      inflight: input.overlay.has(id),
      credential: input.hasCredential(id),
      now,
    }),
  )
  return JSON.stringify({ ok: true, connections, error: null })
}

/** GET /amicode/connections — never rejects; failures collapse into the one
 *  success shape like every other amicode route. */
export function statusResponse(): string {
  try {
    return statusBody({
      file: connectionsFile(),
      overlay: inflightOverlay,
      hasCredential: (id) => readCredential(id) !== undefined,
    })
  } catch (err) {
    return synthesizeConnections("bad_output", String(err))
  }
}

// --- probe validation ---

export type ProbeOutcome = "valid" | "invalid" | "unreachable"

/** Injectable fetch seam — tests stub this; production uses global fetch.
 *  Only the status code matters to classification. */
export type FetchImpl = (
  url: string,
  init: { method: "GET"; headers: Record<string, string> },
) => Promise<{ status: number }>

const PROBE_PATH = "/solves/__validate__/status"

/** Classify a Company Compute credential against the fake-task status route
 *  (parent #159 probe contract: the authorizer rejects bad keys before the
 *  handler; good keys reach the handler's not-found/forbidden).
 *    401                → invalid      (authorizer rejected the key)
 *    2xx / 403 / 404    → valid        (key got past the authorizer)
 *    anything else      → unreachable  (service or network trouble)
 *  The token rides the Authorization header ONLY — never the URL. */
export async function probeCompanyCompute(
  baseUrl: string,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ProbeOutcome> {
  const url = baseUrl.replace(/\/+$/, "") + PROBE_PATH
  let status: number
  try {
    status = (await fetchImpl(url, { method: "GET", headers: { authorization: `Bearer ${token}` } })).status
  } catch {
    return "unreachable"
  }
  if (status === 401) return "invalid"
  if ((status >= 200 && status < 300) || status === 403 || status === 404) return "valid"
  return "unreachable"
}

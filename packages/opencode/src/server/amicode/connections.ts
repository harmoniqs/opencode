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
import {
  atomicWriteFileSync,
  clearCredential,
  readCredential,
  writeCredential,
  type ConnectionType,
} from "./credentials"

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

function isKnownState(v: string): v is ConnectionState {
  return KNOWN_STATES.has(v)
}

function whitelistDevices(v: unknown): ConnectionDevice[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: ConnectionDevice[] = []
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue
    const d = raw as Record<string, unknown>
    const device: ConnectionDevice = {}
    const id = str(d.id)
    const name = str(d.name)
    const state = str(d.state)
    if (id) device.id = id
    if (name) device.name = name
    if (state) device.state = state
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
  if (state && isKnownState(state)) out.state = state
  const identity = str(d.identity)
  if (identity) out.identity = identity
  if (Array.isArray(d.entitlements)) {
    const entitlements = d.entitlements.filter((e): e is string => typeof e === "string" && e !== "")
    if (entitlements.length > 0) out.entitlements = entitlements
  }
  const expires = str(d.expires_at)
  if (expires) out.expires_at = expires
  const devices = whitelistDevices(d.devices)
  if (devices) out.devices = devices
  const validated = str(d.validated_at)
  if (validated) out.validated_at = validated
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

// --- status cache writes: everything lands through the same whitelist, so a
// poisoned in-memory object can never serialize, and a poisoned file gets
// scrubbed on the next write. Atomic replace via the #162 writer.

function persistStatus(id: ConnectionType, entry: Partial<ConnectionStatus>): void {
  const file = connectionsFile()
  const cache = readCacheFile(file)
  const out: Record<string, unknown> = {}
  for (const key of CONNECTION_IDS) if (key in cache) out[key] = whitelistPersisted(cache[key])
  out[id] = whitelistPersisted(entry)
  atomicWriteFileSync(file, JSON.stringify(out, null, 2) + "\n")
}

function clearStatus(id: ConnectionType): void {
  const file = connectionsFile()
  const cache = readCacheFile(file)
  const out: Record<string, unknown> = {}
  for (const key of CONNECTION_IDS) if (key !== id && key in cache) out[key] = whitelistPersisted(cache[key])
  atomicWriteFileSync(file, JSON.stringify(out, null, 2) + "\n")
}

// --- mutation bodies (POST routes). One shape per route family, sibling
// discipline: never reject, ok:false + "code: detail" on failure. SECURITY:
// every failure message is a FIXED string — nothing the caller sent (token,
// base_url, anything an encoder rejects) is ever echoed.

export function synthesizeConnection(code: string, detail: string): string {
  return JSON.stringify({ ok: false, connection: null, error: `${code}: ${detail}` })
}

// --- loopback guard: credential mutations serve LOCAL callers only. The bind
// hostname is recorded by Server.listen (server.ts) at listen time; the
// in-process webHandler never binds a socket, so "never recorded" counts as
// loopback. setBindHostname doubles as the injectable test seam.

let bindHostname: string | undefined

/** Returns the previous value so a listener can RESTORE it when it stops — a
 *  dead 0.0.0.0 listener must not keep refusing mutations for a later
 *  loopback/in-process handler (see server.ts). */
export function setBindHostname(hostname: string | undefined): string | undefined {
  const previous = bindHostname
  bindHostname = hostname
  return previous
}

/** Same loopback family the mdns gate recognizes (server.ts), widened to the
 *  whole 127/8 block and the v4-mapped form. undefined = in-process handler. */
export function isLoopbackHostname(hostname: string | undefined): boolean {
  if (hostname === undefined) return true
  const host = hostname.toLowerCase()
  if (host === "localhost" || host === "::1") return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (host.startsWith("::ffff:127.")) return true
  return false
}

/** The distinct refusal every mutation route answers on a non-loopback bind
 *  (AC5); undefined when the bind is fine. */
function loopbackRefusal(bind: string | undefined): string | undefined {
  if (isLoopbackHostname(bind)) return undefined
  return synthesizeConnection("non_loopback", "credential mutations serve loopback binds only")
}

const MAX_BODY_BYTES = 16 * 1024 // credentials are small; bigger is a mistake

export interface MutationDeps {
  fetchImpl?: FetchImpl
  /** override the recorded bind hostname (pure-injection alternative to
   *  setBindHostname) */
  bindHostname?: string
}

function renderCurrent(id: ConnectionType): string {
  const cache = readCacheFile(connectionsFile())
  const connection = renderStatus(id, whitelistPersisted(cache[id]), {
    inflight: inflightOverlay.has(id),
    credential: readCredential(id) !== undefined,
    now: Date.now(),
  })
  return JSON.stringify({ ok: true, connection, error: null })
}

function parseMutationBody(rawBody: string): { id?: unknown; base_url?: unknown; token?: unknown } | undefined {
  if (rawBody.length > MAX_BODY_BYTES) return undefined
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined
    return parsed as { id?: unknown; base_url?: unknown; token?: unknown }
  } catch {
    return undefined
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/** POST /amicode/connections/credential — body {id:"company-compute",
 *  base_url, token}. Probe FIRST; only the auth-passed class writes through
 *  the #162 seam. The terminal status rides back in the SAME response; while
 *  the probe runs, the overlay renders "validating" for concurrent GETs. */
export async function submitCredentialResponse(rawBody: string, deps: MutationDeps = {}): Promise<string> {
  const refusal = loopbackRefusal(deps.bindHostname ?? bindHostname)
  if (refusal) return refusal
  const body = parseMutationBody(rawBody)
  if (!body) return synthesizeConnection("bad_request", "body must be JSON {id, base_url, token}")
  if (body.id !== "company-compute") {
    if (body.id === "pasqal-cloud")
      return synthesizeConnection("unsupported_connection", "pasqal-cloud lands in a later slice")
    return synthesizeConnection("unknown_connection", "id must be a known connection id")
  }
  const base = typeof body.base_url === "string" ? body.base_url.trim().replace(/\/+$/, "") : ""
  const token = typeof body.token === "string" ? body.token.trim() : ""
  if (base === "" || token === "")
    return synthesizeConnection("bad_request", "non-empty base_url and token are required")
  if (!isHttpUrl(base)) return synthesizeConnection("bad_request", "base_url must be an http(s) URL")

  const id: ConnectionType = "company-compute"
  inflightOverlay.set(id, { state: "validating" })
  let outcome: ProbeOutcome
  try {
    outcome = await probeCompanyCompute(base, token, deps.fetchImpl)
  } finally {
    inflightOverlay.delete(id)
  }
  const validated_at = new Date().toISOString()
  if (outcome === "valid") {
    try {
      writeCredential(id, { base_url: base, token })
    } catch {
      // value-free by contract: never echo what the encoder rejected
      return synthesizeConnection("write_failed", "credential could not be saved")
    }
    persistStatus(id, { state: "connected", validated_at })
  } else {
    // nothing written — an existing credential (if any) stays untouched
    persistStatus(id, { state: outcome, validated_at })
  }
  return renderCurrent(id)
}

/** id-only mutation bodies (disconnect/revalidate) — the secret NEVER rides
 *  these requests; revalidation reads the stored credential server-side. */
function parseIdBody(rawBody: string): ConnectionType | undefined {
  const body = parseMutationBody(rawBody)
  if (!body) return undefined
  const id = body.id
  if (typeof id !== "string") return undefined
  return CONNECTION_IDS.find((known) => known === id)
}

/** POST /amicode/connections/disconnect — body {id}. Clears the credential
 *  through the #162 seam and drops the cache entry; status becomes needs-key.
 *  Idempotent: disconnecting an absent credential is a no-op. */
export function disconnectResponse(rawBody: string, deps: MutationDeps = {}): string {
  const refusal = loopbackRefusal(deps.bindHostname ?? bindHostname)
  if (refusal) return refusal
  const id = parseIdBody(rawBody)
  if (!id) return synthesizeConnection("bad_request", "body must be JSON {id} with a known connection id")
  try {
    clearCredential(id)
    clearStatus(id)
  } catch {
    return synthesizeConnection("write_failed", "credential could not be cleared")
  }
  return renderCurrent(id)
}

/** POST /amicode/connections/revalidate — body {id}. Re-runs the probe from
 *  the STORED credential and refreshes validated_at; the secret never rides
 *  the request. Absent credential → needs-key, no probe fired. */
export async function revalidateResponse(rawBody: string, deps: MutationDeps = {}): Promise<string> {
  const refusal = loopbackRefusal(deps.bindHostname ?? bindHostname)
  if (refusal) return refusal
  const id = parseIdBody(rawBody)
  if (!id) return synthesizeConnection("bad_request", "body must be JSON {id} with a known connection id")
  // parseIdBody only admits CONNECTION_IDS, and this slice serves exactly
  // company-compute — the Pasqal slice adds its own per-id probe branch here.
  const credential = readCredential("company-compute")
  if (!credential) {
    clearStatus(id) // a status claim without a credential behind it is noise
    return renderCurrent(id)
  }
  inflightOverlay.set(id, { state: "validating" })
  let outcome: ProbeOutcome
  try {
    outcome = await probeCompanyCompute(credential.base_url, credential.token, deps.fetchImpl)
  } finally {
    inflightOverlay.delete(id)
  }
  // credential is kept on EVERY outcome — invalid signals re-entry, it does
  // not destroy user data; only disconnect removes the file.
  persistStatus(id, { state: outcome === "valid" ? "connected" : outcome, validated_at: new Date().toISOString() })
  return renderCurrent(id)
}

// AMICODE: dashboard layout state (spec T2.5) — which widgets show, in what
// order, with what per-widget config. Server-owned JSON at
// ~/.amico/dashboard.json (env-injectable for tests, problems.ts idiom).
// Merge discipline: sanitize, never reject on VALUES; only structurally
// invalid bodies get ok:false. Missing/corrupt file → synthesized from the
// registry in built-in order, nothing written until the first save.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { sanitizeConfig, type WidgetManifest } from "./widget-manifest"

export interface RegistryWidget {
  manifest: WidgetManifest
  builtin: boolean
  overridden?: boolean
  hash?: string
}

export interface DashboardEntry {
  key: string
  id: string
  hidden: boolean
  config: Record<string, unknown>
  missing?: boolean
}

export interface DashboardState {
  version: 1
  widget: DashboardEntry[]
}

export function dashboardFile(): string {
  const env = process.env.AMICODE_DASHBOARD_FILE
  if (env && env.trim() !== "") return env
  return path.join(homedir(), ".amico", "dashboard.json")
}

/** Deterministic pre-save instance key: stable across GETs so the grid never
 *  sees identity churn before the user first customizes. */
export function entryKey(id: string): string {
  return "w-" + createHash("sha256").update(id).digest("hex").slice(0, 6)
}

type StoredEntry = { key?: unknown; id?: unknown; hidden?: unknown; config?: unknown }
type StoredState = { version?: unknown; widget?: unknown }

/** Merge stored state (or null) against the live registry. Pure. */
export function mergeDashboard(stored: StoredState | null, registry: RegistryWidget[]): DashboardState {
  const byId = new Map(registry.map((w) => [w.manifest.id, w]))
  const out: DashboardEntry[] = []
  const seen = new Set<string>()

  const storedEntries: StoredEntry[] = Array.isArray(stored?.widget) ? (stored!.widget as StoredEntry[]) : []
  for (const raw of storedEntries) {
    if (typeof raw !== "object" || raw === null) continue
    const id = raw.id
    if (typeof id !== "string" || id === "" || seen.has(id)) continue
    seen.add(id)
    const reg = byId.get(id)
    const config = typeof raw.config === "object" && raw.config !== null ? (raw.config as Record<string, unknown>) : {}
    out.push({
      key: typeof raw.key === "string" && raw.key !== "" ? raw.key : entryKey(id),
      id,
      hidden: raw.hidden === true,
      config: reg ? sanitizeConfig(reg.manifest.config, config) : config,
      ...(reg ? {} : { missing: true }),
    })
  }
  // registry widgets absent from state appear at the end, visible (new
  // built-ins surface automatically after an upgrade)
  for (const w of registry) {
    if (seen.has(w.manifest.id)) continue
    out.push({
      key: entryKey(w.manifest.id),
      id: w.manifest.id,
      hidden: false,
      config: sanitizeConfig(w.manifest.config, undefined),
    })
  }
  return { version: 1, widget: out }
}

export type SaveResult = { ok: true; state: DashboardState } | { ok: false; error: string }

/** Validate structure only; values sanitize. Pure. */
export function applySave(rawBody: string, registry: RegistryWidget[]): SaveResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { ok: false, error: "bad_body: not JSON" }
  }
  if (typeof parsed !== "object" || parsed === null) return { ok: false, error: "bad_body: not an object" }
  const widget = (parsed as StoredState).widget
  if (!Array.isArray(widget)) return { ok: false, error: "bad_body: widget must be a list" }
  for (const e of widget) {
    if (typeof e !== "object" || e === null || typeof (e as StoredEntry).id !== "string")
      return { ok: false, error: "bad_body: entries need a string id" }
  }
  return { ok: true, state: mergeDashboard(parsed as StoredState, registry) }
}

function readStored(): StoredState | null {
  const file = dashboardFile()
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"))
    return typeof parsed === "object" && parsed !== null ? (parsed as StoredState) : null
  } catch {
    return null // corrupt → behave as missing; a save will heal it
  }
}

export function dashboardResponse(registry: RegistryWidget[]): string {
  return JSON.stringify({ ok: true, dashboard: mergeDashboard(readStored(), registry), error: null })
}

export function saveDashboardResponse(rawBody: string, registry: RegistryWidget[]): string {
  const r = applySave(rawBody, registry)
  if (!r.ok) return JSON.stringify({ ok: false, dashboard: null, error: r.error })
  const file = dashboardFile()
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(r.state, null, 2) + "\n")
  } catch (e) {
    return JSON.stringify({ ok: false, dashboard: null, error: `write_failed: ${(e as Error).message}` })
  }
  return JSON.stringify({ ok: true, dashboard: r.state, error: null })
}

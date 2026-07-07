// AMICODE: single consumer of the problem-endpoint wire shapes (spec B —
// GET /amicode/problems, /amicode/problem, /amicode/run-status served by
// packages/opencode/src/server/amicode/problems.ts). Pure, tolerant parsing +
// display derivations (chips, pending merge, run chip, rail failure states,
// entity-view rows). Same defensive style as ./vaults.ts: typeof checks on
// every field, drop non-conforming array entries, never throw. JSX-free so it
// is directly testable under `bun test`.
import { entityLabel } from "./receipt"

// --- view types --------------------------------------------------------------

export type ProblemSummary = {
  slug: string
  name: string
  status: string
  recorded?: string
  entityKinds: string[]
}
export type ProblemsView = { ok: boolean; active?: string; problems: ProblemSummary[]; error?: string }

export type EventView = {
  seq: number
  ts?: string
  entity: string
  action: string
  diff?: Record<string, { from: unknown; to: unknown }>
  source?: { tool?: string; stage?: string }
}
export type RunRefView = { runId: string; lab?: string; tier?: string; recorded?: string }
export type ProblemView = {
  ok: boolean
  name?: string
  slug?: string
  status?: string
  entities: Record<string, Record<string, unknown>>
  scoreStages: string[]
  events: EventView[]
  runs: RunRefView[]
  error?: string
}
export type RunStatusView = {
  runId: string
  status: "solving" | "finished" | "failed" | "stalled" | "stopped" | "aborted"
  fidelity: number | null
  iteration: number | null
}
export type Chip = { kind: string; label: string; text?: string; pending: boolean }
export type RailState =
  | { kind: "loading" }
  | { kind: "ready"; view: ProblemView; stale: boolean }
  | { kind: "unavailable"; error?: string }

// --- wire parsers ------------------------------------------------------------

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}

export function parseProblemsResponse(raw: unknown): ProblemsView {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, problems: [], error: "bad_shape: response is not an object" }
  const data = raw as Record<string, unknown>
  if (data.ok !== true) {
    const error = str(data.error) ?? "problem endpoint reported a failure"
    return { ok: false, problems: [], error }
  }
  const problems = (Array.isArray(data.problems) ? data.problems : [])
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map(
      (entry): ProblemSummary => ({
        slug: str(entry.slug) ?? "(unknown)",
        name: str(entry.name) ?? str(entry.slug) ?? "(unknown)",
        status: str(entry.status) ?? "designing",
        recorded: str(entry.recorded),
        entityKinds: Array.isArray(entry.entity_kinds)
          ? entry.entity_kinds.filter((k): k is string => typeof k === "string")
          : [],
      }),
    )
  return { ok: true, active: str(data.active), problems }
}

export function parseProblemResponse(raw: unknown): ProblemView {
  const empty = { entities: {}, scoreStages: [], events: [], runs: [] }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, ...empty, error: "bad_shape: response is not an object" }
  const data = raw as Record<string, unknown>
  if (data.ok !== true) return { ok: false, ...empty, error: str(data.error) ?? "problem endpoint reported a failure" }
  const problem = (typeof data.problem === "object" && data.problem !== null ? data.problem : {}) as Record<
    string,
    unknown
  >
  const entities: Record<string, Record<string, unknown>> = {}
  if (typeof data.entities === "object" && data.entities !== null)
    for (const [kind, value] of Object.entries(data.entities as Record<string, unknown>))
      entities[kind] = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  const events = (Array.isArray(data.events) ? data.events : [])
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .filter((entry) => typeof entry.seq === "number" && typeof entry.entity === "string")
    .map(
      (entry): EventView => ({
        seq: entry.seq as number,
        ts: str(entry.ts),
        entity: entry.entity as string,
        action: str(entry.action) ?? "",
        diff:
          typeof entry.diff === "object" && entry.diff !== null
            ? (entry.diff as Record<string, { from: unknown; to: unknown }>)
            : undefined,
        source:
          typeof entry.source === "object" && entry.source !== null
            ? (entry.source as { tool?: string; stage?: string })
            : undefined,
      }),
    )
  const runs = (Array.isArray(data.runs) ? data.runs : [])
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .filter((entry) => typeof entry.run_id === "string")
    .map(
      (entry): RunRefView => ({
        runId: entry.run_id as string,
        lab: str(entry.lab),
        tier: str(entry.tier),
        recorded: str(entry.recorded),
      }),
    )
  return {
    ok: true,
    name: str(problem.name),
    slug: str(problem.slug),
    status: str(problem.status),
    entities,
    scoreStages: (Array.isArray(data.score_stages) ? data.score_stages : []).filter(
      (k): k is string => typeof k === "string",
    ),
    events,
    runs,
  }
}

export function parseRunStatusResponse(raw: unknown): RunStatusView[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return []
  const data = raw as Record<string, unknown>
  if (data.ok !== true || !Array.isArray(data.runs)) return []
  return data.runs
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .filter(
      (entry) =>
        typeof entry.run_id === "string" &&
        (entry.status === "solving" ||
          entry.status === "finished" ||
          entry.status === "failed" ||
          entry.status === "stalled" ||
          entry.status === "stopped" ||
          entry.status === "aborted"),
    )
    .map(
      (entry): RunStatusView => ({
        runId: entry.run_id as string,
        status: entry.status as RunStatusView["status"],
        fidelity: typeof entry.fidelity === "number" ? entry.fidelity : null,
        iteration: typeof entry.iteration === "number" ? entry.iteration : null,
      }),
    )
}

// --- chips -------------------------------------------------------------------

const CHIP_ORDER = ["system", "formulation", "run", "device_session", "calibration"]

function shortValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

/** Compact per-kind chip text; undefined when the entity has nothing to show. */
export function chipText(kind: string, entity: Record<string, unknown>): string | undefined {
  if (kind === "system") {
    const params = (typeof entity.params === "object" && entity.params !== null ? entity.params : {}) as Record<
      string,
      unknown
    >
    const parts = [
      str(entity.platform),
      typeof entity.levels === "number" ? `${entity.levels} lvl` : undefined,
      typeof params.drive_max === "number" ? `cap ${params.drive_max}` : undefined,
    ].filter((p): p is string => Boolean(p))
    return parts.length > 0 ? parts.join(" · ") : undefined
  }
  if (kind === "formulation") {
    const parts = [str(entity.target), str(entity.objective)].filter((p): p is string => Boolean(p))
    if (parts.length > 0) return parts.join(" · ")
    return str(entity.problem_type)
  }
  if (kind === "run") return undefined // run chip text comes from runChipText
  // generic: flatten one level of nesting to bare keys, skip null/notes/recorded
  const SKIP = new Set(["notes", "recorded"])
  const entries: string[] = []
  for (const [key, value] of Object.entries(entity)) {
    if (SKIP.has(key) || value === null || value === undefined) continue
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue === null || innerValue === undefined) continue
        entries.push(`${inner}=${shortValue(innerValue)}`)
      }
    } else entries.push(`${key}=${shortValue(value)}`)
  }
  if (entries.length === 0) return undefined
  return entries.length > 4 ? entries.slice(0, 4).join(" · ") + " · …" : entries.join(" · ")
}

/** Present chips in canonical-then-first-seen order, then dimmed pending chips
 *  for score stages not yet recorded (the path ahead, filled left to right). */
export function mergeChips(entities: Record<string, Record<string, unknown>>, scoreStages: string[]): Chip[] {
  const present = Object.keys(entities)
  const ordered = [
    ...CHIP_ORDER.filter((kind) => present.includes(kind)),
    ...present.filter((kind) => !CHIP_ORDER.includes(kind)),
  ]
  const chips: Chip[] = ordered.map((kind) => ({
    kind,
    label: entityLabel(kind),
    text: chipText(kind, entities[kind]),
    pending: false,
  }))
  for (const kind of scoreStages) {
    if (present.includes(kind)) continue
    chips.push({ kind, label: entityLabel(kind), pending: true })
  }
  return chips
}

// --- run chip ----------------------------------------------------------------

function formatFidelity(value: number): string {
  // up to 4 significant decimals, trailing zeros trimmed
  return String(Number(value.toFixed(4)))
}

export function runChipText(statuses: RunStatusView[]): string | undefined {
  if (statuses.length === 0) return undefined
  const solving = [...statuses].reverse().find((s) => s.status === "solving")
  if (solving) {
    const f = solving.fidelity
    // wire carries the raw objective f (≈ infidelity) for solving runs; only
    // render F = 1 - f when f plausibly IS an infidelity (result.toml's
    // finished fidelity needs no transform)
    if (f !== null && f >= 0 && f <= 1) return `solving… F=${formatFidelity(1 - f)}`
    return "solving…"
  }
  const finished = [...statuses].reverse().find((s) => s.status === "finished")
  if (finished && finished.fidelity !== null) {
    const iter = finished.iteration !== null ? ` · ${finished.iteration} iter` : ""
    return `F=${formatFidelity(finished.fidelity)}${iter}`
  }
  if (finished) return "finished"
  const stalled = [...statuses].reverse().find((s) => s.status === "stalled")
  if (stalled) return stalled.iteration !== null ? `stalled · iter ${stalled.iteration}` : "stalled"
  // A deliberate user stop/abort is a successful action — it must never read
  // as "failed" or vanish from the rail (one-spine: run-terminal.ts).
  const stopped = [...statuses].reverse().find((s) => s.status === "stopped" || s.status === "aborted")
  if (stopped) return stopped.status
  return "failed"
}

// --- rail state --------------------------------------------------------------

export function railState(current: ProblemView | undefined, lastGood: ProblemView | undefined): RailState {
  if (current === undefined) return { kind: "loading" }
  if (current.ok) return { kind: "ready", view: current, stale: false }
  if (lastGood?.ok) return { kind: "ready", view: lastGood, stale: true }
  return { kind: "unavailable", error: current.error }
}

// --- entity view helpers -------------------------------------------------------

export type EntityRow = { key: string; value: string }

/** Stable field rows: scalars in object order, one level of object nesting
 *  flattened to dotted keys, undefined skipped. */
export function entityRows(entity: Record<string, unknown>): EntityRow[] {
  const rows: EntityRow[] = []
  for (const [key, value] of Object.entries(entity)) {
    if (value === undefined) continue
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue === undefined) continue
        rows.push({ key: `${key}.${inner}`, value: shortValue(innerValue) })
      }
      continue
    }
    rows.push({ key, value: shortValue(value) })
  }
  return rows
}

export function historyRows(events: EventView[], kind: string): EventView[] {
  return events.filter((event) => event.entity === kind).sort((a, b) => b.seq - a.seq)
}

/** Draft-only edit-in-chat prompt: trailing space so the user types the value. */
export function editPromptText(kind: string, key: string, value: unknown): string {
  const bare = key.split(".").pop() ?? key
  return `Change the ${kind} ${bare} (currently ${shortValue(value)}) to `
}

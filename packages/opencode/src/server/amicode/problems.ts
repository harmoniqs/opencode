// AMICODE: data source for the problem-UI endpoints (GET /amicode/problems,
// /amicode/problem, /amicode/run-status). Reads the Spec A problem-workspace
// fs directly — SAME PROCESS, local fs, .json sidecars ONLY (the plugin owns
// the .toml mirrors). Every failure is synthesized into the route's one
// success shape (ok:false + "code: detail" error) so the web app parses one
// schema per route and the endpoints never reject. Pure body-builders take
// injectable roots for tests; the cached entrypoints bind the real dirs.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

/** Same env override the amicode plugin honors (test + grant point align). */
export function problemsRoot(): string {
  const env = process.env.AMICODE_PROBLEMS_DIR
  if (env && env.trim() !== "") return env
  return path.join(homedir(), ".amico", "problems")
}
export function runsRoot(): string {
  const env = process.env.AMICODE_RUNS_DIR
  if (env && env.trim() !== "") return env
  return path.join(homedir(), ".amico", "runs")
}

export function synthesizeProblems(code: string, detail: string): string {
  return JSON.stringify({ ok: false, active: null, problems: [], error: `${code}: ${detail}` })
}
export function synthesizeProblem(code: string, detail: string): string {
  return JSON.stringify({
    ok: false,
    problem: null,
    entities: {},
    score_stages: [],
    events: [],
    runs: [],
    error: `${code}: ${detail}`,
  })
}
export function synthesizeRunStatus(code: string, detail: string): string {
  return JSON.stringify({ ok: false, runs: [], error: `${code}: ${detail}` })
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"))
}
class BadJson extends Error {
  constructor(readonly file: string) {
    super(`bad_json:${file}`)
  }
}
function readJsonOrThrow(file: string): unknown {
  try {
    return readJson(file)
  } catch {
    throw new BadJson(path.basename(file))
  }
}

function activeSlug(root: string): string | null {
  const file = path.join(root, "active")
  if (!existsSync(file)) return null
  const slug = readFileSync(file, "utf8").trim()
  return slug && existsSync(path.join(root, slug)) ? slug : null
}

function entityKinds(dir: string): string[] {
  const entities = path.join(dir, "entities")
  if (!existsSync(entities)) return []
  return readdirSync(entities)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort()
}

export function problemsBody(root: string): string {
  if (!existsSync(root)) return synthesizeProblems("no_problems_dir", `${root} does not exist`)
  const problems: unknown[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const metaFile = path.join(root, entry.name, "problem.json")
    if (!existsSync(metaFile)) continue
    let meta: any
    try {
      meta = readJson(metaFile)
    } catch {
      continue // one broken workspace must not kill the list
    }
    problems.push({
      slug: meta.slug ?? entry.name,
      name: meta.name ?? entry.name,
      status: meta.status ?? "designing",
      score: meta.score?.id ?? null,
      recorded: meta.recorded ?? null,
      entity_kinds: entityKinds(path.join(root, entry.name)),
    })
  }
  return JSON.stringify({ ok: true, active: activeSlug(root), problems, error: null })
}

const EVENTS_WINDOW = 50

/** score_stages: ordered entity kinds the active score expects. Resolution
 *  chain: problem.score.id, else the workspace's interview_state.json score_id
 *  (the guard's durable record — problem.score is not yet stamped by spec A).
 *  The id must match the root manifest's id; any miss → [] (no pending chips). */
function scoreStages(root: string, dir: string, meta: any): string[] {
  let scoreId: string | undefined = typeof meta?.score?.id === "string" ? meta.score.id : undefined
  if (!scoreId) {
    try {
      const state: any = readJson(path.join(dir, "interview_state.json"))
      if (typeof state?.score_id === "string") scoreId = state.score_id
    } catch {
      /* absent/corrupt state → no score */
    }
  }
  if (!scoreId) return []
  try {
    const raw: any = readJson(path.join(root, "score_manifest.json"))
    const manifest = raw?.manifest
    if (manifest?.id !== scoreId || !Array.isArray(manifest.stages)) return []
    const out: string[] = []
    for (const stage of manifest.stages)
      for (const kind of stage?.emits ?? []) if (typeof kind === "string" && !out.includes(kind)) out.push(kind)
    return out
  } catch {
    return []
  }
}

export function problemBody(root: string, slug: string | undefined): string {
  if (!existsSync(root)) return synthesizeProblem("no_problems_dir", `${root} does not exist`)
  const resolved = slug ?? activeSlug(root) ?? undefined
  if (!resolved) return synthesizeProblem("not_found:", "no slug given and no active problem")
  const dir = path.join(root, resolved)
  if (!existsSync(path.join(dir, "problem.json")))
    return synthesizeProblem(`not_found:${resolved}`, "no such problem workspace")
  try {
    const meta = readJsonOrThrow(path.join(dir, "problem.json"))
    const entities: Record<string, unknown> = {}
    for (const kind of entityKinds(dir)) entities[kind] = readJsonOrThrow(path.join(dir, "entities", `${kind}.json`))
    let events: unknown[] = []
    const eventsFile = path.join(dir, "events.jsonl")
    if (existsSync(eventsFile)) {
      const lines = readFileSync(eventsFile, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
      events = lines.slice(-EVENTS_WINDOW).map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          throw new BadJson("events.jsonl")
        }
      })
    }
    let runs: unknown[] = []
    const runsFile = path.join(dir, "runs.json")
    if (existsSync(runsFile)) {
      const parsed: any = readJsonOrThrow(runsFile)
      if (Array.isArray(parsed?.runs)) runs = parsed.runs
    }
    return JSON.stringify({
      ok: true,
      problem: meta,
      entities,
      score_stages: scoreStages(root, dir, meta),
      events,
      runs,
      error: null,
    })
  } catch (err) {
    if (err instanceof BadJson) return synthesizeProblem("bad_json", err.file)
    return synthesizeProblem("bad_json", String(err))
  }
}

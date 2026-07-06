// AMICODE: data source for the problem-UI endpoints (GET /amicode/problems,
// /amicode/problem, /amicode/run-status). Reads the Spec A problem-workspace
// fs directly — SAME PROCESS, local fs, .json sidecars ONLY (the plugin owns
// the .toml mirrors). Every failure is synthesized into the route's one
// success shape (ok:false + "code: detail" error) so the web app parses one
// schema per route and the endpoints never reject. Pure body-builders take
// injectable roots for tests; the cached entrypoints bind the real dirs.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
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

// --- run-status (lightweight live readout; spec: run-dir contract polling, permanently) ---

function tomlScalar(text: string, key: string): number | null {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*([0-9eE+.\\-]+)\\s*$`, "m"))
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function lastIterLine(log: string): { iteration: number | null; fidelity: number | null } {
  // AMICODE_ITER iter=12 f=3.2e-02 …  (f is the objective ≈ infidelity; the
  // chip shows F = 1 - f — that derivation lives client-side in problem.ts)
  const lines = log.split("\n")
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/^AMICODE_ITER\s+iter=(\d+)\s+f=([0-9eE+.\-]+)/)
    if (match) return { iteration: Number(match[1]), fidelity: Number(match[2]) }
  }
  return { iteration: null, fidelity: null }
}

export function runStatusBody(root: string, runs: string, slug: string | undefined): string {
  if (!existsSync(root)) return synthesizeRunStatus("no_problems_dir", `${root} does not exist`)
  const resolved = slug ?? activeSlug(root) ?? undefined
  if (!resolved || !existsSync(path.join(root, resolved, "problem.json")))
    return synthesizeRunStatus(`not_found:${resolved ?? ""}`, "no such problem workspace")
  let refs: any[] = []
  try {
    const parsed: any = readJson(path.join(root, resolved, "runs.json"))
    if (Array.isArray(parsed?.runs)) refs = parsed.runs
  } catch {
    /* absent/corrupt runs.json → empty list, not an error */
  }
  const out = refs.map((ref) => {
    const dir = path.join(runs, String(ref.lab ?? "default"), String(ref.run_id ?? ""))
    if (existsSync(path.join(dir, "FINISHED"))) {
      try {
        const result = readFileSync(path.join(dir, "result.toml"), "utf8")
        const fidelity = tomlScalar(result, "fidelity")
        if (fidelity === null) throw new Error("no fidelity")
        return { run_id: ref.run_id, status: "finished", fidelity, iteration: tomlScalar(result, "iterations") }
      } catch {
        return { run_id: ref.run_id, status: "failed", fidelity: null, iteration: null }
      }
    }
    let live = { iteration: null as number | null, fidelity: null as number | null }
    try {
      live = lastIterLine(readFileSync(path.join(dir, "run.log"), "utf8"))
    } catch {
      /* not started yet */
    }
    return { run_id: ref.run_id, status: "solving", fidelity: live.fidelity, iteration: live.iteration }
  })
  return JSON.stringify({ ok: true, runs: out, error: null })
}

// --- run-series (spec C: inline run window — iteration curve + latest pulse +
// log tail for one run dir). Same never-reject discipline. The client derives
// F = 1 - f; we ship the raw objective f so one convention lives in one place. ---

const SERIES_MAX_POINTS = 160
const TAIL_LINES = 8

export function synthesizeRunSeries(code: string, detail: string): string {
  return JSON.stringify({ ok: false, run: null, error: `${code}: ${detail}` })
}

/** Resolve a run dir from run_id (+ optional lab). Without a lab, scan labs for
 *  the first `<runsRoot>/<lab>/<run>` that exists — run_ids are effectively unique. */
function resolveRunDir(runsRoot: string, run: string, lab: string | undefined): string | null {
  if (lab) {
    const dir = path.join(runsRoot, lab, run)
    return existsSync(dir) ? dir : null
  }
  if (!existsSync(runsRoot)) return null
  for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(runsRoot, entry.name, run)
    if (existsSync(dir)) return dir
  }
  return null
}

/** Start time embedded in the run_id: r20260705-193722Z-… → epoch ms (UTC). */
function runIdStartMs(runId: string): number | null {
  const m = runId.match(/r(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})Z/)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
}

function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points
  const out: T[] = []
  const step = (points.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]!)
  out[out.length - 1] = points[points.length - 1]! // always keep the last point
  return out
}

function parsePulseMeta(log: string): { drives: number; knots: number; labels: string[] } | null {
  const m = log.match(/^AMICODE_PULSE_META\s+drives=(\d+)\s+knots=(\d+)\s+labels=([^\n]*)$/m)
  if (!m) return null
  const labels = [...m[3].matchAll(/"([^"]*)"/g)].map((x) => x[1])
  return { drives: Number(m[1]), knots: Number(m[2]), labels }
}

function parseLastPulse(log: string): { iter: number; dt: number; values: number[] } | null {
  const lines = log.split("\n")
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^AMICODE_PULSE\s+iter=(\d+)\s+dt=([0-9eE+.\-]+)\s+a=(.+)$/)
    if (m) {
      const values = m[3].split(",").map(Number).filter((v) => Number.isFinite(v))
      return { iter: Number(m[1]), dt: Number(m[2]), values }
    }
  }
  return null
}

export function runSeriesBody(runsRoot: string, run: string | undefined, lab: string | undefined): string {
  if (!run || run.trim() === "") return synthesizeRunSeries("bad_request", "missing run id")
  if (!existsSync(runsRoot)) return synthesizeRunSeries("no_runs_dir", `${runsRoot} does not exist`)
  const dir = resolveRunDir(runsRoot, run, lab)
  if (!dir) return synthesizeRunSeries(`not_found:${run}`, "no such run dir")

  let log = ""
  try {
    log = readFileSync(path.join(dir, "run.log"), "utf8")
  } catch {
    /* run.log may not exist yet (queued) → empty series */
  }

  const iters: { iter: number; f: number }[] = []
  for (const line of log.split("\n")) {
    const m = line.match(/^AMICODE_ITER\s+iter=(\d+)\s+f=([0-9eE+.\-]+)/)
    if (!m) continue
    const f = Number(m[2])
    if (Number.isFinite(f)) iters.push({ iter: Number(m[1]), f })
  }
  const series = downsample(iters, SERIES_MAX_POINTS)
  const bestF = iters.length ? Math.min(...iters.map((p) => p.f)) : null
  const lastIter = iters.length ? iters[iters.length - 1] : null

  const finished = existsSync(path.join(dir, "FINISHED"))
  let status = "solving"
  let fidelity: number | null = null
  let iteration: number | null = lastIter?.iter ?? null
  if (finished) {
    try {
      const result = readFileSync(path.join(dir, "result.toml"), "utf8")
      fidelity = tomlScalar(result, "fidelity")
      const it = tomlScalar(result, "iterations")
      if (it !== null) iteration = it
      status = fidelity === null ? "failed" : "finished"
    } catch {
      status = "failed"
    }
  }
  // DONE line: authoritative fidelity even before the FINISHED sentinel lands.
  if (fidelity === null) {
    const done = log.match(/^DONE\s+fidelity=([0-9eE+.\-]+)/m)
    if (done) {
      fidelity = Number(done[1])
      if (status === "solving") status = "finished"
    }
  }

  const pulse = parseLastPulse(log)
  const pulseMeta = parsePulseMeta(log)
  const tail = log
    .split("\n")
    .filter((l) => l.trim() !== "")
    .slice(-TAIL_LINES)

  const startMs = runIdStartMs(run)
  let endMs: number | null = null
  try {
    endMs = statSync(path.join(dir, finished ? "FINISHED" : "run.log")).mtimeMs
  } catch {
    /* no file to stat → no elapsed */
  }
  const elapsedMs = startMs !== null && endMs !== null ? Math.max(0, Math.round(endMs - startMs)) : null

  return JSON.stringify({
    ok: true,
    run: {
      run_id: run,
      lab: lab ?? path.basename(path.dirname(dir)),
      status,
      iteration,
      fidelity,
      best_f: bestF,
      last_f: lastIter?.f ?? null,
      elapsed_ms: elapsedMs,
      series,
      pulse: pulse ? { iter: pulse.iter, dt: pulse.dt, values: pulse.values } : null,
      pulse_meta: pulseMeta,
      tail,
    },
    error: null,
  })
}

// --- cached entrypoints for the routes (never reject; body is a JSON string) ---

const caches = new Map<string, { at: number; body: string }>()
function cached(key: string, ttlMs: number, build: () => string, synth: (c: string, d: string) => string): string {
  const hit = caches.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.body
  let body: string
  try {
    body = build()
  } catch (err) {
    body = synth("bad_output", String(err))
  }
  caches.set(key, { at: Date.now(), body })
  return body
}

export function problemsResponse(): string {
  return cached("problems", 10_000, () => problemsBody(problemsRoot()), synthesizeProblems)
}
export function problemResponse(slug: string | undefined): string {
  return cached(`problem:${slug ?? "@active"}`, 10_000, () => problemBody(problemsRoot(), slug), synthesizeProblem)
}
export function runStatusResponse(slug: string | undefined): string {
  return cached(`run-status:${slug ?? "@active"}`, 1_000, () => runStatusBody(problemsRoot(), runsRoot(), slug), synthesizeRunStatus)
}
export function runSeriesResponse(run: string | undefined, lab: string | undefined): string {
  return cached(
    `run-series:${lab ?? "@scan"}:${run ?? ""}`,
    1_000,
    () => runSeriesBody(runsRoot(), run, lab),
    synthesizeRunSeries,
  )
}

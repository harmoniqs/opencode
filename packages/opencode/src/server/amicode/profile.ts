// AMICODE: data source for the home-screen "About you" card (GET
// /amicode/profile). Same discipline as ./problems.ts — reads the local
// ~/.amico fs directly, SAME PROCESS, never rejects: every failure collapses
// into the one success shape (ok:false + "code: detail") so the web app parses
// a single schema. Pure body-builder takes injectable roots for tests; the
// cached entrypoint binds the real dirs.
//
// Identity is user-owned (~/.amico/profile.json), but degrades gracefully:
// the name is synthesized from the personal vault mount, the focus line from
// the platform mix of the problem workspaces, so the card is never blank even
// before the interview fills a profile in. "Amico remembers" is sourced LIVE
// from the memory notes (feedback/user type) — the trust surface that makes the
// friend persona real.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { problemsRoot, runsRoot } from "./problems"

export function profileFile(): string {
  const env = process.env.AMICODE_PROFILE_FILE
  if (env && env.trim() !== "") return env
  return path.join(homedir(), ".amico", "profile.json")
}
export function mountsFile(): string {
  return path.join(homedir(), ".amico", "mounts.toml")
}
/** Candidate memory dirs, first-with-notes wins. Product-shaped default is
 *  ~/.amico/memory; the Claude-Code project memory is a dev-machine fallback so
 *  the card shows real notes today without coupling the two trees. */
export function memoryDirs(): string[] {
  const out: string[] = []
  const env = process.env.AMICO_MEMORY_DIR
  if (env && env.trim() !== "") out.push(env)
  out.push(path.join(homedir(), ".amico", "memory"))
  const projects = path.join(homedir(), ".claude", "projects")
  if (existsSync(projects)) {
    try {
      for (const entry of readdirSync(projects, { withFileTypes: true })) {
        if (entry.isDirectory()) out.push(path.join(projects, entry.name, "memory"))
      }
    } catch {
      /* unreadable → skip */
    }
  }
  return out
}

export function synthesizeProfile(code: string, detail: string): string {
  return JSON.stringify({ ok: false, you: null, error: `${code}: ${detail}` })
}

function readJson(file: string): any {
  return JSON.parse(readFileSync(file, "utf8"))
}
function titleCase(slug: string): string {
  return slug
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** Name fallback: the personal (kind = "personal") vault mount id, minus the
 *  "armonia-" prefix, title-cased. mounts.toml is line-oriented TOML tables. */
function nameFromMounts(file: string): string | null {
  if (!existsSync(file)) return null
  let personal = false
  let id: string | null = null
  let pendingId: string | null = null
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim()
    if (line.startsWith("[[") ) {
      pendingId = null
      personal = false
      continue
    }
    const idMatch = line.match(/^id\s*=\s*"([^"]+)"/)
    if (idMatch) pendingId = idMatch[1]
    const kindMatch = line.match(/^kind\s*=\s*"([^"]+)"/)
    if (kindMatch && kindMatch[1] === "personal") {
      personal = true
      if (pendingId) id = pendingId
    }
    if (personal && !id && pendingId) id = pendingId
  }
  if (!id) return null
  return titleCase(id.replace(/^armonia-/, ""))
}

/** platform counts across problem workspaces (entities/system.json then
 *  problem.json), most-used first. */
function platformMix(root: string): { key: string; count: number }[] {
  if (!existsSync(root)) return []
  const counts = new Map<string, number>()
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    if (!existsSync(path.join(dir, "problem.json"))) continue
    let platform: string | undefined
    for (const candidate of [path.join(dir, "entities", "system.json"), path.join(dir, "problem.json")]) {
      try {
        const p = readJson(candidate)?.platform
        if (typeof p === "string" && p.trim()) {
          platform = p.trim()
          break
        }
      } catch {
        /* skip */
      }
    }
    if (platform) counts.set(platform, (counts.get(platform) ?? 0) + 1)
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}

function countProblems(root: string): number {
  if (!existsSync(root)) return 0
  let n = 0
  for (const entry of readdirSync(root, { withFileTypes: true }))
    if (entry.isDirectory() && existsSync(path.join(root, entry.name, "problem.json"))) n++
  return n
}

const RUN_RE = /^r(\d{4})(\d{2})(\d{2})-/

/** Walk every lab under runsRoot; count runs, banked pulses (pulse.jld2),
 *  best finished fidelity, and the earliest run date ("since"). One pass. */
function runStats(root: string): {
  runs: number
  banked: number
  best_fidelity: number | null
  since: string | null
} {
  const out = { runs: 0, banked: 0, best_fidelity: null as number | null, since: null as string | null }
  if (!existsSync(root)) return out
  for (const lab of readdirSync(root, { withFileTypes: true })) {
    if (!lab.isDirectory()) continue
    const labDir = path.join(root, lab.name)
    let runDirs: string[]
    try {
      runDirs = readdirSync(labDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    } catch {
      continue
    }
    for (const name of runDirs) {
      const m = name.match(RUN_RE)
      if (!m) continue
      out.runs++
      const dir = path.join(labDir, name)
      if (existsSync(path.join(dir, "pulse.jld2"))) out.banked++
      const date = `${m[1]}-${m[2]}-${m[3]}`
      if (out.since === null || date < out.since) out.since = date
      try {
        const result = readFileSync(path.join(dir, "result.toml"), "utf8")
        const fm = result.match(/^fidelity\s*=\s*([0-9eE+.\-]+)\s*$/m)
        if (fm) {
          const f = Number(fm[1])
          if (Number.isFinite(f) && (out.best_fidelity === null || f > out.best_fidelity)) out.best_fidelity = f
        }
      } catch {
        /* not finished / no result */
      }
    }
  }
  return out
}

/** Minimal frontmatter read: name, description, metadata.type. */
function readNote(file: string): { name?: string; description?: string; type?: string } | null {
  let text: string
  try {
    text = readFileSync(file, "utf8")
  } catch {
    return null
  }
  if (!text.startsWith("---")) return null
  const end = text.indexOf("\n---", 3)
  if (end < 0) return null
  const fm = text.slice(3, end)
  const out: { name?: string; description?: string; type?: string } = {}
  let inMeta = false
  for (const raw of fm.split("\n")) {
    const metaChild = raw.match(/^\s+type:\s*(.+)$/)
    if (inMeta && metaChild) {
      out.type = metaChild[1].trim().replace(/^["']|["']$/g, "")
      continue
    }
    if (/^\S/.test(raw)) inMeta = false
    const m = raw.match(/^(name|description|metadata):\s*(.*)$/)
    if (!m) continue
    if (m[1] === "metadata") {
      inMeta = true
      const inline = m[2].match(/type:\s*(\w+)/)
      if (inline) out.type = inline[1]
      continue
    }
    out[m[1] as "name" | "description"] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  return out
}

/** LIVE "Amico remembers": behavioral (feedback) + identity (user) notes from
 *  the first memory dir that has any, newest first, capped. */
function remembers(dirs: string[], limit: number): { title: string; detail: string }[] {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    let files: string[]
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "memory.md")
    } catch {
      continue
    }
    const notes = files
      .map((f) => {
        const full = path.join(dir, f)
        const note = readNote(full)
        if (!note) return null
        let mtime = 0
        try {
          mtime = statSync(full).mtimeMs
        } catch {
          /* keep 0 */
        }
        return { note, mtime }
      })
      .filter((x): x is { note: NonNullable<ReturnType<typeof readNote>>; mtime: number } => !!x)
      .filter((x) => x.note.type === "feedback" || x.note.type === "user")
    if (notes.length === 0) continue
    notes.sort((a, b) => b.mtime - a.mtime)
    return notes.slice(0, limit).map((x) => ({
      title: (x.note.description ?? x.note.name ?? "").trim(),
      detail: (x.note.description ?? "").trim(),
    }))
  }
  return []
}

export function profileBody(input: {
  profileFile: string
  mountsFile: string
  problemsRoot: string
  runsRoot: string
  memoryDirs: string[]
}): string {
  let profile: any = {}
  try {
    if (existsSync(input.profileFile)) profile = readJson(input.profileFile) ?? {}
  } catch {
    profile = {}
  }

  const name =
    (typeof profile.name === "string" && profile.name.trim()) || nameFromMounts(input.mountsFile) || "Practitioner"
  const mix = platformMix(input.problemsRoot)
  const stats = runStats(input.runsRoot)
  const you = {
    name,
    affiliation: typeof profile.affiliation === "string" ? profile.affiliation : null,
    focus: typeof profile.focus === "string" ? profile.focus : null,
    avatar: typeof profile.avatar === "string" ? profile.avatar : null,
    platforms: mix.map((p) => p.key),
    stats: {
      problems: countProblems(input.problemsRoot),
      runs: stats.runs,
      best_fidelity: stats.best_fidelity,
      banked: stats.banked,
      since: stats.since,
    },
    remembers: remembers(input.memoryDirs, 3),
  }
  return JSON.stringify({ ok: true, you, error: null })
}

// --- cached entrypoint (never reject; body is a JSON string) ---
let cache: { at: number; body: string } | undefined
export function profileResponse(): string {
  if (cache && Date.now() - cache.at < 10_000) return cache.body
  let body: string
  try {
    body = profileBody({
      profileFile: profileFile(),
      mountsFile: mountsFile(),
      problemsRoot: problemsRoot(),
      runsRoot: runsRoot(),
      memoryDirs: memoryDirs(),
    })
  } catch (err) {
    body = synthesizeProfile("bad_output", String(err))
  }
  cache = { at: Date.now(), body }
  return body
}

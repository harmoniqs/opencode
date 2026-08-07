export * as Database from "./database"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from "fs"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })))
}

/**
 * Known stable channels that get their own dedicated DB file.
 * Everything else (dev branches like "tab-drag-reorder", "local/amicode", etc.)
 * collapses to "opencode-local.db" so branch switches don't strand sessions.
 */
const STABLE_CHANNELS = new Set(["dev", "latest", "beta", "prod"])

/**
 * On first access, if `opencode-local.db` doesn't exist or is smaller than an
 * available branch-named DB, rename the largest branch DB to become the local
 * DB. This makes the migration from per-branch DBs fully transparent — no
 * manual intervention needed when users pull this change.
 */
function consolidateLocalDb(targetPath: string) {
  const dir = Global.Path.data
  let candidates: { path: string; size: number; mtime: number }[]
  try {
    const stableFiles = new Set([...STABLE_CHANNELS].map((c) => `opencode-${c}.db`))
    stableFiles.add("opencode.db")
    stableFiles.add("opencode-local.db")
    candidates = readdirSync(dir)
      .filter((f) => f.startsWith("opencode-") && f.endsWith(".db") && !stableFiles.has(f))
      .map((f) => {
        const full = join(dir, f)
        try {
          const st = statSync(full)
          return { path: full, size: st.size, mtime: st.mtimeMs }
        } catch {
          return null
        }
      })
      .filter((x): x is { path: string; size: number; mtime: number } => x !== null)
  } catch {
    return
  }
  if (candidates.length === 0) return
  // Pick the largest branch DB (most session data)
  candidates.sort((a, b) => b.size - a.size)
  const best = candidates[0]
  // Only consolidate if target doesn't exist or is smaller (i.e. has less data)
  const targetSize = existsSync(targetPath) ? (statSync(targetPath).size ?? 0) : 0
  if (targetSize >= best.size) return
  try {
    // Remove the smaller target if it exists (schema-only or empty)
    if (existsSync(targetPath)) {
      unlinkSync(targetPath)
      for (const ext of ["-wal", "-shm"]) {
        const sidecar = targetPath + ext
        if (existsSync(sidecar)) unlinkSync(sidecar)
      }
    }
    renameSync(best.path, targetPath)
    // Also rename WAL/SHM sidecars if they exist
    for (const ext of ["-wal", "-shm"]) {
      const sidecar = best.path + ext
      if (existsSync(sidecar)) renameSync(sidecar, targetPath + ext)
    }
  } catch {
    // Non-fatal: worst case, a fresh DB is created
  }
}

export function path() {
  if (Flag.OPENCODE_DB) {
    if (Flag.OPENCODE_DB === ":memory:" || isAbsolute(Flag.OPENCODE_DB)) return Flag.OPENCODE_DB
    return join(Global.Path.data, Flag.OPENCODE_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "1" ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "true"
  )
    return join(Global.Path.data, "opencode.db")
  if (STABLE_CHANNELS.has(InstallationChannel))
    return join(Global.Path.data, `opencode-${InstallationChannel}.db`)
  // All non-stable channels (local dev branches) share a single DB to avoid
  // session fragmentation when switching branches.
  const target = join(Global.Path.data, "opencode-local.db")
  consolidateLocalDb(target)
  return target
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })

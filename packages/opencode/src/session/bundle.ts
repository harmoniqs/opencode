export * as SessionBundle from "./bundle"

import { Effect, Schema } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { asc, eq, inArray } from "drizzle-orm"
import { Database } from "@opencode-ai/core/database/database"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProjectV2 } from "@opencode-ai/core/project"
import type { SessionSchema } from "@opencode-ai/core/session/schema"

type Drizzle = Database.Interface["db"]

export type SessionRow = typeof SessionTable.$inferSelect
export type MessageRow = typeof MessageTable.$inferSelect
export type PartRow = typeof PartTable.$inferSelect

export type MessageBlock = { message: MessageRow; parts: PartRow[] }
export type SessionBlock = { session: SessionRow; messages: MessageBlock[] }

export class BundleError extends Schema.TaggedErrorClass<BundleError>()("BundleError", {
  message: Schema.String,
}) {}

/**
 * Portable session bundle: JSONL, one JSON object per line.
 *
 *   {"type":"session","data":<session row verbatim>}
 *   {"type":"message","data":<message row verbatim>}   (chronological, per message)
 *   {"type":"part","data":<part row verbatim>}         (parts of that message, in order)
 *
 * Repeated per session for multi-session bundles. Rows are the raw storage
 * records (IDs and timestamps preserved verbatim), so export → import is
 * row-identical.
 */

export const exportBlocks = (db: Drizzle, ids: string[]): Effect.Effect<SessionBlock[], BundleError> =>
  Effect.gen(function* () {
    if (ids.length === 0) return []
    const unique = [...new Set(ids)]
    const sessionRows = yield* db.select().from(SessionTable).where(inArray(SessionTable.id, unique as SessionSchema.ID[])).all().pipe(Effect.orDie)
    const missing = unique.filter((id) => !sessionRows.some((row) => row.id === id))
    if (missing.length > 0) {
      return yield* Effect.fail(new BundleError({ message: `Session not found: ${missing.join(", ")}` }))
    }
    const byId = new Map(sessionRows.map((row) => [row.id, row]))

    const messageRows = yield* db
      .select()
      .from(MessageTable)
      .where(inArray(MessageTable.session_id, unique as SessionSchema.ID[]))
      .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
      .all()
      .pipe(Effect.orDie)
    const partRows = yield* db
      .select()
      .from(PartTable)
      .where(inArray(PartTable.session_id, unique as SessionSchema.ID[]))
      .orderBy(asc(PartTable.message_id), asc(PartTable.id))
      .all()
      .pipe(Effect.orDie)

    const partsByMessage = new Map<string, PartRow[]>()
    for (const part of partRows) {
      const list = partsByMessage.get(part.message_id)
      if (list) list.push(part)
      else partsByMessage.set(part.message_id, [part])
    }
    const messagesBySession = new Map<string, MessageRow[]>()
    for (const message of messageRows) {
      const list = messagesBySession.get(message.session_id)
      if (list) list.push(message)
      else messagesBySession.set(message.session_id, [message])
    }

    return ids.map((id) => ({
      session: byId.get(id as SessionSchema.ID)!,
      messages: (messagesBySession.get(id) ?? []).map((message) => ({
        message,
        parts: partsByMessage.get(message.id) ?? [],
      })),
    }))
  })

/** All session IDs in a project scope, oldest first. Used by `export session --all`. */
export const allSessionIDs = (db: Drizzle, projectID: ProjectV2.ID): Effect.Effect<string[]> =>
  db
    .select({ id: SessionTable.id })
    .from(SessionTable)
    .where(eq(SessionTable.project_id, projectID))
    .orderBy(asc(SessionTable.time_created), asc(SessionTable.id))
    .all()
    .pipe(Effect.orDie, Effect.map((rows) => rows.map((row) => row.id)))

export const serialize = (blocks: SessionBlock[]): string =>
  blocks
    .flatMap((block) => [
      JSON.stringify({ type: "session", data: block.session }),
      ...block.messages.flatMap(({ message, parts }) => [
        JSON.stringify({ type: "message", data: message }),
        ...parts.map((part) => JSON.stringify({ type: "part", data: part })),
      ]),
    ])
    .join("\n")

type RawLine = { type?: unknown; data?: unknown }

export const parse = (text: string): Effect.Effect<SessionBlock[], BundleError> =>
  Effect.gen(function* () {
    const lines = text
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter((entry) => entry.line.length > 0)
    const blocks: SessionBlock[] = []
    let current: SessionBlock | undefined
    for (const { line, number } of lines) {
      let raw: RawLine
      try {
        raw = JSON.parse(line) as RawLine
      } catch {
        return yield* Effect.fail(new BundleError({ message: `Bundle line ${number}: invalid JSON` }))
      }
      if (!raw || typeof raw !== "object" || typeof raw.type !== "string" || !raw.data || typeof raw.data !== "object") {
        return yield* Effect.fail(new BundleError({ message: `Bundle line ${number}: expected {"type","data"} object` }))
      }
      const data = raw.data as Record<string, unknown>
      if (raw.type === "session") {
        if (typeof data.id !== "string") {
          return yield* Effect.fail(new BundleError({ message: `Bundle line ${number}: session missing id` }))
        }
        current = { session: data as unknown as SessionRow, messages: [] }
        blocks.push(current)
        continue
      }
      if (!current) {
        return yield* Effect.fail(
          new BundleError({ message: `Bundle line ${number}: ${raw.type} line before any session line` }),
        )
      }
      if (raw.type === "message") {
        if (typeof data.id !== "string" || data.session_id !== current.session.id) {
          return yield* Effect.fail(
            new BundleError({ message: `Bundle line ${number}: message does not belong to session ${current.session.id}` }),
          )
        }
        current.messages.push({ message: data as unknown as MessageRow, parts: [] })
        continue
      }
      if (raw.type === "part") {
        const owner = current.messages[current.messages.length - 1]
        if (!owner || typeof data.id !== "string" || data.message_id !== owner.message.id) {
          return yield* Effect.fail(
            new BundleError({ message: `Bundle line ${number}: part does not belong to the preceding message` }),
          )
        }
        owner.parts.push(data as unknown as PartRow)
        continue
      }
      return yield* Effect.fail(new BundleError({ message: `Bundle line ${number}: unknown type ${raw.type}` }))
    }
    return blocks
  })

export type ImportOptions = {
  /** Project used when the session's original project does not exist in the target store. */
  fallbackProjectID: ProjectV2.ID
  /** [from, to] directory rewrites, applied in order; matches `from` exactly or as a path prefix. */
  remaps?: [string, string][]
}

/**
 * Rewrites `directory` if it matches a remap rule (exact match, or a path under
 * `from` — the remainder is re-rooted under `to`). Returns undefined when no
 * rule matches.
 */
export function remapDirectory(directory: string, remaps: [string, string][]): string | undefined {
  for (const [from, to] of remaps) {
    if (!from) continue
    if (directory === from) return to
    const prefix = from.endsWith("/") ? from : from + "/"
    if (directory.startsWith(prefix)) {
      const target = to.endsWith("/") ? to.slice(0, -1) : to
      return target + directory.slice(from.length)
    }
  }
  return undefined
}

/** Parses a `--remap-dir` spec: `from=to` (first `=` separates). */
export function parseRemap(spec: string): [string, string] {
  const index = spec.indexOf("=")
  if (index <= 0 || index === spec.length - 1) {
    throw new BundleError({ message: `invalid --remap-dir value "${spec}", expected from=to` })
  }
  return [spec.slice(0, index).trim(), spec.slice(index + 1).trim()]
}

export type ImportResult = { imported: string[]; skipped: string[] }

export const importBlocks = (
  db: Drizzle,
  blocks: SessionBlock[],
  options: ImportOptions,
): Effect.Effect<ImportResult, SqlError> =>
  Effect.forEach(blocks, (block) => importBlock(db, block, options), { concurrency: 1 }).pipe(
    Effect.map((results) => ({
      imported: results.filter((r) => r.imported).map((r) => r.id),
      skipped: results.filter((r) => !r.imported).map((r) => r.id),
    })),
  )

const importBlock = (db: Drizzle, block: SessionBlock, options: ImportOptions) =>
  db.transaction((tx) =>
    Effect.gen(function* () {
      const existing = yield* tx
        .select({ id: SessionTable.id })
        .from(SessionTable)
        .where(eq(SessionTable.id, block.session.id))
        .get()
        .pipe(Effect.orDie)
      if (existing) return { imported: false, id: block.session.id }

      const remaps = options.remaps ?? []
      const remapped = remapDirectory(block.session.directory, remaps)
      let projectID = block.session.project_id
      if (remapped !== undefined) {
        projectID = options.fallbackProjectID
      } else {
        const project = yield* tx
          .select({ id: ProjectTable.id })
          .from(ProjectTable)
          .where(eq(ProjectTable.id, projectID))
          .get()
          .pipe(Effect.orDie)
        if (!project) projectID = options.fallbackProjectID
      }

      yield* tx
        .insert(SessionTable)
        .values({ ...block.session, project_id: projectID, ...(remapped !== undefined ? { directory: remapped } : {}) })
        .run()
        .pipe(Effect.orDie)
      for (const { message, parts } of block.messages) {
        yield* tx.insert(MessageTable).values(message).run().pipe(Effect.orDie)
        for (const part of parts) {
          yield* tx.insert(PartTable).values(part).run().pipe(Effect.orDie)
        }
      }
      return { imported: true, id: block.session.id }
    }),
  )

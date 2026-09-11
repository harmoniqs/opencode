import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { asc } from "drizzle-orm"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Database } from "@opencode-ai/core/database/database"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import type { ProjectV2 } from "@opencode-ai/core/project"
import type { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionBundle } from "../../src/session/bundle"

type DB = Database.Interface["db"]

async function withStore<A>(fn: (db: DB) => Promise<A> | A): Promise<A> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-bundle-"))
  try {
    return await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        return yield* Effect.promise(() => Promise.resolve(fn(db)))
      }).pipe(Effect.provide(Database.layerFromPath(path.join(tmp, "store.db")))),
    )
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined)
  }
}

const prj = (id: string) => id as ProjectV2.ID

async function seedProject(db: DB, id: string, worktree: string) {
  await Effect.runPromise(
    db
      .insert(ProjectTable)
      .values({ id: prj(id), worktree: worktree as AbsolutePath, sandboxes: [] })
      .run()
      .pipe(Effect.orDie),
  )
}

async function seedSession(db: DB, row: { id: string; project_id: string } & Record<string, unknown>) {
  await Effect.runPromise(
    db
      .insert(SessionTable)
      .values({
        slug: "test-slug",
        directory: "/tmp/default",
        title: "Test session",
        version: "0.0.0-test",
        time_created: 1000,
        time_updated: 1000,
        ...row,
      } as typeof SessionTable.$inferInsert)
      .run()
      .pipe(Effect.orDie),
  )
}

async function seedMessage(db: DB, row: { id: string; session_id: string; time_created: number; data: object }) {
  await Effect.runPromise(
    db
      .insert(MessageTable)
      .values({ ...row, time_updated: row.time_created } as typeof MessageTable.$inferInsert)
      .run()
      .pipe(Effect.orDie),
  )
}

async function seedPart(db: DB, row: { id: string; message_id: string; session_id: string; time_created: number; data: object }) {
  await Effect.runPromise(
    db
      .insert(PartTable)
      .values({ ...row, time_updated: row.time_created } as typeof PartTable.$inferInsert)
      .run()
      .pipe(Effect.orDie),
  )
}

const fetchAll = async (db: DB) => {
  const sessions = await Effect.runPromise(
    db.select().from(SessionTable).orderBy(asc(SessionTable.id)).all().pipe(Effect.orDie),
  )
  const messages = await Effect.runPromise(
    db.select().from(MessageTable).orderBy(asc(MessageTable.time_created), asc(MessageTable.id)).all().pipe(Effect.orDie),
  )
  const parts = await Effect.runPromise(
    db.select().from(PartTable).orderBy(asc(PartTable.message_id), asc(PartTable.id)).all().pipe(Effect.orDie),
  )
  return { sessions, messages, parts }
}

// A representative store: one session, two messages out of insertion order
// (older one inserted last), parts interleaved, plus every column populated.
async function seedRichStore(db: DB) {
  await seedProject(db, "prj_rich", "/tmp/rich")
  const sessionRow = {
    id: "ses_rich",
    project_id: "prj_rich",
    slug: "rich-slug",
    directory: "/tmp/rich",
    path: "sub/dir",
    title: "Rich session",
    version: "1.2.3",
    agent: "build",
    model: { id: "test-model", providerID: "test" },
    cost: 0.25,
    tokens_input: 11,
    tokens_output: 22,
    tokens_reasoning: 3,
    tokens_cache_read: 4,
    tokens_cache_write: 5,
    metadata: { foo: "bar" },
    time_created: 1700000000000,
    time_updated: 1700000005000,
  }
  await seedSession(db, sessionRow)
  await seedMessage(db, {
    id: "msg_new",
    session_id: "ses_rich",
    time_created: 1700000002000,
    data: { role: "assistant", time: { created: 1700000002000 }, parentID: "msg_old", modelID: "test-model", providerID: "test", mode: "build", agent: "build", path: { cwd: "/tmp/rich", root: "/tmp/rich" }, cost: 0.2, tokens: { input: 1, output: 2, reasoning: 0, cache: { read: 0, write: 0 } } },
  })
  await seedMessage(db, {
    id: "msg_old",
    session_id: "ses_rich",
    time_created: 1700000001000,
    data: { role: "user", time: { created: 1700000001000 }, agent: "build", model: { providerID: "test", modelID: "test-model" } },
  })
  await seedPart(db, {
    id: "prt_b",
    message_id: "msg_old",
    session_id: "ses_rich",
    time_created: 1700000001100,
    data: { type: "text", text: "second part" },
  })
  await seedPart(db, {
    id: "prt_a",
    message_id: "msg_old",
    session_id: "ses_rich",
    time_created: 1700000001050,
    data: { type: "text", text: "first part" },
  })
  await seedPart(db, {
    id: "prt_c",
    message_id: "msg_new",
    session_id: "ses_rich",
    time_created: 1700000002100,
    data: { type: "step-start" },
  })
  return { sessionRow }
}

describe("SessionBundle export", () => {
  test("emits session metadata first, then messages and parts in storage order, byte-faithful", async () => {
    await withStore(async (db) => {
      const { sessionRow } = await seedRichStore(db)
      const result = await Effect.runPromise(SessionBundle.exportBlocks(db, ["ses_rich"]))

      expect(result).toHaveLength(1)
      const block = result[0]!
      const sessionJson = JSON.parse(JSON.stringify(block.session)) as Record<string, unknown>
      expect(sessionJson).toEqual({ ...sessionRow, summary_additions: null, summary_deletions: null, summary_files: null, summary_diffs: null, workspace_id: null, parent_id: null, share_url: null, revert: null, permission: null, time_compacting: null, time_archived: null, directories: null })
      expect(block.messages.map((m) => m.message.id as string)).toEqual(["msg_old", "msg_new"])
      expect(block.messages[0]!.parts.map((p) => p.id as string)).toEqual(["prt_a", "prt_b"])
      expect(block.messages[1]!.parts.map((p) => p.id as string)).toEqual(["prt_c"])
      // timestamps preserved verbatim
      expect(block.session.time_created).toBe(1700000000000)
      expect(block.messages[1]!.parts[0]!.time_created).toBe(1700000002100)
    })
  })

  test("serializes to JSONL and parses back to identical blocks", async () => {
    await withStore(async (db) => {
      await seedRichStore(db)
      const blocks = await Effect.runPromise(SessionBundle.exportBlocks(db, ["ses_rich"]))
      const text = SessionBundle.serialize(blocks)
      const lines = text.split("\n")
      expect(lines.length).toBe(1 + 2 + 3)
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow()
      const parsed = await Effect.runPromise(SessionBundle.parse(text))
      expect(parsed).toEqual(blocks)
      // first line is session metadata
      expect(JSON.parse(lines[0]!).type).toBe("session")
    })
  })

  test("export of an unknown session fails with a clear error", async () => {
    await withStore(async (db) => {
      const error = await Effect.runPromise(Effect.flip(SessionBundle.exportBlocks(db, ["ses_missing"])))
      expect(error).toBeInstanceOf(SessionBundle.BundleError)
      expect(error.message).toContain("ses_missing")
    })
  })

  test("exports multiple sessions in requested order", async () => {
    await withStore(async (db) => {
      await seedProject(db, "prj_multi", "/tmp/multi")
      await seedSession(db, { id: "ses_two", project_id: "prj_multi", time_created: 1, time_updated: 1 })
      await seedSession(db, { id: "ses_one", project_id: "prj_multi", time_created: 2, time_updated: 2 })
      const blocks = await Effect.runPromise(SessionBundle.exportBlocks(db, ["ses_two", "ses_one"]))
      expect(blocks.map((b) => b.session.id as string)).toEqual(["ses_two", "ses_one"])
    })
  })
})

describe("SessionBundle import", () => {
  test("round-trip identity: import into a fresh store reproduces the exported rows", async () => {
    await withStore(async (dbA) => {
      await seedRichStore(dbA)
      const blocks = await Effect.runPromise(SessionBundle.exportBlocks(dbA, ["ses_rich"]))
      const text = SessionBundle.serialize(blocks)

      await withStore(async (dbB) => {
        await seedProject(dbB, "prj_rich", "/tmp/rich")
        await seedProject(dbB, "global", "/tmp/global")
        const blocks = await parseHelper(text)
        const result = await Effect.runPromise(
          SessionBundle.importBlocks(dbB, blocks, { fallbackProjectID: prj("global") }),
        )
        expect(result.imported).toEqual(["ses_rich"])
        expect(result.skipped).toEqual([])

        const target = await fetchAll(dbB)
        const source = await fetchAll(dbA)
        expect(target.sessions).toEqual(source.sessions)
        expect(target.messages).toEqual(source.messages)
        expect(target.parts).toEqual(source.parts)
      })
    })
  })

  test("import is idempotent: existing session ID is skipped, no duplication", async () => {
    await withStore(async (dbA) => {
      await seedRichStore(dbA)
      const text = SessionBundle.serialize(await Effect.runPromise(SessionBundle.exportBlocks(dbA, ["ses_rich"])))

      await withStore(async (dbB) => {
        await seedProject(dbB, "prj_rich", "/tmp/rich")
        const blocks = await Effect.runPromise(SessionBundle.parse(text))
        const first = await Effect.runPromise(SessionBundle.importBlocks(dbB, blocks, { fallbackProjectID: prj("global") }))
        expect(first.imported).toEqual(["ses_rich"])

        const second = await Effect.runPromise(SessionBundle.importBlocks(dbB, blocks, { fallbackProjectID: prj("global") }))
        expect(second.imported).toEqual([])
        expect(second.skipped).toEqual(["ses_rich"])

        const target = await fetchAll(dbB)
        expect(target.sessions).toHaveLength(1)
        expect(target.messages).toHaveLength(2)
        expect(target.parts).toHaveLength(3)
      })
    })
  })

  test("--remap-dir rewrites matching directories under the fallback project; non-matching keep original", async () => {
    await withStore(async (dbA) => {
      await seedProject(dbA, "prj_src", "/Users/alice/repo")
      await seedSession(dbA, {
        id: "ses_match",
        project_id: "prj_src",
        directory: "/Users/alice/repo",
        time_created: 1,
        time_updated: 1,
      })
      await seedSession(dbA, {
        id: "ses_match_sub",
        project_id: "prj_src",
        directory: "/Users/alice/repo/sub/dir",
        time_created: 2,
        time_updated: 2,
      })
      await seedSession(dbA, {
        id: "ses_nomatch",
        project_id: "prj_src",
        directory: "/Users/alice/other",
        time_created: 3,
        time_updated: 3,
      })
      const text = SessionBundle.serialize(
        await Effect.runPromise(SessionBundle.exportBlocks(dbA, ["ses_match", "ses_match_sub", "ses_nomatch"])),
      )

      await withStore(async (dbB) => {
        await seedProject(dbB, "prj_src", "/Users/alice/repo")
        await seedProject(dbB, "prj_target", "/Users/bob/repo")
        const blocks = await Effect.runPromise(SessionBundle.parse(text))
        const result = await Effect.runPromise(
          SessionBundle.importBlocks(dbB, blocks, {
            fallbackProjectID: prj("prj_target"),
            remaps: [["/Users/alice/repo", "/Users/bob/repo"]],
          }),
        )
        expect(result.imported.sort()).toEqual(["ses_match", "ses_match_sub", "ses_nomatch"])

        const rows = new Map((await fetchAll(dbB)).sessions.map((s) => [s.id as string, s]))
        expect(rows.get("ses_match")!.directory).toBe("/Users/bob/repo")
        expect(rows.get("ses_match")!.project_id as string).toBe("prj_target")
        expect(rows.get("ses_match_sub")!.directory).toBe("/Users/bob/repo/sub/dir")
        expect(rows.get("ses_match_sub")!.project_id as string).toBe("prj_target")
        // no matching remap: original path, original project (exists in target)
        expect(rows.get("ses_nomatch")!.directory).toBe("/Users/alice/other")
        expect(rows.get("ses_nomatch")!.project_id as string).toBe("prj_src")
      })
    })
  })

  test("multi-session bundle imports all sessions into a store with unrelated sessions present", async () => {
    await withStore(async (dbA) => {
      await seedProject(dbA, "prj_pair", "/tmp/pair")
      await seedSession(dbA, { id: "ses_alpha", project_id: "prj_pair", title: "alpha", time_created: 1, time_updated: 1 })
      await seedSession(dbA, { id: "ses_beta", project_id: "prj_pair", title: "beta", time_created: 2, time_updated: 2 })
      await seedMessage(dbA, { id: "msg_alpha", session_id: "ses_alpha", time_created: 10, data: { role: "user", time: { created: 10 } } })
      await seedPart(dbA, { id: "prt_alpha", message_id: "msg_alpha", session_id: "ses_alpha", time_created: 11, data: { type: "text", text: "hi" } })
      const text = SessionBundle.serialize(await Effect.runPromise(SessionBundle.exportBlocks(dbA, ["ses_alpha", "ses_beta"])))

      await withStore(async (dbB) => {
        // unrelated pre-existing content
        await seedProject(dbB, "prj_unrelated", "/tmp/unrelated")
        await seedSession(dbB, { id: "ses_unrelated", project_id: "prj_unrelated", title: "unrelated", time_created: 1, time_updated: 1 })
        // fallback project must exist in the target store
        await seedProject(dbB, "global", "/tmp/global")

        const blocks = await Effect.runPromise(SessionBundle.parse(text))
        const result = await Effect.runPromise(
          SessionBundle.importBlocks(dbB, blocks, { fallbackProjectID: prj("global") }),
        )
        expect(result.imported.sort()).toEqual(["ses_alpha", "ses_beta"])

        const target = await fetchAll(dbB)
        expect(target.sessions.map((s) => s.id as string).sort()).toEqual(["ses_alpha", "ses_beta", "ses_unrelated"])
        expect(target.messages.map((m) => m.id as string)).toEqual(["msg_alpha"])
        expect(target.parts.map((p) => p.id as string)).toEqual(["prt_alpha"])
        // unrelated session untouched
        const unrelated = target.sessions.find((s) => s.id === "ses_unrelated")!
        expect(unrelated.title).toBe("unrelated")
      })
    })
  })

  test("missing project in target store falls back to fallbackProjectID without remap", async () => {
    await withStore(async (dbA) => {
      await seedProject(dbA, "prj_orphan", "/tmp/orphan")
      await seedSession(dbA, { id: "ses_orphan", project_id: "prj_orphan", directory: "/tmp/orphan", time_created: 1, time_updated: 1 })
      const text = SessionBundle.serialize(await Effect.runPromise(SessionBundle.exportBlocks(dbA, ["ses_orphan"])))

      await withStore(async (dbB) => {
        await seedProject(dbB, "prj_home", "/tmp/home")
        const blocks = await Effect.runPromise(SessionBundle.parse(text))
        const result = await Effect.runPromise(
          SessionBundle.importBlocks(dbB, blocks, { fallbackProjectID: prj("prj_home") }),
        )
        expect(result.imported).toEqual(["ses_orphan"])
        const row = (await fetchAll(dbB)).sessions[0]!
        expect(row.project_id as string).toBe("prj_home")
        expect(row.directory).toBe("/tmp/orphan")
      })
    })
  })

  test("rejects malformed bundles", async () => {
    const bad = await Effect.runPromise(Effect.flip(SessionBundle.parse("not json")))
    expect(bad.message).toContain("invalid JSON")
    const orphanPart = await Effect.runPromise(
      Effect.flip(SessionBundle.parse('{"type":"part","data":{"id":"prt_x"}}')),
    )
    expect(orphanPart.message).toContain("before any session line")
    const orphanMessage = await Effect.runPromise(
      Effect.flip(SessionBundle.parse('{"type":"message","data":{"id":"msg_x","session_id":"ses_x"}}')),
    )
    expect(orphanMessage.message).toContain("before any session line")
  })
})

async function parseHelper(text: string) {
  return Effect.runPromise(SessionBundle.parse(text))
}
void parseHelper

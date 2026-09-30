import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProjectJunkLint } from "@opencode-ai/core/project/junk-lint"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, ProjectJunkLint.node])))

const DAY = 24 * 60 * 60 * 1000

const home = (values: { id: ProjectV2.ID; worktree: string; ageDays?: number }) =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    yield* db
      .insert(ProjectTable)
      .values({
        id: values.id,
        worktree: AbsolutePath.make(values.worktree),
        sandboxes: [],
        time_created: Date.now() - (values.ageDays ?? 0) * DAY,
        time_updated: Date.now() - (values.ageDays ?? 0) * DAY,
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
  })

const archivedSession = (values: { id: string; projectID: ProjectV2.ID; directory: string }) =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    yield* db
      .insert(SessionTable)
      .values({
        id: SessionV2.ID.make(values.id),
        project_id: values.projectID,
        slug: values.id,
        directory: values.directory,
        title: `Session ${values.id}`,
        version: "test",
        time_created: Date.now() - 60 * DAY,
        time_updated: Date.now() - 60 * DAY,
        time_archived: Date.now() - 30 * DAY,
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
  })

const projectIDs = Effect.gen(function* () {
  const db = (yield* Database.Service).db
  const rows = yield* db.select({ id: ProjectTable.id }).from(ProjectTable).all().pipe(Effect.orDie)
  return rows.map((row) => row.id)
})

describe("ProjectJunkLint", () => {
  it.effect("prunes a zero-session home past the cutoff", () =>
    Effect.gen(function* () {
      const id = ProjectV2.ID.make("junk-home")
      yield* home({ id, worktree: "/tmp/junk-home", ageDays: 60 })
      const lint = yield* ProjectJunkLint.Service

      const result = yield* lint.prune

      expect(result.pruned).toEqual([id])
      expect(yield* projectIDs).not.toContain(id)
    }),
  )

  it.effect("never prunes a home holding archived sessions", () =>
    Effect.gen(function* () {
      const id = ProjectV2.ID.make("archived-home")
      yield* home({ id, worktree: "/tmp/archived-home", ageDays: 60 })
      yield* archivedSession({ id: "ses_archived", projectID: id, directory: "/tmp/archived-home" })
      const lint = yield* ProjectJunkLint.Service

      const result = yield* lint.prune

      expect(result.pruned).toEqual([])
      expect(yield* projectIDs).toContain(id)
    }),
  )

  it.effect("never prunes a fresh zero-session home", () =>
    Effect.gen(function* () {
      const id = ProjectV2.ID.make("fresh-home")
      yield* home({ id, worktree: "/tmp/fresh-home", ageDays: 2 })
      const lint = yield* ProjectJunkLint.Service

      const result = yield* lint.prune

      expect(result.pruned).toEqual([])
      expect(yield* projectIDs).toContain(id)
    }),
  )

  it.effect("never prunes the global fallback", () =>
    Effect.gen(function* () {
      yield* home({ id: ProjectV2.ID.global, worktree: "/", ageDays: 400 })
      const lint = yield* ProjectJunkLint.Service

      const result = yield* lint.prune

      expect(result.pruned).toEqual([])
      expect(yield* projectIDs).toContain(ProjectV2.ID.global)
    }),
  )

  it.effect("prunes only homes past the cutoff across a mixed table", () =>
    Effect.gen(function* () {
      const old = ProjectV2.ID.make("old-empty")
      const fresh = ProjectV2.ID.make("fresh-empty")
      yield* home({ id: old, worktree: "/tmp/old-empty", ageDays: 45 })
      yield* home({ id: fresh, worktree: "/tmp/fresh-empty", ageDays: 5 })
      const lint = yield* ProjectJunkLint.Service

      const result = yield* lint.prune

      expect(result.pruned).toEqual([old])
      const ids = yield* projectIDs
      expect(ids).not.toContain(old)
      expect(ids).toContain(fresh)
    }),
  )
})

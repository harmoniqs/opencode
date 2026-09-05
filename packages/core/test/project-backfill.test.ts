import { describe, expect } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@opencode-ai/core/database/database"
import type { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProjectBackfill } from "@opencode-ai/core/project/backfill"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { Hash } from "@opencode-ai/core/util/hash"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, ProjectV2.node, ProjectBackfill.node])))

function remoteID(remote: string) {
  return ProjectV2.ID.make(Hash.fast(`git-remote:${remote}`))
}

function abs(value: string) {
  return AbsolutePath.make(value)
}

async function initRepo(dir: string, opts?: { remote?: string }) {
  await $`git init`.cwd(dir).quiet()
  await $`git config user.email test@opencode.test`.cwd(dir).quiet()
  await $`git config user.name Test`.cwd(dir).quiet()
  await $`git commit --allow-empty -m root`.cwd(dir).quiet()
  if (opts?.remote) await $`git remote add origin ${opts.remote}`.cwd(dir).quiet()
}

const seed = (home: {
  db: EffectDrizzleSqlite.EffectSQLiteDatabase
  project: { id: ProjectV2.ID; worktree: string; vcs?: string | null }
  sessions?: { id: string; projectID: ProjectV2.ID }[]
}) =>
  Effect.gen(function* () {
    yield* home.db
      .insert(ProjectTable)
      .values({
        id: home.project.id,
        worktree: abs(home.project.worktree),
        vcs: home.project.vcs ?? null,
        sandboxes: [],
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    for (const session of home.sessions ?? []) {
      yield* home.db
        .insert(SessionTable)
        .values({
          id: SessionV2.ID.make(session.id),
          project_id: session.projectID,
          slug: session.id,
          directory: home.project.worktree,
          title: `Session ${session.id}`,
          version: "test",
        })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
    }
  })

describe("ProjectBackfill", () => {
  it.effect("re-points pre-existing global sessions in a non-git home to a first-class project", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const real = AbsolutePath.make(yield* Effect.promise(() => fs.realpath(tmp.path)))
      const db = (yield* Database.Service).db
      yield* seed({ db, project: { id: ProjectV2.ID.global, worktree: "/" } })
      yield* seed({
          db,
          project: { id: ProjectV2.ID.global, worktree: tmp.path },
          sessions: [
            { id: "ses_a", projectID: ProjectV2.ID.global },
            { id: "ses_b", projectID: ProjectV2.ID.global },
          ],
        })
      const backfill = yield* ProjectBackfill.Service

      const result = yield* backfill.run

      const homeID = ProjectV2.dirKey(real)
      const rows = yield* db.select().from(SessionTable).all().pipe(Effect.orDie)
      expect(rows.map((row) => row.project_id)).toEqual([homeID, homeID])
      expect(result.repointed).toBe(2)
      const projects = yield* db.select().from(ProjectTable).all().pipe(Effect.orDie)
      const home = projects.find((row) => row.id === homeID)
      expect(home?.worktree).toBe(real)
      expect(home?.vcs).toBeNull()
      expect(projects.find((row) => row.id === ProjectV2.ID.global)).toBeDefined()
    }),
  )

  it.effect("re-keys a non-git home that later became a git repo and retires the auto row", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const real = AbsolutePath.make(yield* Effect.promise(() => fs.realpath(tmp.path)))
      const autoID = ProjectV2.dirKey(real)
      const db = (yield* Database.Service).db
      yield* seed({
          db,
          project: { id: autoID, worktree: tmp.path },
          sessions: [
            { id: "ses_a", projectID: autoID },
            { id: "ses_b", projectID: autoID },
          ],
        })
      yield* Effect.promise(() => initRepo(tmp.path, { remote: "git@github.com:Acme/App.git" }))
      const backfill = yield* ProjectBackfill.Service

      yield* backfill.run

      const gitID = remoteID("github.com/Acme/App")
      const rows = yield* db.select().from(SessionTable).all().pipe(Effect.orDie)
      expect(rows.map((row) => row.project_id)).toEqual([gitID, gitID])
      const projects = yield* db.select().from(ProjectTable).all().pipe(Effect.orDie)
      expect(projects.find((row) => row.id === autoID)).toBeUndefined()
      const git = projects.find((row) => row.id === gitID)
      expect(git?.worktree).toBe(real)
      expect(git?.vcs).toBe("git")
    }),
  )

  it.effect("converges when a merge was applied only partially", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const real = AbsolutePath.make(yield* Effect.promise(() => fs.realpath(tmp.path)))
      const autoID = ProjectV2.dirKey(real)
      const db = (yield* Database.Service).db
      yield* seed({
          db,
          project: { id: autoID, worktree: tmp.path },
          sessions: [
            { id: "ses_a", projectID: autoID },
            { id: "ses_b", projectID: autoID },
          ],
        })
      yield* Effect.promise(() => initRepo(tmp.path, { remote: "git@github.com:Acme/App.git" }))
      const gitID = remoteID("github.com/Acme/App")
      // Simulate a merge killed mid-flight: one session already re-keyed
      // (its git project row exists), the second still on the auto row and
      // the auto row not yet retired.
      yield* seed({ db, project: { id: gitID, worktree: tmp.path, vcs: "git" } })
      yield* db
        .update(SessionTable)
        .set({ project_id: gitID })
        .where(eq(SessionTable.id, SessionV2.ID.make("ses_a")))
        .run()
      const backfill = yield* ProjectBackfill.Service

      yield* backfill.run
      yield* backfill.run

      const rows = yield* db.select().from(SessionTable).all().pipe(Effect.orDie)
      expect(rows.map((row) => row.project_id)).toEqual([gitID, gitID])
      const projects = yield* db.select().from(ProjectTable).all().pipe(Effect.orDie)
      expect(projects.find((row) => row.id === autoID)).toBeUndefined()
      expect(projects.find((row) => row.id === gitID)).toBeDefined()
    }),
  )
})

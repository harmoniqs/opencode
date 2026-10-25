export * as ProjectBackfill from "./backfill"

import { and, eq, ne } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { WorkspaceTable } from "../control-plane/workspace.sql"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { AbsolutePath } from "../schema"
import { SessionTable } from "../session/sql"
import { ProjectV2 } from "../project"
import { ProjectDirectoryTable, ProjectTable } from "./sql"

export interface Result {
  /** Distinct session directories inspected. */
  readonly directories: number
  /** Sessions moved to their directory's resolved project. */
  readonly repointed: number
  /** Auto-created (directory-keyed) project rows retired by the re-key. */
  readonly retired: readonly ProjectV2.ID[]
}

export interface Interface {
  /**
   * D1 boot-time backfill: resolve every distinct session directory and re-key
   * sessions whose project row no longer matches that resolution. Idempotent,
   * one transaction per worktree (#272 discipline) — a merge interrupted
   * mid-flight converges on the next run.
   */
  readonly run: Effect.Effect<Result>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProjectBackfill") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const projects = yield* ProjectV2.Service

    const run = Effect.fn("ProjectBackfill.run")(function* () {
      const directories = yield* db
        .selectDistinct({ directory: SessionTable.directory })
        .from(SessionTable)
        .all()
        .pipe(Effect.orDie)

      let repointed = 0
      const retired: ProjectV2.ID[] = []

      for (const { directory } of directories) {
        // Legacy rows may persist an empty directory — nothing to resolve.
        if (!directory) continue
        const resolved = yield* projects.resolve(AbsolutePath.make(directory))
        const stale = yield* db
          .selectDistinct({ id: SessionTable.project_id })
          .from(SessionTable)
          .where(and(eq(SessionTable.directory, directory), ne(SessionTable.project_id, resolved.id)))
          .all()
          .pipe(Effect.orDie)
        if (stale.length === 0) continue

        const moving = yield* db
          .select({ id: SessionTable.id })
          .from(SessionTable)
          .where(and(eq(SessionTable.directory, directory), ne(SessionTable.project_id, resolved.id)))
          .all()
          .pipe(Effect.orDie)

        // One transaction per worktree: the project row, the session re-key and
        // the auto-row retirement land atomically or not at all.
        yield* db
          .transaction(
            (tx) =>
              Effect.gen(function* () {
                if (resolved.id !== ProjectV2.ID.global) {
                  yield* tx
                    .insert(ProjectTable)
                    .values({
                      id: resolved.id,
                      worktree: resolved.directory,
                      vcs: resolved.vcs?.type ?? null,
                      sandboxes: [],
                    })
                    .onConflictDoNothing()
                    .run()
                  yield* tx
                    .insert(ProjectDirectoryTable)
                    .values({ project_id: resolved.id, directory: AbsolutePath.make(directory) })
                    .onConflictDoNothing()
                    .run()
                }
                yield* tx
                  .update(SessionTable)
                  .set({ project_id: resolved.id })
                  .where(and(eq(SessionTable.directory, directory), ne(SessionTable.project_id, resolved.id)))
                  .run()

                for (const { id } of stale) {
                  if (id === ProjectV2.ID.global) continue
                  const row = yield* tx.select().from(ProjectTable).where(eq(ProjectTable.id, id)).get()
                  if (!row) continue
                  // Only auto-created rows (directory-keyed, no VCS) retire.
                  // Git rows and any hand-made row stay — the junk-home lint,
                  // not the backfill, owns zero-session pruning.
                  if (row.vcs !== null) continue
                  if (row.id !== ProjectV2.dirKey(row.worktree)) continue
                  const remaining = yield* tx
                    .select({ id: SessionTable.id })
                    .from(SessionTable)
                    .where(eq(SessionTable.project_id, id))
                    .all()
                  if (remaining.length > 0) continue
                  yield* tx.update(WorkspaceTable).set({ project_id: resolved.id }).where(eq(WorkspaceTable.project_id, id)).run()
                  yield* tx.delete(ProjectTable).where(eq(ProjectTable.id, id)).run()
                  retired.push(id)
                }
              }),
            { behavior: "immediate" },
          )
          .pipe(Effect.orDie)

        repointed += moving.length
      }

      return { directories: directories.length, repointed, retired }
    })

    return Service.of({ run: run() })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [Database.node, ProjectV2.node] })

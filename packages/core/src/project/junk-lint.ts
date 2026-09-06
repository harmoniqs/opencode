export * as ProjectJunkLint from "./junk-lint"

import { and, eq, lt, ne, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { WorkspaceTable } from "../control-plane/workspace.sql"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { SessionTable } from "../session/sql"
import { ProjectV2 } from "../project"
import { ProjectTable } from "./sql"

/** F6 (spec spec-20260905-045114-session-device-lifecycle): validate against
 *  real usage — the constant is named so it stays adjustable. */
export const DEFAULT_CUTOFF_DAYS = 30

export interface PruneResult {
  /** Project rows removed: zero sessions of ANY state, no workspaces, stale. */
  readonly pruned: readonly ProjectV2.ID[]
}

export interface Interface {
  /**
   * D1 junk-home policy: prune project rows that have held no sessions of any
   * state (active or archived) and no workspaces for longer than the cutoff.
   * The global fallback and rows still holding archived sessions survive.
   */
  readonly prune: Effect.Effect<PruneResult>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProjectJunkLint") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const prune = Effect.fn("ProjectJunkLint.prune")(function* () {
      const cutoff = Date.now() - DEFAULT_CUTOFF_DAYS * 24 * 60 * 60 * 1000
      // A NOT EXISTS subquery, not a join-count: "zero sessions of any state"
      // must stay true when the session table grows.
      const junk = yield* db
        .select({ id: ProjectTable.id })
        .from(ProjectTable)
        .where(
          and(
            ne(ProjectTable.id, ProjectV2.ID.global),
            lt(ProjectTable.time_updated, cutoff),
            sql`(SELECT COUNT(*) FROM ${SessionTable} WHERE ${eq(SessionTable.project_id, ProjectTable.id)}) = 0`,
            sql`(SELECT COUNT(*) FROM ${WorkspaceTable} WHERE ${eq(WorkspaceTable.project_id, ProjectTable.id)}) = 0`,
          ),
        )
        .all()
        .pipe(Effect.orDie)
      if (junk.length === 0) return { pruned: [] }

      const pruned: ProjectV2.ID[] = []
      for (const { id } of junk) {
        // Re-check per row inside the delete transaction: the lint runs
        // unattended, so a home may gain a session between scan and delete.
        yield* db
          .transaction(
            (tx) =>
              Effect.gen(function* () {
                const holding = yield* tx
                  .select({ id: SessionTable.id })
                  .from(SessionTable)
                  .where(eq(SessionTable.project_id, id))
                  .all()
                if (holding.length > 0) return
                yield* tx.delete(ProjectTable).where(eq(ProjectTable.id, id)).run()
                pruned.push(id)
              }),
            { behavior: "immediate" },
          )
          .pipe(Effect.orDie)
      }
      return { pruned }
    })

    return Service.of({ prune: prune() })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [Database.node] })

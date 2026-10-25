import { describe, expect } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { ProjectV2 } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionCurrency } from "@opencode-ai/core/session/currency"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionStore } from "@opencode-ai/core/session/store"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { Location } from "@opencode-ai/core/location"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) =>
      Effect.succeed({ id: ProjectV2.ID.make("cur-test-project"), directory, vcs: undefined }),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, EventV2.node, SessionProjector.node, SessionStore.node, SessionV2.node]),
    [
      [ProjectV2.node, projects],
      [SessionExecution.node, SessionExecution.noopLayer],
    ],
  ),
)

const location = Location.Ref.make({ directory: AbsolutePath.make("/currency-home") })
const BUILD = "test-build-1"

const render = Effect.gen(function* () {
  const session = yield* SessionV2.Service
  const rows = yield* session.list()
  return SessionCurrency.token(SessionCurrency.projection(rows), BUILD)
})

describe("SessionCurrency (H4: derived, never hand-bumped)", () => {
  it.effect("advances on same-tick writes", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const before = yield* render

      const first = yield* session.create({ location })
      const second = yield* session.create({ location })
      // Force the same tick: identical created/updated stamps for both rows.
      const now = Date.now()
      yield* Database.Service.use(({ db }) =>
        db
          .update(SessionTable)
          .set({ time_created: now, time_updated: now })
          .where(sql`${SessionTable.id} in (${first.id}, ${second.id})`)
          .run()
          .pipe(Effect.orDie),
      )

      const after = yield* render

      expect(after).not.toBe(before)
    }),
  )

  it.effect("advances on archive churn", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })
      const seeded = yield* render

      // Out-of-band archive: the write path bypasses every API, as migrations
      // and ops sometimes do. The rendered projection still changes.
      yield* Database.Service.use(({ db }) =>
        db
          .update(SessionTable)
          .set({ time_archived: Date.now(), time_updated: Date.now() })
          .where(eq(SessionTable.id, created.id))
          .run()
          .pipe(Effect.orDie),
      )

      const after = yield* render

      expect(after).not.toBe(seeded)
    }),
  )

  it.effect("advances on delete-then-touch pairs", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const victim = yield* session.create({ location })
      const survivor = yield* session.create({ location })
      const victimRow = yield* Database.Service.use(({ db }) =>
        db.select().from(SessionTable).where(eq(SessionTable.id, victim.id)).get().pipe(Effect.orDie),
      )
      const seeded = yield* render

      yield* Database.Service.use(({ db }) =>
        db.delete(SessionTable).where(eq(SessionTable.id, victim.id)).run().pipe(Effect.orDie),
      )
      // Touch the survivor back to the victim's old timestamp: count drops by
      // one, max stays, sum changes — the tuple moves without any "hand bump".
      yield* Database.Service.use(({ db }) =>
        db
          .update(SessionTable)
          .set({ time_updated: victimRow!.time_created })
          .where(eq(SessionTable.id, survivor.id))
          .run()
          .pipe(Effect.orDie),
      )

      const after = yield* render

      expect(after).not.toBe(seeded)
    }),
  )

  it.effect("advances on direct out-of-band writes", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      yield* session.create({ location })
      const seeded = yield* render

      yield* Database.Service.use(({ db }) =>
        db
          .update(SessionTable)
          .set({ time_updated: Date.now() + 5000 })
          .run()
          .pipe(Effect.orDie),
      )

      const after = yield* render

      expect(after).not.toBe(seeded)
    }),
  )

  it.effect("binds the hub build id: same rows under a different build give a different token", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const rows = yield* session.list()

      const a = SessionCurrency.token(SessionCurrency.projection(rows), "build-a")
      const b = SessionCurrency.token(SessionCurrency.projection(rows), "build-b")

      expect(a).not.toBe(b)
    }),
  )

  it.effect("is a pure function of the projection: same projection, same token", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      yield* session.create({ location })
      const rows = yield* session.list()

      const first = SessionCurrency.token(SessionCurrency.projection(rows), BUILD)
      const second = SessionCurrency.token(SessionCurrency.projection(rows), BUILD)

      expect(second).toBe(first)
    }),
  )
})

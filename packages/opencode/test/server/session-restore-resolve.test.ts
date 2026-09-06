import { describe, expect } from "bun:test"
import { $ } from "bun"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProjectV2 } from "@opencode-ai/core/project"
import { Hash } from "@opencode-ai/core/util/hash"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Project } from "@/project/project"
import { Session as SessionNs } from "@/session/session"
import { provideInstance, TestInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      SessionNs.node,
      SessionProjector.node,
      Project.node,
      CrossSpawnSpawner.node,
      Database.node,
    ]),
  ),
)

const withSession = (input?: Parameters<SessionNs.Interface["create"]>[0]) =>
  Effect.acquireRelease(SessionNs.use.create(input), (created) =>
    SessionNs.Service.use((session) => session.remove(created.id).pipe(Effect.ignore)),
  )

const remoteID = (remote: string) => ProjectV2.ID.make(Hash.fast(`git-remote:${remote}`))

describe("Session.setArchived restore", () => {
  it.instance(
    "re-resolves the session's project by worktree when the home changed while archived",
    () =>
      Effect.gen(function* () {
        const home = yield* tmpdirScoped()
        const session = yield* withSession({ title: "restore-me" }).pipe(provideInstance(home))

        yield* SessionNs.Service.use((s) => s.setArchived({ sessionID: session.id, time: Date.now() }))

        // While archived, the home becomes a git repo — its project identity
        // changes under the session.
        yield* Effect.promise(() =>
          $`git init && git config user.email test@opencode.test && git config user.name Test && git commit --allow-empty -m root && git remote add origin git@github.com:Acme/Restored.git`
            .cwd(home)
            .quiet()
            .nothrow(),
        )

        yield* SessionNs.Service.use((s) => s.setArchived({ sessionID: session.id, time: undefined }))

        const db = (yield* Database.Service).db
        const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, session.id)).get().pipe(Effect.orDie)
        const expected = remoteID("github.com/Acme/Restored")
        expect(row?.project_id).toBe(expected)
        const project = yield* Project.use.get(expected)
        expect(project?.worktree).toBe(home)
      }),
    { git: false },
  )
})

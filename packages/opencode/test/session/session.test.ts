import { describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { SessionLineageTable } from "@opencode-ai/core/session/sql"
import { EventV2 } from "@opencode-ai/core/event"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Deferred, Effect, Exit, Layer } from "effect"
import { Session as SessionNs } from "@/session/session"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { GlobalBus } from "@/bus/global"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceStore } from "@/project/instance-store"
import { InstanceBootstrap } from "@/project/bootstrap"
import { ExternalDiff } from "@/session/external-diff"
import path from "path"
import { eq } from "drizzle-orm"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      SessionNs.node,
      Database.node,
      EventV2Bridge.node,
      SessionProjector.node,
      CrossSpawnSpawner.node,
      InstanceStore.node,
    ]),
    [
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalWorkspaces: false })],
      [
        InstanceBootstrap.node,
        Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void })),
      ],
    ],
  ),
)

const awaitDeferred = <T>(deferred: Deferred.Deferred<T>, message: string) =>
  Effect.race(
    Deferred.await(deferred),
    Effect.sleep("2 seconds").pipe(Effect.flatMap(() => Effect.fail(new Error(message)))),
  )

const remove = (id: SessionID) => SessionNs.use.remove(id)

describe("session.created event", () => {
  it.instance("should emit session.created event when session is created", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const events = yield* EventV2Bridge.Service
      const received = yield* Deferred.make<SessionNs.Info>()

      const unsub = yield* events.listen((event) => {
        if (event.type === SessionNs.Event.Created.type)
          Deferred.doneUnsafe(
            received,
            Effect.succeed((event.data as typeof SessionNs.Event.Created.data.Type).info as SessionNs.Info),
          )
        return Effect.void
      })
      yield* Effect.addFinalizer(() => unsub)

      const info = yield* session.create({})
      const receivedInfo = yield* awaitDeferred(received, "timed out waiting for session.created")

      expect(receivedInfo.id).toBe(info.id)
      expect(receivedInfo.projectID).toBe(info.projectID)
      expect(receivedInfo.directory).toBe(info.directory)
      expect(receivedInfo.path).toBe(info.path)
      expect(receivedInfo.title).toBe(info.title)

      yield* session.remove(info.id)
    }),
  )

  it.instance("session.created event should be emitted before session.updated", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const source = yield* EventV2Bridge.Service
      const events: string[] = []
      const received = yield* Deferred.make<string[]>()
      const push = (event: string) => {
        events.push(event)
        if (events.includes("created") && events.includes("updated")) {
          Deferred.doneUnsafe(received, Effect.succeed(events))
        }
      }

      const unsubscribe = yield* source.listen((event) => {
        if (event.type === SessionNs.Event.Created.type) push("created")
        if (event.type === SessionNs.Event.Updated.type) push("updated")
        return Effect.void
      })
      yield* Effect.addFinalizer(() => unsubscribe)

      const info = yield* session.create({})
      yield* session.setTitle({ sessionID: info.id, title: "updated" })
      const receivedEvents = yield* awaitDeferred(received, "timed out waiting for session created/updated events")

      expect(receivedEvents).toContain("created")
      expect(receivedEvents).toContain("updated")
      expect(receivedEvents.indexOf("created")).toBeLessThan(receivedEvents.indexOf("updated"))

      yield* session.remove(info.id)
    }),
  )

  it.instance("emits legacy global sync payload", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const received = yield* Deferred.make<{ syncEvent: EventV2.SerializedEvent }>()
      const listener = (event: { payload: { type?: string; syncEvent?: EventV2.SerializedEvent } }) => {
        if (event.payload.type === "sync" && event.payload.syncEvent)
          Deferred.doneUnsafe(received, Effect.succeed({ syncEvent: event.payload.syncEvent }))
      }
      GlobalBus.on("event", listener)
      yield* Effect.addFinalizer(() => Effect.sync(() => GlobalBus.off("event", listener)))

      const info = yield* session.create({})
      const event = yield* awaitDeferred(received, "timed out waiting for legacy global sync event")

      expect(event.syncEvent).toMatchObject({
        type: EventV2.versionedType(SessionNs.Event.Created.type, 1),
        seq: 0,
        aggregateID: info.id,
        data: { sessionID: info.id },
      })

      yield* session.remove(info.id)
    }),
  )
})

describe("step-finish token propagation via event", () => {
  it.instance(
    "non-zero tokens propagate through PartUpdated event",
    () =>
      Effect.gen(function* () {
        const session = yield* SessionNs.Service
        const events = yield* EventV2Bridge.Service
        const info = yield* session.create({})

        const messageID = MessageID.ascending()
        yield* session.updateMessage({
          id: messageID,
          sessionID: info.id,
          role: "user",
          time: { created: Date.now() },
          agent: "user",
          model: { providerID: "test", modelID: "test" },
          tools: {},
          mode: "",
        } as unknown as SessionV1.Info)

        // Event subscribers receive readonly Schema.Type payloads; `SessionV1.Part`
        // is the mutable domain type. Cast bridges the two — safe because the
        // test only reads the value afterwards.
        const received = yield* Deferred.make<SessionV1.Part>()
        const unsub = yield* events.listen((event) => {
          if (event.type === MessageV2.Event.PartUpdated.type)
            Deferred.doneUnsafe(
              received,
              Effect.succeed((event.data as typeof MessageV2.Event.PartUpdated.data.Type).part as SessionV1.Part),
            )
          return Effect.void
        })
        yield* Effect.addFinalizer(() => unsub)

        const tokens = {
          total: 1500,
          input: 500,
          output: 800,
          reasoning: 200,
          cache: { read: 100, write: 50 },
        }

        const partInput = {
          id: PartID.ascending(),
          messageID,
          sessionID: info.id,
          type: "step-finish" as const,
          reason: "stop",
          cost: 0.005,
          tokens,
        }

        yield* session.updatePart(partInput)
        const receivedPart = yield* awaitDeferred(received, "timed out waiting for message.part.updated")

        expect(receivedPart.type).toBe("step-finish")
        const finish = receivedPart as SessionV1.StepFinishPart
        expect(finish.tokens.input).toBe(500)
        expect(finish.tokens.output).toBe(800)
        expect(finish.tokens.reasoning).toBe(200)
        expect(finish.tokens.total).toBe(1500)
        expect(finish.tokens.cache.read).toBe(100)
        expect(finish.tokens.cache.write).toBe(50)
        expect(finish.cost).toBe(0.005)
        expect(receivedPart).not.toBe(partInput)

        yield* session.remove(info.id)
      }),
    { timeout: 30000 },
  )
})

describe("Session", () => {
  it.instance("creates one full lineage root for each new session", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const created = yield* session.create({ title: "lineage root" })

      expect(yield* session.lineage(created.id)).toMatchObject({
        mode: "full",
        rootID: created.id,
        root: { sessionID: created.id, title: "lineage root" },
        descendants: [],
      })
    }),
  )

  it.instance("keeps registered task and session spawns under the parent root with typed edges", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const parent = yield* session.create({ title: "parent" })
      const task = yield* session.create({
        parentID: parent.id,
        lineageEdgeKind: "task_spawn",
        title: "task child",
      })
      const spawned = yield* session.create({ parentID: parent.id, title: "spawn child" })

      expect(yield* session.lineage(task.id)).toMatchObject({
        mode: "full",
        rootID: parent.id,
        root: { sessionID: parent.id },
        descendants: [
          { sessionID: task.id, parentID: parent.id, edgeKind: "task_spawn", mode: "full" },
          { sessionID: spawned.id, parentID: parent.id, edgeKind: "session_spawn", mode: "full" },
        ],
      })
    }),
  )

  it.instance("keeps legacy parents outside aggregation until an explicit partial epoch opens", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const database = yield* Database.Service
      const legacy = yield* session.create({ title: "before rollout" })
      yield* database.db.delete(SessionLineageTable).where(eq(SessionLineageTable.session_id, legacy.id)).run()

      expect(yield* session.lineage(legacy.id)).toMatchObject({
        mode: "legacy",
        rootID: undefined,
        root: undefined,
        descendants: [],
      })

      const beforeEpoch = yield* session.create({ parentID: legacy.id, title: "untracked parent spawn" })
      expect(yield* session.lineage(beforeEpoch.id)).toMatchObject({
        mode: "full",
        rootID: beforeEpoch.id,
        legacyParentID: legacy.id,
        descendants: [],
      })

      yield* session.beginPartialLineage(legacy.id, 42)
      const afterEpoch = yield* session.create({ parentID: legacy.id, title: "tracked parent spawn" })
      expect(yield* session.lineage(afterEpoch.id)).toMatchObject({
        mode: "partial",
        rootID: legacy.id,
        descendants: [{ sessionID: afterEpoch.id, edgeKind: "session_spawn", mode: "partial" }],
      })
    }),
  )

  it.instance("gives forks independent roots without inherited lineage descendants", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const parent = yield* session.create({ title: "source" })
      const child = yield* session.create({ parentID: parent.id, title: "source child" })
      const fork = yield* session.fork({ sessionID: parent.id })

      expect(yield* session.lineage(fork.id)).toMatchObject({
        mode: "full",
        rootID: fork.id,
        root: { sessionID: fork.id },
        descendants: [],
      })
      expect(yield* session.lineage(parent.id)).toMatchObject({
        rootID: parent.id,
        descendants: [{ sessionID: child.id }],
      })
    }),
  )

  it.instance("hides archived children and retains only their root-owned origin projection after deletion", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const root = yield* session.create({ title: "root" })
      const child = yield* session.create({ parentID: root.id, title: "child", metadata: { private: "do not retain" } })

      yield* session.setArchived({ sessionID: child.id, time: 1 })
      expect((yield* session.lineage(root.id)).descendants).toEqual([])

      yield* session.remove(child.id)
      const lineage = yield* session.lineage(root.id, { retainedOrigins: true })
      expect(lineage).toMatchObject({
        rootID: root.id,
        descendants: [],
        retainedOrigins: [{ sessionID: child.id, title: "child", edgeKind: "session_spawn" }],
      })
      expect(lineage.retainedOrigins[0]).not.toHaveProperty("metadata")
    }),
  )

  it.instance("queries only registered descendants of the requested concurrent root", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const [first, second] = yield* Effect.all(
        [session.create({ title: "first root" }), session.create({ title: "second root" })],
        { concurrency: "unbounded" },
      )
      const [firstChild, secondChild] = yield* Effect.all(
        [
          session.create({ parentID: first.id, title: "first child" }),
          session.create({ parentID: second.id, title: "second child" }),
        ],
        { concurrency: "unbounded" },
      )

      expect((yield* session.lineage(first.id)).descendants).toEqual([
        expect.objectContaining({ sessionID: firstChild.id, parentID: first.id }),
      ])
      expect((yield* session.lineage(second.id)).descendants).toEqual([
        expect.objectContaining({ sessionID: secondChild.id, parentID: second.id }),
      ])
    }),
  )

  it.live("remove works without an instance", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const dir = yield* tmpdirScoped({ git: true })
      const info = yield* provideInstance(dir)(session.create({ title: "remove-without-instance" }))

      const removeExit = yield* remove(info.id).pipe(Effect.exit)
      expect(Exit.isSuccess(removeExit)).toBe(true)

      const getExit = yield* session.get(info.id).pipe(Effect.exit)
      expect(Exit.isFailure(getExit)).toBe(true)
    }),
  )

  it.instance("persists metadata and copies it on fork by default", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const meta = { source: "sdk", trace: { id: "abc" } }
      const created = yield* Effect.acquireRelease(session.create({ title: "with-meta", metadata: meta }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )
      const saved = yield* session.get(created.id)
      const fork = yield* Effect.acquireRelease(session.fork({ sessionID: created.id }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )

      expect(saved.metadata).toEqual(meta)
      expect(fork.metadata).toEqual(meta)
      expect(fork.metadata).not.toBe(meta)
    }),
  )

  it.instance("omits metadata when not provided", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const created = yield* Effect.acquireRelease(session.create({ title: "empty-meta" }), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )
      const saved = yield* session.get(created.id)

      expect(created.metadata).toBeUndefined()
      expect(saved.metadata).toBeUndefined()
    }),
  )

  it.instance("forks and recursively removes external ownership without inheriting host-local baselines", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const dir = yield* tmpdirScoped({ git: true })
      const parent = yield* provideInstance(dir)(session.create({ title: "external-owner" }))
      const external = path.join(path.dirname(dir), `external-owner-${parent.id}.txt`)
      yield* Effect.promise(() => Bun.write(external, "baseline\n"))
      const reservation = ExternalDiff.prepare({ sessionID: parent.id, files: [external] })!
      yield* Effect.promise(() => Bun.write(external, "changed\n"))
      expect(ExternalDiff.commit({ sessionID: parent.id, reservation })).toBe(true)

      const fork = yield* provideInstance(dir)(session.fork({ sessionID: parent.id }))
      expect(ExternalDiff.assessed(fork.id).assessments).toEqual([])

      yield* session.remove(parent.id)
      ExternalDiff.resetMemoryForTest()
      expect(ExternalDiff.assessed(parent.id).assessments).toEqual([])
      expect(ExternalDiff.assessed(fork.id).assessments).toEqual([])
      expect(ExternalDiff.commit({ sessionID: parent.id, reservation })).toBe(false)
      ExternalDiff.sweep()
      ExternalDiff.sweep()
    }),
  )
})

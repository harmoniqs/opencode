/**
 * Integration test for session-scoped diffs (#174).
 *
 * Verifies that GET /session/:id/diff returns the net diff (session-start
 * snapshot vs current state) filtered to only files the agent touched (tracked
 * via PatchParts). This replaces the old per-turn/per-message diff model.
 */
import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import path from "path"
import { Effect, Layer } from "effect"
import { Session } from "@/session/session"
import { Snapshot } from "@/snapshot"
import { Storage } from "@/storage/storage"
import { SessionPaths } from "@/server/routes/instance/httpapi/groups/session"
import { MessageID, PartID } from "@/session/schema"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(LayerNode.group([Session.node, Snapshot.node, Storage.node, FSUtil.node])),
    httpApiLayer,
  ),
)

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

function pathFor(template: string, params: Record<string, string>) {
  return Object.entries(params).reduce((result, [key, value]) => result.replace(`:${key}`, value), template)
}

const withSession = (input?: Parameters<Session.Interface["create"]>[0]) =>
  Effect.acquireRelease(Session.use.create(input), (created) => Session.use.remove(created.id).pipe(Effect.ignore))

describe("Session.diff — session-scoped agent diffs (#174)", () => {
  it.instance(
    "returns [] for session with no messages",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* withSession({ title: "empty-session" })

        const response = yield* requestInDirectory(
          pathFor(SessionPaths.diff, { sessionID: session.id }),
          test.directory,
        )
        expect(response.status).toBe(200)
        expect(yield* response.json).toEqual([])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "falls back to per-message summary diffs when no snapshot parts exist",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* withSession({ title: "no-snapshots" })
        const messageID = MessageID.ascending()
        yield* Session.use.updateMessage({
          id: messageID,
          sessionID: session.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("model") },
          summary: {
            diffs: [
              { file: "src/main.ts", additions: 10, deletions: 2, status: "modified" as const },
              { file: "src/new.ts", additions: 5, deletions: 0, status: "added" as const },
            ],
          },
        } satisfies SessionV1.User)

        const response = yield* requestInDirectory(
          pathFor(SessionPaths.diff, { sessionID: session.id }),
          test.directory,
        )
        expect(response.status).toBe(200)
        const diffs = (yield* response.json) as Array<{ file: string; additions: number; deletions: number }>
        expect(diffs.length).toBe(2)
        expect(diffs.map((d) => d.file).sort()).toEqual(["src/main.ts", "src/new.ts"])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "returns net diff for agent-touched files across the session",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* withSession({ title: "agent-diffs" })
        const snapshot = yield* Snapshot.Service
        const fs = yield* FSUtil.Service

        // Write an initial file before the session starts
        yield* fs.writeWithDirs(path.join(test.directory, "existing.txt"), "original content")
        // Take the session-start snapshot
        const startHash = yield* snapshot.track()
        expect(startHash).toBeTruthy()

        // Create a user message (parts are attached to it for simplicity)
        const userMsgID = MessageID.ascending()
        yield* Session.use.updateMessage({
          id: userMsgID,
          sessionID: session.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("model") },
        } satisfies SessionV1.User)

        // Attach step-start part (records session-start snapshot)
        yield* Session.use.updatePart({
          id: PartID.ascending(),
          sessionID: session.id,
          messageID: userMsgID,
          type: "step-start",
          snapshot: startHash!,
        })

        // Agent writes a new file and modifies an existing one
        yield* fs.writeWithDirs(path.join(test.directory, "new-file.ts"), "export const x = 1")
        yield* fs.writeWithDirs(path.join(test.directory, "existing.txt"), "modified content")

        // Also write a file that the agent did NOT touch (external change)
        yield* fs.writeWithDirs(path.join(test.directory, "external.txt"), "external change")

        // Record a patch part with agent-touched files
        const agentFiles = [
          path.join(test.directory, "new-file.ts"),
          path.join(test.directory, "existing.txt"),
        ]
        yield* Session.use.updatePart({
          id: PartID.ascending(),
          sessionID: session.id,
          messageID: userMsgID,
          type: "patch",
          hash: startHash!,
          files: agentFiles,
        })

        // Query the session diff via the HTTP endpoint
        const response = yield* requestInDirectory(
          pathFor(SessionPaths.diff, { sessionID: session.id }),
          test.directory,
        )
        expect(response.status).toBe(200)
        const diffs = (yield* response.json) as Array<{ file: string; additions: number; deletions: number }>

        // Should include agent-touched files only (not external.txt)
        const files = diffs.map((d) => d.file)
        expect(files).toContain("new-file.ts")
        expect(files).toContain("existing.txt")
        expect(files).not.toContain("external.txt")
        expect(diffs.length).toBe(2)

        // Each diff should have non-zero additions/deletions
        for (const d of diffs) {
          expect((d.additions ?? 0) + (d.deletions ?? 0)).toBeGreaterThan(0)
        }
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "filters out files where agent edits were externally reverted (zero diff)",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* withSession({ title: "reverted-diffs" })
        const snapshot = yield* Snapshot.Service
        const fs = yield* FSUtil.Service

        // Write a file
        yield* fs.writeWithDirs(path.join(test.directory, "reverted.txt"), "original")
        const startHash = yield* snapshot.track()
        expect(startHash).toBeTruthy()

        // Create a user message
        const userMsgID = MessageID.ascending()
        yield* Session.use.updateMessage({
          id: userMsgID,
          sessionID: session.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("model") },
        } satisfies SessionV1.User)

        yield* Session.use.updatePart({
          id: PartID.ascending(),
          sessionID: session.id,
          messageID: userMsgID,
          type: "step-start",
          snapshot: startHash!,
        })

        // Record the file as agent-touched
        yield* Session.use.updatePart({
          id: PartID.ascending(),
          sessionID: session.id,
          messageID: userMsgID,
          type: "patch",
          hash: startHash!,
          files: [path.join(test.directory, "reverted.txt")],
        })

        // File is back to its original content → net diff is zero
        // (we didn't actually change it from the snapshot state)

        const response = yield* requestInDirectory(
          pathFor(SessionPaths.diff, { sessionID: session.id }),
          test.directory,
        )
        expect(response.status).toBe(200)
        expect(yield* response.json).toEqual([])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "messageID query param is accepted but ignored (backwards compat)",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* withSession({ title: "compat" })

        // Passing messageID should still work (200) but returns session-scoped results
        const messageID = MessageID.ascending()
        const response = yield* requestInDirectory(
          `${pathFor(SessionPaths.diff, { sessionID: session.id })}?messageID=${messageID}`,
          test.directory,
        )
        expect(response.status).toBe(200)
        expect(yield* response.json).toEqual([])
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})

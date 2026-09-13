import { $ } from "bun"
import { afterEach, describe, expect } from "bun:test"
import * as fs from "fs/promises"
import path from "path"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { GlobalBus, type GlobalEvent } from "../../src/bus/global"
import { Git } from "../../src/git"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { Worktree } from "../../src/worktree"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(LayerNode.group([Worktree.node, FSUtil.node, Git.node]), [
    [InstanceStore.bootstrapNode, InstanceBootstrap.node],
  ]),
)

const git = Effect.fn("WorktreeRenameTest.git")(function* (cwd: string, args: string[]) {
  const service = yield* Git.Service
  const result = yield* service.run(args, { cwd })
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString("utf8")}`)
  return result.text()
})

const gitResult = Effect.fn("WorktreeRenameTest.gitResult")(function* (cwd: string, args: string[]) {
  const service = yield* Git.Service
  return yield* service.run(args, { cwd })
})

const waitRenamed = Effect.fn("WorktreeRenameTest.waitRenamed")(function* () {
  const renamed = yield* Deferred.make<{ name: string; branch?: string; oldDirectory: string }>()
  const on = (evt: GlobalEvent) => {
    if (evt.payload.type !== Worktree.Event.Renamed.type) return
    Deferred.doneUnsafe(renamed, Effect.succeed(evt.payload.properties))
  }

  GlobalBus.on("event", on)
  yield* Effect.addFinalizer(() => Effect.sync(() => GlobalBus.off("event", on)))

  return yield* Deferred.await(renamed).pipe(
    Effect.timeoutOrElse({
      duration: "10 seconds",
      orElse: () => Effect.fail(new Error("timed out waiting for worktree.renamed")),
    }),
  )
})

const waitReady = Effect.fn("WorktreeRenameTest.waitReady")(function* () {
  const ready = yield* Deferred.make<{ name: string; branch?: string }>()
  const on = (evt: GlobalEvent) => {
    if (evt.payload.type !== Worktree.Event.Ready.type) return
    Deferred.doneUnsafe(ready, Effect.succeed(evt.payload.properties))
  }

  GlobalBus.on("event", on)
  yield* Effect.addFinalizer(() => Effect.sync(() => GlobalBus.off("event", on)))

  return yield* Deferred.await(ready).pipe(
    Effect.timeoutOrElse({
      duration: "10 seconds",
      orElse: () => Effect.fail(new Error("timed out waiting for worktree.ready")),
    }),
  )
})

// Create a worktree via the service, wait for ready, then yield control
const withCreatedWorktree = <A, E, R>(
  name: string,
  use: (created: { info: Worktree.Info }) => Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    Effect.gen(function* () {
      const svc = yield* Worktree.Service
      const ready = yield* waitReady().pipe(Effect.forkScoped)
      const info = yield* svc.create({ name })
      yield* Fiber.join(ready)
      return { info }
    }),
    use,
    ({ info }) =>
      Effect.gen(function* () {
        const svc = yield* Worktree.Service
        // Try to remove by current directory; if renamed, the test cleaned up
        yield* svc.remove({ directory: info.directory }).pipe(Effect.catch(() => Effect.void))
      }),
  )

describe("Worktree.rename", () => {
  afterEach(() => disposeAllInstances())

  it.instance(
    "renames a worktree: old directory gone, new directory exists, git shows new path",
    () =>
      withCreatedWorktree(`rename-src-${Date.now().toString(36)}`, ({ info }) =>
        Effect.gen(function* () {
          const test = yield* TestInstance
          const svc = yield* Worktree.Service
          const fsSvc = yield* FSUtil.Service

          const newName = `rename-dst-${Date.now().toString(36)}`
          const renamedFiber = yield* waitRenamed().pipe(Effect.forkScoped)
          const result = yield* svc.rename({ directory: info.directory, newName })

          // New directory exists
          expect(yield* fsSvc.exists(result.directory).pipe(Effect.orDie)).toBe(true)

          // Old directory gone
          expect(yield* fsSvc.exists(info.directory).pipe(Effect.orDie)).toBe(false)

          // git worktree list shows the new path
          const list = yield* git(test.directory, ["worktree", "list", "--porcelain"])
          expect(list).toContain(result.directory)
          expect(list).not.toContain(info.directory)

          // worktree.renamed event was emitted
          const evt = yield* Fiber.join(renamedFiber)
          expect(evt.name).toBe(result.name)
          // canonical() resolves symlinks (on macOS /var → /private/var), so compare basenames
          expect(path.basename(evt.oldDirectory)).toBe(path.basename(info.directory))

          // Clean up the renamed worktree
          yield* svc.remove({ directory: result.directory }).pipe(Effect.catch(() => Effect.void))
        }),
      ),
    { git: true },
  )

  it.instance(
    "renames the branch from opencode/<old> to opencode/<new>",
    () =>
      withCreatedWorktree(`branch-src-${Date.now().toString(36)}`, ({ info }) =>
        Effect.gen(function* () {
          const test = yield* TestInstance
          const svc = yield* Worktree.Service

          const newName = `branch-dst-${Date.now().toString(36)}`
          const result = yield* svc.rename({ directory: info.directory, newName })

          // Old branch should be gone
          const oldRef = yield* gitResult(test.directory, [
            "show-ref",
            "--verify",
            "--quiet",
            `refs/heads/${info.branch}`,
          ])
          expect(oldRef.exitCode).not.toBe(0)

          // New branch should exist
          const newRef = yield* gitResult(test.directory, [
            "show-ref",
            "--verify",
            "--quiet",
            `refs/heads/${result.branch}`,
          ])
          expect(newRef.exitCode).toBe(0)

          yield* svc.remove({ directory: result.directory }).pipe(Effect.catch(() => Effect.void))
        }),
      ),
    { git: true },
  )

  it.instance(
    "rejects rename of the primary workspace",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const svc = yield* Worktree.Service

        const exit = yield* Effect.exit(svc.rename({ directory: test.directory, newName: "anything" }))

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const error = Cause.squash(exit.cause)
          expect(error).toBeInstanceOf(Worktree.RenameFailedError)
          if (error instanceof Worktree.RenameFailedError) {
            expect(error.message).toContain("primary")
          }
        }
      }),
    { git: true },
  )

  it.instance(
    "rejects rename when target directory already exists",
    () =>
      withCreatedWorktree(`conflict-src-${Date.now().toString(36)}`, ({ info }) =>
        Effect.gen(function* () {
          const svc = yield* Worktree.Service
          const fsSvc = yield* FSUtil.Service

          // Create a directory at the target path
          const conflictName = `conflict-dst-${Date.now().toString(36)}`
          const parentDir = path.dirname(info.directory)
          const conflictDir = path.join(parentDir, conflictName)
          yield* fsSvc.makeDirectory(conflictDir, { recursive: true }).pipe(Effect.orDie)

          const exit = yield* Effect.exit(svc.rename({ directory: info.directory, newName: conflictName }))

          expect(Exit.isFailure(exit)).toBe(true)
          if (Exit.isFailure(exit)) {
            const error = Cause.squash(exit.cause)
            expect(error).toBeInstanceOf(Worktree.RenameFailedError)
            if (error instanceof Worktree.RenameFailedError) {
              expect(error.message).toContain("already exists")
            }
          }

          // Clean up the conflicting directory
          yield* Effect.promise(() => fs.rm(conflictDir, { recursive: true, force: true }))
        }),
      ),
    { git: true },
  )

  it.instance(
    "rejects rename of a non-existent worktree",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const svc = yield* Worktree.Service

        const fakeDir = path.join(test.directory, "..", `nonexistent-${Date.now().toString(36)}`)
        const exit = yield* Effect.exit(svc.rename({ directory: fakeDir, newName: "anything" }))

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const error = Cause.squash(exit.cause)
          expect(error).toBeInstanceOf(Worktree.RenameFailedError)
          if (error instanceof Worktree.RenameFailedError) {
            expect(error.message).toContain("not found")
          }
        }
      }),
    { git: true },
  )
})

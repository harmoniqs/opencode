import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ServerScope } from "@/utils/server-scope"
import { Worktree } from "@/utils/worktree"
import { handleWorktreeLifecycleEvent } from "./notification-toasts"

const directory = (name: string) => `/tmp/opencode-worktree-lifecycle-${name}-${crypto.randomUUID()}`
const legacyLayout = readFileSync(join(import.meta.dir, "..", "layout.tsx"), "utf8")
const newLayout = readFileSync(join(import.meta.dir, "..", "layout-new.tsx"), "utf8")
const notificationToasts = readFileSync(join(import.meta.dir, "notification-toasts.ts"), "utf8")

describe("worktree lifecycle notifications", () => {
  test("releases a pending worktree when the server reports readiness", async () => {
    const scope = ServerScope.local
    const worktree = directory("ready")
    const busy: Array<{ directory: string; value: boolean }> = []

    Worktree.pending(scope, worktree)
    const waiting = Worktree.wait(scope, worktree)
    expect(
      handleWorktreeLifecycleEvent(
        {
          name: worktree,
          details: { type: "worktree.ready" },
        },
        {
          scope,
          setBusy: (directory, value) => busy.push({ directory, value }),
          fallbackMessage: "request failed",
        },
      ),
    ).toBe(true)

    expect(await waiting).toEqual({ status: "ready" })
    expect(busy).toEqual([{ directory: worktree, value: false }])
  })

  test("releases a pending worktree with the server failure message", async () => {
    const scope = ServerScope.local
    const worktree = directory("failed")
    Worktree.pending(scope, worktree)
    const waiting = Worktree.wait(scope, worktree)

    expect(
      handleWorktreeLifecycleEvent(
        {
          name: worktree,
          details: {
            type: "worktree.failed",
            properties: { message: "bootstrap failed" },
          },
        },
        {
          scope,
          fallbackMessage: "request failed",
        },
      ),
    ).toBe(true)

    expect(await Promise.race([waiting, Bun.sleep(20).then(() => ({ status: "still waiting" as const }))])).toEqual({
      status: "failed",
      message: "bootstrap failed",
    })
  })

  test("ignores events outside the worktree lifecycle", () => {
    const scope = ServerScope.local
    const worktree = directory("unrelated")
    const busy: Array<{ directory: string; value: boolean }> = []
    Worktree.pending(scope, worktree)

    expect(
      handleWorktreeLifecycleEvent(
        {
          name: worktree,
          details: { type: "session.updated" },
        },
        {
          scope,
          setBusy: (directory, value) => busy.push({ directory, value }),
          fallbackMessage: "request failed",
        },
      ),
    ).toBe(false)

    expect(Worktree.get(scope, worktree)).toEqual({ status: "pending" })
    expect(busy).toEqual([])
  })

  test("mounts the shared lifecycle hook from both layout roots", () => {
    expect(legacyLayout).toContain('import { useNotificationToasts } from "./layout/notification-toasts"')
    expect(legacyLayout).toContain("useNotificationToasts({ setBusy })")
    expect(newLayout).toContain('import { useNotificationToasts } from "./layout/notification-toasts"')
    expect(newLayout).toContain("useNotificationToasts()")
    expect(notificationToasts).toContain("serverSDK().event.listen")
    expect(notificationToasts).toContain("handleWorktreeLifecycleEvent(event")
  })
})

import { beforeAll, describe, expect, mock, test } from "bun:test"
import type { AssistantMessage, Part, UserMessage } from "@opencode-ai/sdk/v2"

/* Row-model guard for the brain-strip removal (ADR 0002): promoting the Brain
   to the chat background deletes its timeline row, but the timeline's
   working-indicator shimmer — the Thinking row — must survive the refactor
   unchanged, and no "brain"-keyed row may ever come out of the model.

   `@opencode-ai/ui/message-part` drags component-only dependencies that
   cannot load headless, so it is mocked (the repo's file-tree.test.ts
   pattern) with a shape-faithful groupParts/renderable. */

let Timeline: typeof import("./message-timeline.data").Timeline
let TimelineRow: typeof import("./message-timeline.data").TimelineRow

beforeAll(async () => {
  mock.module("@opencode-ai/ui/message-part", () => ({
    renderable: () => true,
    groupParts: (refs: { messageID: string; messageIndex: number; part: Part }[]) =>
      refs.map((ref) => ({ key: ref.part.id, parts: [ref] })),
  }))
  const data = await import("./message-timeline.data")
  Timeline = data.Timeline
  TimelineRow = data.TimelineRow
})

const userMessage = () =>
  ({
    id: "u1",
    sessionID: "s",
    role: "user",
    time: { created: 1 },
  }) as UserMessage

const assistantMessage = (opts: { completed?: boolean; error?: AssistantMessage["error"] } = {}) =>
  ({
    id: "a1",
    sessionID: "s",
    role: "assistant",
    parentID: "u1",
    time: opts.completed ? { created: 2, completed: 3 } : { created: 2 },
    error: opts.error,
  }) as unknown as AssistantMessage

const noParts = (): Part[] => []

const construct = (opts: {
  assistant?: AssistantMessage[]
  status?: "idle" | "busy" | "retry"
  isActive?: boolean
}) =>
  Timeline.constructMessageRows(
    userMessage(),
    noParts,
    opts.assistant ?? [assistantMessage()],
    0,
    false,
    opts.status ?? "busy",
    opts.isActive ?? true,
  )

describe("constructMessageRows", () => {
  test("a working turn emits the Thinking row — the shimmer survives the strip removal", () => {
    const rows = construct({ status: "busy", isActive: true })
    expect(rows.some((row) => row._tag === "Thinking")).toBe(true)
  })

  test("an idle turn emits no Thinking row", () => {
    const rows = construct({ status: "idle", isActive: true, assistant: [assistantMessage({ completed: true })] })
    expect(rows.some((row) => row._tag === "Thinking")).toBe(false)
  })

  test("an inactive turn emits no Thinking row even while the session is busy", () => {
    const rows = construct({ status: "busy", isActive: false })
    expect(rows.some((row) => row._tag === "Thinking")).toBe(false)
  })

  test("the row model never produces a brain-keyed row", () => {
    for (const rows of [
      construct({ status: "busy", isActive: true }),
      construct({ status: "idle", isActive: true, assistant: [assistantMessage({ completed: true })] }),
    ]) {
      expect(rows.map(TimelineRow.key)).not.toContain("brain")
    }
  })
})

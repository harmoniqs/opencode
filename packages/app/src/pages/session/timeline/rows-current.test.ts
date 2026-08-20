import { describe, expect, mock, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import type { UserMessage } from "@opencode-ai/sdk/v2"
import { normalizeSessionMessages } from "@/utils/session-message"

mock.module("@opencode-ai/session-ui/message-part", () => ({
  renderable: () => true,
  groupParts: (refs: Array<{ messageID: string; part: { id: string } }>) =>
    refs.map((ref) => ({
      type: "part" as const,
      key: ref.part.id,
      ref: { messageID: ref.messageID, partID: ref.part.id },
    })),
}))

const { Timeline, TimelineRow } = await import("./rows")

describe("current session timeline rows", () => {
  test("derives turns and tagged rows from chronological current messages", () => {
    const source = [
      { id: "msg_1", type: "user", text: "first", time: { created: 1 } },
      {
        id: "msg_2",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        content: [{ type: "text", text: "answer" }],
        time: { created: 2, completed: 3 },
      },
      { id: "msg_3", type: "user", text: "second", time: { created: 4 } },
      {
        id: "msg_4",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        content: [{ type: "reasoning", text: "working" }],
        time: { created: 5 },
      },
    ] satisfies SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const messages = new Map(normalized.messages.map((message) => [message.id, message]))

    const result = Timeline.constructSessionMessageRows(
      source,
      (messageID) => messages.get(messageID),
      (messageID) => normalized.parts.get(messageID) ?? [],
      true,
      "busy",
      true,
      normalized.messages.filter((message) => message.role === "user"),
    )

    expect(result.activeMessageID).toBe("msg_3")
    expect(result.rows.map(TimelineRow.key)).toEqual([
      "user-message:msg_1",
      "assistant-part:msg_1:msg_2:text:0",
      "turn-gap:msg_3",
      "user-message:msg_3",
      "assistant-part:msg_3:msg_4:reasoning:0",
    ])
  })

  test("renders a current shell message as a standalone turn", () => {
    const source = [
      {
        id: "msg_shell",
        type: "shell",
        shellID: "shell_1",
        command: "pwd",
        status: "exited",
        exit: 0,
        output: { output: "/repo", cursor: 5, size: 5, truncated: false },
        time: { created: 1, completed: 2 },
      },
    ] satisfies SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const messages = new Map(normalized.messages.map((message) => [message.id, message]))

    const result = Timeline.constructSessionMessageRows(
      source,
      (messageID) => messages.get(messageID),
      (messageID) => normalized.parts.get(messageID) ?? [],
      true,
      "idle",
      true,
      normalized.messages.filter((message) => message.role === "user"),
    )

    expect(result.activeMessageID).toBe("msg_shell")
    expect(result.rows.map(TimelineRow.key)).toEqual([
      "user-message:msg_shell",
      "assistant-part:msg_shell:msg_shell:tool",
    ])
  })

  test("keeps a projected parent missing from the source page before newer turns", () => {
    const source = [
      { id: "msg_user_1", type: "user", text: "first question", time: { created: 1 } },
      {
        id: "msg_assistant_1",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        content: [{ type: "text", text: "first answer" }],
        time: { created: 2, completed: 3 },
      },
      { id: "msg_user_2", type: "user", text: "second question", time: { created: 4 } },
      {
        id: "msg_assistant_2",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        content: [{ type: "text", text: "second answer" }],
        time: { created: 5, completed: 6 },
      },
    ] satisfies SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const messages = new Map(normalized.messages.map((message) => [message.id, message]))

    const result = Timeline.constructSessionMessageRows(
      source.slice(1),
      (messageID) => messages.get(messageID),
      (messageID) => normalized.parts.get(messageID) ?? [],
      true,
      "idle",
      true,
      normalized.messages.filter((message) => message.role === "user"),
    )

    expect(result.rows.map(TimelineRow.key)).toEqual([
      "user-message:msg_user_1",
      "assistant-part:msg_user_1:msg_assistant_1:text:0",
      "turn-gap:msg_user_2",
      "user-message:msg_user_2",
      "assistant-part:msg_user_2:msg_assistant_2:text:0",
    ])
  })

  test("renders an optimistic user turn and thinking before the protocol message arrives", () => {
    const source = [
      { id: "msg_1", type: "user", text: "existing", time: { created: 1 } },
    ] satisfies SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const optimistic = {
      id: "msg_2",
      sessionID: "ses_1",
      role: "user" as const,
      time: { created: 2 },
      agent: "build",
      model: { modelID: "model", providerID: "provider" },
    }
    const result = Timeline.constructSessionMessageRows(
      source,
      (messageID) =>
        messageID === optimistic.id ? optimistic : normalized.messages.find((message) => message.id === messageID),
      () => [],
      true,
      "busy",
      true,
      [...normalized.messages.filter((message) => message.role === "user"), optimistic],
    )

    expect(result.activeMessageID).toBe(optimistic.id)
    expect(result.rows.map(TimelineRow.key)).toEqual([
      "user-message:msg_1",
      "turn-gap:msg_2",
      "user-message:msg_2",
      "thinking:msg_2",
    ])
  })

  test("step rail: all steps in a busy turn show running state", () => {
    // When session is busy (agent working after user's message), ALL steps
    // show "running" — the entire rail is yellow. Once session goes idle, all flip to white.
    const userMsg = { id: "msg_u", type: "user" as const, text: "hello", time: { created: 1 } }
    const assistantMsg = {
      id: "msg_a",
      type: "assistant" as const,
      agent: "build",
      model: { id: "model", providerID: "provider" },
      content: [{ type: "text", text: "working on it" }],
      time: { created: 2 },
    }
    const source = [userMsg, assistantMsg] as unknown as SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const messages = new Map(normalized.messages.map((m) => [m.id, m]))

    // Inject step-start before the text part (simulating the event reducer)
    const baseParts = normalized.parts.get("msg_a") ?? []
    const partsWithStep = [
      { id: "step_0", sessionID: "ses_1", messageID: "msg_a", type: "step-start" as const },
      ...baseParts,
    ]

    const result = Timeline.constructMessageRows(
      messages.get("msg_u")! as UserMessage,
      (messageID) => (messageID === "msg_a" ? partsWithStep : normalized.parts.get(messageID) ?? []),
      [messages.get("msg_a")!] as any,
      0,
      true,
      "busy",
      true,
      true,
    )

    const stepFrames = result.filter((row) => row._tag === "StepFrame")
    expect(stepFrames.length).toBeGreaterThan(0)
    expect(stepFrames[0]!.state).toBe("running")
  })

  test("step rail: busy turn with tool step also shows running state", () => {
    const userMsg = { id: "msg_u", type: "user" as const, text: "hello", time: { created: 1 } }
    const assistantMsg = {
      id: "msg_a",
      type: "assistant" as const,
      agent: "build",
      model: { id: "model", providerID: "provider" },
      content: [{ type: "tool", id: "tool_1", name: "bash", time: { created: 2 }, state: { status: "running", input: { command: "ls" }, metadata: {} } }],
      time: { created: 2 },
    }
    const source = [userMsg, assistantMsg] as unknown as SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const messages = new Map(normalized.messages.map((m) => [m.id, m]))

    const baseParts = normalized.parts.get("msg_a") ?? []
    const partsWithStep = [
      { id: "step_0", sessionID: "ses_1", messageID: "msg_a", type: "step-start" as const },
      ...baseParts,
    ]

    const result = Timeline.constructMessageRows(
      messages.get("msg_u")! as UserMessage,
      (messageID) => (messageID === "msg_a" ? partsWithStep : normalized.parts.get(messageID) ?? []),
      [messages.get("msg_a")!] as any,
      0,
      true,
      "busy",
      true,
      true,
    )

    const stepFrames = result.filter((row) => row._tag === "StepFrame")
    expect(stepFrames.length).toBeGreaterThan(0)
    expect(stepFrames[0]!.state).toBe("running")
  })

  test("step rail: completed step shows done state", () => {
    const userMsg = { id: "msg_u", type: "user" as const, text: "hello", time: { created: 1 } }
    const assistantMsg = {
      id: "msg_a",
      type: "assistant" as const,
      agent: "build",
      model: { id: "model", providerID: "provider" },
      content: [{ type: "text", text: "done" }],
      time: { created: 2, completed: 3 },
    }
    const source = [userMsg, assistantMsg] as unknown as SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const messages = new Map(normalized.messages.map((m) => [m.id, m]))

    const baseParts = normalized.parts.get("msg_a") ?? []
    const partsWithStep = [
      { id: "step_0", sessionID: "ses_1", messageID: "msg_a", type: "step-start" as const },
      ...baseParts,
      { id: "step_0_end", sessionID: "ses_1", messageID: "msg_a", type: "step-finish" as const, reason: "end_turn", cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
    ]

    // Session is idle — the step should be "done"
    const result = Timeline.constructMessageRows(
      messages.get("msg_u")! as UserMessage,
      (messageID) => (messageID === "msg_a" ? partsWithStep : normalized.parts.get(messageID) ?? []),
      [messages.get("msg_a")!] as any,
      0,
      true,
      "idle",
      true,
      true,
    )

    const stepFrames = result.filter((row) => row._tag === "StepFrame")
    expect(stepFrames.length).toBeGreaterThan(0)
    expect(stepFrames[0]!.state).toBe("done")
  })

  test("step rail: step with errored tool shows error state", () => {
    const userMsg = { id: "msg_u", type: "user" as const, text: "hello", time: { created: 1 } }
    const assistantMsg = {
      id: "msg_a",
      type: "assistant" as const,
      agent: "build",
      model: { id: "model", providerID: "provider" },
      content: [{ type: "tool", id: "tool_1", name: "bash", time: { created: 2, completed: 3 }, state: { status: "error", input: { command: "fail" }, error: { message: "failed" }, metadata: {} } }],
      time: { created: 2 },
    }
    const source = [userMsg, assistantMsg] as unknown as SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const messages = new Map(normalized.messages.map((m) => [m.id, m]))

    const baseParts = normalized.parts.get("msg_a") ?? []
    const partsWithStep = [
      { id: "step_0", sessionID: "ses_1", messageID: "msg_a", type: "step-start" as const },
      ...baseParts,
    ]

    const result = Timeline.constructMessageRows(
      messages.get("msg_u")! as UserMessage,
      (messageID) => (messageID === "msg_a" ? partsWithStep : normalized.parts.get(messageID) ?? []),
      [messages.get("msg_a")!] as any,
      0,
      true,
      "busy",
      true,
      true,
    )

    const stepFrames = result.filter((row) => row._tag === "StepFrame")
    expect(stepFrames.length).toBeGreaterThan(0)
    expect(stepFrames[0]!.state).toBe("error")
  })

  test("step rail: all steps in a busy turn show running state (yellow rail)", () => {
    // Two steps: step 0 (text, finished) and step 1 (text, still open).
    // Both should be "running" because the session is busy — the entire turn's
    // rail is yellow until the agent finishes and the session goes idle.
    const userMsg = { id: "msg_u", type: "user" as const, text: "hello", time: { created: 1 } }
    const assistantMsg = {
      id: "msg_a",
      type: "assistant" as const,
      agent: "build",
      model: { id: "model", providerID: "provider" },
      content: [{ type: "text", text: "first" }, { type: "text", text: "second" }],
      time: { created: 2 },
    }
    const source = [userMsg, assistantMsg] as unknown as SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const messages = new Map(normalized.messages.map((m) => [m.id, m]))

    const baseParts = normalized.parts.get("msg_a") ?? []
    // Two step slices: step 0 has part[0], step 1 has part[1]
    const partsWithSteps = [
      { id: "step_0", sessionID: "ses_1", messageID: "msg_a", type: "step-start" as const },
      baseParts[0]!,
      { id: "step_0_end", sessionID: "ses_1", messageID: "msg_a", type: "step-finish" as const, reason: "end_turn", cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
      { id: "step_1", sessionID: "ses_1", messageID: "msg_a", type: "step-start" as const },
      baseParts[1]!,
    ]

    const result = Timeline.constructMessageRows(
      messages.get("msg_u")! as UserMessage,
      (messageID) => (messageID === "msg_a" ? partsWithSteps : normalized.parts.get(messageID) ?? []),
      [messages.get("msg_a")!] as any,
      0,
      true,
      "busy",
      true,
      true,
    )

    const stepFrames = result.filter((row) => row._tag === "StepFrame")
    expect(stepFrames.length).toBe(2)
    expect(stepFrames[0]!.state).toBe("running")
    expect(stepFrames[0]!.lastStep).toBe(false)
    expect(stepFrames[1]!.state).toBe("running")
    expect(stepFrames[1]!.lastStep).toBe(true)
  })

  test("removes a failed assistant error when the turn continues streaming", () => {
    const source = [
      { id: "msg_user", type: "user", text: "recover", time: { created: 1 } },
      {
        id: "msg_failed",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        content: [],
        error: { type: "ProviderError", message: "temporary failure" },
        time: { created: 2, completed: 3 },
      },
      {
        id: "msg_recovery",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        content: [{ type: "text", text: "streaming again" }],
        time: { created: 4 },
      },
    ] satisfies SessionMessageInfo[]
    const normalized = normalizeSessionMessages("ses_1", source)
    const messages = new Map(normalized.messages.map((message) => [message.id, message]))

    const result = Timeline.constructSessionMessageRows(
      source,
      (messageID) => messages.get(messageID),
      (messageID) => normalized.parts.get(messageID) ?? [],
      true,
      "busy",
      true,
      normalized.messages.filter((message) => message.role === "user"),
    )

    expect(result.rows.map((row) => row._tag)).toEqual(["UserMessage", "AssistantPart"])
  })
})

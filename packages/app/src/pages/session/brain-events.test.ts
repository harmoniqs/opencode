import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Part, UserMessage } from "@opencode-ai/sdk/v2"
import { deriveBrainEvents } from "./brain-events"

/* The live-feed contract for the chat-wide Brain background: the inline
   strip's event derivation, lifted to a pure session-scoped function so it
   can be pinned headless against sync-store-shaped fixtures — no Solid
   context, no component mount. */

type PartsByMessage = Record<string, Part[] | undefined>

const userMsg = (id: string) =>
  ({
    id,
    sessionID: "s",
    role: "user",
    time: { created: 1 },
  }) as UserMessage

const assistantMsg = (id: string, opts: { parentID?: string; completed?: boolean } = {}) =>
  ({
    id,
    sessionID: "s",
    role: "assistant",
    parentID: opts.parentID,
    time: opts.completed ? { created: 2, completed: 3 } : { created: 2 },
  }) as unknown as AssistantMessage

const textPart = (id: string, messageID: string, text: string) =>
  ({ id, messageID, sessionID: "s", type: "text", text }) as Part

const toolPart = (id: string, messageID: string, tool: string, input: Record<string, unknown>) =>
  ({
    id,
    messageID,
    sessionID: "s",
    type: "tool",
    tool,
    callID: `call-${id}`,
    state: { status: "completed", input },
  }) as unknown as Part

const partsFor =
  (parts: PartsByMessage) =>
  (messageID: string): Part[] =>
    parts[messageID] ?? []

describe("deriveBrainEvents", () => {
  test("a fresh session with no assistant activity yields an empty stream", () => {
    expect(deriveBrainEvents([], partsFor({}))).toEqual([])
    expect(deriveBrainEvents([userMsg("u1")], partsFor({ u1: [textPart("t1", "u1", "hello")] }))).toEqual([])
  })

  test("touches land in message order, mapped through the tool→brain-ref lookup", () => {
    const messages = [
      userMsg("u1"),
      assistantMsg("a1", { parentID: "u1", completed: true }),
      assistantMsg("a2", { parentID: "u1" }),
    ]
    const events = deriveBrainEvents(
      messages,
      partsFor({
        a1: [
          toolPart("p1", "a1", "read", { filePath: "vault/notes.md" }),
          toolPart("p2", "a1", "grep", { pattern: "saveat" }),
        ],
        a2: [toolPart("p3", "a2", "skill", { name: "tdd" })],
      }),
    )
    const touches = events.filter((e) => e.kind === "touch")
    expect(touches.map((e) => e.id)).toEqual(["p1", "p2", "p3"])
    expect(touches[0]).toMatchObject({ label: "notes.md", type: "note", consider: false })
    expect(touches[1]).toMatchObject({ label: "saveat", type: "resource", consider: true })
    expect(touches[2]).toMatchObject({ label: "tdd", type: "skill", consider: false })
  })

  test("tools with no brain reference stay out of the visible thought", () => {
    const events = deriveBrainEvents(
      [assistantMsg("a1", { completed: true })],
      partsFor({ a1: [toolPart("p1", "a1", "todowrite", { todos: [] })] }),
    )
    expect(events).toEqual([])
  })

  test("completed turns replay; the in-flight busy turn is live", () => {
    const messages = [assistantMsg("a1", { completed: true }), assistantMsg("a2", {})]
    const events = deriveBrainEvents(
      messages,
      partsFor({
        a1: [toolPart("p1", "a1", "read", { filePath: "solve.jl" })],
        a2: [toolPart("p2", "a2", "read", { filePath: "setup.jl" })],
      }),
    )
    expect(events).toMatchObject([
      { kind: "touch", id: "p1", replay: true },
      { kind: "touch", id: "p2", replay: false },
    ])
  })

  test("a completed turn with ≥2 commits charts a constellation titled from the parent prompt", () => {
    const prompt = "Optimize the fluxonium X gate carefully"
    const messages = [userMsg("u1"), assistantMsg("a1", { parentID: "u1", completed: true })]
    const events = deriveBrainEvents(
      messages,
      partsFor({
        u1: [textPart("t1", "u1", prompt)],
        a1: [
          toolPart("p1", "a1", "read", { filePath: "solve.jl" }),
          toolPart("p2", "a1", "read", { filePath: "setup.jl" }),
        ],
      }),
    )
    // the chart marker lands after that message's touches
    expect(events.map((e) => e.kind)).toEqual(["touch", "touch", "chart"])
    expect(events[2]).toMatchObject({ id: "chart-a1", title: prompt.trim().slice(0, 28) })
  })

  test("considers do not count toward the chart threshold", () => {
    const events = deriveBrainEvents(
      [assistantMsg("a1", { completed: true })],
      partsFor({
        a1: [
          toolPart("p1", "a1", "read", { filePath: "solve.jl" }),
          toolPart("p2", "a1", "grep", { pattern: "saveat" }),
          toolPart("p3", "a1", "glob", { pattern: "**/*.jl" }),
        ],
      }),
    )
    expect(events.filter((e) => e.kind === "chart")).toEqual([])
  })

  test("an in-flight turn never charts, even with ≥2 commits", () => {
    const events = deriveBrainEvents(
      [assistantMsg("a1", {})],
      partsFor({
        a1: [
          toolPart("p1", "a1", "read", { filePath: "solve.jl" }),
          toolPart("p2", "a1", "read", { filePath: "setup.jl" }),
        ],
      }),
    )
    expect(events.filter((e) => e.kind === "chart")).toEqual([])
  })

  test("each completed ≥2-commit turn charts — one plate per turn", () => {
    const messages = [
      userMsg("u1"),
      assistantMsg("a1", { parentID: "u1", completed: true }),
      userMsg("u2"),
      assistantMsg("a2", { parentID: "u2", completed: true }),
    ]
    const events = deriveBrainEvents(
      messages,
      partsFor({
        u1: [textPart("t1", "u1", "first ask")],
        u2: [textPart("t2", "u2", "second ask")],
        a1: [
          toolPart("p1", "a1", "read", { filePath: "one.md" }),
          toolPart("p2", "a1", "read", { filePath: "two.md" }),
        ],
        a2: [
          toolPart("p3", "a2", "read", { filePath: "three.md" }),
          toolPart("p4", "a2", "read", { filePath: "four.md" }),
        ],
      }),
    )
    expect(events.filter((e) => e.kind === "chart").map((e) => e.id)).toEqual(["chart-a1", "chart-a2"])
    expect(events.filter((e) => e.kind === "chart").map((e) => "title" in e && e.title)).toEqual([
      "first ask",
      "second ask",
    ])
  })

  test("duplicate ids are de-duplicated — the stream never repeats an event", () => {
    const dup = toolPart("p1", "a1", "read", { filePath: "solve.jl" })
    const events = deriveBrainEvents(
      [assistantMsg("a1", { completed: true })],
      partsFor({ a1: [dup, dup, toolPart("p2", "a1", "read", { filePath: "setup.jl" })] }),
    )
    expect(events.map((e) => e.id)).toEqual(["p1", "p2", "chart-a1"])
  })
})

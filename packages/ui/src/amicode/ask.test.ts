import { describe, expect, test } from "bun:test"
import { latestAssistantMessageID, parseAskInput } from "./ask"

describe("parseAskInput", () => {
  test("parses a well-formed ask input", () => {
    expect(parseAskInput({ question: "Which platform?", options: ["transmon", "rydberg"] })).toEqual({
      question: "Which platform?",
      options: ["transmon", "rydberg"],
    })
  })

  test("trims and drops empty/non-string options", () => {
    expect(parseAskInput({ question: "  Pick one  ", options: [" a ", "", 3, null, "b"] })).toEqual({
      question: "Pick one",
      options: ["a", "b"],
    })
  })

  test("malformed input falls back to undefined (collapsed chip)", () => {
    expect(parseAskInput(undefined)).toBeUndefined()
    expect(parseAskInput(null)).toBeUndefined()
    expect(parseAskInput("question")).toBeUndefined()
    expect(parseAskInput({})).toBeUndefined()
    expect(parseAskInput({ question: "", options: ["a"] })).toBeUndefined()
    expect(parseAskInput({ question: "q" })).toBeUndefined()
    expect(parseAskInput({ question: "q", options: [] })).toBeUndefined()
    expect(parseAskInput({ question: "q", options: [1, "", "  "] })).toBeUndefined()
  })
})

describe("latestAssistantMessageID", () => {
  test("returns the lexicographically last assistant message id (ULID order)", () => {
    expect(
      latestAssistantMessageID([
        { id: "msg_a", role: "assistant" },
        { id: "msg_c", role: "assistant" },
        { id: "msg_z", role: "user" },
        { id: "msg_b", role: "assistant" },
      ]),
    ).toBe("msg_c")
  })

  test("ignores non-assistant and malformed entries", () => {
    expect(latestAssistantMessageID([{ id: "msg_z", role: "user" }, { id: "" , role: "assistant" }])).toBeUndefined()
    expect(latestAssistantMessageID([])).toBeUndefined()
  })
})

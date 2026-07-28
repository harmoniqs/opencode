import { describe, expect, test } from "bun:test"
import { producedUserVisibleOutput } from "../../src/session/turn-output"

// Regression coverage for the silent-turn guard in prompt.ts.
//
// The bug this pins: the pulse-designer interview died after every answer. The
// abandoned assistant message was step-start → reasoning → step-finish with a
// finish reason of "unknown" — the model was mid-thought, about to ask the next
// question. The loop's exit test whitelisted only "tool-calls", so it read that
// as "done" and ended the turn. Reproduced reliably on deepseek-v4-flash-free.
describe("producedUserVisibleOutput", () => {
  test("reasoning-only turn produces NOTHING (the interview-stall shape)", () => {
    const parts = [{ type: "step-start" }, { type: "reasoning", text: "The system has been recorded…" }, { type: "step-finish" }]
    expect(producedUserVisibleOutput(parts)).toBe(false)
  })

  test("non-empty text counts as output", () => {
    expect(producedUserVisibleOutput([{ type: "text", text: "Transmon it is." }])).toBe(true)
  })

  test("a tool call counts as output even with no text", () => {
    expect(producedUserVisibleOutput([{ type: "step-start" }, { type: "tool", text: undefined }])).toBe(true)
  })

  test("whitespace-only text does NOT count — it says nothing", () => {
    expect(producedUserVisibleOutput([{ type: "text", text: "   \n  " }])).toBe(false)
  })

  test("missing/empty parts are silent, never a throw", () => {
    expect(producedUserVisibleOutput(undefined)).toBe(false)
    expect(producedUserVisibleOutput([])).toBe(false)
  })

  test("an orphaned (interrupted) tool call does not count as work done", () => {
    const parts = [{ type: "tool", callID: "abandoned" }]
    const isOrphaned = (p: { type: string; callID?: string }) => p.callID === "abandoned"
    expect(producedUserVisibleOutput(parts, isOrphaned)).toBe(false)
    // …while a live tool call in the same shape still counts
    expect(producedUserVisibleOutput([{ type: "tool", callID: "live" }], isOrphaned)).toBe(true)
  })

  test("mixed turn: reasoning plus real text is output", () => {
    const parts = [
      { type: "step-start" },
      { type: "reasoning", text: "thinking about levels" },
      { type: "text", text: "How many levels should we keep?" },
      { type: "step-finish" },
    ]
    expect(producedUserVisibleOutput(parts)).toBe(true)
  })
})

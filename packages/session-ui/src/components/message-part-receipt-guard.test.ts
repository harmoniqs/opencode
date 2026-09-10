import { describe, expect, test } from "bun:test"
import { hasStringToolName } from "./message-part-receipt-guard"

describe("hasStringToolName", () => {
  test("rejects a tool part without a string tool name", () => {
    expect(hasStringToolName({ type: "tool", tool: undefined })).toBe(false)
  })

  test("accepts a tool part with a string tool name", () => {
    expect(hasStringToolName({ type: "tool", tool: "amicode_formulate" })).toBe(true)
  })
})

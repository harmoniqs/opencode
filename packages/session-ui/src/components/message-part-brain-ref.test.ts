import { describe, expect, test } from "bun:test"
import { messagePartBrainRef } from "./message-part-brain-ref"

describe("messagePartBrainRef", () => {
  test("does not pass a malformed tool part to the brain reference mapper", () => {
    expect(() => messagePartBrainRef({ type: "tool", tool: undefined })).not.toThrow()
    expect(messagePartBrainRef({ type: "tool", tool: undefined })).toBeUndefined()
  })

  test("preserves brain references for valid tool parts", () => {
    expect(messagePartBrainRef({ type: "tool", tool: "read" }, { filePath: "/tmp/example.ts" })).toEqual({
      label: "example.ts",
      type: "resource",
      consider: false,
      path: "/tmp/example.ts",
    })
  })
})

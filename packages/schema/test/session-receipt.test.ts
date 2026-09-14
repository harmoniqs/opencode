import { describe, expect, test } from "bun:test"
import { SessionReceipt } from "../src/session-receipt"

describe("session receipt exposure schema", () => {
  test("classifies every receipt and evidence field at every serializer boundary", () => {
    expect(Object.keys(SessionReceipt.Exposure).sort()).toEqual([...SessionReceipt.Fields].sort())

    for (const field of SessionReceipt.Fields) {
      expect(Object.keys(SessionReceipt.Exposure[field]).sort()).toEqual([...SessionReceipt.Boundaries].sort())
    }
  })

  test("never permits host-only context values through a client or egress serializer", () => {
    for (const field of [
      "context.capability",
      "context.canonicalPath",
      "context.rawHash",
      "context.baseline",
      "context.redactionDecision",
    ] as const) {
      for (const boundary of SessionReceipt.Boundaries) {
        expect(SessionReceipt.Exposure[field][boundary]).toBe("deny")
      }
    }
  })

  test("fails closed when a new receipt or evidence field has no exposure decision", () => {
    const { "evidence.content": _missing, ...incomplete } = SessionReceipt.Exposure
    expect(() => SessionReceipt.assertExposureCoverage(incomplete)).toThrow(
      "Missing receipt exposure classification for evidence.content",
    )
  })
})

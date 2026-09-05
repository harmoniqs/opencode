import { describe, expect, test } from "bun:test"
import { bootCurrencyDecision, toSnapshot, type SessionSnapshot } from "./session-snapshot"

const session = (id: string) => ({
  id,
  directory: "/home",
  projectID: "p1",
  slug: id,
  version: "test",
  title: `Session ${id}`,
  time: { created: 1, updated: 1 },
})

describe("bootCurrencyDecision (D2: the #293 stale-storage shape self-heals on boot)", () => {
  test("a snapshot with a stale token is proven stale and the fetched rows are adopted", () => {
    const snapshot: SessionSnapshot = { sessions: [session("old")], currency: "v1.3.100.100.build-a" }
    const decision = bootCurrencyDecision({
      snapshot,
      response: { sessions: [session("fresh")], currency: "v1.4.200.200.build-a" },
    })

    expect(decision.adopt).toBe(true)
    expect(decision.stale).toBe(true)
    expect(decision.currency).toBe("v1.4.200.200.build-a")
  })

  test("a snapshot written without a token (the #293 shape) cannot be trusted", () => {
    const snapshot: SessionSnapshot = { sessions: [], currency: undefined }
    const decision = bootCurrencyDecision({
      snapshot,
      response: { sessions: [session("fresh")], currency: "v1.4.200.200.build-a" },
    })

    expect(decision.stale).toBe(true)
    expect(decision.adopt).toBe(true)
  })

  test("a matching token means the snapshot was fresh", () => {
    const snapshot: SessionSnapshot = { sessions: [session("old")], currency: "v1.4.200.200.build-a" }
    const decision = bootCurrencyDecision({
      snapshot,
      response: { sessions: [session("old")], currency: "v1.4.200.200.build-a" },
    })

    expect(decision.stale).toBe(false)
    expect(decision.currency).toBe("v1.4.200.200.build-a")
  })

  test("a hub without a currency token (additive base default) cannot be verified", () => {
    const snapshot: SessionSnapshot = { sessions: [session("old")], currency: "v1.4.200.200.build-a" }
    const decision = bootCurrencyDecision({ snapshot, response: { sessions: [session("fresh")] } })

    expect(decision.stale).toBe(false)
    expect(decision.currency).toBeUndefined()
  })

  test("a fresh client with no snapshot adopts the fetched rows without a verdict", () => {
    const decision = bootCurrencyDecision({
      response: { sessions: [session("fresh")], currency: "v1.4.200.200.build-a" },
    })

    expect(decision.adopt).toBe(true)
    expect(decision.stale).toBe(false)
    expect(decision.currency).toBe("v1.4.200.200.build-a")
  })

  test("toSnapshot shapes what gets persisted: rows plus the token", () => {
    const snapshot = toSnapshot([session("a"), session("b")], "v1.4.200.200.build-a")
    expect(snapshot.sessions).toHaveLength(2)
    expect(snapshot.currency).toBe("v1.4.200.200.build-a")
  })
})

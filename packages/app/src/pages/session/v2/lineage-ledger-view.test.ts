import { describe, expect, test } from "bun:test"
import {
  applyLedgerKeyDown,
  buildLedgerView,
  describeLedgerStatus,
  LEDGER_CAPABILITY_LABELS,
  ledgerCapabilityLabel,
  pageReceiptHistory,
  type LedgerProjectionRecord,
  type LedgerStatusKind,
} from "./lineage-ledger-view"

// A projected ledger record mirrors the #1078 `browser`-boundary projection of one
// host receipt: operation context (origin/state + display-safe session/resource
// keys), the immutable receipt fact, an optional assessment revision, and derived
// counts. Host-only fields (ids/rootID/sessionID/canonical path/evidence/redaction)
// are absent by construction — the browser boundary denies them.
function record(input: Partial<LedgerProjectionRecord>): LedgerProjectionRecord {
  return input
}

describe("buildLedgerView — no-fallback ownership (AC1)", () => {
  test("derives a resource's origin only from projected operation data, never inferred", () => {
    const view = buildLedgerView({
      capability: { mode: "full" },
      records: [
        record({
          operation: { origin: "agent", session: "root", state: "committed" },
          receipt: { id: "r1", sequence: 1, resource: "src/a.ts", operation: "create", outcome: "succeeded", timeCreated: 10 },
          assessment: { receiptID: "r1", netState: "added", evidenceState: "available", confidence: "observed", revision: 1, timeCreated: 11 },
        }),
      ],
    })
    expect(view.resources).toHaveLength(1)
    expect(view.resources[0].origins).toEqual(["agent"])
    // The row exposes no tool/watcher-owned attribution field at all.
    expect(view.resources[0]).not.toHaveProperty("tool")
    expect(view.resources[0]).not.toHaveProperty("watcher")
  })
})

describe("buildLedgerView — one canonical resource row (AC2)", () => {
  test("aggregates final state, origin mix, source provenance, receipt count, evidence state", () => {
    const view = buildLedgerView({
      capability: { mode: "full" },
      records: [
        record({
          operation: { origin: "user", session: "root" },
          receipt: { id: "r1", sequence: 1, resource: "src/a.ts", operation: "create", outcome: "succeeded", timeCreated: 1 },
          assessment: { receiptID: "r1", netState: "added", evidenceState: "available", revision: 1, timeCreated: 2 },
        }),
        record({
          operation: { origin: "agent", session: "child" },
          receipt: { id: "r2", sequence: 2, resource: "src/a.ts", operation: "edit", outcome: "succeeded", timeCreated: 3 },
          assessment: { receiptID: "r2", netState: "modified", evidenceState: "available", revision: 1, timeCreated: 4 },
        }),
      ],
    })
    expect(view.resources).toHaveLength(1)
    const row = view.resources[0]
    expect(row.displayPath).toBe("src/a.ts")
    expect(row.receiptCount).toBe(2)
    expect(row.origins.sort()).toEqual(["agent", "user"])
    expect(row.sources.sort()).toEqual(["child", "root"])
    expect(row.status.kind).toBe("modified") // final assessment
    expect(row.evidenceState).toBe("available")
  })
})

describe("buildLedgerView — chronological history preserves immutable facts (AC3)", () => {
  test("expands receipts in sequence with assessment revisions interleaved after their receipt", () => {
    const view = buildLedgerView({
      capability: { mode: "full" },
      records: [
        record({
          operation: { origin: "agent" },
          receipt: { id: "r1", sequence: 1, resource: "a.ts", operation: "create", outcome: "succeeded", timeCreated: 1 },
          assessment: { receiptID: "r1", netState: "added", evidenceState: "available", revision: 1, timeCreated: 2 },
        }),
        // later reassessment of the same receipt — a new revision, not a rewrite
        record({
          assessment: { receiptID: "r1", netState: "reverted", evidenceState: "available", revision: 2, timeCreated: 5 },
        }),
        record({
          operation: { origin: "agent" },
          receipt: { id: "r2", sequence: 2, resource: "a.ts", operation: "edit", outcome: "succeeded", timeCreated: 3 },
        }),
      ],
    })
    const row = view.resources[0]
    expect(row.history.map((h) => h.receiptID)).toEqual(["r1", "r2"])
    expect(row.history[0].assessments.map((a) => a.revision)).toEqual([1, 2])
  })

  test("a duplicate receipt record never rewrites the first-seen immutable execution fact", () => {
    const view = buildLedgerView({
      capability: { mode: "full" },
      records: [
        record({
          receipt: { id: "r1", sequence: 1, resource: "a.ts", operation: "create", outcome: "succeeded", timeCreated: 1 },
        }),
        record({
          receipt: { id: "r1", sequence: 1, resource: "a.ts", operation: "create", outcome: "TAMPERED", timeCreated: 99 },
        }),
      ],
    })
    expect(view.resources[0].history[0].outcome).toBe("succeeded")
    expect(view.resources[0].history[0].timeCreated).toBe(1)
  })

  test("a zero-net final state never erases the resource's historical receipt row", () => {
    const view = buildLedgerView({
      capability: { mode: "full" },
      records: [
        record({
          receipt: { id: "r1", sequence: 1, resource: "tmp.ts", operation: "create", outcome: "succeeded", timeCreated: 1 },
          assessment: { receiptID: "r1", netState: "added", evidenceState: "available", revision: 1, timeCreated: 2 },
        }),
        record({
          receipt: { id: "r2", sequence: 2, resource: "tmp.ts", operation: "delete", outcome: "succeeded", timeCreated: 3 },
          assessment: { receiptID: "r2", netState: "deleted", evidenceState: "available", revision: 1, timeCreated: 4 },
        }),
      ],
    })
    expect(view.resources).toHaveLength(1)
    expect(view.resources[0].receiptCount).toBe(2)
    expect(view.resources[0].status.kind).toBe("deleted")
  })
})

describe("buildLedgerView — rename chain is one identity with aliases (AC2/AC3)", () => {
  test("groups receipts sharing a server resource key across differing display paths", () => {
    const view = buildLedgerView({
      capability: { mode: "full" },
      records: [
        record({
          resourceKey: "res-1",
          receipt: { id: "r1", sequence: 1, resource: "old.ts", operation: "create", outcome: "succeeded", timeCreated: 1 },
        }),
        record({
          resourceKey: "res-1",
          receipt: { id: "r2", sequence: 2, resource: "new.ts", operation: "move", outcome: "succeeded", timeCreated: 2 },
        }),
      ],
    })
    expect(view.resources).toHaveLength(1)
    expect(view.resources[0].displayPath).toBe("new.ts")
    expect(view.resources[0].aliases).toEqual(["old.ts"])
  })
})

describe("buildLedgerView — unknown mutation receipts are a dedicated uncertainty group (AC4)", () => {
  test("a receipt with no resource identity becomes an uncertainty item, never a fabricated resource row", () => {
    const view = buildLedgerView({
      capability: { mode: "full" },
      records: [
        record({
          operation: { origin: "agent" },
          receipt: { id: "u1", sequence: 1, operation: "shell", outcome: "opaque", timeCreated: 1 },
        }),
        record({
          receipt: { id: "r1", sequence: 2, resource: "a.ts", operation: "edit", outcome: "succeeded", timeCreated: 2 },
        }),
      ],
    })
    expect(view.resources).toHaveLength(1)
    expect(view.resources.some((r) => r.displayPath === "")).toBe(false)
    expect(view.unknown).toHaveLength(1)
    expect(view.unknown[0].receiptID).toBe("u1")
    // No patch/resource is fabricated for an unknown item.
    expect(view.unknown[0]).not.toHaveProperty("patch")
    expect(view.unknown[0]).not.toHaveProperty("resource")
  })

  test("unknown items do not consume resource-page capacity", () => {
    const view = buildLedgerView({
      capability: { mode: "full" },
      page: { size: 2 },
      records: [
        record({ receipt: { id: "u1", sequence: 1, operation: "shell", outcome: "opaque", timeCreated: 1 } }),
        record({ receipt: { id: "u2", sequence: 2, operation: "mcp", outcome: "opaque", timeCreated: 2 } }),
        record({ receipt: { id: "r1", sequence: 3, resource: "a.ts", operation: "edit", outcome: "succeeded", timeCreated: 3 } }),
        record({ receipt: { id: "r2", sequence: 4, resource: "b.ts", operation: "edit", outcome: "succeeded", timeCreated: 4 } }),
      ],
    })
    expect(view.resources).toHaveLength(2)
    expect(view.unknown).toHaveLength(2)
    expect(view.page.total).toBe(2) // resource total, unknowns excluded
    expect(view.page.nextCursor).toBeUndefined()
  })
})

describe("describeLedgerStatus — distinguishable states without color alone (AC5)", () => {
  const cases: Array<{ input: Parameters<typeof describeLedgerStatus>[0]; kind: LedgerStatusKind }> = [
    { input: { netState: "added", outcome: "succeeded" }, kind: "added" },
    { input: { netState: "modified", outcome: "succeeded" }, kind: "modified" },
    { input: { netState: "deleted", outcome: "succeeded" }, kind: "deleted" },
    { input: { netState: "reverted", outcome: "succeeded" }, kind: "reverted" },
    { input: { netState: "conflicted", outcome: "succeeded" }, kind: "conflicted" },
    { input: { netState: "unavailable", outcome: "succeeded", evidenceState: "unavailable" }, kind: "unavailable" },
    { input: { outcome: "opaque", netState: "opaque" }, kind: "opaque" },
    { input: { outcome: "partial", netState: "added" }, kind: "partial" },
  ]

  test("every named state yields a unique label + icon pair", () => {
    const descriptors = cases.map((c) => describeLedgerStatus(c.input))
    for (const [i, c] of cases.entries()) expect(descriptors[i].kind).toBe(c.kind)
    expect(new Set(descriptors.map((d) => d.label)).size).toBe(cases.length)
    expect(new Set(descriptors.map((d) => d.icon)).size).toBe(cases.length)
  })

  test("distinguishers are text + icon (not color): tone is a semantic keyword, never a raw color", () => {
    for (const c of cases) {
      const d = describeLedgerStatus(c.input)
      expect(d.label.length).toBeGreaterThan(0)
      expect(d.icon.length).toBeGreaterThan(0)
      expect(["success", "danger", "warning", "neutral"]).toContain(d.tone)
      expect(d.tone).not.toMatch(/#|rgb|hsl/i)
    }
  })

  test("accessible name always contains execution, assessment, and evidence state", () => {
    const d = describeLedgerStatus({ outcome: "succeeded", netState: "added", evidenceState: "available" })
    expect(d.accessibleName.toLowerCase()).toContain("succeeded")
    expect(d.accessibleName.toLowerCase()).toContain("added")
    expect(d.accessibleName.toLowerCase()).toContain("available")
  })

  test("an unavailable assessment never hides the immutable execution fact", () => {
    // real net state present + evidence unavailable → keep the execution/net fact, note evidence
    const d = describeLedgerStatus({ outcome: "succeeded", netState: "modified", evidenceState: "unavailable" })
    expect(d.kind).toBe("modified")
    expect(d.accessibleName.toLowerCase()).toContain("succeeded")
    expect(d.accessibleName.toLowerCase()).toContain("unavailable")
  })

  test("theme-independent: the descriptor carries no theme branch or inline color", () => {
    const light = describeLedgerStatus({ netState: "deleted", outcome: "succeeded" })
    const dark = describeLedgerStatus({ netState: "deleted", outcome: "succeeded" })
    expect(light).toEqual(dark)
  })
})

describe("buildLedgerView — paging preserves grouping and origin context (AC6)", () => {
  test("pages resources while keeping each row's grouping and origins intact", () => {
    const records: LedgerProjectionRecord[] = []
    for (let i = 0; i < 5; i++) {
      records.push(
        record({
          resourceKey: `res-${i}`,
          operation: { origin: "agent", session: "root" },
          receipt: { id: `r${i}`, sequence: i + 1, resource: `f${i}.ts`, operation: "create", outcome: "succeeded", timeCreated: i },
          assessment: { receiptID: `r${i}`, netState: "added", evidenceState: "available", revision: 1, timeCreated: i },
        }),
      )
    }
    const first = buildLedgerView({ capability: { mode: "full" }, page: { size: 2 }, records })
    expect(first.resources).toHaveLength(2)
    expect(first.page.total).toBe(5)
    expect(first.page.nextCursor).toBe(2)
    expect(first.resources[0].origins).toEqual(["agent"])

    const next = buildLedgerView({ capability: { mode: "full" }, page: { size: 2, cursor: first.page.nextCursor }, records })
    expect(next.resources).toHaveLength(2)
    expect(next.page.nextCursor).toBe(4)
  })

  test("pageReceiptHistory independently pages an expanded resource's history", () => {
    const view = buildLedgerView({
      capability: { mode: "full" },
      records: Array.from({ length: 4 }, (_, i) =>
        record({
          resourceKey: "res-1",
          receipt: { id: `r${i}`, sequence: i + 1, resource: "a.ts", operation: "edit", outcome: "succeeded", timeCreated: i },
        }),
      ),
    })
    const paged = pageReceiptHistory(view.resources[0], { cursor: 0, limit: 2 })
    expect(paged.entries.map((e) => e.receiptID)).toEqual(["r0", "r1"])
    expect(paged.nextCursor).toBe(2)
  })
})

describe("ledgerCapabilityLabel — full/partial/legacy fixed text (AC7)", () => {
  test("each mode has fixed explanatory text selected only by capability", () => {
    expect(ledgerCapabilityLabel("full")).toEqual(LEDGER_CAPABILITY_LABELS.full)
    expect(ledgerCapabilityLabel("partial")).toEqual(LEDGER_CAPABILITY_LABELS.partial)
    expect(ledgerCapabilityLabel("legacy")).toEqual(LEDGER_CAPABILITY_LABELS.legacy)
  })

  test("legacy and partial never imply full historical provenance", () => {
    expect(LEDGER_CAPABILITY_LABELS.legacy.description.toLowerCase()).toContain("not")
    expect(LEDGER_CAPABILITY_LABELS.partial.description.toLowerCase()).toMatch(/before|not|upgrad/)
    expect(LEDGER_CAPABILITY_LABELS.full.description.toLowerCase()).not.toContain("legacy")
  })

  test("the built view surfaces the capability label for accessible status text", () => {
    const view = buildLedgerView({ capability: { mode: "legacy" }, records: [] })
    expect(view.capability).toEqual(LEDGER_CAPABILITY_LABELS.legacy)
  })
})

describe("applyLedgerKeyDown — keyboard operation (AC8)", () => {
  function ev(key: string) {
    let prevented = false
    return { event: { key, preventDefault: () => (prevented = true) }, prevented: () => prevented }
  }

  test("Enter and Space on a resource row toggle it and prevent default", () => {
    for (const key of ["Enter", " "]) {
      const e = ev(key)
      const action = applyLedgerKeyDown(e.event, { focusKind: "row", id: "res-1", expanded: false })
      expect(action).toEqual({ type: "toggle", id: "res-1" })
      expect(e.prevented()).toBe(true)
    }
  })

  test("Escape inside expanded content collapses and returns focus to its row", () => {
    const e = ev("Escape")
    const action = applyLedgerKeyDown(e.event, { focusKind: "content", id: "res-1", expanded: true })
    expect(action).toEqual({ type: "collapse", id: "res-1", refocus: "res-1" })
    expect(e.prevented()).toBe(true)
  })

  test("Escape on an expanded row collapses it", () => {
    const action = applyLedgerKeyDown(ev("Escape").event, { focusKind: "row", id: "res-1", expanded: true })
    expect(action).toEqual({ type: "collapse", id: "res-1", refocus: "res-1" })
  })

  test("unrelated keys and collapsed-row escape are no-ops", () => {
    expect(applyLedgerKeyDown(ev("a").event, { focusKind: "row", id: "res-1", expanded: false })).toEqual({ type: "none" })
    expect(applyLedgerKeyDown(ev("Escape").event, { focusKind: "row", id: "res-1", expanded: false })).toEqual({ type: "none" })
  })
})

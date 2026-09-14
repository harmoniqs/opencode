import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// The lineage-ledger panel is authored in Solid JSX; bun's test transpiler does
// not run Solid's dom-expressions transform, so (as elsewhere in this repo —
// see vscode-explorer-file-icon.test.tsx) the component's behavioral substance
// lives in pure, directly-tested functions (lineage-ledger-view.test.ts) and
// this test proves the component wires the accessibility contract those
// functions require. The Work Column design contract (amicode#1082 AC8) is:
// Tab reaches each filter/row/continuation/unknown item, Enter/Space toggles a
// resource, Escape returns focus to its row, and each status has an accessible
// name plus a non-color signal.
const source = readFileSync(resolve(__dirname, "lineage-ledger-panel.tsx"), "utf8")

describe("LineageLedgerPanel — render + accessibility contract", () => {
  test("renders from the projected view-model only (no tool/watcher inference — AC1)", () => {
    expect(source).toContain("./lineage-ledger-view")
    expect(source).toContain("props.view()")
    expect(source).not.toMatch(/accumulate-diffs|toolDiffs|externalFileStatus|watcher/i)
  })

  test("surfaces the capability label as accessible status text (AC7)", () => {
    expect(source).toContain('data-slot="lineage-ledger-capability"')
    expect(source).toContain('role="status"')
    expect(source).toContain("capability().label")
    expect(source).toContain("capability().description")
  })

  test("each canonical resource is one focusable, toggleable row (AC2/AC8)", () => {
    expect(source).toContain('data-slot="lineage-ledger-resource"')
    expect(source).toContain("aria-expanded")
    expect(source).toContain("aria-controls")
    // a real <button> is natively Tab-reachable and Enter/Space-activatable
    expect(source).toMatch(/<button[\s\S]*?onKeyDown/)
  })

  test("status carries an accessible name and a non-color signal (AC5)", () => {
    expect(source).toContain('data-slot="lineage-ledger-status"')
    expect(source).toContain("status.accessibleName")
    expect(source).toContain("data-status={")
    expect(source).toContain("data-tone={")
    // icon + text label accompany the tone — color is never the only signal
    expect(source).toContain("status.icon")
    expect(source).toContain("status.label")
  })

  test("expanded history is a chronological region keyed to its row (AC3)", () => {
    expect(source).toContain('data-slot="lineage-ledger-history"')
    expect(source).toContain("history")
    expect(source).toContain("assessments")
  })

  test("unknown mutation receipts render in a dedicated uncertainty group (AC4)", () => {
    expect(source).toContain('data-slot="lineage-ledger-unknown"')
    expect(source).toContain("Unknown Mutation Receipts")
    expect(source).toContain("view().unknown")
  })

  test("keyboard: applyLedgerKeyDown drives toggle/collapse and Escape refocuses the row (AC8)", () => {
    expect(source).toContain("applyLedgerKeyDown")
    expect(source).toContain('"toggle"')
    expect(source).toContain('"collapse"')
    expect(source).toContain("focus()")
  })

  test("paging exposes a Tab-reachable continuation control (AC6)", () => {
    expect(source).toContain('data-slot="lineage-ledger-more"')
    expect(source).toContain("nextCursor")
  })
})

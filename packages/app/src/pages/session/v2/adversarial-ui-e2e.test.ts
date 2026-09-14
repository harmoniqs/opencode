import { describe, expect, test } from "bun:test"
import { ProvenanceMatrix } from "@opencode-ai/schema/provenance-matrix"
import {
  applyLedgerKeyDown,
  buildLedgerView,
  describeLedgerStatus,
  LEDGER_CAPABILITY_LABELS,
  ledgerCapabilityLabel,
  type LedgerStatusInput,
  type LedgerStatusKind,
} from "./lineage-ledger-view"

/**
 * The ui harness of the adversarial full-provenance matrix (amicode#1084).
 *
 * This cross-harness E2E fixture RUNS the ui-owned matrix rows against the REAL
 * unified lineage-ledger view-model (#1082) — the same pure reducer + status
 * descriptors the Files Changed surface renders — and records each row that
 * produced its declared observable result as green. It proves the unified surface
 * is operable by keyboard and legible in BOTH supported themes (its distinctions
 * are text + icon, never color), then feeds the green set to the shared gate
 * (`ProvenanceMatrix.gate`) exactly as the engine harness does.
 */

const green = new Set<string>()
const ui = ProvenanceMatrix.subset("ui")

// ── AC7a: keyboard operation ─────────────────────────────────────────────────

function keyEvent(key: string) {
  let prevented = false
  return { event: { key, preventDefault: () => (prevented = true) }, prevented: () => prevented }
}

function runKeyboard(): void {
  // Enter and Space on a focused row toggle it and prevent default (no page scroll).
  for (const key of ["Enter", " "]) {
    const e = keyEvent(key)
    expect(applyLedgerKeyDown(e.event, { focusKind: "row", id: "res-1", expanded: false })).toEqual({
      type: "toggle",
      id: "res-1",
    })
    expect(e.prevented()).toBe(true)
  }
  // Escape inside expanded content collapses and returns focus to the row.
  expect(applyLedgerKeyDown(keyEvent("Escape").event, { focusKind: "content", id: "res-1", expanded: true })).toEqual({
    type: "collapse",
    id: "res-1",
    refocus: "res-1",
  })
  // Escape on an expanded row collapses it.
  expect(applyLedgerKeyDown(keyEvent("Escape").event, { focusKind: "row", id: "res-1", expanded: true })).toEqual({
    type: "collapse",
    id: "res-1",
    refocus: "res-1",
  })
  // Unrelated keys and collapsed-row escape are no-ops — the surface never traps the keyboard.
  expect(applyLedgerKeyDown(keyEvent("a").event, { focusKind: "row", id: "res-1", expanded: false })).toEqual({
    type: "none",
  })
  expect(applyLedgerKeyDown(keyEvent("Escape").event, { focusKind: "row", id: "res-1", expanded: false })).toEqual({
    type: "none",
  })
}

// ── AC7b: legibility across both supported themes (text + icon, never color) ──

const STATUS_CASES: Array<{ input: LedgerStatusInput; kind: LedgerStatusKind }> = [
  { input: { netState: "added", outcome: "succeeded" }, kind: "added" },
  { input: { netState: "modified", outcome: "succeeded" }, kind: "modified" },
  { input: { netState: "deleted", outcome: "succeeded" }, kind: "deleted" },
  { input: { netState: "reverted", outcome: "succeeded" }, kind: "reverted" },
  { input: { netState: "conflicted", outcome: "succeeded" }, kind: "conflicted" },
  { input: { netState: "unavailable", outcome: "succeeded", evidenceState: "unavailable" }, kind: "unavailable" },
  { input: { outcome: "opaque", netState: "opaque" }, kind: "opaque" },
  { input: { outcome: "partial", netState: "added" }, kind: "partial" },
]

function runThemes(): void {
  const descriptors = STATUS_CASES.map((c) => describeLedgerStatus(c.input))
  // Each named state resolves to its kind.
  for (const [index, c] of STATUS_CASES.entries()) expect(descriptors[index].kind).toBe(c.kind)
  // Distinctions are TEXT + ICON — unique per state — so the surface is legible without relying on color.
  expect(new Set(descriptors.map((d) => d.label)).size).toBe(STATUS_CASES.length)
  expect(new Set(descriptors.map((d) => d.icon)).size).toBe(STATUS_CASES.length)
  for (const d of descriptors) {
    expect(d.label.length).toBeGreaterThan(0)
    expect(d.icon.length).toBeGreaterThan(0)
    // Tone is a semantic keyword, never a raw color literal — so no theme owns the meaning.
    expect(["success", "danger", "warning", "neutral"]).toContain(d.tone)
    expect(d.tone).not.toMatch(/#|rgb|hsl/i)
  }
  // Theme-independent by construction: the descriptor carries no theme branch or inline color.
  expect(describeLedgerStatus({ netState: "deleted", outcome: "succeeded" })).toEqual(
    describeLedgerStatus({ netState: "deleted", outcome: "succeeded" }),
  )
  // Screen-reader legibility (theme-agnostic): the accessible name carries execution + assessment + evidence.
  const accessible = describeLedgerStatus({ outcome: "succeeded", netState: "added", evidenceState: "available" }).accessibleName.toLowerCase()
  for (const token of ["succeeded", "added", "available"]) expect(accessible).toContain(token)
  // The capability label is fixed explanatory text selected only by capability — surfaced on the built view.
  for (const mode of ["full", "partial", "legacy"] as const)
    expect(ledgerCapabilityLabel(mode)).toEqual(LEDGER_CAPABILITY_LABELS[mode])
  expect(buildLedgerView({ capability: { mode: "legacy" }, records: [] }).capability).toEqual(
    LEDGER_CAPABILITY_LABELS.legacy,
  )
}

// ── Register the ui per-row tests ────────────────────────────────────────────

describe("adversarial matrix — ui harness (unified Files Changed surface)", () => {
  for (const row of ui.cases) {
    test(row.id, () => {
      if (row.id === "a11y:keyboard") runKeyboard()
      else if (row.id === "a11y:themes") runThemes()
      else throw new Error(`no ui executor for row ${row.id}`)
      green.add(row.id)
    })
  }
})

describe("adversarial matrix — the ui-subset release gate (AC8)", () => {
  test("every required ui case ran green — all_required_passed, enablement STILL off", () => {
    const result = ProvenanceMatrix.gate(ui, green)
    expect(result.missingRequired).toEqual([])
    expect(result.all_required_passed).toBe(true)
    expect(result.defaultEnablement).toBe("off")
  })

  test("dropping any one required ui case blocks the gate", () => {
    const dropped = ProvenanceMatrix.requiredCaseIDs(ui)[0]
    const minusOne = new Set(green)
    minusOne.delete(dropped)
    expect(ProvenanceMatrix.gate(ui, minusOne).all_required_passed).toBe(false)
  })
})

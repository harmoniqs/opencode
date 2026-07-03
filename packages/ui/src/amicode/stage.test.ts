import { describe, expect, test } from "bun:test"
import { amicodeStage, chipTextFromSummary, railStage } from "./stage"

describe("amicodeStage", () => {
  test("maps the four v0 interview tools to their stage labels", () => {
    expect(amicodeStage("amicode_pick_system")).toBe("System")
    expect(amicodeStage("amicode_set_model")).toBe("Model")
    expect(amicodeStage("amicode_formulate")).toBe("Formulation")
    expect(amicodeStage("amicode_solve")).toBe("Run")
  })

  test("falls back to a capitalized, de-underscored label for unknown amicode tools", () => {
    expect(amicodeStage("amicode_to_hardware")).toBe("To hardware")
    expect(amicodeStage("amicode_calibrate")).toBe("Calibrate")
  })

  test("degenerate names do not crash", () => {
    expect(amicodeStage("amicode_")).toBe("amicode_")
    expect(amicodeStage("weird")).toBe("Weird")
  })
})

describe("railStage", () => {
  test("routes pick_system AND set_model to the System chip", () => {
    expect(railStage("amicode_pick_system")).toBe("System")
    expect(railStage("amicode_set_model")).toBe("System")
  })

  test("routes formulate and solve", () => {
    expect(railStage("amicode_formulate")).toBe("Formulation")
    expect(railStage("amicode_solve")).toBe("Run")
  })

  test("unknown amicode tools and non-amicode tools have no rail slot", () => {
    expect(railStage("amicode_to_hardware")).toBeUndefined()
    expect(railStage("bash")).toBeUndefined()
  })
})

describe("chipTextFromSummary", () => {
  test("compacts the System summary shape with known key rewrites", () => {
    expect(chipTextFromSummary("System updated (transmon, 3 levels, omega=5, delta=-0.2, drive_max=0.5)")).toBe(
      "transmon · 3 lvl · ω=5 · δ=−0.2 · cap 0.5",
    )
  })

  test("unknown tokens pass through as the raw parenthetical", () => {
    expect(chipTextFromSummary("Formulation updated (X gate, unitary infidelity, free_phase)")).toBe(
      "X gate · unitary infidelity · free_phase",
    )
  })

  test("garbage falls back to undefined", () => {
    expect(chipTextFromSummary("no parenthetical here")).toBeUndefined()
    expect(chipTextFromSummary("empty ()")).toBeUndefined()
    expect(chipTextFromSummary(undefined)).toBeUndefined()
    expect(chipTextFromSummary(42)).toBeUndefined()
  })
})

import { describe, it, expect } from "bun:test"
import { compactValue } from "./facets"

describe("compactValue", () => {
  it("passes scalars through unchanged", () => {
    expect(compactValue("gate")).toBe("gate")
    expect(compactValue(3)).toBe("3")
    expect(compactValue(true)).toBe("true")
  })
  it("renders null/undefined as em-dash", () => {
    expect(compactValue(null)).toBe("—")
    expect(compactValue(undefined)).toBe("—")
  })
  it("summarizes arrays by count + head, never raw JSON", () => {
    const out = compactValue([{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }])
    expect(out).not.toContain("{") // no JSON blob
    expect(out).toContain("4") // count present
    expect(out).toContain("q1") // head label present
  })
  it("summarizes objects compactly, never raw JSON", () => {
    const out = compactValue({ arch: "global", n: 2 })
    expect(out).not.toContain('"') // no JSON quotes
    expect(out).toContain("arch")
  })
})

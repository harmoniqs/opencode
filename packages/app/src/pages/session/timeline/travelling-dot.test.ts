import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// Regression guard for the bottom-anchored harmonic dot (replaces travelling
// dot #265). The running dot sits at the bottom of the last row — no position
// transitions needed, content grows above it.

const indexCss = readFileSync(resolve(__dirname, "../../../index.css"), "utf8")
const polishCss = readFileSync(resolve(__dirname, "../../../design-polish.css"), "utf8")

describe("bottom-anchored harmonic dot", () => {
  test("grow animation exists on mount", () => {
    expect(indexCss).toContain("thought-rail-dot--harmonic")
    expect(indexCss).toContain("thought-rail-grow")
  })

  test("grow animation scales from done-dot size (7/13)", () => {
    expect(indexCss).toMatch(/thought-rail-grow[\s\S]*scale\(0\.538\)/)
  })

  test("no position transition on the dot (bottom-anchored, passive)", () => {
    // The settled class with top transition was removed — verify it's gone
    expect(indexCss).not.toContain("thought-rail-dot--settled")
  })

  test("no height transition on rail line (no travelling)", () => {
    // The line transition was for the travelling dot — verify it's gone
    expect(indexCss).not.toMatch(/thought-rail-line[^}]*transition[^}]*height/)
  })

  test("reduced motion disables grow animation", () => {
    expect(indexCss).toMatch(/prefers-reduced-motion[\s\S]*thought-rail-dot--harmonic[\s\S]*animation:\s*none/)
  })
})

describe("timeline entrance animation", () => {
  test("timeline-enter keyframe uses blur + rise + opacity", () => {
    expect(polishCss).toMatch(/timeline-enter[\s\S]*opacity:\s*0/)
    expect(polishCss).toMatch(/timeline-enter[\s\S]*translateY/)
    expect(polishCss).toMatch(/timeline-enter[\s\S]*blur/)
  })

  test("[data-part-enter] uses timeline-enter (unified entrance)", () => {
    expect(polishCss).toMatch(/data-part-enter[\s\S]*timeline-enter/)
  })
})

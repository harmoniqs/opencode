import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

// ============================================================================
// The devtools "Developer Tools" section header and its rebuild status
// indicator (#940) sit side by side in a flex row (.devtools-section-header,
// align-items: center). .settings-v2-section-title carries a padding-bottom
// meant for the normal case where a title sits above a settings list — but
// that padding shifts the title's visual center up relative to its flex
// sibling, misaligning it against the rebuild status text. The existing
// .settings-v2-providers and .settings-v2-models sections already override
// this padding to 0 for the same reason; this extends that same override to
// the devtools header.
// ============================================================================

function extractRule(css: string, selector: string): string {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`selector "${selector}" not found`)
  const braceOpen = css.indexOf("{", start)
  const braceClose = css.indexOf("}", braceOpen)
  return css.slice(start, braceClose + 1)
}

describe("devtools section header title alignment (#940)", () => {
  test("the amicode.css devtools header rule exists (baseline)", () => {
    const css = readFileSync(new URL("./amicode.css", import.meta.url), "utf8")
    const rule = extractRule(css, ".devtools-section-header {")
    expect(rule).toContain("align-items: center")
  })

  test("the title's padding-bottom is zeroed out inside the devtools header, matching the providers/models precedent", () => {
    const css = readFileSync(new URL("./amicode.css", import.meta.url), "utf8")
    const rule = extractRule(css, ".devtools-section-header .settings-v2-section-title")
    expect(rule).toMatch(/padding-bottom:\s*0/)
  })
})

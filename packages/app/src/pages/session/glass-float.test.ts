// AMICODE glass float (#61) — app-side source contract.
//
// The ui-package test (packages/ui/src/amicode/glass-float.test.ts) certifies
// the tier map, the contrast mapping over the running-brain reference frame,
// and the ui components' tier attributes. This file pins the app-side seams:
//
//   - the composer card (session-composer / session-new-composer) floats on
//     the STANDARD tier and no longer paints an opaque layer fill; its dock
//     band no longer tiles the Brain away;
//   - the diff card (session-turn-diffs-group) floats on the DENSE tier;
//   - gaps stay live: the timeline row frame (session-turn) and the message
//     container/column wrappers carry no glass and paint no background;
//   - the in-timeline sticky session-title header keeps its PRE-EXISTING
//     chrome blur, untouched, and carries no data-glass (out-of-scope chrome
//     per the issue — the no-literal scan explicitly excludes it).
//
// Solid components cannot be rendered under bun test in this repo (no JSX
// runtime transform), so the render-level companion evidence is the browser
// pass recorded on the issue; these scans keep the contract green in CI.

import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const APP_SRC = join(import.meta.dir, "../..")

async function read(rel: string): Promise<string> {
  return await Bun.file(join(APP_SRC, rel)).text()
}

/** The JSX open tag containing a marker (single `<tag …>` span). */
function openTag(source: string, marker: string, from = 0): string {
  const idx = source.indexOf(marker, from)
  expect(idx).toBeGreaterThan(-1)
  const start = source.lastIndexOf("<", idx)
  const end = source.indexOf(">", idx)
  return source.slice(start, end + 1)
}

describe("glass float — the composer floats on standard", () => {
  test("the composer DockShellForm carries standard glass and drops the opaque layer fill", async () => {
    const src = await read("components/prompt-input.tsx")
    const idx = src.indexOf('data-component={newSession() ? "session-new-composer" : "session-composer"}')
    expect(idx).toBeGreaterThan(-1)
    // the form's opening block: from <DockShellForm to the classList close
    const start = src.lastIndexOf("<DockShellForm", idx)
    const block = src.slice(start, src.indexOf("<PromptDragOverlay", start))
    expect(block).toContain('data-glass="standard"')
    // the tier token carries fill/radius/border/shadow — the old opaque card
    // chrome is gone (a utilities-layer class would override the glass)
    expect(block).not.toContain("bg-v2-background-bg-layer-01")
    expect(block).not.toContain("rounded-lg")
    expect(block).not.toContain("shadow-[")
    // no ad-hoc tint/blur literals on the card
    expect(block).not.toMatch(/backdrop-blur|rgba\(/)
  })

  test("the child-session composer stub is a dimmed zone: dense tier (its text is muted-role)", async () => {
    const src = await read("pages/session/composer/session-composer-region.tsx")
    const idx = src.indexOf("session.child.promptDisabled")
    expect(idx).toBeGreaterThan(-1)
    const cardStart = src.lastIndexOf("<div", src.lastIndexOf("ref={props.inputRef}", idx))
    const card = src.slice(cardStart, idx)
    // muted notice text never floats on standard — the whole stub rides dense
    // (the ADR's locally-dimmed zone, realized with the #60 tier)
    expect(card).toContain('data-glass="dense"')
    expect(card).not.toContain("bg-background-base")
  })

  test("the composer footer's muted controls ride a dense-backed zone (slice #60 token)", async () => {
    const src = await read("components/prompt-input.tsx")
    expect(src).toContain("bg-[var(--glass-dense-bg)]")
  })

  test("the dock band no longer tiles the Brain away behind the composer", async () => {
    const src = await read("pages/session/composer/session-composer-region.tsx")
    expect(src).not.toContain("bg-background-stronger")
  })
})

describe("glass float — the diff card floats on dense", () => {
  test("session-turn-diffs-group carries dense glass", async () => {
    const src = await read("pages/session/message-timeline.tsx")
    const tag = openTag(src, 'data-component="session-turn-diffs-group"')
    expect(tag).toContain('data-glass="dense"')
  })
})

describe("glass float — gaps stay live", () => {
  test("the timeline row frame (session-turn) carries no glass", async () => {
    const src = await read("pages/session/message-timeline.tsx")
    const tag = openTag(src, 'data-component="session-turn"')
    expect(tag).not.toContain("data-glass")
    // and paints no background of its own
    expect(tag).not.toMatch(/bg-/)
  })

  test("the centered column / message container wrappers carry no glass and no fill", async () => {
    const src = await read("pages/session/message-timeline.tsx")
    let from = 0
    let count = 0
    for (;;) {
      const idx = src.indexOf('data-slot="session-turn-message-container"', from)
      if (idx === -1) break
      const tag = openTag(src, 'data-slot="session-turn-message-container"', from)
      expect(tag).not.toContain("data-glass")
      expect(tag).not.toMatch(/\bbg-\S/)
      from = idx + 1
      count++
    }
    expect(count).toBeGreaterThanOrEqual(5)
  })

  test("the session-turn frame rules paint no background (ui css)", async () => {
    const css = await Bun.file(
      join(APP_SRC, "../../ui/src/components/session-turn.css"),
    ).text()
    // extract ONLY the direct declarations of the [data-component="session-turn"]
    // block head (before its first nested selector) — the row frame itself
    const idx = css.indexOf('[data-component="session-turn"] {')
    expect(idx).toBeGreaterThan(-1)
    const head = css.slice(idx, css.indexOf("[data-slot", idx))
    expect(head).not.toContain("background")
  })
})

describe("glass float — the sticky session-title header is untouched chrome", () => {
  test("it keeps its pre-existing backdrop blur and carries no data-glass", async () => {
    const src = await read("pages/session/message-timeline.tsx")
    const idx = src.indexOf("data-session-title")
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 600)
    // pre-existing chrome blur stays byte-identical — explicitly excluded
    // from the no-literal scan (out-of-scope chrome, issue #61)
    expect(block).toContain("backdrop-blur-[10px]")
    expect(block).not.toContain("data-glass")
  })

  test("no data-glass anywhere in the timeline except the diff card", async () => {
    const src = await read("pages/session/message-timeline.tsx")
    const hits = [...src.matchAll(/data-glass="([\w-]+)"/g)]
    expect(hits).toHaveLength(1)
    expect(hits[0]![1]).toBe("dense")
  })

  test("rail, titlebar and panels carry no data-glass", async () => {
    const files = [
      "pages/session/session-side-panel.tsx",
      "pages/session/terminal-panel.tsx",
      "pages/session/review-tab.tsx",
      "components/titlebar.tsx",
    ]
    for (const rel of files) {
      const file = Bun.file(join(APP_SRC, rel))
      if (!(await file.exists())) continue
      expect(await file.text()).not.toContain("data-glass")
    }
  })
})

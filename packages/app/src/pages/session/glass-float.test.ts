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

  test("the composer footer shares the ONE glass surface — no separate inset fill (Kate 2026-07-25)", async () => {
    // The footer used to ride its own dense-backed zone; that read as a second
    // background (dark text area / lighter footer). It now shares the composer's
    // single glass surface — the footer row carries no bg fill of its own.
    const src = await read("components/prompt-input.tsx")
    const footerIdx = src.indexOf("the footer shares the composer's ONE glass")
    expect(footerIdx).toBeGreaterThan(-1)
    const footerTag = src.slice(footerIdx, src.indexOf(">", footerIdx))
    expect(footerTag).not.toContain("bg-[var(--glass-dense-bg)]")
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

describe("glass sweep (#56) — the sticky session-title band rides the glass vars", () => {
  test("its gradient + blur are the recipe's own terms, not chrome literals; band form keeps no hook", async () => {
    const src = await read("pages/session/message-timeline.tsx")
    const idx = src.indexOf("data-session-title")
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 1200) // the band's classList follows the attribute
    // converted (#56): derived tint fading to transparent over the shared
    // blur+brightness — the opaque --background-stronger gradient and the
    // hand-rolled 10px blur are gone
    expect(block).toContain("var(--glass-standard-bg)")
    expect(block).toContain("blur(var(--glass-blur,8px))")
    expect(block).toContain("brightness(var(--glass-brightness,1))")
    expect(block).not.toContain("var(--background-stronger)")
    expect(block).not.toContain("backdrop-blur-[10px]")
    // it stays a BAND (no border/radius/shadow), so no card hook on it
    expect(block).not.toContain("data-glass")
  })

  test("timeline data-glass census: diff card (dense) + jump-to-bottom + error card (standard)", async () => {
    const src = await read("pages/session/message-timeline.tsx")
    const hits = [...src.matchAll(/data-glass="([\w-]+)"/g)].map((m) => m[1])
    expect(hits.sort()).toEqual(["dense", "standard", "standard"])
  })

  test("comment-strip chips ride the dense-zone token, not an opaque layer", async () => {
    const src = await read("pages/session/message-timeline.tsx")
    expect(src).toContain("bg-[var(--glass-dense-bg)]")
    expect(src).not.toContain("bg-background-stronger")
  })

  test("jump-to-bottom dropped its hand-rolled near-glass for the single recipe", async () => {
    const src = await read("pages/session/message-timeline.tsx")
    expect(src).not.toContain("backdrop-blur-[0.75px]")
    expect(src).not.toContain("color-mix(in_srgb,var(--surface-raised-stronger-non-alpha)")
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

describe("glass sweep (#56) — docks and composer chrome float on the recipe", () => {
  test("todo / followup / revert trays carry standard glass", async () => {
    for (const rel of [
      "pages/session/composer/session-todo-dock.tsx",
      "pages/session/composer/session-followup-dock.tsx",
      "pages/session/composer/session-revert-dock.tsx",
    ]) {
      expect(await read(rel)).toContain('data-glass="standard"')
    }
  })

  test("the todo scroll-fade rides the glass tint, not the opaque page ground", async () => {
    const src = await read("pages/session/composer/session-todo-dock.tsx")
    expect(src).toContain("linear-gradient(to bottom, var(--glass-standard-bg), transparent)")
    expect(src).not.toContain("linear-gradient(to bottom, var(--background-base)")
  })

  test("composer loading stub rides the dense hook, not a half-opaque one-off", async () => {
    const src = await read("pages/session/composer/session-composer-region.tsx")
    expect(src).not.toContain("bg-background-base/50")
  })

  test("autocomplete popover + project picker + model menu carry standard; highlights use the accent state fill", async () => {
    const slash = await read("components/prompt-input/slash-popover.tsx")
    expect(slash).toContain('data-glass="standard"')
    expect(slash).toContain("bg-[var(--accent-fill-soft)]")
    expect(slash).not.toContain("bg-surface-raised-stronger-non-alpha")
    const model = await read("components/dialog-select-model.tsx")
    expect(model).toContain('data-glass="standard"')
    expect(model).not.toContain("bg-surface-raised-stronger-non-alpha")
    const prompt = await read("components/prompt-input.tsx")
    expect(prompt).not.toContain("bg-v2-background-bg-layer-01")
  })

  test("context chips + attachment tiles: dense-zone/token tints, no theme-blind literals", async () => {
    const ctx = await read("components/prompt-input/context-items.tsx")
    expect(ctx).toContain("bg-[var(--glass-dense-bg)]")
    expect(ctx).not.toContain("bg-background-stronger")
    const img = await read("components/prompt-input/image-attachments.tsx")
    expect(img).toContain("var(--glass-dense-bg)")
    // the filename bar's theme-blind bg-black/50 literal became a float-token mix
    expect(img).toContain("bg-[color-mix(in_srgb,var(--surface-float-base)_60%,transparent)]")
    expect(img).not.toContain('"bg-black/50')
    expect(img).not.toContain("bg-surface-base ")
  })

  test("drag overlay: heavier by function (masking) but token-mix + shared blur, never a raw 90% token", async () => {
    const src = await read("components/prompt-input/drag-overlay.tsx")
    expect(src).toContain("color-mix(in_srgb,var(--surface-raised-stronger-non-alpha)_80%,transparent)")
    expect(src).toContain("blur(var(--glass-blur,8px))")
    expect(src).not.toContain("bg-surface-raised-stronger-non-alpha/90")
  })

  test("the legacy composer path (flag off) floats on standard; its clip-mask stays heavier by function", async () => {
    const src = await read("components/prompt-input.tsx")
    // both DockShellForm branches carry the hook
    const forms = [...src.matchAll(/<DockShellForm[\s\S]{0,800}?data-glass="standard"/g)]
    expect(forms.length).toBe(2)
    expect(src).toContain("color-mix(in srgb, var(--surface-raised-stronger-non-alpha) 92%, transparent)")
  })
})

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// harmoniqs/amicode#261 — paste inserted the same text twice in the webview.
//
// Two mod+V handlers are live inside the framed app:
//   1. utils/global-clipboard.ts — window-level, CAPTURE phase, for every
//      editable that has no bridged paste of its own.
//   2. prompt-input.tsx's handleKeyDown — the composer's own, image-first.
//
// (1) exempts elements matching CLIPBOARD_SELF_SELECTOR. It calls
// preventDefault() but deliberately NOT stopPropagation() — so an unmarked
// composer receives BOTH insertions. The marker is the whole mechanism, and it
// had been applied to the home-cards fields but never to the composer the
// mechanism was written for.
//
// This is a SOURCE assertion rather than a rendered-DOM one because the app has
// no component-render harness (no @solidjs/testing-library) — the same reason
// global-clipboard.test.ts exercises the exemption against a synthetic element
// it builds itself, which is exactly the gap that let #261 ship. Replace this
// with a render assertion the day a harness lands; until then it is the only
// thing standing between the composer and a silent regression.
const source = readFileSync(join(import.meta.dir, "prompt-input.tsx"), "utf8")

describe("composer opts out of the global clipboard fallback (amicode#261)", () => {
  test('the editor element carries data-amc-clipboard="self"', () => {
    expect(source).toContain('data-amc-clipboard="self"')
  })

  test("the marker sits on the same element as the composer's own key handler", () => {
    // Guard against the marker drifting onto a wrapper: closest() would still
    // match, but a future refactor that moves the handler and not the marker
    // (or vice versa) silently restores the double insert. Both attributes must
    // live in the one editor element's prop block.
    const editor = source.slice(
      source.indexOf('data-component="prompt-input"'),
      source.indexOf("classList={{", source.indexOf('data-component="prompt-input"')),
    )
    expect(editor).toContain('data-amc-clipboard="self"')
    expect(editor).toContain("onKeyDown={handleKeyDown}")
  })

  test("the composer still owns an image-first bridged paste", () => {
    // The reason the marker is the correct fix and stopPropagation() in
    // global-clipboard.ts is not: only this path tries the image bridge, so
    // suppressing it would silently kill screenshot paste.
    expect(source).toContain("readClipboardImageViaBridge")
  })
})

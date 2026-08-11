import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { matchKeybind, parseKeybind } from "./command"

// harmoniqs/amicode#266 — Cmd/Ctrl +/- zoom did nothing in the webview.
//
// The zoom commands, their CSS-zoom implementation, and the platform signal all
// existed and were correct. Only the keybind strings were wrong: dispatch is an
// exact (normalized-key, modifier-mask) lookup with no fallback, and only
// "mod+=" / "mod+-" were registered.
//
// What a user actually presses:
//   Ctrl+Plus on a US layout IS Ctrl+Shift+"=", which arrives as key "+"
//   (normalized "plus") WITH the shift bit — wrong key AND wrong mask.
//   The numpad's "+" arrives unshifted. On DE/FR/Nordic layouts "=" is itself
//   a shifted key, so even the canonical chord carries shift.
//
// So the bare chord worked only on a US layout with the main-row "=", which is
// why this survived: it works for whoever tries it that one way. There was no
// test of any kind over zoom before this file.
//
// These assert the CHORD SET, deliberately decoupled from where it is
// registered — layout.tsx gates the commands on platform.platform === "web"
// and cannot be imported here without dragging the whole page graph in.
const ZOOM_IN = "mod+=,mod+shift+=,mod+plus,mod+shift+plus"
const ZOOM_OUT = "mod+-,mod+shift+_"
const ZOOM_RESET = "mod+0"

/** `mod` resolves to meta on mac and ctrl elsewhere; drive whichever the parse
 *  produced so these pass on both. */
function chord(config: string, key: string, opts: { shift?: boolean } = {}) {
  const first = parseKeybind(config)[0]!
  return new KeyboardEvent("keydown", {
    key,
    ctrlKey: first.ctrl,
    metaKey: first.meta,
    shiftKey: opts.shift ?? false,
  })
}

describe("zoom keybinds cover every chord that means zoom (amicode#266)", () => {
  test("zoom in: main-row =, US Ctrl+Plus, numpad +, and shifted-= layouts", () => {
    const kb = parseKeybind(ZOOM_IN)

    // Ctrl/Cmd + "=" — the canonical chord, US main row.
    expect(matchKeybind(kb, chord(ZOOM_IN, "="))).toBe(true)
    // Ctrl/Cmd + Plus on US: shift+"=" surfaces as "+" with the shift bit.
    expect(matchKeybind(kb, chord(ZOOM_IN, "+", { shift: true }))).toBe(true)
    // Numpad plus: "+" with no shift.
    expect(matchKeybind(kb, chord(ZOOM_IN, "+"))).toBe(true)
    // Layouts where "=" itself requires shift (DE/FR/Nordic).
    expect(matchKeybind(kb, chord(ZOOM_IN, "=", { shift: true }))).toBe(true)
  })

  test("zoom out: main-row - and the shifted underscore", () => {
    const kb = parseKeybind(ZOOM_OUT)

    expect(matchKeybind(kb, chord(ZOOM_OUT, "-"))).toBe(true)
    expect(matchKeybind(kb, chord(ZOOM_OUT, "_", { shift: true }))).toBe(true)
  })

  test("zoom reset stays a single unambiguous chord", () => {
    // "0" is unshifted on every layout we ship to — no widening needed, and
    // widening it would start swallowing chords that mean something else.
    const kb = parseKeybind(ZOOM_RESET)
    expect(matchKeybind(kb, chord(ZOOM_RESET, "0"))).toBe(true)
    expect(kb).toHaveLength(1)
  })

  test("the bare chord alone misses Ctrl+Plus — the regression this locks", () => {
    // Guards the fix itself: if someone narrows the config back to "mod+=",
    // this is the assertion that explains why they should not.
    const narrow = parseKeybind("mod+=")
    expect(matchKeybind(narrow, chord("mod+=", "+", { shift: true }))).toBe(false)
    expect(matchKeybind(narrow, chord("mod+=", "+"))).toBe(false)
    expect(matchKeybind(narrow, chord("mod+=", "=", { shift: true }))).toBe(false)
  })

  // The seam. Everything above proves the chord SETS behave; this proves the
  // app actually registers them. #266 shipped because the mechanism was right
  // and its one integration was not — asserting the set without asserting the
  // registration would reproduce that exact failure mode in the fix's own test.
  test("layout.tsx registers these exact chord sets", () => {
    const layout = readFileSync(join(import.meta.dir, "..", "pages", "layout.tsx"), "utf8")
    expect(layout).toContain(`keybind: "${ZOOM_IN}"`)
    expect(layout).toContain(`keybind: "${ZOOM_OUT}"`)
    expect(layout).toContain(`keybind: "${ZOOM_RESET}"`)
  })

  test("zoom chords do not collide with each other", () => {
    const zin = parseKeybind(ZOOM_IN)
    const zout = parseKeybind(ZOOM_OUT)

    for (const [key, shift] of [
      ["=", false],
      ["+", true],
      ["+", false],
      ["=", true],
    ] as const) {
      expect(matchKeybind(zout, chord(ZOOM_OUT, key, { shift }))).toBe(false)
    }
    for (const [key, shift] of [
      ["-", false],
      ["_", true],
    ] as const) {
      expect(matchKeybind(zin, chord(ZOOM_IN, key, { shift }))).toBe(false)
    }
  })
})

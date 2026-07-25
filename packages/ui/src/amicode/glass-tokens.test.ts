// AMICODE glass tiers — the contrast test IS the legibility guarantee (#60).
//
// Headless per the brain-engine discipline: bun:test, pure numbers, no DOM,
// no rAF. Every assertion composites a tint over the per-mode REFERENCE
// FRAME — the worst-case feature the Brain actually paints in that mode,
// read from the engine's own PALETTES (dark: peak-bloom thought #fff676;
// light: the darkest solid feature #8f8000) — and checks WCAG arithmetic.
// This file is the surface later slices extend when they add a theme or a
// mark class.

import { describe, expect, test } from "bun:test"
import { oc2Theme } from "../theme/default-themes"
import { resolveThemeVariant } from "../theme/resolve"
import { resolveThemeVariantV2 } from "../theme/v2/resolve"
import { PALETTES } from "./brain-engine"
import {
  CONTRAST,
  GLASS_BLUR_PX,
  GLASS_BRIGHTNESS,
  GLASS_FROST_MAX,
  collectMarks,
  composite,
  contrast,
  deriveGlassTiers,
  generateGlassCss,
  parseColor,
  type Rgb,
} from "./glass-tokens"

type Mode = "light" | "dark"
const MODES: Mode[] = ["light", "dark"]

/** oc-2's concrete token values through the theme resolve API (v1 + v2). */
function resolvedTokens(mode: Mode): Record<string, string> {
  const variant = oc2Theme[mode]
  const isDark = mode === "dark"
  return { ...resolveThemeVariant(variant, isDark), ...resolveThemeVariantV2(variant, isDark) }
}

/** The reference frame is the engine's own worst-case painted feature. */
function frame(mode: Mode): string {
  return PALETTES[mode].thought
}

/** The worst-case backdrop the shipped filter actually produces: the raw
    reference frame scaled by the modeled brightness() term for the mode. */
function effectiveBackdrop(mode: Mode): Rgb {
  const raw = parseColor(frame(mode), resolvedTokens(mode))!.rgb
  return raw.map((c) => Math.round(c * GLASS_BRIGHTNESS[mode])) as Rgb
}

function derive(mode: Mode) {
  return deriveGlassTiers(resolvedTokens(mode), frame(mode), GLASS_BRIGHTNESS[mode], GLASS_FROST_MAX[mode])
}

describe("glass standard tier — body text over the reference frame", () => {
  for (const mode of MODES) {
    test(`oc-2 ${mode}: text-strong over standard tint composited on ${frame(mode)} clears AA with margin`, () => {
      const tokens = resolvedTokens(mode)
      const glass = derive(mode)
      const body = parseColor(tokens["text-strong"], tokens)!
      const backdrop = { rgb: effectiveBackdrop(mode) } // frame × modeled brightness()
      const surface = composite(glass.standard.tint, glass.standard.alpha, backdrop.rgb)
      const ratio = contrast(body.rgb, surface)
      // AA floor for body text
      expect(ratio).toBeGreaterThanOrEqual(4.5)
      // the derivation targeted a real safety margin, not the 4.5 cliff
      expect(CONTRAST.bodyTarget).toBeGreaterThanOrEqual(4.8)
      expect(ratio).toBeGreaterThanOrEqual(CONTRAST.bodyTarget)
      // the derivation reports the same arithmetic it certified
      expect(glass.standard.bodyContrast).toBeCloseTo(ratio, 6)
    })
  }
})

describe("glass single tier — the marks law is WAIVED (design decision, Kate 2026-07-25)", () => {
  for (const mode of MODES) {
    test(`oc-2 ${mode}: dense equals standard — one tint, one alpha, one recipe`, () => {
      const glass = derive(mode)
      expect(glass.dense.tint).toEqual(glass.standard.tint)
      expect(glass.dense.alpha).toBe(glass.standard.alpha)
    })

    test(`oc-2 ${mode}: code/diff text (text-strong) still clears AA with margin on the single tier`, () => {
      const glass = derive(mode)
      expect(glass.dense.bodyContrast).toBeGreaterThanOrEqual(4.5)
      expect(glass.dense.bodyContrast).toBeGreaterThanOrEqual(CONTRAST.bodyTarget)
    })
  }

  test("the mark set is still measurable (the waiver is a choice, not a blind spot)", () => {
    // Colored marks (syntax, diff fills, plot strokes) are NO LONGER certified
    // over the Brain — WCAG 1.4.11 floor + no-drift were deliberately waived
    // with the single-tier decision. collectMarks stays so the trade can be
    // re-measured if the decision is ever revisited.
    const marks = collectMarks(resolvedTokens("dark"))
    expect(marks.length).toBeGreaterThan(10)
  })
})

describe("glass known limit — muted grey is not certified anywhere (accepted with single-tier)", () => {
  for (const mode of MODES) {
    test(`oc-2 ${mode}: text-base does not clear AA on the single tier — recorded, not certified`, () => {
      const tokens = resolvedTokens(mode)
      const glass = derive(mode)
      const muted = parseColor(tokens["text-base"], tokens)!
      const backdrop = { rgb: effectiveBackdrop(mode) } // frame × modeled brightness()
      const onGlass = contrast(muted.rgb, composite(glass.standard.tint, glass.standard.alpha, backdrop.rgb))
      // With the dense tier gone there is no certified home for muted ink over
      // the Brain. This records the accepted limit so it can't silently rot
      // into a claimed guarantee.
      expect(onGlass).toBeLessThan(4.5)
    })
  }
})

describe("glass blur — one shared constant, never a contrast term", () => {
  test("both tiers share one blur radius, greater than zero", () => {
    expect(GLASS_BLUR_PX).toBeGreaterThan(0)
    const css = generateGlassCss()
    // ONE blur token, defined once, referenced identically by both tiers
    expect(css.match(/--glass-blur:/g)).toHaveLength(1)
    expect(css).toContain(`--glass-blur: ${GLASS_BLUR_PX}px`)
    const standardRule = css.match(/\[data-glass="standard"\] \{[^}]*\}/)![0]
    const denseRule = css.match(/\[data-glass="dense"\] \{[^}]*\}/)![0]
    for (const rule of [standardRule, denseRule]) {
      expect(rule).toContain("backdrop-filter: blur(var(--glass-blur))")
      expect(rule).toContain("-webkit-backdrop-filter: blur(var(--glass-blur))")
    }
  })

  test("the derivation takes no blur argument (tint alone clears every floor)", () => {
    expect(deriveGlassTiers.length).toBe(2) // (tokens, referenceFrame) — nothing else
  })
})

describe("glass keying — a pure function of the resolved chat theme", () => {
  test("dark tokens+frame vs light tokens+frame derive distinct standard alphas", () => {
    expect(derive("dark").standard.alpha).not.toBe(derive("light").standard.alpha)
  })

  test("emitted CSS scopes each mode under the chat theme system's own attributes", () => {
    const css = generateGlassCss()
    for (const mode of MODES) {
      const scope = `html[data-theme="oc-2"][data-color-scheme="${mode}"]`
      expect(css).toContain(scope)
      const block = css.match(new RegExp(`${escapeRe(scope)} \\{([^}]*)\\}`))![1]!
      const glass = derive(mode)
      // standard and dense carry their own tints (dark standard = white frost;
      // dense = the theme surface) — assert each against its own rgb
      const [sr, sg, sb] = glass.standard.tint
      const [dr, dg, db] = glass.dense.tint
      expect(block).toContain(`--glass-standard-bg: rgba(${sr}, ${sg}, ${sb}, ${glass.standard.alpha})`)
      expect(block).toContain(`--glass-dense-bg: rgba(${dr}, ${dg}, ${db}, ${glass.dense.alpha})`)
    }
  })

  test("every bundled theme is emitted so a theme switch re-keys correctly", () => {
    const css = generateGlassCss()
    for (const id of ["oc-2", "dracula", "github", "tokyonight"]) {
      expect(css).toContain(`html[data-theme="${id}"][data-color-scheme="light"]`)
      expect(css).toContain(`html[data-theme="${id}"][data-color-scheme="dark"]`)
    }
  })
})

describe("glass fallback — no backdrop-filter, no bare canvas", () => {
  test("under @supports-not, both tiers resolve to a near-opaque tint (alpha ≥ 0.92)", () => {
    const css = generateGlassCss()
    const supports = css.match(/@supports not \(\(-webkit-backdrop-filter[\s\S]*$/)![0]
    expect(supports).toContain(`[data-glass="standard"]`)
    expect(supports).toContain(`[data-glass="dense"]`)
    expect(supports).toContain("var(--glass-standard-bg-fallback)")
    expect(supports).toContain("var(--glass-dense-bg-fallback)")
    // every emitted fallback var, every theme, every mode: alpha ≥ 0.92
    const fallbacks = [...css.matchAll(/--glass-(?:standard|dense)-bg-fallback: rgba\([\d\s,]+, ([\d.]+)\);/g)]
    expect(fallbacks.length).toBeGreaterThanOrEqual(4)
    for (const [, alpha] of fallbacks) {
      expect(Number(alpha)).toBeGreaterThanOrEqual(0.92)
    }
  })
})

describe("glass restyles nothing — the hook exists, no component opts in", () => {
  test("visual declarations live only under [data-glass] selectors; all else is custom properties", () => {
    const css = generateGlassCss().replace(/\/\*[\s\S]*?\*\//g, "")
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    expect(rules.length).toBeGreaterThan(70) // 37 themes × 2 modes + :root + utilities
    for (const [, selector, body] of rules) {
      if (selector!.includes("[data-glass") || selector!.trim().startsWith("@supports")) continue
      for (const decl of body!.split(";")) {
        if (!decl.trim()) continue
        // without a data-glass attribute, only inert custom properties exist
        expect(decl.trim().startsWith("--glass-")).toBe(true)
      }
    }
  })
})

describe("glass generated CSS — derived output, never hand-edited", () => {
  test("re-running the generator reproduces the committed glass.css byte-for-byte", async () => {
    const committed = await Bun.file(new URL("./glass.css", import.meta.url)).text()
    expect(committed).toBe(generateGlassCss())
  })
})

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

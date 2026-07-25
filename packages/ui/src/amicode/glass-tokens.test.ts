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
  collectMarks,
  composite,
  contrast,
  deriveGlassTiers,
  generateGlassCss,
  parseColor,
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

function derive(mode: Mode) {
  return deriveGlassTiers(resolvedTokens(mode), frame(mode))
}

describe("glass standard tier — body text over the reference frame", () => {
  for (const mode of MODES) {
    test(`oc-2 ${mode}: text-strong over standard tint composited on ${frame(mode)} clears AA with margin`, () => {
      const tokens = resolvedTokens(mode)
      const glass = derive(mode)
      const body = parseColor(tokens["text-strong"], tokens)!
      const backdrop = parseColor(frame(mode), tokens)!
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

describe("glass dense tier — graphical marks (WCAG 1.4.11) over the reference frame", () => {
  for (const mode of MODES) {
    test(`oc-2 ${mode}: every mark holds 3:1 where native does, and never drifts >0.2 below native`, () => {
      const tokens = resolvedTokens(mode)
      const glass = derive(mode)
      const backdrop = parseColor(frame(mode), tokens)!
      const base = glass.dense.tint // the theme's own base surface (native rendering)
      const denseSurface = composite(glass.dense.tint, glass.dense.alpha, backdrop.rgb)

      const marks = collectMarks(tokens)
      // the set is real: syntax tokens ∪ diff add/delete fills ∪ run-plot strokes
      expect(marks.length).toBeGreaterThan(10)
      const sources = marks.map((m) => m.source)
      expect(sources).toContain("syntax-string")
      expect(sources).toContain("surface-diff-add-base")
      expect(sources).toContain("surface-diff-delete-base")
      expect(sources).toContain("v2-icon-icon-accent") // the run-plot series stroke

      for (const mark of marks) {
        const native = contrast(composite(mark.rgb, mark.alpha, base), base)
        const over = contrast(composite(mark.rgb, mark.alpha, denseSurface), denseSurface)
        if (native >= CONTRAST.markFloor) {
          expect(over).toBeGreaterThanOrEqual(CONTRAST.markFloor)
        }
        // the dense tint never degrades a mark relative to native rendering
        expect(over).toBeGreaterThanOrEqual(native - CONTRAST.markDrift)
      }
    })
  }
})

describe("glass dense tier — code/diff text over the reference frame", () => {
  for (const mode of MODES) {
    test(`oc-2 ${mode}: text-strong over dense tint clears AA with margin`, () => {
      const glass = derive(mode)
      expect(glass.dense.bodyContrast).toBeGreaterThanOrEqual(4.5)
      expect(glass.dense.bodyContrast).toBeGreaterThanOrEqual(CONTRAST.bodyTarget)
    })

    test(`oc-2 ${mode}: dense is strictly more opaque than standard`, () => {
      const glass = derive(mode)
      expect(glass.dense.alpha).toBeGreaterThan(glass.standard.alpha)
    })
  }
})

describe("glass known invariant — muted grey rides dense, never standard", () => {
  for (const mode of MODES) {
    test(`oc-2 ${mode}: text-base is NOT certified on standard (and IS legible on dense)`, () => {
      const tokens = resolvedTokens(mode)
      const glass = derive(mode)
      const muted = parseColor(tokens["text-base"], tokens)!
      const backdrop = parseColor(frame(mode), tokens)!
      const onStandard = contrast(muted.rgb, composite(glass.standard.tint, glass.standard.alpha, backdrop.rgb))
      const onDense = contrast(muted.rgb, composite(glass.dense.tint, glass.dense.alpha, backdrop.rgb))
      // the standard tint is bounded below by the BODY floor only — muted grey
      // does not clear AA there; floating it on standard is a bug, not a tweak.
      expect(onStandard).toBeLessThan(4.5)
      expect(onDense).toBeGreaterThanOrEqual(4.5)
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
      const [r, g, b] = glass.standard.tint
      expect(block).toContain(`--glass-standard-bg: rgba(${r}, ${g}, ${b}, ${glass.standard.alpha})`)
      expect(block).toContain(`--glass-dense-bg: rgba(${r}, ${g}, ${b}, ${glass.dense.alpha})`)
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

// AMICODE chat glass tiers — derivation + validator + CSS generator (#60).
//
// The Brain becomes the Chat's full-bleed background (ADR 0002), so every
// component sits on translucent Glass over a moving, sometimes bright-yellow
// graph. ONE recipe everywhere (single-tier glass — design decision, Kate
// 2026-07-25): a single blur + a single per-mode tint whose opacity is
// derived so body text (text-strong) clears WCAG AA with a safety margin.
// The `dense` hook is still emitted for markup compat but carries the SAME
// values as `standard`. The former marks law (WCAG 1.4.11 floor + no-drift
// for syntax/diff/plot colors on a heavier dense tier) is deliberately
// WAIVED — colored marks over the Brain are accepted as a design trade.
//
// Contrast comes from TWO modeled terms: the tint overlay and a deterministic
// backdrop brightness() (dark mode only) that darkens the Brain's bloom
// multiplicatively — structure stays visible where an overlay would paint it
// out. Blur is ONE shared constant (calm, cheap) and is never a term in the
// derivation or the test: blur depends on the neighborhood, brightness does
// not, which is exactly why brightness may be modeled and blur may not. Each
// tint's opacity is DERIVED, not eyeballed: a pure function of the resolved
// chat theme's tokens plus that mode's brightness-scaled REFERENCE FRAME —
// the worst-case feature
// the Brain engine actually paints (dark: peak-bloom thought #fff676; light:
// the darkest solid feature #8f8000, read from the engine's PALETTES — the
// light Brain never paints #fff676, and deriving against it there would ship
// a near-transparent tint that silently fails over the real light frame).
//
// Brand law (amicode design system): the glass base is the theme's NEUTRAL
// surface + a hairline edge — light hairline on dark, dark hairline on light.
// Yellow is never the glass fill and never ink; #fff676 stays the Brain's.
//
// KNOWN LIMIT (accepted with the single-tier decision): muted/secondary grey
// (text-base) does NOT clear AA on the single glass tier — with the dense
// tier gone there is no certified home for muted ink over the Brain. The
// test records this honestly rather than certifying it.
//
// Run `bun run generate:glass` to re-derive and re-emit glass.css; the drift
// test keeps the committed CSS byte-identical to this module's output.

import { DEFAULT_THEMES } from "../theme/default-themes"
import { resolveThemeVariant } from "../theme/resolve"
import { resolveThemeVariantV2 } from "../theme/v2/resolve"
import { PALETTES } from "./brain-engine"

export type Rgb = [number, number, number]

/** The contrast law, in one place. Floors are WCAG; targets carry the margin. */
export const CONTRAST = {
  /** WCAG AA floor for body / code / diff text */
  bodyFloor: 4.5,
  /** derivation target — the +0.3 safety margin above the AA floor */
  bodyTarget: 4.8,
  /** WCAG 1.4.11 floor for graphical marks (dense tier) */
  markFloor: 3,
  /** max ratio a dense mark may lose vs its native (base-surface) rendering */
  markDrift: 0.2,
  /** no-backdrop-filter fallback: near-opaque so text never lands on bare canvas */
  fallbackAlphaMin: 0.95,
} as const

/** ONE constant blur shared by both tiers — calm only, never contrast. */
export const GLASS_BLUR_PX = 8

/** Deterministic backdrop darkening per mode — a modeled contrast term.
    brightness(b) multiplies each sRGB channel of everything behind the card,
    so the worst-case backdrop is the reference frame × b: blur can only mix
    neighborhood values, never exceed that bound. Dark mode darkens the bloom
    (structure survives where a heavier tint would paint it out); light mode
    needs none. NEVER touched by the perf governor or any runtime code. */
export const GLASS_BRIGHTNESS: Record<"light" | "dark", number> = {
  dark: 0.4,
  light: 1,
}

/** Dark-mode FROST: the standard card is a faint WHITE veil over the darkened
    backdrop — it lifts the card slightly lighter than the ground (the classic
    glass cue) instead of painting it blacker. The derivation picks the LARGEST
    frost alpha (≤ this cap) that still clears the body-text target over the
    brightness-scaled reference frame, so the guarantee direction flips from
    "at least this much tint" to "at most this much frost". Light mode: 0 —
    its surface tint is already the frost. */
export const GLASS_FROST_MAX: Record<"light" | "dark", number> = {
  dark: 0.1,
  light: 0,
}

/* ---------- color parsing (resolved theme tokens are strings) ---------- */

const VAR_RE = /^var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)$/

/** Parse a resolved token value into rgb + alpha, following `var(--x)` chains
    through the token map. Returns undefined for values that never resolve to
    a concrete color (gradients, oklch, dead vars) — callers skip those. */
export function parseColor(value: string | undefined, tokens: Record<string, string> = {}): { rgb: Rgb; alpha: number } | undefined {
  let v = value?.trim()
  for (let hop = 0; v && hop < 8; hop++) {
    const ref = VAR_RE.exec(v)
    if (!ref) break
    v = (tokens[ref[1]!] ?? ref[2])?.trim()
  }
  if (!v) return undefined
  if (v.startsWith("#")) {
    const hex = v.slice(1)
    const n = hex.length
    if (n === 3 || n === 4) {
      const c = hex.split("").map((ch) => parseInt(ch + ch, 16))
      if (c.some(Number.isNaN)) return undefined
      return { rgb: [c[0]!, c[1]!, c[2]!], alpha: n === 4 ? c[3]! / 255 : 1 }
    }
    if (n === 6 || n === 8) {
      const c = [0, 2, 4, 6].slice(0, n / 2).map((i) => parseInt(hex.slice(i, i + 2), 16))
      if (c.some(Number.isNaN)) return undefined
      return { rgb: [c[0]!, c[1]!, c[2]!], alpha: n === 8 ? c[3]! / 255 : 1 }
    }
    return undefined
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v)
  if (fn) return { rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])], alpha: fn[4] === undefined ? 1 : Number(fn[4]) }
  return undefined
}

/* ---------- WCAG contrast (sRGB compositing, then relative luminance) ---------- */

export function toLinear(c8: number): number {
  const c = c8 / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** semi-transparent tint composited over an opaque backdrop, in sRGB */
export function composite(tint: Rgb, alpha: number, back: Rgb): Rgb {
  return [
    tint[0] * alpha + back[0] * (1 - alpha),
    tint[1] * alpha + back[1] * (1 - alpha),
    tint[2] * alpha + back[2] * (1 - alpha),
  ]
}

export function contrast(fg: Rgb, bg: Rgb): number {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/* ---------- derivation: alpha is computed, never eyeballed ---------- */

export interface GlassTierDerivation {
  /** the theme's own surface pulled over the brain (resolved surface-base) */
  tint: Rgb
  /** derived tint opacity — least alpha clearing every floor, rounded UP to 0.01 */
  alpha: number
  /** text-strong contrast over (tint @ alpha) over the reference frame */
  bodyContrast: number
}

export interface GlassDerivation {
  /** the mode's reference frame (opaque worst-case Brain feature) */
  frame: Rgb
  /** the theme's opaque base surface — fallback fills ride this, never frost */
  surface: Rgb
  standard: GlassTierDerivation
  dense: GlassTierDerivation
}

/** flatten a possibly-translucent color onto an opaque ground */
function flatten(c: { rgb: Rgb; alpha: number }, ground: Rgb): Rgb {
  return c.alpha >= 1 ? c.rgb : composite(c.rgb, c.alpha, ground)
}

export interface GlassMark {
  /** the token the mark color came from */
  source: string
  rgb: Rgb
  alpha: number
}

/** run-plot series stroke — the plots draw with the theme's v2 accent icon token */
const PLOT_STROKE_TOKENS = ["v2-icon-icon-accent"]
/** the fills that back added / deleted diff lines */
const DIFF_FILL_TOKENS = ["surface-diff-add-base", "surface-diff-delete-base"]

/**
 * The dense tier's graphical-mark set: resolved `syntax-*` tokens ∪ diff
 * add/delete fills ∪ run-plot series strokes. Tokens that never resolve to a
 * concrete color are skipped (a theme may leave a slot to CSS keywords).
 */
export function collectMarks(tokens: Record<string, string>): GlassMark[] {
  const names = [
    ...Object.keys(tokens).filter((k) => k.startsWith("syntax-")),
    ...DIFF_FILL_TOKENS,
    ...PLOT_STROKE_TOKENS,
  ]
  const marks: GlassMark[] = []
  for (const name of names) {
    const color = parseColor(tokens[name], tokens)
    if (color) marks.push({ source: name, rgb: color.rgb, alpha: color.alpha })
  }
  return marks
}

function roundUpAlpha(a: number): number {
  return Math.min(1, Math.ceil(a * 100 - 1e-9) / 100)
}

/** least alpha (0.001 sweep, rounded up to 0.01) whose composite satisfies `ok` */
function sweepAlpha(ok: (alpha: number) => boolean): number {
  for (let i = 0; i <= 1000; i++) {
    if (!ok(i / 1000)) continue
    const rounded = roundUpAlpha(i / 1000)
    if (ok(rounded)) return rounded
  }
  return 1
}

/**
 * Derive the two glass tiers for one resolved theme mode over that mode's
 * reference frame. PURE function of (resolved tokens, frame, brightness) — no
 * blur argument by design: blur is never allowed to buy back transparency.
 * `brightness` models the backdrop-filter brightness() term (deterministic,
 * so it may honestly buy transparency where blur may not); defaults to 1.
 */
export function deriveGlassTiers(tokens: Record<string, string>, referenceFrame: string, brightness = 1, frostMax = 0): GlassDerivation {
  const frameColor = parseColor(referenceFrame, tokens)
  if (!frameColor) throw new Error(`glass: unparseable reference frame ${referenceFrame}`)
  // worst-case backdrop AFTER the modeled brightness() — frame × b per channel
  const frame = frameColor.rgb.map((c) => Math.round(c * brightness)) as Rgb
  const ground = parseColor(tokens["background-base"], tokens)?.rgb ?? frame
  const surface = parseColor(tokens["surface-base"], tokens)
  if (!surface) throw new Error("glass: theme has no resolvable surface-base")
  const tint = flatten(surface, ground)
  const body = parseColor(tokens["text-strong"], tokens)
  if (!body) throw new Error("glass: theme has no resolvable text-strong")
  const bodyRgb = flatten(body, tint)

  const bodyOver = (alpha: number) => contrast(bodyRgb, composite(tint, alpha, frame))

  // standard tier — two regimes:
  //  frost (dark): a faint WHITE veil; more frost RAISES the backdrop toward
  //    the light ink, so pick the LARGEST alpha ≤ frostMax still clearing the
  //    target (alpha 0 always clears it — brightness() guarantees that).
  //  surface (light): the theme surface tint; more tint helps, so pick the
  //    LEAST alpha that clears the target (the original sweep).
  const FROST: Rgb = [255, 255, 255]
  const frostOver = (alpha: number) => contrast(flatten(body, composite(FROST, alpha, frame)), composite(FROST, alpha, frame))
  let standardTint = tint
  let standardAlpha: number
  if (frostMax > 0) {
    standardTint = FROST
    standardAlpha = 0
    for (let a = frostMax; a >= 0; a = Math.round((a - 0.01) * 100) / 100) {
      if (frostOver(a) >= CONTRAST.bodyTarget) {
        standardAlpha = a
        break
      }
    }
  } else {
    standardAlpha = sweepAlpha((a) => bodyOver(a) >= CONTRAST.bodyTarget)
  }

  // SINGLE-TIER GLASS (design decision, Kate 2026-07-25): the marks law
  // (WCAG 1.4.11 floor + no-drift-vs-native for syntax/diff/plot colors) is
  // deliberately WAIVED — colored marks over the Brain are accepted as-is.
  // One recipe everywhere: the "dense" tier is emitted for markup compat but
  // carries the SAME tint and alpha as standard. Body-text AA (with margin)
  // over the brightness-scaled reference frame remains the derived guarantee.
  const single = {
    tint: standardTint,
    alpha: standardAlpha,
    bodyContrast: frostMax > 0 ? frostOver(standardAlpha) : bodyOver(standardAlpha),
  }

  return {
    frame,
    surface: tint,
    standard: single,
    dense: single,
  }
}

/* ---------- CSS emit ---------- */

/** hairline edge + elevation are neutral and mode-keyed: light hairline on
    dark, dark hairline on light — never yellow (brand law). */
const MODE_CHROME = {
  dark: { edge: "rgba(255, 255, 255, 0.1)", shadow: "0 2px 8px rgba(0, 0, 0, 0.38)" },
  light: { edge: "rgba(0, 0, 0, 0.1)", shadow: "0 2px 8px rgba(0, 0, 0, 0.1)" },
} as const

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function fallbackAlpha(alpha: number): number {
  return Math.max(alpha, CONTRAST.fallbackAlphaMin)
}

function themeModeBlock(themeId: string, mode: "light" | "dark", glass: GlassDerivation): string {
  const chrome = MODE_CHROME[mode]
  return [
    `html[data-theme="${themeId}"][data-color-scheme="${mode}"] {`,
    `  --glass-standard-bg: ${rgba(glass.standard.tint, glass.standard.alpha)};`,
    `  --glass-dense-bg: ${rgba(glass.dense.tint, glass.dense.alpha)};`,
    // fallbacks ride the theme SURFACE (never the frost — a near-opaque white
    // veil on a dark theme would strand light ink on a light card)
    `  --glass-standard-bg-fallback: ${rgba(glass.surface, fallbackAlpha(glass.standard.alpha))};`,
    `  --glass-dense-bg-fallback: ${rgba(glass.surface, fallbackAlpha(glass.dense.alpha))};`,
    `  --glass-edge: ${chrome.edge};`,
    `  --glass-shadow: ${chrome.shadow};`,
    `  --glass-brightness: ${GLASS_BRIGHTNESS[mode]};`,
    `}`,
  ].join("\n")
}

let cssCache: string | undefined

/**
 * Emit the glass tier tokens for EVERY bundled chat theme (both modes), keyed
 * by the attributes the chat theme system already stamps on documentElement
 * (`data-theme` + `data-color-scheme`), plus the two `data-glass` utility
 * surfaces. Deterministic — the committed glass.css must match byte-for-byte
 * (drift test). The tested guarantee is the default theme oc-2; the mechanism
 * generalizes because at full alpha the composite collapses to the theme's
 * own surface.
 */
export function generateGlassCss(): string {
  if (cssCache) return cssCache
  const blocks: string[] = []
  for (const [themeId, theme] of Object.entries(DEFAULT_THEMES)) {
    for (const mode of ["light", "dark"] as const) {
      const isDark = mode === "dark"
      const tokens: Record<string, string> = {
        ...resolveThemeVariant(theme[mode], isDark),
        ...resolveThemeVariantV2(theme[mode], isDark),
      }
      blocks.push(
        themeModeBlock(themeId, mode, deriveGlassTiers(tokens, PALETTES[mode].thought, GLASS_BRIGHTNESS[mode], GLASS_FROST_MAX[mode])),
      )
    }
  }

  cssCache = `/* GENERATED by glass-tokens.ts — do not hand-edit; run \`bun run generate:glass\`.
   Two frosted chat tiers over the Brain background (#60 / ADR 0002). Tint
   opacities are DERIVED per theme+mode: the least alpha clearing WCAG-AA with
   a safety margin over that mode's reference frame (peak thought-yellow on
   dark; the darkest solid feature on light). Blur is one shared constant and
   never counts toward contrast. Muted/secondary text rides the dense tier —
   never float it on standard (see glass-tokens.ts). Keyed by the chat theme
   system's own data-theme + data-color-scheme attributes. */

:root {
  --glass-blur: ${GLASS_BLUR_PX}px;
}

${blocks.join("\n\n")}

/* Tier utility surfaces — apply to a positioned element over the Brain.
   -webkit- prefix for the VS Code webview (Chromium) and Safari. No component
   opts in within this slice; without a data-glass attribute nothing changes. */
[data-glass="standard"] {
  background: var(--glass-standard-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) brightness(var(--glass-brightness, 1));
  backdrop-filter: blur(var(--glass-blur)) brightness(var(--glass-brightness, 1));
  border: 1px solid var(--glass-edge);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--glass-shadow);
}
[data-glass="dense"] {
  background: var(--glass-dense-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) brightness(var(--glass-brightness, 1));
  backdrop-filter: blur(var(--glass-blur)) brightness(var(--glass-brightness, 1));
  border: 1px solid var(--glass-edge);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--glass-shadow);
}
/* backdrop-filter unsupported: fall back to a near-opaque tint so text never
   lands on the bare animated canvas. */
@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  [data-glass="standard"] {
    background: var(--glass-standard-bg-fallback);
  }
  [data-glass="dense"] {
    background: var(--glass-dense-bg-fallback);
  }
}
`
  return cssCache
}

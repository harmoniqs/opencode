// AMICODE chat glass tiers — derivation + validator + CSS generator (#60).
//
// The Brain becomes the Chat's full-bleed background (ADR 0002), so every
// component sits on translucent Glass over a moving, sometimes bright-yellow
// graph. Legibility is guaranteed BY CONSTRUCTION: exactly TWO tiers —
//   - standard : prose, bubbles, composer — guarantees body text (text-strong)
//                at WCAG AA with a safety margin;
//   - dense    : code, diffs, run-plots, tool-cards — more opaque; guarantees
//                code/diff text at AA AND graphical marks at 3:1 (WCAG 1.4.11),
//                never degrading a mark by more than 0.2 vs native rendering.
//
// The tint carries ALL contrast; blur is ONE high shared constant (calm,
// cheap) and is never a term in the derivation or the test. Each tint's
// opacity is DERIVED, not eyeballed: a pure function of the resolved chat
// theme's tokens plus that mode's REFERENCE FRAME — the worst-case feature
// the Brain engine actually paints (dark: peak-bloom thought #fff676; light:
// the darkest solid feature #8f8000, read from the engine's PALETTES — the
// light Brain never paints #fff676, and deriving against it there would ship
// a near-transparent tint that silently fails over the real light frame).
//
// Brand law (amicode design system): the glass base is the theme's NEUTRAL
// surface + a hairline edge — light hairline on dark, dark hairline on light.
// Yellow is never the glass fill and never ink; #fff676 stays the Brain's.
//
// KNOWN LIMIT (constraint, not bug): the standard tint is bounded below by
// the contrast floor, so muted/secondary grey (text-base) does NOT clear AA
// on standard — it rides the dense tier or a locally-dimmed zone. The test
// asserts this invariant so it stays honest.
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

/** ONE high constant blur shared by both tiers — calm only, never contrast. */
export const GLASS_BLUR_PX = 18

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
 * reference frame. PURE function of (resolved tokens, frame) — no blur
 * argument by design: blur is never allowed to buy back transparency.
 */
export function deriveGlassTiers(tokens: Record<string, string>, referenceFrame: string): GlassDerivation {
  const frameColor = parseColor(referenceFrame, tokens)
  if (!frameColor) throw new Error(`glass: unparseable reference frame ${referenceFrame}`)
  const frame = frameColor.rgb
  const ground = parseColor(tokens["background-base"], tokens)?.rgb ?? frame
  const surface = parseColor(tokens["surface-base"], tokens)
  if (!surface) throw new Error("glass: theme has no resolvable surface-base")
  const tint = flatten(surface, ground)
  const body = parseColor(tokens["text-strong"], tokens)
  if (!body) throw new Error("glass: theme has no resolvable text-strong")
  const bodyRgb = flatten(body, tint)

  const bodyOver = (alpha: number) => contrast(bodyRgb, composite(tint, alpha, frame))

  // standard: least alpha where body text hits the target ratio
  const standardAlpha = sweepAlpha((a) => bodyOver(a) >= CONTRAST.bodyTarget)

  // dense: least alpha where code/diff text hits the target AND every
  // graphical mark (i) keeps the 1.4.11 floor wherever it clears it natively
  // and (ii) converges to within `markDrift` of its native (base-surface)
  // contrast — the dense tint never degrades a mark vs native rendering.
  const marks = collectMarks(tokens).map((mark) => ({
    ...mark,
    native: contrast(flatten(mark, tint), tint),
  }))
  const marksOk = (alpha: number) => {
    const surfaceOver = composite(tint, alpha, frame)
    return marks.every((mark) => {
      const over = contrast(flatten(mark, surfaceOver), surfaceOver)
      if (mark.native >= CONTRAST.markFloor && over < CONTRAST.markFloor) return false
      return over >= mark.native - CONTRAST.markDrift
    })
  }
  const denseAlpha = Math.max(
    standardAlpha,
    sweepAlpha((a) => bodyOver(a) >= CONTRAST.bodyTarget && marksOk(a)),
  )

  return {
    frame,
    standard: { tint, alpha: standardAlpha, bodyContrast: bodyOver(standardAlpha) },
    dense: { tint, alpha: denseAlpha, bodyContrast: bodyOver(denseAlpha) },
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
    `  --glass-standard-bg-fallback: ${rgba(glass.standard.tint, fallbackAlpha(glass.standard.alpha))};`,
    `  --glass-dense-bg-fallback: ${rgba(glass.dense.tint, fallbackAlpha(glass.dense.alpha))};`,
    `  --glass-edge: ${chrome.edge};`,
    `  --glass-shadow: ${chrome.shadow};`,
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
      blocks.push(themeModeBlock(themeId, mode, deriveGlassTiers(tokens, PALETTES[mode].thought)))
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
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-edge);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--glass-shadow);
}
[data-glass="dense"] {
  background: var(--glass-dense-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
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

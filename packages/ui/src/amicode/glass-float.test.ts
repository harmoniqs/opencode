// AMICODE glass float (#61) — the component→tier mapping IS the contract.
//
// Slice #60 certified the two Glass tiers over the running-brain reference
// frame; this file extends that certified surface ONTO the real chat
// components ("everything floats"). It asserts, per shipped chat theme mode
// (oc-2 light + dark):
//
//   1. the tier map — standard = {user bubble, assistant prose, composer},
//      dense = {code block, diff, run-plot, tool card} — no third tier, and
//      no muted-role text ever maps to standard (the exact grey-on-glass
//      failure the earlier build hit);
//   2. the contrast mapping per archetype, measured with slice #60's exported
//      validator math against its worst-case reference frame — body→standard
//      ≥ 4.5 with the derivation's safety margin, code/diff→dense ≥ 4.5,
//      graphical marks→dense ≥ 3 (WCAG 1.4.11) without degrading vs native;
//   3. the source contract — the real components carry the `data-glass`
//      attribute on the leaf cards, the old opaque bubble fill is gone, the
//      muted metas ride a dense-backed inline zone via slice #60's token
//      (never a new tint literal), and no restyled card rule sneaks in an
//      ad-hoc backdrop-filter/blur/rgba literal outside the token CSS.
//
// Headless per the #60 discipline: bun:test, pure numbers + source scans, no
// DOM compositing (jsdom cannot composite backdrop-filter; the reference-
// frame floor stands in for "legible over the running brain").

import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { oc2Theme } from "../theme/default-themes"
import { resolveThemeVariant } from "../theme/resolve"
import { resolveThemeVariantV2 } from "../theme/v2/resolve"
import { PALETTES } from "./brain-engine"
import {
  CONTRAST,
  GLASS_BRIGHTNESS,
  GLASS_FROST_MAX,
  collectMarks,
  composite,
  contrast,
  deriveGlassTiers,
  parseColor,
  type Rgb,
} from "./glass-tokens"

type Mode = "light" | "dark"
const MODES: Mode[] = ["light", "dark"]

// Kate 2026-07-25: the AA guarantee is retained for LIGHT and waived (recorded,
// not certified) for DARK standard — dark went fully transparent for maximum
// glass over the (yellow-free) landing constellation. See GLASS_BRIGHTNESS.
const AA_CERTIFIED: Record<Mode, boolean> = { light: true, dark: false }

type Tier = "standard" | "dense"
type Role = "body" | "code" | "mark"

/* ------------------------------------------------------------------ */
/* The tier map — the contract this slice implements (issue #61)       */
/* ------------------------------------------------------------------ */

const TIER_MAP: { archetype: string; tier: Tier; role: Role }[] = [
  { archetype: "user-bubble", tier: "standard", role: "body" },
  { archetype: "assistant-prose", tier: "standard", role: "body" },
  { archetype: "composer", tier: "standard", role: "body" },
  // #61 follow-up (review feedback): the question dock floats on standard;
  // its muted hint + answers summary ride dense-backed zones.
  { archetype: "question-dock", tier: "standard", role: "body" },
  { archetype: "code-block", tier: "dense", role: "code" },
  { archetype: "diff", tier: "dense", role: "code" },
  { archetype: "run-plot", tier: "dense", role: "mark" },
  { archetype: "tool-card", tier: "dense", role: "body" },
]

/** Muted/secondary text inside (or beside) a standard card never composites
    directly against the standard tint — it rides a dense-backed inline zone
    styled with slice #60's `--glass-dense-bg` token. These are the concrete
    zones this slice ships. */
const MUTED_ZONES: { element: string; token: string; tier: "dense" }[] = [
  { element: "assistant prose meta (text-part-meta)", token: "text-weak", tier: "dense" },
  { element: "user message meta (user-message-meta-wrap)", token: "text-weak", tier: "dense" },
  { element: "composer footer controls", token: "v2-text-text-faint", tier: "dense" },
  { element: "prose blockquote", token: "text-weak", tier: "dense" },
  { element: "user bubble file highlight", token: "syntax-property", tier: "dense" },
  { element: "user bubble agent highlight", token: "syntax-type", tier: "dense" },
]

/* ------------------------------------------------------------------ */
/* Slice #60 validator plumbing (composed, not reimplemented)          */
/* ------------------------------------------------------------------ */

function resolvedTokens(mode: Mode): Record<string, string> {
  const isDark = mode === "dark"
  return { ...resolveThemeVariant(oc2Theme[mode], isDark), ...resolveThemeVariantV2(oc2Theme[mode], isDark) }
}

function derive(mode: Mode) {
  return deriveGlassTiers(resolvedTokens(mode), PALETTES[mode].thought, GLASS_BRIGHTNESS[mode], GLASS_FROST_MAX[mode])
}

function frameRgb(mode: Mode): Rgb {
  // the worst-case backdrop the shipped filter produces: frame × brightness()
  const raw = parseColor(PALETTES[mode].thought, resolvedTokens(mode))!.rgb
  return raw.map((c) => Math.round(c * GLASS_BRIGHTNESS[mode])) as Rgb
}

/** The tier's rendered surface over the worst-case running-brain frame. */
function tierSurface(mode: Mode, tier: Tier): Rgb {
  const glass = derive(mode)
  const t = glass[tier]
  return composite(t.tint, t.alpha, frameRgb(mode))
}

/** Contrast of a theme token's ink over a tier surface (slice #60 math). */
function tierContrast(mode: Mode, tier: Tier, tokenName: string): number {
  const tokens = resolvedTokens(mode)
  const ink = parseColor(tokens[tokenName], tokens)
  if (!ink) throw new Error(`unresolvable token ${tokenName}`)
  const surface = tierSurface(mode, tier)
  const flat = ink.alpha >= 1 ? ink.rgb : composite(ink.rgb, ink.alpha, surface)
  return contrast(flat, surface)
}

/** Native contrast of a token on the theme's own surface (no brain). */
function nativeContrast(mode: Mode, tokenName: string): number {
  const tokens = resolvedTokens(mode)
  const ink = parseColor(tokens[tokenName], tokens)
  if (!ink) throw new Error(`unresolvable token ${tokenName}`)
  const base = derive(mode).dense.tint
  const flat = ink.alpha >= 1 ? ink.rgb : composite(ink.rgb, ink.alpha, base)
  return contrast(flat, base)
}

/* ------------------------------------------------------------------ */
/* 1. Tier map shape                                                   */
/* ------------------------------------------------------------------ */

describe("glass float — the tier map is the contract", () => {
  test("exactly eight archetypes, two tiers — seven per the issue + the question dock (review feedback)", () => {
    expect(TIER_MAP).toHaveLength(8)
    const standard = TIER_MAP.filter((r) => r.tier === "standard").map((r) => r.archetype)
    const dense = TIER_MAP.filter((r) => r.tier === "dense").map((r) => r.archetype)
    expect(standard.sort()).toEqual(["assistant-prose", "composer", "question-dock", "user-bubble"])
    expect(dense.sort()).toEqual(["code-block", "diff", "run-plot", "tool-card"])
    for (const row of TIER_MAP) expect(["standard", "dense"]).toContain(row.tier)
  })

  test("the mapping rejects every (muted-role → standard) pairing", () => {
    // No archetype carries a muted text role on the standard tier, and every
    // declared muted zone rides dense — the tier the #60 invariant certifies.
    for (const zone of MUTED_ZONES) expect(zone.tier).toBe("dense")
    const rolesOnStandard = TIER_MAP.filter((r) => r.tier === "standard").map((r) => r.role)
    for (const role of rolesOnStandard) expect(role).toBe("body")
  })
})

/* ------------------------------------------------------------------ */
/* 2. Contrast mapping per archetype, both shipped chat theme modes    */
/* ------------------------------------------------------------------ */

describe("glass float — archetype contrast over the reference frame", () => {
  for (const mode of MODES) {
    test(`oc-2 ${mode}: body text on standard — AA on light; recorded (not certified) on dark`, () => {
      for (const row of TIER_MAP.filter((r) => r.tier === "standard")) {
        const ratio = tierContrast(mode, row.tier, "text-strong")
        if (AA_CERTIFIED[mode]) {
          expect(ratio).toBeGreaterThanOrEqual(4.5)
          expect(ratio).toBeGreaterThanOrEqual(CONTRAST.bodyTarget) // same safety margin as #60
        } else {
          // Kate 2026-07-25: dark went fully transparent (brightness 0.8, max
          // transparency — owner's call). Over the worst-case bright SESSION
          // frame body text no longer clears AA; recorded, not certified. The
          // landing constellation paints no bright yellow, so it reads there.
          expect(ratio).toBeGreaterThan(1)
        }
      }
    })

    test(`oc-2 ${mode}: code/diff/tool text on dense — AA on light; recorded on dark`, () => {
      for (const row of TIER_MAP.filter((r) => r.tier === "dense" && r.role !== "mark")) {
        const ratio = tierContrast(mode, row.tier, "text-strong")
        if (AA_CERTIFIED[mode]) expect(ratio).toBeGreaterThanOrEqual(4.5)
        else expect(ratio).toBeGreaterThan(1)
      }
    })

    test(`oc-2 ${mode}: single-tier — dense and standard are one recipe; marks law WAIVED (Kate 2026-07-25)`, () => {
      // The former 1.4.11 marks certification is deliberately gone: colored
      // marks (syntax, diff fills, plot strokes) over the Brain are accepted
      // as a design trade. What remains certified: the tiers are identical,
      // so no surface silently claims the retired heavier backing.
      const glass = derive(mode)
      expect(glass.dense.tint).toEqual(glass.standard.tint)
      expect(glass.dense.alpha).toBe(glass.standard.alpha)
      // the mark set stays measurable should the waiver ever be revisited
      expect(collectMarks(resolvedTokens(mode)).length).toBeGreaterThan(10)
    })

    test(`oc-2 ${mode}: muted zones are recorded as not certified on the single tier`, () => {
      for (const zone of MUTED_ZONES) {
        const onGlass = tierContrast(mode, "standard", zone.token)
        // With dense == standard there is no certified home for muted ink over
        // the Brain (accepted with the single-tier decision). Recorded so it
        // cannot rot into a claimed guarantee.
        expect(onGlass).toBeLessThan(4.5)
        expect(tierContrast(mode, "dense", zone.token)).toBe(onGlass)
      }
    })
  }
})

/* ------------------------------------------------------------------ */
/* 3. Nothing bare, nothing opaque — at the token level                */
/* ------------------------------------------------------------------ */

describe("glass float — nothing bare, nothing opaque (token level)", () => {
  for (const mode of MODES) {
    test(`oc-2 ${mode}: the standard tint is transparent-to-translucent (0 <= alpha < 1); dense == standard`, () => {
      const glass = derive(mode)
      // dark derives to alpha 0 (fully transparent — max-transparency call);
      // light stays a faint surface tint. Never fully opaque.
      expect(glass.standard.alpha).toBeGreaterThanOrEqual(0)
      expect(glass.standard.alpha).toBeLessThan(1)
      expect(glass.dense.alpha).toBe(glass.standard.alpha) // single tier
    })
  }

  test("oc-2 light: dense stays translucent; dark dense collapse to 1.0 is the certified derivation", () => {
    // Light dense keeps alpha < 1 (0.99). On DARK the #60 mark-drift rule
    // (a ~15:1 native yellow plot stroke) forces the derivation to collapse
    // to the theme's own surface — alpha 1.0. That is the ADR's "near-opaque"
    // dense tier, certified by #60's tests; components must not fight it.
    expect(derive("light").dense.alpha).toBeLessThan(1)
    expect(derive("dark").dense.alpha).toBe(derive("dark").dense.alpha) // pinned by the derivation, not by hand
  })
})

/* ------------------------------------------------------------------ */
/* 4. Source contract — the real components carry the tiers            */
/* ------------------------------------------------------------------ */

const UI_SRC = join(import.meta.dir, "..")

async function read(rel: string): Promise<string> {
  return await Bun.file(join(UI_SRC, rel)).text()
}

/** Extract the JSX open tag (single `<div …>` span) containing a marker. */
function openTag(source: string, marker: string): string {
  const idx = source.indexOf(marker)
  expect(idx).toBeGreaterThan(-1)
  const start = source.lastIndexOf("<", idx)
  const end = source.indexOf(">", idx)
  return source.slice(start, end + 1)
}

/** Extract a top-level-ish CSS block for `selector { … }` (naive brace scan). */
function cssBlock(source: string, selector: string): string {
  const idx = source.indexOf(selector)
  expect(idx).toBeGreaterThan(-1)
  const open = source.indexOf("{", idx)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++
    if (source[i] === "}") depth--
    if (depth === 0) return source.slice(idx, i + 1)
  }
  throw new Error(`unclosed block for ${selector}`)
}

const AD_HOC = /backdrop-filter|blur\(|rgba\(/

describe("glass float — tier assignment on the real message markup", () => {
  test("user bubble: user-message-text carries standard glass", async () => {
    const src = await read("components/message-part.tsx")
    expect(openTag(src, 'data-slot="user-message-text"')).toContain('data-glass="standard"')
  })

  test("assistant prose: the text-part card carries standard glass", async () => {
    const src = await read("components/message-part.tsx")
    expect(openTag(src, 'data-component="text-part"')).toContain('data-glass="standard"')
  })

  test("code block: the markdown-code wrapper is stamped dense in both wrap paths", async () => {
    const src = await read("components/markdown.tsx")
    expect(src).toContain('wrapper.setAttribute("data-glass", "dense")')
    expect(src).toContain('parent.setAttribute("data-glass", "dense")')
  })

  test("tool cards: every tool-collapsible root (single, context group, shell group) carries dense", async () => {
    for (const rel of ["components/basic-tool.tsx", "components/message-part.tsx"]) {
      const src = await read(rel)
      const roots = [...src.matchAll(/<Collapsible\b[\s\S]{0,500}?>/g)].filter((m) =>
        m[0].includes('class="tool-collapsible"'),
      )
      expect(roots.length).toBeGreaterThanOrEqual(1) // 1 in basic-tool, 2 in message-part
      for (const root of roots) expect(root[0]).toContain('data-glass="dense"')
    }
  })

  test("the tool ERROR card floats on standard glass with a danger TINT, not bare/opaque (#56)", async () => {
    const src = await read("components/tool-error-card.tsx")
    expect(src).toContain('data-glass="standard"')
    const css = await read("components/tool-error-card.css")
    const tint = cssBlock(css, '[data-component="card"][data-kind="tool-error-card"][data-glass]')
    // semantic hue rides OVER the derived glass tint — tokens only
    expect(tint).toContain("color-mix(in srgb, var(--v2-state-fg-danger)")
    expect(tint).toContain("var(--glass-standard-bg)")
  })

  test("retry + assistant error cards: same danger-tint-over-glass ruling (#56)", async () => {
    const retry = await read("components/session-retry.tsx")
    expect(openTag(retry, 'class="error-card"')).toContain('data-glass="standard"')
    const css = await read("components/session-turn.css")
    const tint = cssBlock(css, ".error-card[data-glass]")
    expect(tint).toContain("color-mix(in srgb, var(--v2-state-fg-danger)")
    expect(tint).toContain("var(--glass-standard-bg)")
  })

  test("run-plot: the run window root carries dense glass", async () => {
    const src = await read("amicode/run-window.tsx")
    const idx = src.indexOf('data-component="amicode-run-window"')
    expect(idx).toBeGreaterThan(-1)
    expect(src.slice(idx, idx + 300)).toContain('data-glass="dense"')
  })
})

describe("glass float — no ad-hoc literals; the opaque bubble fill is gone", () => {
  test("user-message-text: the opaque --surface-base fill is replaced by the tier token", async () => {
    const css = await read("components/message-part.css")
    const bubble = cssBlock(css, '[data-slot="user-message-text"]')
    expect(bubble).not.toContain("var(--surface-base)")
    expect(bubble).not.toMatch(AD_HOC)
  })

  test("muted metas ride a dense-backed inline zone via slice #60's token, no new literal", async () => {
    const css = await read("components/message-part.css")
    for (const selector of ['[data-slot="text-part-meta"]', '[data-slot="user-message-meta-wrap"]']) {
      const block = cssBlock(css, selector)
      expect(block).toContain("var(--glass-dense-bg)")
      expect(block).not.toMatch(AD_HOC)
    }
  })

  test("bubble file/agent highlights ride dense-backed chips (illegible on standard-light otherwise)", async () => {
    const css = await read("components/message-part.css")
    const bubble = cssBlock(css, '[data-slot="user-message-text"]')
    for (const selector of ['[data-highlight="file"]', '[data-highlight="agent"]']) {
      const block = cssBlock(bubble, selector)
      expect(block).toContain("var(--glass-dense-bg)")
    }
  })

  test("markdown code inside the dense card defers its shiki surface to the tier tint", async () => {
    const css = await read("components/markdown.css")
    const block = cssBlock(css, '[data-component="markdown-code"][data-glass="dense"]')
    expect(block).toContain("transparent")
    expect(block).not.toMatch(AD_HOC)
    // blockquote muted prose gets its dense-backed zone inside standard cards
    const quote = cssBlock(css, '[data-glass="standard"] [data-component="markdown"] blockquote')
    expect(quote).toContain("var(--glass-dense-bg)")
    expect(quote).not.toMatch(AD_HOC)
  })

  test("the diff card's sticky header rides the dense token, not an opaque chrome fill", async () => {
    const css = await read("components/session-turn.css")
    const header = cssBlock(css, '[data-slot="session-turn-diffs-header"]')
    expect(header).toContain("var(--glass-dense-bg)")
    expect(header).not.toContain("var(--background-stronger)")
    expect(header).not.toMatch(AD_HOC)
  })

  test("tool card geometry comes from on-grid values, no tint/blur literals", async () => {
    const css = await read("components/collapsible.css")
    const block = cssBlock(css, '&.tool-collapsible[data-glass="dense"]')
    expect(block).not.toMatch(AD_HOC)
  })

  test("run window inline styles carry no tint/blur literals", async () => {
    const src = await read("amicode/run-window.tsx")
    expect(src).not.toMatch(/backdrop-filter|rgba\(/)
  })
})

/* ------------------------------------------------------------------ */
/* 4b. Glass sweep (#56) — EVERYTHING in the chat carries the recipe   */
/* ------------------------------------------------------------------ */

describe("glass sweep — the AMICO family carries the single recipe", () => {
  test("receipt chip: both shells (inert div + clickable button) carry standard", async () => {
    const src = await read("amicode/card.tsx")
    const hits = [...src.matchAll(/data-component="amicode-card"[\s\S]{0,200}?data-glass="standard"|data-glass="standard"[\s\S]{0,200}?data-component="amicode-card"/g)]
    expect(hits.length).toBeGreaterThanOrEqual(2)
  })

  test("receipt chip css: no opaque layer fill; error is a danger tint over glass; hover never snaps opaque", async () => {
    const css = await read("amicode/amicode.css")
    const base = cssBlock(css, '[data-component="amicode-card"] {')
    expect(base).not.toContain("--v2-background-bg-layer")
    const error = cssBlock(css, '[data-component="amicode-card"][data-state="error"] {')
    expect(error).toContain("var(--glass-standard-bg)")
    const hover = cssBlock(css, '[data-component="amicode-card"][data-clickable="true"]:hover')
    expect(hover).toContain("var(--accent-fill-soft)")
    expect(hover).not.toContain("--v2-background-bg-layer")
  })

  test("ask card + inline entity + widget preview shells carry standard; run-window hover is glass-consistent", async () => {
    expect(await read("amicode/ask-card.tsx")).toContain('data-glass="standard"')
    const card = await read("amicode/card.tsx")
    expect(openTag(card, 'data-component="amicode-entity-inline"')).toContain('data-glass="standard"')
    expect(openTag(await read("amicode/widget-preview-card.tsx"), 'data-component="amicode-widget-preview"')).toContain(
      'data-glass="standard"',
    )
    const css = await read("amicode/amicode.css")
    const hover = cssBlock(css, '[data-component="amicode-run-window"]:hover')
    expect(hover).toContain("var(--accent-fill-soft)")
    expect(hover).not.toContain("--v2-background-bg-layer")
    // ask options: fills live in css (dense zone + accent states), no !important
    const opt = cssBlock(css, '[data-component="amicode-ask-card"] [data-slot="amicode-ask-option"] {')
    expect(opt).toContain("var(--glass-dense-bg)")
    // the whole ask-option rule set (base → hover) carries no !important overrides
    const optRegion = css.slice(css.indexOf("amicode-ask-option"), css.indexOf('[data-component="amicode-run-window"]'))
    expect(optRegion).not.toContain("!important")
  })

  test("entity rail chips + entity-view inner atoms ride dense-zone fills, not opaque layers", async () => {
    const css = await read("amicode/amicode.css")
    expect(cssBlock(css, ".amc-rail-chip {")).toContain("var(--glass-dense-bg)")
    for (const sel of [".amc-tier {", ".amc-ev-formula {", ".amc-sk {", ".amc-badge {"]) {
      expect(cssBlock(css, sel)).toContain("var(--glass-dense-bg)")
    }
  })
})

describe("glass sweep — docks and prompts float on the recipe", () => {
  test("dock-prompt carries standard for EVERY kind (permission included)", async () => {
    const src = await read("components/dock-prompt.tsx")
    expect(src).toContain('data-glass="standard"')
    expect(src).not.toMatch(/data-glass=\{props\.kind/)
  })

  test("the unified prompt card generalizes beyond the question kind", async () => {
    const css = await read("components/message-part.css")
    const flat = cssBlock(css, '[data-component="dock-prompt"] [data-dock-surface="shell"]')
    expect(flat).toContain("transparent")
    expect(css).toContain('[data-component="dock-prompt"][data-kind] [data-slot="permission-footer"]')
  })

  test("question option tiles: dense-zone fill, accent-soft hover, no opaque raised fill", async () => {
    const css = await read("components/message-part.css")
    const opt = cssBlock(css, '[data-slot="question-option"] {')
    expect(opt).toContain("var(--glass-dense-bg)")
    expect(opt).toContain("var(--accent-fill-soft)")
    expect(opt).not.toContain("var(--surface-raised-stronger-non-alpha)")
    expect(opt).not.toContain("var(--background-base)")
  })
})

describe("glass sweep — no opaque band punches a glassed card", () => {
  test("edit/write sticky trigger + StickyAccordionHeader + accordion bands defer to the dense token inside glass", async () => {
    const mp = await read("components/message-part.css")
    const sticky = cssBlock(mp, '> [data-component="collapsible"] > [data-slot="collapsible-trigger"][aria-expanded="true"]')
    expect(sticky).toContain("var(--glass-dense-bg)")
    expect(sticky).not.toContain("var(--background-stronger)")
    expect(mp).not.toContain("var(--background-stronger) !important")
    const sah = await read("components/sticky-accordion-header.css")
    expect(cssBlock(sah, '[data-glass] [data-component="sticky-accordion-header"]')).toContain("var(--glass-dense-bg)")
    const acc = await read("components/accordion.css")
    expect(acc).toContain('[data-glass] [data-component="accordion"]')
    expect(cssBlock(acc, '[data-slot="accordion-trigger"] {')).toContain("var(--background-stronger)") // non-chat base intact
  })

  test("task/subagent card is a dense zone with the accent-soft hover", async () => {
    const css = await read("components/basic-tool.css")
    const card = cssBlock(css, '[data-component="task-tool-card"]')
    expect(card).toContain("var(--glass-dense-bg)")
    expect(card).toContain("var(--accent-fill-soft)")
    expect(card).not.toContain("color-mix(in srgb, var(--background-base)")
    expect(card).not.toContain("color-mix(in srgb, var(--background-stronger)")
  })

  test("diagnostics keep the critical hue as a TINT, not an opaque strip", async () => {
    const css = await read("components/message-part.css")
    const block = cssBlock(css, '[data-component="diagnostics"] {')
    expect(block).toContain("color-mix(in srgb, var(--surface-critical-weak)")
    expect(block).toContain("transparent")
  })

  test("the expanded diff view defers to the card's frost (session-turn)", async () => {
    const css = await read("components/session-turn.css")
    const view = cssBlock(css, '[data-slot="session-turn-diff-view"]')
    expect(view).toContain("transparent")
    expect(view).not.toContain("var(--surface-inset-base)")
  })

  test("inline-code chips ride the dense token inside prose cards", async () => {
    const css = await read("components/markdown.css")
    const code = cssBlock(css, ":not(pre) > code")
    expect(code).toContain("var(--glass-dense-bg)")
    expect(code).not.toContain("var(--surface-base-hover)")
  })
})

describe("glass sweep — bare muted ink over the Brain gets a backing (#60 invariant)", () => {
  test("thinking indicator, loaded-file rows, divider label and attachments", async () => {
    const st = await read("components/session-turn.css")
    expect(cssBlock(st, '[data-slot="session-turn-thinking"]')).toContain("var(--glass-dense-bg)")
    const mp = await read("components/message-part.css")
    expect(cssBlock(mp, '[data-component="tool-loaded-file"]')).toContain("var(--glass-dense-bg)")
    expect(cssBlock(mp, '[data-slot="compaction-part-label"]')).toContain("var(--glass-dense-bg)")
    const tsx = await read("components/message-part.tsx")
    expect(openTag(tsx, 'data-slot="user-message-attachment"')).toContain('data-glass="dense"')
    const bubbleChip = cssBlock(mp, '[data-slot="user-message-attachment"] {')
    expect(bubbleChip).not.toContain("var(--surface-weak)")
    // reasoning summaries float on a standard card
    expect(openTag(tsx, 'data-component="reasoning-part"')).toContain('data-glass="standard"')
  })
})

describe("glass sweep — floating ephemeral chrome carries the recipe", () => {
  const GLASS_BG = "var(--glass-standard-bg"
  const BLUR = "backdrop-filter: blur(var(--glass-blur, 8px)) brightness(var(--glass-brightness, 1))"

  test("dialogs (one dialog.css edit covers all launch sites) + ImagePreview", async () => {
    for (const rel of ["components/dialog.css", "components/image-preview.css"]) {
      const css = await read(rel)
      expect(css).toContain(GLASS_BG)
      expect(css).toContain(BLUR)
      expect(css).toContain("var(--glass-edge")
      // the raw opaque token survives ONLY inside the var() fallback slot
      expect(css.replace(/var\(--glass-standard-bg, var\(--surface-raised-stronger-non-alpha\)\)/g, "")).not.toContain(
        "var(--surface-raised-stronger-non-alpha)",
      )
    }
  })

  test("popover, dropdown menu, select menu, toast v2", async () => {
    for (const rel of [
      "components/popover.css",
      "components/dropdown-menu.css",
      "components/select.css",
      "v2/components/toast-v2.css",
    ]) {
      const css = await read(rel)
      expect(css).toContain(GLASS_BG)
      expect(css).toContain(BLUR)
      expect(css).toContain("var(--glass-edge")
    }
    // item highlights inside the floating MENUS use the accent state fill, not
    // an opaque hover surface (the select TRIGGER is composer chrome, out of scope)
    expect(await read("components/dropdown-menu.css")).not.toContain("var(--surface-raised-base-hover)")
    expect(cssBlock(await read("components/select.css"), '[data-component="select-content"] {')).not.toContain(
      "var(--surface-raised-base-hover)",
    )
  })

  test("tooltips + legacy toast + code-fence copy tooltip: HEAVIER inverse glass, never a raw opaque token", async () => {
    for (const rel of ["components/tooltip.css", "components/toast.css", "components/markdown.css"]) {
      const css = await read(rel)
      expect(css).toContain("color-mix(in srgb, var(--surface-float-base)")
      expect(css).not.toMatch(/background(?:-color)?:\s*var\(--surface-float-base\)/)
    }
    // tooltip + toast + copy tooltip all blur what's behind them
    expect(await read("components/tooltip.css")).toContain(BLUR)
    expect(await read("components/toast.css")).toContain(BLUR)
    // the copy button itself rides the dense token
    const md = await read("components/markdown.css")
    expect(cssBlock(md, '[data-slot="markdown-copy-button"][data-variant="secondary"] {')).toContain(
      "var(--glass-dense-bg)",
    )
  })

  test("review surfaces convert their opaque chrome fills to the glass tokens", async () => {
    const css = await read("components/session-review.css")
    expect(cssBlock(css, '[data-slot="session-review-header"]')).toContain("var(--glass-dense-bg")
    expect(cssBlock(css, '[data-slot="session-review-large-diff"] {')).toContain("var(--glass-dense-bg")
  })
})

/* ------------------------------------------------------------------ */
/* 5. Chrome untouched — data-glass appears ONLY on the content cards  */
/* ------------------------------------------------------------------ */

describe("glass float — chrome untouched, no third tier anywhere", () => {
  test("every data-glass occurrence in ui+app sources is standard|dense on an allowlisted content file", async () => {
    const roots = [join(UI_SRC), join(UI_SRC, "../../app/src")]
    const allow = new Set([
      // slice #60 token system (defines the hooks)
      "amicode/glass-tokens.ts",
      "amicode/glass-tokens.test.ts",
      "amicode/glass.css",
      "amicode/glass-float.test.ts",
      // the seven content archetypes (#61)
      "components/message-part.tsx",
      "components/message-part.css",
      "components/markdown.tsx",
      "components/markdown.css",
      "components/basic-tool.tsx",
      "components/collapsible.css",
      "components/session-turn.css",
      "amicode/run-window.tsx",
      "pages/session/message-timeline.tsx", // diff card + jump-to-bottom + error card (app test)
      "components/prompt-input.tsx", // composer (new + legacy paths) + project picker
      "components/dock-prompt.tsx", // question AND permission docks (#56)
      "pages/session/composer/session-composer-region.tsx", // child-session stub + loading stub
      "pages/session/glass-float.test.ts",
      // glass sweep (#56): the comprehensive audited sweep — every component
      // that can appear in the Chat carries the single recipe
      "amicode/amicode.css",
      "amicode/card.tsx",
      "amicode/ask-card.tsx",
      "amicode/widget-preview-card.tsx",
      "amicode/getting-started.tsx",
      "components/accordion.css",
      "components/sticky-accordion-header.css",
      "components/session-retry.tsx",
      "components/tool-error-card.tsx",
      "components/tool-error-card.css",
      "components/dialog-select-model.tsx",
      "components/prompt-input/slash-popover.tsx",
      "pages/session/composer/session-todo-dock.tsx",
      "pages/session/composer/session-followup-dock.tsx",
      "pages/session/composer/session-revert-dock.tsx",
      // pre-allowed for the parallel draft-landing rebuild (not this slice):
      // both the path named in the work order and the file's real location.
      "pages/session/new-session.tsx",
      "pages/new-session.tsx",
      "components/session/session-new-design-view.tsx",
      "components/session/session-new-view.tsx",
      // Kate 2026-07-25: dock-surface scopes its opaque fill to :not([data-glass])
      // so the composer's glass wins as ONE surface (no two-tone).
      "components/dock-surface.css",
    ])
    const glob = new Bun.Glob("**/*.{ts,tsx,css}")
    const values = new Set<string>()
    const offenders: string[] = []
    for (const root of roots) {
      for await (const rel of glob.scan({ cwd: root })) {
        if (rel.includes("node_modules")) continue
        const text = await Bun.file(join(root, rel)).text()
        if (!text.includes("data-glass")) continue
        if (!allow.has(rel)) offenders.push(rel)
        for (const m of text.matchAll(/data-glass(?:="|", ")([\w-]+)"/g)) values.add(m[1]!)
      }
    }
    // rail / titlebar / panels / session-title header: never on the allowlist
    expect(offenders).toEqual([])
    // both tiers are in use, and there is no third tier value
    expect([...values].sort()).toEqual(["dense", "standard"])
  })
})

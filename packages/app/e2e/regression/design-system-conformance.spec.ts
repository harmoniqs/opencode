import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { fixture, pageMessages } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

// ============================================================================
// Design-system conformance — the amicode-design-system skill, executed.
//
// The static gate (script/check-design-tokens.mjs) proves components carry no
// literals. This spec proves what actually RENDERS conforms, in both themes:
// the tokens are read live from design-system/tokens.css at runtime, so the numbers
// here can never go stale — if the brand sheet changes, the assertions follow.
//
// Rules (skill section → check):
//   geometry   radius corners ∈ {--radius-*} ∪ {0};  border sides ∈ {0, 1px}
//   shadows    no shadow-as-border (inset / zero-blur ring); SHADOW_POLICY=none
//              bans every box-shadow
//   colour     gold ramp never rendered;  yellow ONLY as black-on-yellow or
//              yellow-on-dark — never a yellow foreground on a light surface
//   type       font-size ∈ {--font-size-*};  font-weight ∈ {400,500,600,650,700}
//   a11y       icon-only buttons carry a label;  no interactive control nested
//              inside another (the titlebar drag-wrapper regression);
//              a visible focus ring on every Tab stop;  reduced motion honoured
// ============================================================================

const schemes = ["light", "dark"] as const
type Scheme = (typeof schemes)[number]

const routes = {
  landing: "/",
  session: `/${base64Encode(fixture.directory)}/session/${fixture.sourceID}`,
} as const

const SHADOW_POLICY = process.env.SHADOW_POLICY ?? "no-border-shadows"

async function bootApp(page: Page, scheme: Scheme, route: string) {
  await page.emulateMedia({ colorScheme: scheme })
  await mockOpenCodeServer(page, {
    sessions: fixture.sessions,
    provider: fixture.provider,
    directory: fixture.directory,
    project: fixture.project,
    pageMessages,
  })
  await page.addInitScript((directory) => {
    localStorage.setItem(
      "opencode.global.dat:server",
      JSON.stringify({
        projects: { local: [{ worktree: directory, expanded: true }] },
        lastProject: { local: directory },
      }),
    )
  }, fixture.directory)
  // oc-theme-preload.js honours ?colorScheme= (the extension's own bridge), so
  // the explicit attribute path and the media-query path are both exercised.
  const sep = route.includes("?") ? "&" : "?"
  await page.goto(`${route}${sep}colorScheme=${scheme}`)
  await expectAppVisible(page.locator('[data-component^="prompt-input"]').first())
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.colorScheme))
    .toBe(scheme)
}

type Violation = { rule: string; el: string; detail: string }
type Sweep = { tokens: Record<string, string>; counts: Record<string, number>; sample: Violation[]; scanned: number }

function sweep(page: Page, policy: string): Promise<Sweep> {
  return page.evaluate((policy) => {
    const root = document.documentElement
    const rootStyle = getComputedStyle(root)

    // ---- tokens, read from the brand sheet's :root rule (never hardcoded) ----
    const tokens: Record<string, string> = {}
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule) || !/:root/.test(rule.selectorText)) continue
        for (const name of Array.from(rule.style)) {
          if (/^--(radius|font-size|space|border-width|accent)/.test(name)) {
            tokens[name] = rootStyle.getPropertyValue(name).trim()
          }
        }
      }
    }
    const px = (v: string) => (v.endsWith("px") ? parseFloat(v) : NaN)
    const radii = new Set(
      Object.entries(tokens)
        .filter(([k]) => k.startsWith("--radius-"))
        .map(([, v]) => px(v))
        .filter((n) => !Number.isNaN(n)),
    )
    const sizes = new Set(
      Object.entries(tokens)
        .filter(([k]) => k.startsWith("--font-size-"))
        .map(([, v]) => px(v))
        .filter((n) => !Number.isNaN(n)),
    )
    const weights = new Set([400, 500, 600, 650, 700])

    // ---- colour helpers -------------------------------------------------------
    const parse = (c: string): [number, number, number, number] | null => {
      let m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/)
      if (m) {
        const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])
        return [+m[1], +m[2], +m[3], a]
      }
      m = c.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/)
      if (m) {
        const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])
        return [+m[1] * 255, +m[2] * 255, +m[3] * 255, a]
      }
      return null
    }
    const hex = (h: string) => {
      const n = parseInt(h.slice(1), 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
    }
    const near = (a: readonly number[] | null, b: readonly number[], tol = 14) =>
      !!a && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol
    const lum = (c: readonly number[]) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    // the dead gold ramp, from the skill — must never render
    const gold = ["#9a7414", "#c99a2e", "#e2b959", "#857a00", "#9c8317", "#f2c94c"].map(hex)
    const accentRaw = tokens["--accent"] ?? ""
    const accent = accentRaw.startsWith("#") ? hex(accentRaw) : parse(accentRaw)
    const effectiveBg = (el: Element): readonly number[] => {
      let node: Element | null = el
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor)
        if (c && c[3] > 0.05) return c
        node = node.parentElement
      }
      return [255, 255, 255]
    }

    // ---- the sweep -------------------------------------------------------------
    const counts: Record<string, number> = {}
    const sample: Violation[] = []
    const CAP = 40
    const describe = (el: Element) => {
      const dc = el.getAttribute("data-component")
      const ds = el.getAttribute("data-slot")
      const id = el.id ? `#${el.id}` : ""
      const cls = Array.from(el.classList).slice(0, 2).map((c) => `.${c}`).join("")
      const label = el.getAttribute("aria-label")
      return `${el.tagName.toLowerCase()}${id}${dc ? `[data-component=${dc}]` : ""}${ds ? `[data-slot=${ds}]` : ""}${cls}${label ? `{${label}}` : ""}`
    }
    const hit = (rule: string, el: Element, detail: string) => {
      counts[rule] = (counts[rule] ?? 0) + 1
      if (sample.filter((s) => s.rule === rule).length < CAP) sample.push({ rule, el: describe(el), detail })
    }
    const interactive = "button, [role='button'], a[href], input, select, textarea, [role='link'], [role='menuitem'], [role='tab']"

    let scanned = 0
    for (const el of Array.from(document.querySelectorAll("*"))) {
      if (el.closest("script, style, template, noscript")) continue
      const cs = getComputedStyle(el)
      if (cs.display === "none" || cs.visibility === "hidden" || el.getClientRects().length === 0) continue
      scanned++
      const isHtml = el instanceof HTMLElement
      const rect = el.getBoundingClientRect()

      // colour rules apply to everything that paints (incl. SVG fills/strokes)
      for (const prop of ["color", "backgroundColor", "borderTopColor", "borderBottomColor", "borderLeftColor", "borderRightColor", "fill", "stroke", "outlineColor"] as const) {
        const c = parse(cs[prop])
        if (!c || c[3] < 0.05) continue
        if (gold.some((g) => near(c, g))) hit("gold", el, `${prop}: ${cs[prop]}`)
      }
      if (accent) {
        const bg = parse(cs.backgroundColor)
        const fg = parse(cs.color)
        if (bg && bg[3] > 0.5 && near(bg, accent) && fg && fg[3] > 0.5 && lum(fg) > 0.2)
          hit("yellow-fill-needs-ink", el, `yellow fill with non-ink text color: ${cs.color}`)
        if (fg && fg[3] > 0.5 && near(fg, accent)) {
          const under = effectiveBg(el)
          if (lum(under) > 0.35) hit("yellow-on-light", el, `yellow foreground over light surface (bg ${under.map(Math.round).join(",")})`)
        }
      }

      if (!isHtml) continue

      // geometry: radius ∈ tokens ∪ {0} ∪ {full}
      for (const corner of ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"] as const) {
        const v = cs[corner]
        if (v === "0px" || v === "50%") continue
        const n = px(v.split(" ")[0])
        const full = n >= 999 || (rect.width > 0 && n >= Math.min(rect.width, rect.height) / 2 - 0.5)
        if (Number.isNaN(n) || (!radii.has(n) && !full)) hit("radius", el, `${corner}: ${v} (tokens: ${[...radii].join("/")}px)`)
        break // one corner per element is enough for the report
      }
      // geometry: border sides ∈ {0, 1px}
      for (const side of ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"] as const) {
        const n = px(cs[side])
        if (n !== 0 && Math.abs(n - 1) > 0.01) {
          hit("border-width", el, `${side}: ${cs[side]}`)
          break
        }
      }
      // shadows
      const sh = cs.boxShadow
      if (sh && sh !== "none") {
        // a shadow is a border when it is inset or a zero-blur ring — but only if
        // it actually paints: Tailwind's ring reset leaves transparent 0-spread
        // layers (`rgba(0,0,0,0) 0px 0px 0px 0px`) on many elements
        const layers = sh.split(/,(?![^(]*\))/).map((l) => l.trim())
        const isBorderShadow = layers.some((l) => {
          const c = parse(l)
          if (!c || c[3] < 0.02) return false
          const nums = (l.replace(/rgba?\([^)]*\)|color\([^)]*\)/, "").match(/-?\d*\.?\d+px/g) ?? []).map(parseFloat)
          const [x = 0, y = 0, blur = 0, spread = 0] = nums
          return /\binset\b/.test(l) ? spread > 0 || blur > 0 : x === 0 && y === 0 && blur === 0 && spread > 0
        })
        if (policy === "none") hit("box-shadow", el, sh.slice(0, 90))
        else if (isBorderShadow) hit("shadow-as-border", el, sh.slice(0, 90))
      }
      // type
      const text = (el.childNodes.length && Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())) || false
      if (text) {
        const fs = px(cs.fontSize)
        if (sizes.size && !sizes.has(fs)) hit("font-size", el, `${cs.fontSize} (tokens: ${[...sizes].join("/")}px)`)
        const fw = parseInt(cs.fontWeight, 10)
        if (!weights.has(fw)) hit("font-weight", el, `${cs.fontWeight}`)
      }
      // a11y: icon-only controls need a name; controls never nest
      if (el.matches("button, [role='button']")) {
        const name = (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || el.textContent || "").trim()
        if (!name) hit("unlabelled-button", el, "no aria-label / text")
        if (el.querySelector(interactive)) hit("nested-interactive", el, `contains ${describe(el.querySelector(interactive)!)}`)
        if (cs.cursor !== "pointer" && !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true")
          hit("cursor", el, `cursor: ${cs.cursor}`)
      } else if (el.matches("a[href]") && el.querySelector(interactive)) {
        hit("nested-interactive", el, `link contains ${describe(el.querySelector(interactive)!)}`)
      }
    }
    return { tokens, counts, sample, scanned }
  }, policy)
}

function report(s: Sweep) {
  const lines = Object.entries(s.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([rule, n]) => {
      const ex = s.sample.filter((v) => v.rule === rule).slice(0, 4).map((v) => `      ${v.el}  →  ${v.detail}`)
      return `  ${rule.padEnd(24)} ${String(n).padStart(4)}\n${ex.join("\n")}`
    })
  return `scanned ${s.scanned} elements\n${lines.join("\n")}`
}

for (const scheme of schemes) {
  for (const [name, route] of Object.entries(routes)) {
    test(`design-system conformance — ${name} · ${scheme}`, async ({ page }, testInfo) => {
      await bootApp(page, scheme, route)
      const s = await sweep(page, SHADOW_POLICY)
      await testInfo.attach(`conformance-${name}-${scheme}.json`, { body: JSON.stringify(s, null, 2), contentType: "application/json" })
      expect(Object.keys(s.tokens).length, "brand tokens must be readable at runtime (design-system/tokens.css loaded)").toBeGreaterThan(5)
      expect(s.counts, `\n${report(s)}\n`).toEqual({})
    })
  }
}

test("every Tab stop shows a visible focus ring (light + dark)", async ({ page }) => {
  const missing: string[] = []
  for (const scheme of schemes) {
    await bootApp(page, scheme, routes.session)
    await page.keyboard.press("Tab")
    for (let i = 0; i < 40; i++) {
      const r = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const w = window as unknown as { __focusSeen?: WeakSet<Element> }
        w.__focusSeen ??= new WeakSet()
        if (w.__focusSeen.has(el)) return null // wrapped around to the first stop
        w.__focusSeen.add(el)
        const cs = getComputedStyle(el)
        const key = el.tagName + "|" + (el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || "") + "|" + Array.from(el.classList).slice(0, 2).join(".")
        const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow !== "none" && /0px 0px 0px \d/.test(cs.boxShadow))
        return { key, ring, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` }
      })
      if (!r) break
      if (!r.ring) missing.push(`${scheme}: ${r.key}  (outline: ${r.outline})`)
      await page.keyboard.press("Tab")
    }
  }
  expect(missing, `\n${missing.join("\n")}\n`).toEqual([])
})

test("prefers-reduced-motion stops running animations (except those the brand sheet keeps on purpose)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bootApp(page, "light", routes.session)
  const animated = await page.evaluate(() => {
    // An animation may keep running under reduced motion ONLY if the brand
    // sheet says so explicitly: a rule inside an `@media (prefers-reduced-motion:
    // reduce)` block that sets a non-zero animation-duration (design-system/components.css
    // does this for the timeline-enter FADE — rise and blur are zeroed, and a
    // withheld block popping in with no signal is worse than a fade).
    const kept: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSMediaRule) || !/prefers-reduced-motion/.test(rule.conditionText)) continue
        for (const inner of Array.from(rule.cssRules)) {
          if (!(inner instanceof CSSStyleRule)) continue
          const d = inner.style.getPropertyValue("animation-duration").trim()
          // a re-applied duration is a declared exception whether literal or var()
          if (d && (d.startsWith("var(") || parseFloat(d) > 0.02)) kept.push(inner.selectorText)
          else if (inner.style.getPropertyValue("animation").trim()) kept.push(inner.selectorText)
        }
      }
    }
    return Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((el) => {
        const cs = getComputedStyle(el)
        if (cs.animationName === "none" || parseFloat(cs.animationDuration) <= 0.02 || cs.animationPlayState === "paused" || el.getClientRects().length === 0) return false
        return !kept.some((sel) => {
          try {
            return el.matches(sel)
          } catch {
            return false
          }
        })
      })
      .slice(0, 25)
      .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute("data-component") ? `[data-component=${el.getAttribute("data-component")}]` : ""}.${Array.from(el.classList).slice(0, 2).join(".")}  →  ${getComputedStyle(el).animationName} ${getComputedStyle(el).animationDuration}`)
  })
  expect(animated, `\n${animated.join("\n")}\n`).toEqual([])
})

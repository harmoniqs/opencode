#!/usr/bin/env node
/**
 * Design-token gate for the amicode UI.
 *
 * The brand is defined in ONE place — packages/app/src/design-polish.css, plus
 * the theme JSON it documents. Components consume tokens; they never carry
 * literals. This script fails the moment a raw literal reappears, so the rule
 * survives contact with future edits instead of decaying quietly.
 *
 * Modelled on harmoniqs-ai/scripts/check-copy-gate.mjs, which does the same job
 * for the website's copy and fonts.
 *
 * Usage: npm run check:design
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const BRAND_SHEET = "packages/app/src/design-polish.css"

// Directories whose components must be fully token-driven.
// Includes the theme loader and the pre-paint script: both write colours
// straight onto <html>, which beats every stylesheet, so a literal there
// overrides the brand invisibly.
// widgets-src renders inside an iframe and cannot read host CSS vars, so it
// must go through the --amc-* bridge; a literal there pins the dashboard.
const SCAN = [
  "packages/app/src",
  "packages/ui/src/amicode",
  "packages/ui/src/theme",
  "packages/app/public",
  "packages/opencode/src/server/amicode/widgets-src",
  // the chat surface ships in the same bundle and must follow the same brand
  "packages/session-ui/src",
]

// Deliberate exemptions — each one is justified in the brand sheet's header.
const EXEMPT = [
  /packages\/ui\/src\/amicode\/connections\.ts$/, // third-party provider logos
  /packages\/ui\/src\/amicode\/run-card\.tsx$/, // theme-independent export poster
  /packages\/ui\/src\/amicode\/brain-engine\.ts$/, // data-viz categorical palette
  /packages\/ui\/src\/amicode\/context-tree-engine\.ts$/, // data-viz categorical palette
  /packages\/app\/src\/components\/terminal\.tsx$/, // no-theme fallbacks, kept in brand
  /packages\/app\/src\/design-polish\.css$/, // the brand sheet itself
  /packages\/app\/src\/index\.css$/, // @font-face declarations
  /\.stories\.tsx$/, // Storybook fixtures, not shipped UI
  /\.test\.tsx?$/,
  /\/e2e\//,
]

const failures = []
const fail = (file, line, msg) => failures.push({ file, line, msg })

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(tsx?|css|js)$/.test(entry)) out.push(p)
  }
  return out
}

// --- rule 1: no raw colour literals on visual properties -------------------
const RAW_COLOUR = /(background|background-color|color|border|border-color|fill|stroke)\s*:\s*["']?(#[0-9a-fA-F]{3,8})\b/g
// --- rule 2: no raw radius, in CSS or as a Tailwind arbitrary value ---------
const RAW_RADIUS = /border-radius\s*:\s*["']?(\d+)px/g
const ARB_RADIUS = /rounded-\[(\d+)px\]/g
// --- rule 3: no hardcoded font stacks --------------------------------------
const RAW_FONT = /font-family\s*:\s*["']?(?!var\()([A-Za-z"][^;,}]*)/g
// --- rule 5: no literal painted directly onto an element via inline style ---
const RAW_INLINE = /(style\.backgroundColor|setAttribute\("content")\s*(=|,)\s*["']#[0-9a-fA-F]{3,8}["']/g

for (const dir of SCAN) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file)
    if (EXEMPT.some((re) => re.test(rel))) continue
    const src = readFileSync(file, "utf8")
    const lines = src.split("\n")
    lines.forEach((text, i) => {
      // skip comments so documentation may name a colour
      const t = text.trim()
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return
      for (const [re, msg] of [
        [RAW_COLOUR, "raw colour literal — use a --v2-* or --accent* token"],
        [RAW_RADIUS, "raw radius — use var(--radius-*)"],
        [ARB_RADIUS, "arbitrary Tailwind radius — use rounded-xs/sm/md/lg/full"],
        [RAW_FONT, "hardcoded font stack — use var(--font-family-text) or var(--font-mono)"],
        [RAW_INLINE, "literal painted onto an element — derive it from the active theme"],
      ]) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(text))) fail(rel, i + 1, `${msg}: ${m[0].trim()}`)
      }
    })
  }
}

// --- rule 4: the brand sheet must actually define the brand ----------------
const sheet = existsSync(join(root, BRAND_SHEET)) ? readFileSync(join(root, BRAND_SHEET), "utf8") : ""
if (!sheet) fail(BRAND_SHEET, 0, "brand sheet is missing")
for (const token of [
  "--accent:",
  "--accent-ink:",
  "--accent-fill-soft:",
  "--accent-edge:",
  "--radius-sm:",
  "--radius-full:",
  "--font-body:",
  "--font-mono:",
]) {
  if (!sheet.includes(token)) fail(BRAND_SHEET, 0, `brand sheet must define ${token}`)
}

if (failures.length) {
  console.error(`\n✗ design-token gate: ${failures.length} violation(s)\n`)
  for (const f of failures) console.error(`  ${f.file}:${f.line}  ${f.msg}`)
  console.error(`\nThe brand lives in ${BRAND_SHEET}. Add a named token there rather than a literal here.`)
  console.error(`If a literal is genuinely required, exempt the file in script/check-design-tokens.mjs`)
  console.error(`AND justify it in the brand sheet's header.\n`)
  process.exit(1)
}
console.log("✓ design-token gate: all styles resolve from the brand sheet")

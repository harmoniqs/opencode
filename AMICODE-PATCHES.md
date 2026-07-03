# AMICODE patch-stack log

Local fork of sst/opencode @ v1.17.3 on branch `local/amicode`. Remote: `upstream` only
(fetch = github.com/sst/opencode, push URL disabled to `no_push_disabled`). Never push.

## Build recipe (v1.17.3)

Toolchain: bun 1.3.14 (`~/.bun/bin/bun` — must ALSO be on PATH, see gotcha 1). Node/pnpm not used by this repo (pure Bun workspace).

### 1. Install

```bash
cd ~/harmoniqs/opencode
PATH="$HOME/.bun/bin:$PATH" bun install
```

Gotcha 1: plain `~/.bun/bin/bun install` FAILS — `tree-sitter-powershell`'s node-gyp
postinstall shim re-invokes `bun` by name (exit 127: `node-gyp: 3: bun: not found`).
Prepending `~/.bun/bin` to PATH fixes it; install then completes clean (2729 packages,
root postinstall `packages/core fix-node-pty` + husky OK). No source patches needed.

### 2. How the release artifact is produced (recon)

- CI (`.github/workflows/publish.yml`, job `build-cli`) runs `./packages/opencode/script/build.ts`
  with `OPENCODE_VERSION` / `OPENCODE_RELEASE` set, then uploads `packages/opencode/dist/opencode-linux*`.
- `packages/opencode/script/build.ts` is the whole recipe:
  1. imports `script/generate.ts` → fetches `https://models.dev/api.json` (network needed;
     override with `MODELS_DEV_API_JSON=<file>` or `OPENCODE_MODELS_URL`) → inlined as
     `OPENCODE_MODELS_DEV` define.
  2. **Web UI embed**: runs `bun run --cwd packages/app build` (vite build → `packages/app/dist`,
     SolidJS; Sentry plugin auto-disabled without `SENTRY_*` env), then generates an in-memory
     virtual module `opencode-web-ui.gen.ts` that imports every dist file `with { type: "file" }`
     and exports a `{ "relative/path": embedded-file-path }` map. Skip with `--skip-embed-web-ui`.
  3. `Bun.build({ compile: { target: "bun-linux-x64", outfile: "dist/opencode-linux-x64/bin/opencode" }, ... })`
     — i.e. `bun build --compile`, minified ESM, entrypoints `src/index.ts` + opentui
     `parser.worker.js` + `src/cli/tui/worker.ts` + the generated web-ui module.
  4. `--single` limits targets to current platform (native, non-baseline, non-musl);
     `--skip-install` skips the cross-platform `bun install --os=* --cpu=*` prebuild pulls
     (only needed for cross-compiling; keeps the tree clean).
  5. Runs its own smoke test (`<binary> --version`).
  - Version/channel come from `packages/script/src/index.ts` (`Script`): without env it fetches
    npm + uses the git branch as channel → set `OPENCODE_VERSION=1.17.3` (forces channel
    `latest`, keeps `Script.release` false so no `gh release upload` runs).

### 3. Exact local build command (worked)

```bash
cd ~/harmoniqs/opencode/packages/opencode
PATH="$HOME/.bun/bin:$PATH" OPENCODE_VERSION=1.17.3 bun run script/build.ts --single --skip-install
# artifact: packages/opencode/dist/opencode-linux-x64/bin/opencode
# convenience copy: ~/harmoniqs/opencode/dist/opencode-local
```

### 3b. Smoke test (2026-07-03, local build)

```bash
./dist/opencode-local serve --port 14096
```
- startup log: `opencode server listening on http://127.0.0.1:14096` (+ warning: `OPENCODE_SERVER_PASSWORD` not set → unsecured)
- `GET /` → 200, SolidJS app HTML shell (`<title>OpenCode</title>`, `<div id="root">`, script `/assets/index-BfWaaOZM.js` = the exact vite-build hash → served from the binary embed, no separate app step needed)
- `GET /assets/index-BfWaaOZM.js` → 200 text/javascript 1,694,088 B
- `GET /health` → 200 but it's the SPA index.html fallback — **no dedicated /health route at v1.17.3**
- `POST /session {}` → 200 `{"id":"ses_…","slug":"shiny-cabin","projectID":"…","directory":…,"cost":0,"tokens":{…},"title":"New session - …","version":"1.17.3","time":{created,updated}}`
- `GET /session` → 200 array of sessions; `GET /doc` → 200 (OpenAPI)

### 4. How the SolidJS app is served

`packages/opencode/src/server/shared/ui.ts`:
- Compiled binary: `import("opencode-web-ui.gen.ts")` resolves → `serveEmbeddedUIEffect`
  serves the embedded `packages/app/dist` files (SPA fallback to `index.html`), with CSP
  derived from the inline theme-preload script hash.
- Run-from-source (`bun run src/index.ts serve`): the generated module doesn't exist →
  catch → **reverse-proxies https://app.opencode.ai** instead. So run-from-source does NOT
  serve local app assets; only the compiled binary embeds them. (Env kill-switch:
  `disableEmbeddedWebUi` → proxy mode.)

## Branding map (v1.17.3)

User-visible brand sites in the served web app (packages/app + packages/ui), enumerated at tag v1.17.3.
Format: file:line — string/asset — replacement. [desktop] = ships only in the Electron desktop app, not the served web app.

| # | site | current | replacement |
|---|------|---------|-------------|
| 1 | packages/app/index.html:6 | `<title>OpenCode</title>` | `<title>Amicode</title>` |
| 2 | packages/app/index.html:8 | svg favicon `/favicon-v3.svg` | `/amico.svg` (new brand asset) |
| 3 | packages/ui/src/assets/favicon/site.webmanifest:2-3 (symlinked as packages/app/public/site.webmanifest) | `name`/`short_name` "OpenCode" | "Amicode" |
| 4 | packages/ui/src/assets/favicon/amico.svg (new; symlinked as packages/app/public/amico.svg, matching the repo's favicon symlink pattern) | (new) | favicon: brand-accent disc `#FFF676` + amico face (from amicode `packages/extension/media/amico.svg`, on-accent `#000`) |
| 5 | packages/ui/src/components/favicon.tsx:10 | `apple-mobile-web-app-title` "OpenCode" | "Amicode" (+ svg icon Link `/amico.svg`) |
| 6 | packages/ui/src/components/logo.tsx | `Logo` = OPENCODE letterform SVG; `Mark`/`Splash` = "O" mark | `Logo` → AMICODE wordmark text; `Mark`/`Splash` → amico face (inlined from amico.svg). Rendered at: home.tsx:1151 (watermark), pages/error.tsx:281, session-side-panel.tsx, session-new-view.tsx, app.tsx (loading splash) |
| 7 | packages/ui/src/v2/components/wordmark-v2.tsx | OPENCODE glyph SVG | AMICODE wordmark text (rendered on session-new-design-view.tsx new-session screen) |
| 8 | packages/ui/src/theme/context.tsx:72 | theme display label `opencode: "OpenCode"` | `"Amicode"` (key `opencode` untouched — storage/config contract) |
| 9 | packages/app/src/i18n/en.ts | 30 brand mentions ("…models in OpenCode", "OpenCode Desktop", update/error/settings copy) | "Amicode" (29 sites; "OpenCode Zen" kept, see below) |
| 10 | packages/app/src/desktop-menu.ts:75 [desktop] | menu label "OpenCode" | "Amicode" |
| 11 | packages/app/src/wsl/settings-model.ts:17-18 [desktop, Windows/WSL] | "Install OpenCode"/"Update OpenCode" | "Install/Update Amicode" |
| 13 | packages/ui/src/components/logo.css | `[data-component="logo-mark"]` aspect-ratio 4/5 (old 16x20 viewBox) | aspect-ratio 1/1 (new square amico mark) |
| 12 | packages/ui/src/theme/themes/oc-2.json (default theme) | accent tokens `v2-{background,text,icon}-*accent*` = blue-600/700 (light), blue-400/300 (dark) | Harmoniqs accent `#FFF676` (brand.css `--color-accent`): dark text/icon/bg-accent → `#FFF676`, hover `#FFFA9E`; light bg-accent → `#FFF676`, light text/icon-accent → derived dark shades `#857A00` / hover `#6B6200` (raw `#FFF676` is unreadable on light bg) |

Deliberately left stock (and why):
- 25 non-English app locales + all ui locales brand strings — demo is English; en.ts is the default/fallback dictionary; bulk-editing translations is churn without review.
- "OpenCode Zen" (app en.ts:139) and "OpenCode Go" (ui en.ts:58) — proper names of the external commercial model-gateway services the binary still connects to; renaming would misrepresent a third-party service.
- Shiki syntax-theme name "OpenCode" (ui context/marked.tsx, ui pierre/worker.ts, ui pierre/index.ts) — cross-module string identifier, not user-visible; partial rename breaks code highlighting.
- Font names "OpenCode Sans/Mono" — CSS font-family identifiers.
- Binary icon assets (favicon-96x96-v3.png, favicon-v3.ico, apple-touch-icon-v3.png, web-app-manifest-*.png, social-share.png) — need image regeneration tooling; svg favicon takes precedence in modern browsers. Morning follow-up.
- All internal identifiers: `opencode-titlebar-*` DOM ids, `opencode-*` localStorage keys, `OPENCODE_*` env vars, config keys, API/SDK strings, `@opencode-ai/*` imports, `oc-theme-preload-script` id (the server CSP hash regex in packages/opencode/src/server/shared/ui.ts matches this exact id).
- Storybook/stories files — dev-only, not in the served app.
- desktop-menu.ts:203 "OpenCode Documentation" [desktop] — the link target IS opencode.ai/docs; relabeling would misattribute upstream docs.

## Branded binary (v1.17.3 + L1, built 2026-07-03)

Rebuilt with the exact T3 recipe (`OPENCODE_VERSION=1.17.3 bun run script/build.ts --single --skip-install` in packages/opencode, `~/.bun/bin` on PATH).

- Binary: `~/harmoniqs/opencode/dist/opencode-local` (copy of `packages/opencode/dist/opencode-linux-x64/bin/opencode`)
- sha256 (L1 branding build): `930fd0457d9ffb389027ca23d09cc0b1ab9d6aaa1a2022864dc8e1b748d3c5f4`
- sha256 (L1+L2 build, current): `8f4c6751ca5c112e25652de7adb9a3b6b710f64fa4de8fb53ceb8949cf3e1ecb` — L2 verify: `GET /` → 200 `<title>Amicode</title>`; card code compiled into the lazy session chunk (`/assets/session-U3zHIEN6.js` → 200, `amicode-card` ×5, `AMICODE` ×1); `POST /session {}` → 200 session object (no regression)
- sha256 (L1+L2+L3 build, current): `7f60c60de1a23c82cd6477f2b6e67bb3956982a23cdbbc57db731f56927c5eff` — L3 verify: `GET /` → 200 `<title>Amicode</title>`; session chunk `/assets/session-BQYupOEO.js` → 200 (`amicode-entity-rail` ×1, `amicode-card` ×3); `POST /session {}` → 200 session object (no regression). Vendored copy refreshed to the same sha (cp over the live file per coordinator — running server keeps the old inode; Aaron picks it up on next debug restart).
- Vendor swap refreshed (2026-07-03): L1+L2 binary copied over `~/harmoniqs/amicode/packages/extension/vendor/opencode/linux-x64/opencode` (idle-checked first; `--version` → 1.17.3; backup remains at `opencode.stock`). NOTE: the `.sha256` sidecar is left at the MANIFEST value on purpose — `fetch:opencode` skips download only when sidecar == manifest sha, so overwriting it with the local binary's hash would make the next fetch re-download stock and clobber the swap.
- Verify (serve --port 14096): `GET /` → 200 with `<title>Amicode</title>` + `href="/amico.svg"`; `GET /amico.svg` → 200 image/svg+xml 441 B; main JS `/assets/index-CeQonklQ.js`: `AMICODE` ×1 (wordmark; WordmarkV2 lives in the lazy session chunk), `Amicode` ×31 (i18n/meta); `POST /session {}` → 200 session object, version 1.17.3 (no functional regression); `/site.webmanifest` → name/short_name Amicode. (`/health` is SPA fallback at this tag — not a health check.)

## Patch stack

1. `4e20def26e` — amicode: build fixes for local v1.17.3 reproduction (AMICODE-PATCHES.md, bun.lock ghostty-web drift)
2. `c566a17db7` — amicode: L1 branding — AMICODE wordmark, logo, accent. Files: packages/app/index.html, packages/ui/src/assets/favicon/{amico.svg,site.webmanifest}, packages/app/public/amico.svg (symlink), packages/ui/src/components/{favicon.tsx,logo.tsx,logo.css}, packages/ui/src/v2/components/wordmark-v2.tsx, packages/ui/src/theme/context.tsx, packages/ui/src/theme/themes/oc-2.json, packages/app/src/i18n/en.ts, packages/app/src/desktop-menu.ts, packages/app/src/wsl/settings-model.ts. User-visible strings/assets ONLY — no identifier, config-key, env-var, or API renames.
3. `1929d3db09` — amicode: L2 renderer slot — amicode_* tool cards.
   - Renderer location: the session timeline (packages/app/src/pages/session/message-timeline.tsx:1057) delegates every message part to `Part` in **packages/ui/src/components/message-part.tsx**; tool parts dispatch at `PART_MAPPING["tool"]` via `ToolRegistry.render(part().tool) ?? GenericTool`. (Errored tool parts branch to ToolErrorCard *before* this dispatch, so amicode errors keep stock error rendering.)
   - Sole stock-code touch: packages/ui/src/components/message-part.tsx — import at **line 38**, dispatch branch at **lines 1392–1395**: `/^amicode_/.test(part().tool) ? AmicodeToolCard : (ToolRegistry.render(...) ?? GenericTool)`. Prefix regex (not per-name ToolRegistry registration) so future amicode_* tools (to_hardware, calibrate) auto-match.
   - New files (all presentation): packages/ui/src/amicode/card.tsx (AmicodeToolCard: "AMICODE · <stage>" header in accent `var(--v2-text-text-accent)`, 3px accent left border `var(--v2-icon-icon-accent)`, monospace body = tool output, falls back to pretty-printed input while running); packages/ui/src/amicode/stage.ts (pure stage mapping: pick_system→System, set_model→Model, formulate→Formulation, solve→Run, else de-underscored+capitalized); packages/ui/src/amicode/stage.test.ts (3 tests, `bun test src/amicode` → 3 pass).
   - Visual check of the card in a live session = morning (headless smoke can't exercise a tool-call part without a model turn).
4. (L3, same patch family) — amicode: L3 entity rail + collapsed tool chips. Live feedback (Aaron, 2026-07-03): full cards repeated per call cluttered the transcript, and the raw tool return is agent-directed text (for the MODEL, not the human).
   - AmicodeToolCard collapsed to a one-line chip "AMICODE · <stage> updated ✓" (or "running…"); monospace body REMOVED on purpose — do not resurrect it.
   - NEW packages/ui/src/amicode/entity-rail.tsx — `AmicodeEntityRail`: compact sticky row, chips System / Formulation / Run showing the LATEST state per stage, derived client-side by scanning the session's amicode_* tool parts (messages ULID-sorted; later parts win). Renders nothing until the session has ≥1 amicode_* part (non-amicode sessions stay stock); stages without parts show a dimmed "—". pick_system AND set_model both feed the System chip.
   - NEW packages/ui/src/components/amicode-entity-rail.tsx — one-line re-export shim so packages/app imports resolve through the EXISTING `"./*": "./src/components/*.tsx"` export wildcard (packages/ui/package.json untouched).
   - stage.ts extended with pure helpers `railStage` + `chipTextFromSummary` (tolerant summary→chip parser: first parenthetical, comma tokens, rewrites omega=→ω=, delta=→δ=, drive_max=→cap, "N levels"→"N lvl", `=-`→`=−`; unknown tokens pass through raw; no/empty parenthetical → undefined). stage.test.ts: 9 tests / 20 expects, `bun test src/amicode` → 9 pass.
   - Stock-code touch #2 (rail mount): packages/app/src/pages/session/message-timeline.tsx — import at **line 20**, mount at **lines 1583–1584** (bottom of the sticky `data-session-title` header inside the timeline ScrollView: once per session view, sticky at top, no prompt overlap, no scroll theft; rail hidden when `showHeader()` is false — acceptable v0). Total stock-file touches across L2+L3: message-part.tsx (dispatch) + message-timeline.tsx (mount).

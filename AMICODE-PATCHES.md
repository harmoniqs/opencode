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

## Patch stack

1. `4e20def26e` — amicode: build fixes for local v1.17.3 reproduction (AMICODE-PATCHES.md, bun.lock ghostty-web drift)
2. (this commit) — amicode: L1 branding — AMICODE wordmark, logo, accent. Files: packages/app/index.html, packages/ui/src/assets/favicon/{amico.svg,site.webmanifest}, packages/app/public/amico.svg (symlink), packages/ui/src/components/{favicon.tsx,logo.tsx,logo.css}, packages/ui/src/v2/components/wordmark-v2.tsx, packages/ui/src/theme/context.tsx, packages/ui/src/theme/themes/oc-2.json, packages/app/src/i18n/en.ts, packages/app/src/desktop-menu.ts, packages/app/src/wsl/settings-model.ts. User-visible strings/assets ONLY — no identifier, config-key, env-var, or API renames.

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

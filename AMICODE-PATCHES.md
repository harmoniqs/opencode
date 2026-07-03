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
4. `9829bd1864` — amicode: L3 entity rail + collapsed tool chips. Live feedback (Aaron, 2026-07-03): full cards repeated per call cluttered the transcript, and the raw tool return is agent-directed text (for the MODEL, not the human).
   - AmicodeToolCard collapsed to a one-line chip "AMICODE · <stage> updated ✓" (or "running…"); monospace body REMOVED on purpose — do not resurrect it.
   - NEW packages/ui/src/amicode/entity-rail.tsx — `AmicodeEntityRail`: compact sticky row, chips System / Formulation / Run showing the LATEST state per stage, derived client-side by scanning the session's amicode_* tool parts (messages ULID-sorted; later parts win). Renders nothing until the session has ≥1 amicode_* part (non-amicode sessions stay stock); stages without parts show a dimmed "—". pick_system AND set_model both feed the System chip.
   - NEW packages/ui/src/components/amicode-entity-rail.tsx — one-line re-export shim so packages/app imports resolve through the EXISTING `"./*": "./src/components/*.tsx"` export wildcard (packages/ui/package.json untouched).
   - stage.ts extended with pure helpers `railStage` + `chipTextFromSummary` (tolerant summary→chip parser: first parenthetical, comma tokens, rewrites omega=→ω=, delta=→δ=, drive_max=→cap, "N levels"→"N lvl", `=-`→`=−`; unknown tokens pass through raw; no/empty parenthetical → undefined). stage.test.ts: 9 tests / 20 expects, `bun test src/amicode` → 9 pass.
   - Stock-code touch #2 (rail mount): packages/app/src/pages/session/message-timeline.tsx — import at **line 20**, mount at **lines 1583–1584** (bottom of the sticky `data-session-title` header inside the timeline ScrollView: once per session view, sticky at top, no prompt overlap, no scroll theft; rail hidden when `showHeader()` is false — acceptable v0). Total stock-file touches across L2+L3: message-part.tsx (dispatch) + message-timeline.tsx (mount).
5. (final night batch) — amicode: ask buttons + start-screen wordmark + default locale en.
   a. ASK BUTTONS (`amicode_ask`, 7th tool in the pack). NEW packages/ui/src/amicode/{ask.ts, ask-bridge.ts, ask-card.tsx, ask.test.ts}.
      - `parseAskInput` (pure): reads `question`/`options[]` from the tool part's INPUT args; trims, drops non-string/empty options; malformed → undefined → AmicodeToolCard falls back to the collapsed chip.
      - `latestAssistantMessageID` (pure): ULID-max over role==="assistant" — staleness guard; buttons render disabled when the part is NOT in the last assistant message, after a click (local `picked` state), or when no bridge is registered (share page/read-only surfaces can never submit).
      - Send path: ask-bridge module signal. The app registers it through the EXISTING rail mount — `AmicodeEntityRail` gained an `onAsk` prop; message-timeline passes `(text) => sdk.client.session.promptAsync({ sessionID, parts: [{type:"text", text}] })` — same endpoint the prompt input's submit uses (`model`/`agent` are OPTIONAL in the server PromptInput schema → session/agent defaults apply). Bridge unregisters on rail unmount.
      - Stock-code touches (L2 family): packages/ui/src/components/message-part.tsx — `messageID={part().messageID}` added to the tool `<Dynamic>` (1 line, needed for the staleness guard); packages/app/src/pages/session/message-timeline.tsx — the existing rail mount now passes `onAsk` (same insertion site as L3).
      - Tests: `bun test src/amicode` → 14 pass / 33 expects (stage 9 + ask 5).
   b. START-SCREEN WORDMARK (L1 family). packages/app/src/components/session/session-new-view.tsx — localized `session.new.title` headline ("Build anything" / "Créez ce que vous voulez") REPLACED by `<Logo class="w-56 max-w-full" />` (AMICODE wordmark component, deliberately NOT localized — brand marks don't translate). Mark (amico face) above and localized repo-path/branch/subtitle lines kept as-is. (The new-design variant session-new-design-view.tsx already renders WordmarkV2 since L1.)
   c. DEFAULT LOCALE = en (L1 family). packages/app/src/context/language.tsx — both init sites (`warm` line ~196 and provider `initial` line ~203) now default `readStoredLocale() ?? "en"` instead of `?? detectLocale()`; an explicit stored preference (`opencode.global.dat:language`) still wins. Rationale: only en.ts is branded tonight. REVERT CONDITION: restore `?? detectLocale()` at both sites once the other locales are branded (`detectLocale` is left in place, currently unreferenced).
   - Batch build (L1+L2+L3+ask/wordmark/locale) sha256: `a236b87fe92043eea6129a4a5b260ca2adc7fe51fc634e49405872973a7a60cb` at both `dist/opencode-local` and the vendored path. Verify: `GET /` → 200 `<title>Amicode</title>`; main chunk `/assets/index-Dwcv_zit.js` → 200, `AMICODE` ×1 (start-screen wordmark now in the MAIN bundle); session chunk `/assets/session-CGaG1HX5.js` → 200, `amicode-ask-card` ×1 + `amicode-entity-rail` ×1; `POST /session {}` → 200 session object; `bun test src/amicode` → 14 pass.
   - ⚠️ Vendor swap while the binary is RUNNING: plain `cp` fails with ETXTBSY. Use write-temp + `mv -f` (rename) — the running process keeps the old inode, next restart picks up the new file. Done that way this batch.
6. (getting-started) — amicode: start-screen getting-started block + starter chips.
   - NEW packages/ui/src/amicode/getting-started.tsx — `AmicodeGettingStarted` (`data-component="amicode-getting-started"`): en-only tagline "Pulse design, from conversation to calibrated waveform." (not localized, consistent with patch 5c), dimmed how-it-works row "① Describe your system / ② Watch the solve live / ③ Send to hardware & calibrate" (flex-wrap, nowrap per step → wraps up to 3 lines on narrow panes), three accent-bordered starter chips (ask-button family) exported as `AMICODE_STARTERS`. Static content — no unit tests needed.
   - NEW packages/ui/src/components/amicode-getting-started.tsx — re-export shim (same wildcard-export pattern as the rail).
   - Stock touch (L1 family): packages/app/src/components/session/session-new-view.tsx — mounts the block under the wordmark, above the path/branch lines (kept).
   - Submit wiring = DIRECT (not the prefill fallback): `startPrompt` sets the composer draft via `usePrompt().set([{type:"text", content, start:0, end:len}], len)` — the submit button's `blank()` gate reads the SAME prompt store (prompt-input.tsx:317) — then next frame clicks the composer's own `[data-action="prompt-submit"]:not([disabled])` button so the REAL `handleSubmit` runs (worktree resolution, session.create, promote/handoff, navigation, optimistic UI, composer model/agent selection — none of it replicated). Degradation: if no enabled submit button exists, the text stays pre-filled and `[data-component="prompt-input"]` gets focus (user hits Enter).
7. (live-session UX bundle, 2026-07-03) — four parts:
   a. ASK-CARD GUARD FIX (live bug: buttons rendered locked). Old criterion "part must be in the LAST assistant message" was too strict — the model streams text/messages after calling amicode_ask. New criterion: **buttons stay active until a USER message exists later (ULID order) than the card's message** (`hasUserReplyAfter(messages, messageID)` replaces `latestAssistantMessageID` in ask.ts, the AskBridge interface, the rail registration, and the card's `active()`); local `picked` lock and no-bridge disable unchanged.
   b. ASK OPTION DETAILS. `parseAskInput` accepts optional `details: string[]` (Track-A commit 778e1bb): validated against the RAW options length, all-strings; mismatch/non-strings → treated as absent (never rejects the card); alignment with options preserved through the invalid-option filter. ask-card renders each detail as a dim 11px second line inside its button (`data-slot="amicode-ask-option-detail"`).
   c. COMPOSER PLACEHOLDER. Rotation = i18n keys via `EXAMPLES` array (packages/app/src/components/prompt-input.tsx:99). en.ts `prompt.example.1-5` values → the five pulse-design examples; EXAMPLES trimmed to those five keys (stock touch; keys 6-25 left dormant in every dictionary for easy revert). "Ask anything..." prefix (`prompt.placeholder.normal`) unchanged.
   d. AMICO RELABEL (three-layer vocabulary: Amico = persona, Amicode = product). In-chat display labels only — entity-rail header, collapsed chip, ask-card header: "AMICODE" → "AMICO". Start-screen wordmark, `<title>`, favicon/manifest, getting-started block and all other chrome stay AMICODE/Amicode. All `data-component`/`data-slot` `amicode-*` identifiers unchanged. No unit test asserted the display label.
   - Tests after bundle: `bun test src/amicode` → 20 pass / 41 expects.
   - Bundle build sha256: `1c6fede30dc1c8eac7a4d544e0001b54b8e6399268c56ab2ee29582b7a80ffe2` (dist/opencode-local + vendored path, write-temp + mv -f swap). Verify: `GET /` → 200 `<title>Amicode</title>`; session chunk `session-IeOwC1wP.js` → ask-card ×1 + rail ×1 markers, display label `AMICO` ×3; composer-state chunk `session-composer-state-VTIq3S7H.js` → getting-started ×1; en dictionary chunk `index-B2YGTpT0.js` → "Warm-start from my last pulse" ×1; `POST /session {}` → 200.
8. (brand mark v2) — amicode: "digi" Harmoniqs H-robot replaces the amico smile on the fork's brand-mark surfaces.
   - packages/ui/src/components/logo.tsx — `Mark`/`Splash` render the H-robot (inlined shapes; body path `fill="currentColor"` riding `color: var(--icon-strong-base)`, display rect `#0A0A0A`, glyphs `#FFF676`); viewBox `0 0 64 56` (8:7, NOT square). `Logo` wordmark, data-component hooks, and prop pass-through unchanged — call sites untouched.
   - packages/ui/src/components/logo.css — `[data-component="logo-mark"]` aspect-ratio 1/1 → 8/7.
   - packages/ui/src/assets/favicon/amico.svg — replaced with the FAVICON variant: 72×72 yellow chip (`rx=14`, `#FFF676`) + mark in `<g transform="translate(4,8)" color="#17181A">`. Public symlink `packages/app/public/amico.svg` follows automatically; favicon.tsx/index.html links and site.webmanifest unchanged (verified resolving).
   - Canonical source of the mark also lives at amicode:`packages/extension/media/amico.svg` — kept in sync MANUALLY; if the mark changes again, update both.
   - Brand-v2 build sha256: `0de38685480961a70775c64d81f46ed3a4e8197b2af6ebe7074bc0fceaa4aab3` (dist/opencode-local + vendored path, write-temp + mv -f swap). Verify: `GET /` → 200 `<title>Amicode</title>`; `GET /amico.svg` → 200 image/svg+xml 1324 B (yellow chip rx=14 + robot path); main chunk `index-Drab4s7t.js` → robot path `M2 2h16v14h28V2h16v52` ×1 AND `AMICODE` wordmark ×1; `POST /session {}` → 200; `bun test src/amicode` → 20 pass.
9. (native question form branding) — consolidation: opencode's NATIVE question tool (packages/opencode/src/tool/question.ts, rendered by the question dock) is now the ONE ask mechanism; `amicode_ask` is DEPRECATED (L0 prompts updated on the night branch).
   - packages/app/src/pages/session/composer/session-question-dock.tsx (~line 434, inside the DockPrompt `header` fragment): "AMICO · Question" brand line inserted INSIDE `question-header-title`, above the progress summary — same label family as amicode-ask-card (accent AMICO, faint ·, base Question); display-only, no behavior change (radio options, descriptions, multiple, custom answer row, progress header all untouched).
   - packages/ui/src/components/message-part.css (question block, `[data-slot="question-body"]`): accent left border `3px solid var(--v2-icon-icon-accent)` — matches the rail/cards treatment.
   - LEGACY pending morning review: packages/ui/src/amicode/{ask-card.tsx, ask-bridge.ts, ask.ts hasUserReplyAfter/parseAskInput} + the message-part.tsx amicode_ask routing remain in place as the legacy renderer for deprecated amicode_ask calls — do NOT remove tonight.
   - Question-branding build sha256: `69070a33f8d5ebdff4f38f3d68b4be5625398b581accfb577945e1e9d522f44c` (dist/opencode-local + vendored path, write-temp + mv -f swap). Verify: `GET /` → 200 `<title>Amicode</title>`; AMICO display labels total 4 — session chunk `session-BfBMMSAH.js` ×3 (rail/chip/ask-card) + composer-state chunk `session-composer-state-D8UQPTE4.js` ×1 (question dock, `amicode-question-brand` slot ×1 — the dock compiles into the COMPOSER chunk, not the session chunk); css asset carries the accent border rule ×1; `POST /session {}` → 200; `bun test src/amicode` → 20 pass.
10. (H-glyph working spinner) — amicode: the session timeline's working/thinking spinner is the H-robot glyph.
   - Design v2 per Aaron (binary-eye-frames concept DROPPED before commit): small monochrome H silhouette with the screen slit knocked out (single path, fill-rule=evenodd, currentColor — mount-site `style={{color}}` passes through like stock Spinner).
   - Animation choice: gentle opacity pulse reusing the EXISTING `pulse-opacity` keyframes (styles/animations.css, 0.4→1) at 1.2s — chosen over Claude-style rotation because the H is non-radial and tumbles/blurs at 16px, and pulse matches the stock spinner's own animation language. prefers-reduced-motion: static glyph, NO animation (matchMedia guard; the repo's CSS-file media-query pattern doesn't cover inline animations).
   - NEW packages/ui/src/amicode/spinner.tsx (`AmicoSpinner`, data-component="amico-spinner") + packages/ui/src/components/amico-spinner.tsx re-export shim. No pure frame logic remained after the design change → no new unit tests.
   - Stock touch: packages/app/src/pages/session/message-timeline.tsx — import swap + `<AmicoSpinner class="size-4" .../>` replacing `<Spinner .../>` at the sticky-header working indicator (~line 1359); unused Spinner import removed. Other spinner sites left STOCK (list for morning): session-header.tsx:362 (header circle), home.tsx:848, sidebar-items.tsx:66+124, sidebar-workspace.tsx:102, dialog-connect-provider.tsx.
   - Spinner build sha256: `83f5a9fd3b35155bf2014115b54a27ef3d9542e8b14c7a83925175a73c1f7ebc` (dist/opencode-local + vendored path, write-temp + mv -f swap). Verify: `GET /` → 200 `<title>Amicode</title>`; session chunk `session-CMqmIgk2.js` → `amico-spinner` ×1 + `pulse-opacity 1.2s` ×1; `POST /session {}` → 200; `bun test src/amicode` → 20 pass.
   - SWEEP (Aaron: "no spinner" — the sticky-header site isn't where he looks): AmicoSpinner now at ALL visible working indicators: session-header.tsx:362 (top-right circle, size-3.5 + tint), message-part.tsx task-tool running row (~1841; inline 16x14 style because basic-tool.css sizes only [data-component="spinner"]), session-retry.tsx:58 (retry card), home.tsx:848, sidebar-items.tsx:66+124, sidebar-workspace.tsx:102 — each with the site's exact class/tint. Stock Spinner imports removed from swapped files. Left stock on purpose: dialog-connect-provider.tsx (provider setup, rarely seen), wsl/dialog-add-server.tsx (Windows-only).
   - Sweep build sha256: `8aa718ad957607ff4d4da563d836a54451420dfb98d390a722ec09217bf2383c` (dist/opencode-local + vendored path, write-temp + mv -f swap). Verify: `GET /` → 200 `<title>Amicode</title>`; `amico-spinner` ×1 in served MAIN chunk `index-A7nOnjqy.js` — the component definition hoisted to the main bundle now that main-route sites (home/sidebar) import it; all call sites share that one definition, so marker count = 1 definition, not per-site; `pulse-opacity 1.2s` wired ×1; `POST /session {}` → 200; `bun test src/amicode` → 20 pass.

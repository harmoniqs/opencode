# Upstream sync report — 2026-08-16

Upstream: anomalyco/opencode `dev` @ `3fd77ae980c9e68eccd10f1c396f32c6e3965046` (`3fd77ae980`, version `1.18.18`)
Base: harmoniqs/opencode `local/amicode` @ b24d43d9f2
Branch: `notturno/merge-upstream-2026-08-16`

## Result
Merge exited with conflicts — **hand-merge required** (32 files).

## Conflict files
```
bun.lock packages/app/src/app.tsx packages/app/src/components/debug-bar.tsx packages/app/src/components/prompt-input/placeholder.ts packages/app/src/components/session/session-context-tab.tsx packages/app/src/components/titlebar.tsx packages/app/src/context/language.tsx packages/app/src/desktop-menu.ts packages/app/src/entry.tsx packages/app/src/i18n/ar.ts packages/app/src/i18n/da.ts packages/app/src/i18n/de.ts packages/app/src/i18n/fr.ts packages/app/src/i18n/ja.ts packages/app/src/i18n/ko.ts packages/app/src/i18n/pl.ts packages/app/src/i18n/th.ts packages/app/src/i18n/uk.ts packages/app/src/pages/layout.tsx packages/app/src/pages/session.tsx packages/app/src/pages/session/timeline/message-timeline.tsx packages/app/src/wsl/settings-model.test.ts packages/app/src/wsl/settings-model.ts packages/opencode/src/server/shared/ui.ts packages/opencode/src/session/system.ts packages/opencode/test/server/httpapi-ui.test.ts packages/session-ui/package.json packages/session-ui/src/components/markdown-stream.test.ts packages/session-ui/src/components/markdown.tsx packages/session-ui/src/components/message-part.tsx packages/session-ui/src/v2/components/session-review-v2.css packages/ui/src/context/marked.tsx
```

## Full conflict list
```

```

## Next steps
1. `git fetch upstream && git checkout notturno/merge-upstream-2026-08-16 && git merge upstream/dev`
2. Resolve per AMICODE-PATCHES.md policy:
   - adopt upstream bugfixes wholesale
   - keep fork branding/KaTeX/AmicoSpinner/entity-rail/bug-dock
   - re-delete `debug-bar.tsx` (fork keeps it deleted)
   - `bun.lock` → theirs + `bun install`
   - i18n: re-run `script/translate-app.ts` or copy EN fallbacks
3. Update `AMICODE-PATCHES.md` header + new sync section, bump `package.json` versions to `1.18.18`.
4. Verify: `env -u OPENCODE_CONFIG_CONTENT -u OPENCODE_SERVER_PASSWORD bun test`, `bun run typecheck`, and `OPENCODE_CHANNEL=dev` build gate (`grep newLayoutDesigns`).
5. Push — PR auto-updates.

_Generated manually (amicode unavailable) on 2026-08-16_

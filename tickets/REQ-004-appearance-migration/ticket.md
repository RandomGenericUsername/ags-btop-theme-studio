---
id: REQ-004
title: "Migrate the studio to the v2 Appearance plane"
kind: requirement
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-004/
branch: ticket/REQ-004-appearance-migration
---

# Migrate the studio to the v2 Appearance plane

## Requirement

The contracts v0.7.0 / platform v0.9.0 Appearance plane replaces the split
Theme + Skin pair with one composed generation: `createAppearance({ configDir })`
applies palette + skin + mode from the single `current/appearance` hop, and
`createAppearanceRefreshHandler(appearance, work?)` always re-applies the whole
appearance before app-owned derived work. Migrate this app without a redesign:

- `app.tsx` holds one module-level
  `const appearance = createAppearance({ configDir: "ags-btop-studio" })`
  and calls `appearance.apply()` in `main()` instead of `theme.apply()` /
  `skin.apply()`.
- The one `palette-refresh` handler becomes
  `createAppearanceRefreshHandler(appearance, work)`. The app-owned work is the
  existing pending-aware `refreshStudioPalette()` / base-map reload; staged
  edits, selected theme, picked key, scope, save target and preview controls
  still survive. No new request command is added.
- The namespaced layout tokens that exist for this app are consumed in TSX:
  `layout.ags-btop-studio.left-width` (fallback `280`) and `right-width`
  (fallback `320`) feed the existing pane size requests; `.peek()` is used
  where GTK needs a plain number.
- `style.css` remains the bundled glass fallback; no structure, class or
  behavior change.
- The local pin moves to `ags-platform` v0.9.0 / `contracts` v0.7.0, with local
  `.dev/` overrides for the gates.
- Source-level tests assert the module-level appearance apply/configDir, the
  `createAppearanceRefreshHandler` wiring, the layout-token reads and the
  retained `style.css` fallback, and reject the retired theme/skin applies.

## Acceptance

- [x] `app.tsx` creates one module-scope Appearance for
      `configDir: "ags-btop-studio"` and applies it in `main()`; no
      `theme.apply()` or `skin.apply()` survives.
- [x] The request handler is `createAppearanceRefreshHandler(appearance, work)`
      and the work preserves the pending-aware `refreshStudioPalette()` /
      base-map reload; no new request command exists.
- [x] `layout.ags-btop-studio.left-width` / `right-width` are read with their
      `280` / `320` fallbacks and drive the pane size requests.
- [x] `style.css` is still bundled through `app.start({ css: style })` and
      remains the glass fallback; no structure/class/behavior change.
- [x] `Makefile` pins `ags-platform` v0.9.0 and `contracts` v0.7.0; local
      `.dev/` links and every pin assertion agree.
- [x] Source-level test covers appearance apply/configDir/handler, the layout
      tokens, the pending-aware reload and `style.css`.
- [x] `make gates` passes; v0.4.0 (next minor) is tagged after the
      fast-forward merge.

## Evidence

Planning commit: `250f050` — `docs(REQ-004): open appearance migration ticket`.
Implementation commit: `f2aa219` — `feat(REQ-004): migrate to the v2 appearance
plane`. Worktree `.worktrees/REQ-004/`, branch
`ticket/REQ-004-appearance-migration`.

### Appearance

`Evidence:` `app.tsx:8-11` imports `createAppearance` +
`createAppearanceRefreshHandler` from `ags-platform/adapters/appearance`;
`app.tsx:34` is the single module-scope
`const appearance = createAppearance({ configDir: "ags-btop-studio" })`;
`app.tsx:53` calls `appearance.apply()` in `main()`. No `theme.apply()` /
`skin.apply()` / `createAppSkin` survives in `app.tsx`.
`Verify:` `node --test tests/appearance-consumption.mjs` → 6/6 pass.

- `app.tsx:45-49` registers
  `createAppearanceRefreshHandler(appearance, () => applyStudioAppearance({
  reloadPalette: () => refreshStudioPalette() }))`. The platform helper
  re-applies the whole appearance first; `lib/appearance.ts:34-36` owns only the
  app-owned reload. The window's non-destructive
  `reloadPaletteForRefresh()` (`ui/StudioWindow.tsx:197-207`) still replaces
  only the runtime palette + generated base map, so staged edits, selection,
  scope, save target and preview controls survive.
- `lib/palette-refresh.ts` is deleted; `app.tsx` has exactly one
  `requestHandler:` and no `argv[0]`/`PALETTE_REFRESH_COMMAND` dispatch. No
  `skin-refresh`/`SKIN_REFRESH` string exists.
- `style.css` is byte-identical to the pre-ticket tree:
  `git diff 9967055 -- style.css` is empty. The preview engine, generated key
  widgets and btop parsing are untouched:
  `git diff 9967055 -- lib/preview.ts lib/schematic.ts
  lib/schematic-graphics.ts lib/theme-model.ts lib/btop-conf.ts
  lib/key-widgets.generated.ts lib/key_widgets.json tools live` is empty.
  `ui/StudioWindow.tsx` changes only the constructor signature, the two layout
  accessors and the two size requests.

### Layout tokens

`Evidence:` `ui/StudioWindow.tsx:197-198` reads
`appearance.value("layout.ags-btop-studio.left-width", 280)` and
`right-width` / `320`; `:371` and `:784` feed them into the existing
`leftScroll` / `right` size requests with `peek()` because GTK wants plain
pixels. `style.css:42` and `:241` keep the `280px` / `320px` glass fallbacks.
`Verify:` `node --test tests/appearance-consumption.mjs` → layout-token case
passes.

### Pin

`Evidence:` `Makefile:8-9` pins `AGS_PLATFORM_VERSION := v0.9.0` and
`CONTRACTS_VERSION := v0.7.0`; `README.md:124`, `AGENTS.md:71`,
`.github/workflows/ci.yml:12,43-55` and the pin assertion in
`tests/app-contract.test.mjs:426-430` agree. Local overrides used for the gates
(gitignored, not committed):

```sh
ln -sfn /home/inumaki/Development/dotfiles/ags-platform \
  .dev/ags-platform/v0.9.0
ln -sfn /home/inumaki/Development/dotfiles/contracts \
  .dev/contracts/v0.7.0
```

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log: `/tmp/opencode/req004-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | all suites pass; new `appearance-consumption` 6/6, `platform-consumption` 4/4, `unit.test.mjs` 6/6 |
| `make conformance` | 17/17 pass, including the platform `checkAppRepo` template gate and the v0.9.0 / v0.7.0 pin assertion |
| `make drift` | `OK: lib/key_widgets.json matches source (48 keys)` |
| `make bundle` | `build/btop-theme-studio.js`, 1,209,852 bytes |
| `make typecheck` | 0 errors in the ags-btop-theme-studio tree (28 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

## Release and merge

This closeout commit records the evidence and is fast-forwarded into `main` (no
merge commit), then annotated as `v0.4.0` after the gates above. No existing tag
is moved; `v0.1.0`–`v0.3.0` remain untouched.

## Deviations

- The local typecheck used a gitignored `@girs` symlink to the parent repo's
  generated declarations (plus the parent `env.d.ts`); no generated artifact is
  committed.
- `tests/skin-consumption.mjs` was renamed to
  `tests/appearance-consumption.mjs` because the v1 skin plane is retired; the
  Makefile test loop and the package/file assertions point at the new name.
- `lib/palette-refresh.ts` was deleted: the platform
  `createAppearanceRefreshHandler` now owns the transport and the appearance-hash
  ledger. The same pending-aware reload work is retained.
- The app was not run live (no GUI session here): this is a source migration,
  backed by the bundle and typecheck gates. No other deviation.

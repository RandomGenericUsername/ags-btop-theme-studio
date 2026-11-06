---
id: REQ-003
title: "Consume the app-scoped skin plane"
kind: requirement
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-003/
branch: ticket/REQ-003-skin-consumption
---

# Consume the app-scoped skin plane

## Requirement

Adopt the platform skin plane (frozen Skin Spec v1) in the btop Theme Studio
without redesigning the studio. `ags-platform` v0.8.0 exports
`createAppSkin({ configDir })`; the runtime emits the app-scoped
`$XDG_CONFIG_HOME/ags-btop-studio/skin.css` plus the shared grouped token map
`$XDG_STATE_HOME/dotfiles/current/skin.json` (contracts v0.6.0).

`app.tsx` declares one module-level `skin` scoped to `ags-btop-studio` and
calls `skin.apply()` immediately after `theme.apply()` in `main()`. The
existing pending-aware `palette-refresh` handler keeps its current work and no
skin-refresh request is added: the skin adapter owns its own monitor and
reloads `skin.css` when the runtime repoints it.

`style.css` stays the bundled glass fallback. No structure, class, gesture,
size or behavior changes; the btop preview engine, generated key widgets and
palette/model logic are untouched. Layout tokens are TSX-owned and none apply
in v1, so no `createAppSkinValue` call is added.

The local platform pin moves to `v0.8.0` (`contracts` `v0.6.0`) and gates run
with `AGS_PLATFORM_DEV` / `CONTRACTS_ROOT` overrides.

## Acceptance

- [x] `app.tsx` imports `createAppSkin`, declares one module-level
      `createAppSkin({ configDir: "ags-btop-studio" })`, and calls
      `skin.apply()` immediately after `theme.apply()` in `main()`.
- [x] The existing pending-aware palette-refresh handler is unchanged and
      there is still exactly one `requestHandler`; no skin request command or
      skin-refresh path is added.
- [x] `style.css` remains present as the bundled glass fallback; selectors,
      geometry, class vocabulary and behavior are unchanged.
- [x] `Makefile` pins `ags-platform` `v0.8.0` / `contracts` `v0.6.0`; local
      pin assertions and docs agree.
- [x] A source-level validation test asserts the theme-then-skin startup
      order, the `ags-btop-studio` config dir, the single request handler, and
      the retained `style.css` fallback.
- [x] `make gates` passes on the branch with the local overrides.
- [x] The branch merges fast-forward to `main`, the next minor tag is created,
      and the tag + gate evidence are recorded in this ticket.

## Implementation

- `app.tsx`: `import { createAppSkin } from "ags-platform/adapters/skin"`;
  module-level `const skin = createAppSkin({ configDir: "ags-btop-studio" })`;
  `skin.apply()` immediately after `theme.apply()` in `main()`. The existing
  pending-aware `requestHandler` and `createStudioPaletteRefresh` closure are
  unchanged.
- `tests/skin-consumption.mjs` (new): static assertions for the one
  app-scoped factory call, the theme-then-skin order, the single request
  handler / no skin reachability, the absent layout-token accessor, and the
  retained `style.css` fallback. It joins `make test`.
- `Makefile`: platform pin `v0.8.0` / contracts `v0.6.0`.
- `.github/workflows/ci.yml`, `README.md`, `AGENTS.md`, `CHANGELOG.md` and the
  tuple assertion in `tests/app-contract.test.mjs`: describe/pin the same
  `v0.8.0` / `v0.6.0` tuple.

## Evidence

### Source checks

- `app.tsx:8` imports `createAppSkin`; `app.tsx:31` is the one module-level
  `createAppSkin({ configDir: "ags-btop-studio" })`; `app.tsx:52-55` applies
  `theme.apply()` then `skin.apply()` in `main()`.
  `Verify:` `node tests/skin-consumption.mjs` → 4/4 pass.
- `app.tsx` still has exactly one `requestHandler:` (`app.tsx:42`); the test
  rejects any `skin` reference inside that handler and any
  `skin-refresh`/`SKIN_REFRESH` string. The palette-refresh work remains
  `applyTheme: () => theme.apply()` + `reloadPalette: () => refreshStudioPalette()`.
- `style.css` is byte-identical to the pre-ticket tree:
  `git diff 006c237 -- style.css` is empty. The btop preview engine,
  generated key widgets, and palette/model logic are untouched:
  `git diff 006c237 -- ui/ lib/ tools/ live/` is empty.
- No `createAppSkinValue` call is added; the app has no v1 layout tokens.

### Pin

`Makefile:7-8` pins `AGS_PLATFORM_VERSION := v0.8.0` and
`CONTRACTS_VERSION := v0.6.0`; `README.md:125`, `AGENTS.md:71`,
`.github/workflows/ci.yml` and `tests/app-contract.test.mjs:418-423` agree.
`git -C /home/inumaki/Development/dotfiles/ags-platform describe --tags
--exact-match` → `v0.8.0`; the contracts checkout → `v0.6.0`.

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log: `/tmp/opencode/req003-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | all suites pass; new `skin-consumption` 4/4, `platform-consumption` 4/4, `unit.test.mjs` 7/7 |
| `make conformance` | 17/17 pass, including the platform `checkAppRepo` template gate and the v0.8.0 / v0.6.0 pin assertion |
| `make drift` | `OK: lib/key_widgets.json matches source (48 keys)` |
| `make bundle` | `build/btop-theme-studio.js`, 1,176,892 bytes |
| `make typecheck` | 0 errors in the ags-btop-theme-studio tree (28 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

## Release and merge

- Planning commit: `114aead` — `docs(REQ-003): open skin consumption ticket`.
- Implementation commit: `8b0f0e1` — `feat(REQ-003): consume the app-scoped skin plane`.
- This closeout commit records the evidence and is fast-forwarded into `main`
  (no merge commit), then annotated as `v0.3.0` after the gates above.
- No existing tag is moved; `v0.1.0`–`v0.2.0` remain untouched.

## Deviations

- The first gate run failed twice before passing: the new suite was initially
  named `skin-consumption.test.mjs` while this repo's test loop runs
  `tests/<suite>.mjs` (renamed to `tests/skin-consumption.mjs`); and
  `make conformance`'s `contracts-dev` prerequisite tries to fetch the pinned
  tag even when `CONTRACTS_ROOT` is set, which fails for a local-only tag. The
  passing run used the requested `AGS_PLATFORM_DEV`/`CONTRACTS_ROOT` overrides
  plus a gitignored `.dev/contracts/v0.6.0` symlink to the local contracts
  checkout. No repo file was changed to work around either issue.
- No runtime screenshot/e2e was captured: this ticket changes only startup
  ordering/imports, the bundle gate proves the skin import resolves, and the
  source-level test pins the order. The adapter monitor is platform behavior,
  already verified in `ags-platform`.

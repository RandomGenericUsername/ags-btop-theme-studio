---
id: REQ-005
title: "Drop the btop layout token reads and restore natural panes"
kind: requirement
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-005/
branch: ticket/REQ-005-layout-token-cleanup
---

# Drop the btop layout token reads and restore natural panes

## Requirement

The v2 appearance migration fed
`layout.ags-btop-studio.left-width` / `right-width` into
`leftScroll.set_size_request(...)` / `right.set_size_request(...)`. Pre-v2 the
`280` / `320` values existed only as CSS `min-width` on `.studio-left-scroll` /
`.studio-right`; the panes were otherwise natural (the right rail's scroll area
already expands). The assets repo is retiring the unused token group, so this
follow-up removes the app-side consumption without changing the layout or any
preview behavior:

- `ui/StudioWindow.tsx` has no `layout.ags-btop-studio.*` read, no
  `leftWidth` / `rightWidth` accessor and no width
  `set_size_request` on the left/right rails. The pre-v2 natural pane
  construction is restored: CSS `min-width` plus the existing `hexpand`.
- `StudioWindow` returns to its pre-v2 one-argument signature and `app.tsx`
  calls `StudioWindow(monitor)`. The module-scope
  `createAppearance({ configDir: "ags-btop-studio" })` apply and the
  `createAppearanceRefreshHandler(appearance, work)` refresh path are unchanged.
- `style.css` remains the bundled glass fallback and keeps
  `.studio-left-scroll { min-width: 280px }` /
  `.studio-right { min-width: 320px }`; no structure, class or behavior change.
- The source validation test rejects layout-token usage and the pane width
  size requests while keeping the appearance apply/configDir/refresh
  assertions.
- The preview engine, generated key widgets and btop parsing are untouched.
- The next patch tag follows after the fast-forward merge.

## Acceptance

- [x] `ui/StudioWindow.tsx` contains no `layout.ags-btop-studio.*` reads,
      `leftWidth` / `rightWidth` values or pane width `set_size_request` calls.
- [x] The left/right rails are natural again: `style.css` owns the `280px` /
      `320px` minimums and the existing `hexpand` is preserved.
- [x] `app.tsx` keeps the module-scope appearance apply/configDir and the
      `createAppearanceRefreshHandler(appearance, work)` wiring unchanged.
- [x] The source validation test covers the absence of btop layout tokens and
      the pane construction while keeping the appearance assertions.
- [x] The preview engine, generated widgets and `style.css` structure/classes
      are unchanged.
- [x] `make gates` passes with the local platform/contracts overrides.
- [x] v0.4.1 is tagged after the fast-forward merge; `main` and the tag are
      pushed.

## Evidence

Planning commit: `f5edc13` — `docs(REQ-005): open layout token cleanup ticket`.
Implementation commit: `45abf37` — `feat(REQ-005): drop btop layout token reads
and restore natural panes`. Worktree `.worktrees/REQ-005/`, branch
`ticket/REQ-005-layout-token-cleanup`.

### Natural panes

`Evidence:` `ui/StudioWindow.tsx:178` is back to the pre-v2
`export function StudioWindow(gdkmonitor: Gdk.Monitor)`. The left rail
(`:358-366`) and right rail (`:774-780`) are built naturally; neither rail calls
a width `set_size_request`, and the right rail's scroll area keeps
`hexpand: true` (`:778`). `git diff 9967055 -- ui/StudioWindow.tsx` is empty, so
the window source is identical to the pre-v2 construction. The only remaining
`set_size_request` calls are unrelated widget sizes (`:493`, `:1195`, `:1405`,
`:1673`).

`Verify:` `grep -rn "layout\.ags-btop-studio\|leftWidth\|rightWidth" app.tsx lib
ui` → no output.

`style.css:41-42` and `:240-241` still own
`.studio-left-scroll { min-width: 280px }` and
`.studio-right { min-width: 320px }`. `git diff abbf366 -- style.css` is empty;
no structure, class or behavior changed.

### Appearance unchanged

`Evidence:` `app.tsx:34` still declares the module-scope
`createAppearance({ configDir: "ags-btop-studio" })`; `:45-49` registers
`createAppearanceRefreshHandler(appearance, …)` with the existing pending-aware
reload; `:53` applies it in `main()`; `:58` now calls `StudioWindow(monitor)`
without the retired layout argument.

`tests/appearance-consumption.mjs:114-169` keeps the four appearance cases
(module-scope configDir/apply, handler wiring/reload, no new request command),
and `:171-178` asserts no btop layout-token use and the natural
`StudioWindow(monitor)` wiring. The preview engine, generated key widgets and
artifact, btop parsing and `style.css` are untouched:

```sh
git diff --stat abbf366..HEAD -- lib/preview.ts lib/schematic.ts \
  lib/schematic-graphics.ts lib/theme-model.ts lib/btop-conf.ts \
  lib/key-widgets.generated.ts lib/key_widgets.json tools live style.css
```

→ no output.

`Verify:` `node --test tests/appearance-consumption.mjs` → 6/6 pass, including
`the studio consumes no btop layout tokens and keeps natural panes`.

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log: `/tmp/opencode/req005-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | all suites pass; new natural-pane case is in `appearance-consumption` 6/6, `platform-consumption` 4/4, `unit.test.mjs` 6/6 |
| `make conformance` | 17/17 pass, including the platform `checkAppRepo` template gate and the v0.9.0 / v0.7.0 pin assertion |
| `make drift` | `OK: lib/key_widgets.json matches source (48 keys)` |
| `make bundle` | `build/btop-theme-studio.js`, 1,208,028 bytes |
| `make typecheck` | 0 errors in the ags-btop-theme-studio tree (28 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

Local overrides used for the gates (gitignored, not committed):

```sh
ln -sfn /home/inumaki/Development/dotfiles/ags-btop-theme-studio/@girs @girs
ln -sfn /home/inumaki/Development/dotfiles/ags-btop-theme-studio/env.d.ts env.d.ts
```

`make contracts-dev` also fetched the pinned contracts v0.7.0 into gitignored
`.dev/`; no fetched or generated artifact is committed.

## Release and merge

This closeout commit records the evidence, bumps `package.json` to `0.4.1` and
is fast-forwarded into `main` (no merge commit), then annotated as `v0.4.1` after
the gates above. No existing tag is moved; `v0.1.0`–`v0.4.0` remain untouched.

## Deviations

- The local typecheck used gitignored `@girs` and `env.d.ts` symlinks to the
  parent checkout; `make contracts-dev` fetched contracts v0.7.0 into `.dev/`.
  No generated artifact is committed.
- `package.json` moves from the stale `0.3.0` to `0.4.1` in this closeout
  commit (v0.4.0 had not bumped it); no other package metadata changes.

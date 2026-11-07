---
id: REQ-006
title: "Consume Generations v3 and pin platform v1.0.0 / contracts v0.8.0"
kind: requirement
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-006/
branch: ticket/REQ-006-generations-v3
---

# Consume Generations v3 and pin platform v1.0.0 / contracts v0.8.0

## Requirement

Generations v3 freezes the state plane at contracts v0.8.0 and the platform
v1.0.0 adapter implements it. `createAppearance` now reads
`$XDG_STATE_HOME/dotfiles/current/manifest.json` plus
`current/appearance/<configDir>.css`, and `createAppearanceRefreshHandler`
implements the generation-bound `appearance-refresh <genHash>` protocol
instead of the v2 `palette-refresh <appearance-hash>` boolean ack. The studio
must consume v3 without changing its app-owned behavior:

- The gate tuple moves to `ags-platform` v1.0.0 / `contracts` v0.8.0 in the
  Makefile, the CI workflow and the source conformance test.
- `app.tsx` keeps one module-scope
  `createAppearance({ configDir: "ags-btop-studio" })`, calls
  `appearance.apply()` in `main()`, and registers one
  `createAppearanceRefreshHandler(appearance, work)` whose work reloads the
  studio palette/base map and returns the frozen `{ status: "applied" }` v3
  work result. It accepts only `appearance-refresh <64-hex genHash>`.
- The studio's pending-aware work, the preview engine, the generated widgets,
  the btop parsing and `style.css` (natural panes) are unchanged.
- The executable unit suite and the source gates test the v3 protocol
  (generation-bound apply/ack, requested-hash responses, malformed and stale
  v2 requests rejected) instead of the retired `palette-refresh` protocol.

## Acceptance

- [x] `Makefile`, `.github/workflows/ci.yml` and
      `tests/app-contract.test.mjs` pin `ags-platform` v1.0.0 / `contracts`
      v0.8.0 and keep `make gates` = test + conformance + drift + bundle +
      typecheck.
- [x] `app.tsx` keeps the module-scope
      `createAppearance({ configDir: "ags-btop-studio" })` and
      `appearance.apply()`, with exactly one v3
      `createAppearanceRefreshHandler(appearance, work)` whose pending-aware
      work returns `{ status: "applied" }`.
- [x] `tests/unit.test.mjs` executes the generation-bound
      `appearance-refresh <genHash>` handler and no longer imports or asserts
      the retired `palette-refresh` protocol.
- [x] The source gates assert the v3 handler/response contract and reject the
      old `palette-refresh` command.
- [x] The preview engine, generated widgets, btop parsing, `style.css` and the
      natural panes are unchanged.
- [x] `make gates` passes with the local platform/contracts overrides.
- [x] `v0.5.0` is tagged after the fast-forward merge; `main` and the tag are
      pushed.

## Evidence

Planning commit: `5186ba6` — `docs(REQ-006): open generations v3 ticket`.
Implementation commit: `d0a9688` — `feat(REQ-006): consume generations v3
appearance refresh`. Worktree `.worktrees/REQ-006/`, branch
`ticket/REQ-006-generations-v3`.

### Pinned tuple

`Evidence:` `Makefile:8-9` is
`AGS_PLATFORM_VERSION := v1.0.0` / `CONTRACTS_VERSION := v0.8.0`; the same
comments and `.dev/` help paths name v1.0.0 / v0.8.0. `.github/workflows/ci.yml`
checks out `RandomGenericUsername/ags-platform` at `v1.0.0` and
`RandomGenericUsername/contracts` at `v0.8.0`. `tests/app-contract.test.mjs:428`
asserts both exact pins plus the unchanged `gates` / `ci` targets
(`Makefile:134`, `:176`).

`Verify:` `grep -n "AGS_PLATFORM_VERSION :=\|CONTRACTS_VERSION :=" Makefile`
→ `v1.0.0` / `v0.8.0`. `grep -n "ref: v" .github/workflows/ci.yml` → `v1.0.0`
and `v0.8.0`.

### v3 handler, pending-aware work

`Evidence:` `app.tsx:35` still declares the single module-scope
`createAppearance({ configDir: "ags-btop-studio" })`; `:48-53` registers the
one `createAppearanceRefreshHandler(appearance, () => { … })` whose work keeps
`applyStudioAppearance({ reloadPalette: () => refreshStudioPalette() })` and
returns `{ status: "applied" }`; `:57` applies the appearance in `main()`.
`lib/appearance.ts:5-16` documents the generation-bound protocol and the
pending-aware reload (only the runtime palette + generated base map). The
studio still stages edits, selection, scope, save target and preview controls;
no restart/quit/reset path was added.

`tests/unit.test.mjs` executes the real platform port against
`APPEARANCE_REFRESH_COMMAND`: it asserts the requested generation is applied
before the work, the response is exactly `{"applied":"<genHash>"}`, same-hash
work is idempotent, throws are retryable, deferred work names the requested
hash, and malformed input plus the retired `palette-refresh` command apply
nothing. `tests/appearance-consumption.mjs:172-175` rejects the old command;
`tests/app-contract.test.mjs:222` rejects it in `app.tsx`.

`Verify:` `node --test tests/unit.test.mjs` → 8/8 pass;
`node --test tests/appearance-consumption.mjs` → 6/6 pass;
`node --test tests/app-contract.test.mjs` → 17/17 pass.

### Unchanged surfaces

`Evidence:` the preview engine, generated widgets/artifact, btop parsing,
`style.css` and the vendored tools are byte-identical to the ticket base:

```sh
git diff --stat a15bf33..d0a9688 -- lib/preview.ts lib/schematic.ts \
  lib/schematic-graphics.ts lib/theme-model.ts lib/btop-conf.ts \
  lib/key-widgets.generated.ts lib/key_widgets.json tools live style.css
```

→ no output. `ui/StudioWindow.tsx` changes one comment word
(`palette-refresh` → `appearance-refresh`, `:166`); the pane construction,
reload function and preview controls are untouched.

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log: `/tmp/opencode/req006-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | all suites pass; `unit.test.mjs` 8/8 (v3 generation-bound cases), `appearance-consumption` 6/6, `platform-consumption` 4/4 |
| `make conformance` | 17/17 pass, including the platform `checkAppRepo` template gate and the v1.0.0 / v0.8.0 pin assertion |
| `make drift` | `OK: lib/key_widgets.json matches source (48 keys)` |
| `make bundle` | `build/btop-theme-studio.js`, 1,264,112 bytes |
| `make typecheck` | 0 errors in the ags-btop-theme-studio tree (28 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

Local overrides used for the gates (gitignored, not committed):

```sh
ln -sfn /home/inumaki/Development/dotfiles/ags-btop-theme-studio/@girs @girs
ln -sfn /home/inumaki/Development/dotfiles/ags-btop-theme-studio/env.d.ts env.d.ts
```

`make contracts-dev` fetched contracts v0.8.0 into gitignored `.dev/`; no
fetched or generated artifact is committed.

## Release and merge

This closeout commit records the evidence, bumps `package.json` from `0.4.1` to
`0.5.0` and is fast-forwarded into `main` (no merge commit), then annotated as
`v0.5.0` after the gates above. No existing tag is moved; `v0.1.0`–`v0.4.1`
remain untouched.

## Deviations

- The v3 work callback returns `{ status: "applied" }`. Platform v1.0.0's
  handler accepts only the frozen work result (a void work return normalizes to
  an invalid response), so this is required to answer
  `{"applied":"<genHash>"}` after the studio's palette reload.
- The local typecheck used gitignored `@girs` / `env.d.ts` symlinks to the
  parent checkout; `make contracts-dev` fetched contracts v0.8.0 into `.dev/`.
  No generated artifact is committed.
- `app.tsx`, the README, AGENTS.md, the CI comments and `lib/appearance.ts`
  carry documentation updates from v2/palette-refresh to v3/appearance-refresh;
  no behavior outside the protocol change was altered.

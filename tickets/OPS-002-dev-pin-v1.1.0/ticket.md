---
id: OPS-002
title: "Bump the local dev tuple to ags-platform v1.1.0 / contracts v0.12.0"
kind: ops-task
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/OPS-002/
branch: ticket/OPS-002-dev-pin-v1.1.0
---

# Bump the local dev tuple to ags-platform v1.1.0 / contracts v0.12.0

## Work

Keep the app, UI, handler/ack behavior, preview engine, generated widgets,
`style.css`, layout tokens and lane policy untouched. Move only the local dev
tuple: `ags-platform` from `v1.0.1` to `v1.1.0` and `contracts` from `v0.8.0` to
`v0.12.0`, both dev-pin parity only.

- `Makefile`: `AGS_PLATFORM_VERSION := v1.1.0`,
  `CONTRACTS_VERSION := v0.12.0`, the tuple comments and the `.dev/` help paths.
- `.github/workflows/ci.yml`: check out `ags-platform` `v1.1.0` and
  `contracts` `v0.12.0`, and assert the new platform path.
- `tests/app-contract.test.mjs`: assert the `v1.1.0` / `v0.12.0` tuple.
- `tests/appearance-consumption.mjs`: name the `v1.1.0` platform comment.
- `README.md` / `AGENTS.md`: name the `v1.1.0` / `v0.12.0` pin and symlink
  paths.
- `CHANGELOG.md` / `package.json`: cut `v0.5.2` with the pin bump only.

## Acceptance

- [x] `Makefile`, `.github/workflows/ci.yml` and
      `tests/app-contract.test.mjs` pin `ags-platform` `v1.1.0` /
      `contracts` `v0.12.0`; `gates` / `ci` target lists are unchanged.
- [x] `README.md`, `AGENTS.md` and `CHANGELOG.md` name the new pin and the
      `.dev/ags-platform/v1.1.0` / `.dev/contracts/v0.12.0` paths.
- [x] No app code, UI, handler/ack behavior, preview engine, generated widget,
      `style.css`, layout-token or lane-policy change.
- [x] `make gates` passes with the requested local overrides.
- [x] `v0.5.2` is tagged annotated after the fast-forward merge; `main` and
      the tag are pushed.

## Done-when

Every local platform pin is `v1.1.0` and every contracts pin is `v0.12.0`,
`make gates` passes, and `v0.5.2` is tagged and pushed.

## Evidence

Planning commit: `f76cba7` — `docs(OPS-002): open dev tuple v1.1.0 / v0.12.0
ticket`. Implementation commit: `f0927a3` — `chore(OPS-002): bump the dev tuple
to ags-platform v1.1.0 / contracts v0.12.0`. Worktree `.worktrees/OPS-002/`,
branch `ticket/OPS-002-dev-pin-v1.1.0`.

### Pinned tuple

`Evidence:` `Makefile:8-9` is `AGS_PLATFORM_VERSION := v1.1.0` /
`CONTRACTS_VERSION := v0.12.0`; `Makefile:30-31` names the
`.dev/ags-platform/v1.1.0` and `.dev/contracts/v0.12.0` help paths.
`.github/workflows/ci.yml:43-44` checks out `ags-platform` at `v1.1.0` into
`.dev/ags-platform/v1.1.0`, `:50` checks out contracts at `v0.12.0`, and `:55`
asserts the new platform path. `tests/app-contract.test.mjs:409,428-431`
asserts the `v0.12.0` schema and the `v1.1.0` / `v0.12.0` tuple plus the
unchanged `gates` / `ci` targets. `README.md:51,126,132-133`, `AGENTS.md:71`
and `tests/appearance-consumption.mjs:3` name the new tuple.

`Verify:` `grep -n "AGS_PLATFORM_VERSION :=\|CONTRACTS_VERSION :=" Makefile`
→ `v1.1.0` / `v0.12.0`. `grep -n "ref: v" .github/workflows/ci.yml` → `v1.1.0`
and `v0.12.0`.

The platform tag is local `v1.1.0` at commit `f20a685`; the gate checkout
`/home/inumaki/Development/dotfiles/ags-platform` is exactly that tag
(`git describe --tags --exact-match HEAD` → `v1.1.0`). The contracts tag is
`v0.12.0` at commit `a03b563`; the gate checkout
`/home/inumaki/Development/dotfiles/contracts` is exactly that tag.

### Unchanged surfaces

`Evidence:` `git diff --stat f76cba7..f0927a3` is limited to `Makefile`,
`.github/workflows/ci.yml`, `tests/app-contract.test.mjs`,
`tests/appearance-consumption.mjs`, `README.md`, `AGENTS.md`, `CHANGELOG.md`
and `package.json` — 8 files, 33 insertions and 22 deletions, all version-string
edits plus the changelog entry. `app.tsx`, `lib/`, `ui/`, `style.css`, `tools/`,
`live/`, layout-token usage and the platform handler/ack behavior have no diff.

### Gates

Command (worktree root, exactly as requested):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log:
`/tmp/opencode/ags-btop-theme-studio-OPS-002-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | 11 suites pass: 10 custom suites plus `platform-consumption` 4/4, `appearance-consumption` 6/6, `unit.test.mjs` 8/8 (0 fail) |
| `make conformance` | 17/17 pass, including the platform `checkAppRepo` template gate and the v1.1.0 / v0.12.0 pin assertion |
| `make drift` | `OK: lib/key_widgets.json matches source (48 keys)` |
| `make bundle` | `build/btop-theme-studio.js`, 1,270,192 bytes |
| `make typecheck` | 0 errors in the ags-btop-theme-studio tree (28 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

`make contracts-dev` fetched contracts `v0.12.0` into the gitignored
`.dev/contracts/v0.12.0`; nothing under `.dev/`, `node_modules/`, `@girs/` or
`build/` is committed.

## Release and merge

The closeout commit records this evidence, moves `CHANGELOG.md` to `v0.5.2`
(added in the implementation commit) and bumps `package.json` from `0.5.1` to
`0.5.2`; it is fast-forwarded into `main` (no merge commit) and annotated as
`v0.5.2` after the gates above. No existing tag is moved; `v0.1.0`–`v0.5.1`
remain untouched. This repo's convention is tag-only: there is no GitHub
Release object.

## Deviations

- `app.tsx:4,30` and `lib/appearance.ts:6` still name `v1.0.0` / contracts
  `v0.8.0` as the platform/contracts version that introduced the consumed API.
  They are app-code comments and the task forbids app-code changes, so the pin
  files alone moved.
- The historical `CHANGELOG.md` v0.5.0 / v0.5.1 entries keep their original
  `v1.0.0` / `v0.8.0` / `v1.0.1` strings; only the new v0.5.2 entry records the
  bump.
- Both tuple members move together this time (OPS-001 kept contracts at
  `v0.8.0`); the task requested platform `v1.1.0` plus contracts `v0.12.0`.

---
id: OPS-001
title: "Bump the local ags-platform dev pin to v1.0.1"
kind: ops-task
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/OPS-001/
branch: ticket/OPS-001-dev-pin-v1.0.1
---

# Bump the local ags-platform dev pin to v1.0.1

## Work

Keep the app, handler/ack behavior, preview engine, generated widgets,
`style.css`, layout tokens and lane policy untouched. Move only the local
`ags-platform` dev pin from `v1.0.0` to `v1.0.1`; `contracts` stays `v0.8.0`.

- `Makefile`: `AGS_PLATFORM_VERSION := v1.0.1` plus the tuple comments and
  `.dev/ags-platform/v1.0.1` help path.
- `.github/workflows/ci.yml`: check out `ags-platform` `v1.0.1`, keep the
  contracts `v0.8.0` checkout, and assert the new platform path.
- `tests/app-contract.test.mjs`: assert the `v1.0.1` / `v0.8.0` tuple.
- `README.md` / `AGENTS.md`: name the `v1.0.1` pin and symlink path.
- `CHANGELOG.md` / `package.json`: cut `v0.5.1` with the pin bump only.

## Acceptance

- [x] `Makefile`, `.github/workflows/ci.yml` and
      `tests/app-contract.test.mjs` pin `ags-platform` `v1.0.1` while
      `contracts` stays `v0.8.0`; `gates` / `ci` target lists are unchanged.
- [x] `README.md`, `AGENTS.md` and `CHANGELOG.md` name the `v1.0.1` pin and
      the `.dev/ags-platform/v1.0.1` path.
- [x] No app code, handler/ack behavior, preview engine, generated widget,
      `style.css`, layout-token or lane-policy change.
- [x] `make gates` passes with the requested local overrides.
- [x] `v0.5.1` is tagged annotated after the fast-forward merge; `main` and
      the tag are pushed.

## Done-when

Every local `v1.0.0` platform pin is `v1.0.1` while `contracts` remains
`v0.8.0`, `make gates` passes, and `v0.5.1` is tagged and pushed.

## Evidence

Planning commit: `9e90991` — `docs(OPS-001): open dev pin v1.0.1 ticket`.
Implementation commit: `90763f4` — `chore(OPS-001): bump the ags-platform dev
pin to v1.0.1`. Worktree `.worktrees/OPS-001/`, branch
`ticket/OPS-001-dev-pin-v1.0.1`.

### Pinned tuple

`Evidence:` `Makefile:8-9` is `AGS_PLATFORM_VERSION := v1.0.1` /
`CONTRACTS_VERSION := v0.8.0`; `Makefile:30-31` names the
`.dev/ags-platform/v1.0.1` and `.dev/contracts/v0.8.0` help paths.
`.github/workflows/ci.yml:43-44` checks out `ags-platform` at `v1.0.1` into
`.dev/ags-platform/v1.0.1`, `:50` keeps contracts at `v0.8.0`, and `:55`
asserts the new platform path. `tests/app-contract.test.mjs:428-431` asserts
the `v1.0.1` / `v0.8.0` tuple plus the unchanged `gates` / `ci` targets.
`README.md:51,126,132`, `AGENTS.md:71` and `tests/appearance-consumption.mjs:3`
name `v1.0.1`.

`Verify:` `grep -n "AGS_PLATFORM_VERSION :=\|CONTRACTS_VERSION :=" Makefile`
→ `v1.0.1` / `v0.8.0`. `grep -n "ref: v" .github/workflows/ci.yml` → `v1.0.1`
and `v0.8.0`.

The platform tag peak is local `v1.0.1` at commit `10b4d11`; the gate checkout
`/home/inumaki/Development/dotfiles/ags-platform` is exactly that tag
(`git describe --tags --always HEAD` → `v1.0.1`). `contracts` is untouched at
`v0.8.0`.

### Unchanged surfaces

`Evidence:` `git diff --stat 5486d9f..90763f4` is limited to `Makefile`,
`.github/workflows/ci.yml`, `tests/app-contract.test.mjs`,
`tests/appearance-consumption.mjs`, `README.md` and `AGENTS.md` — 6 files,
14 insertions and 14 deletions, all version-string edits. `app.tsx`, `lib/`,
`ui/`, `style.css`, `tools/`, `live/`, layout-token usage and the platform
handler/ack behavior have no diff. `contracts` stays `v0.8.0`.

### Gates

Command (worktree root, exactly as requested):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log:
`/tmp/opencode/ags-btop-theme-studio-OPS-001-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | 11 suites pass: 10 custom suites = 180 cases, plus `platform-consumption` 4/4, `appearance-consumption` 6/6, `unit.test.mjs` 8/8 (198 cases total, 0 fail) |
| `make conformance` | 17/17 pass, including the platform `checkAppRepo` template gate and the v1.0.1 / v0.8.0 pin assertion |
| `make drift` | `OK: lib/key_widgets.json matches source (48 keys)` |
| `make bundle` | `build/btop-theme-studio.js`, 1,267,184 bytes |
| `make typecheck` | 0 errors in the ags-btop-theme-studio tree (28 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

Local overrides used for the gates (gitignored, not committed):
`.dev/ags-platform/v1.0.1` → the local platform checkout,
`.dev/contracts/v0.8.0` → the local contracts checkout, `@girs` → the parent
checkout's generated declarations, and `env.d.ts` → the parent checkout's file.

## Release and merge

The closeout commit records this evidence, moves `CHANGELOG.md` to `v0.5.1`
and bumps `package.json` from `0.5.0` to `0.5.1`; it is fast-forwarded into
`main` (no merge commit) and annotated as `v0.5.1` after the gates above. No
existing tag is moved; `v0.1.0`–`v0.5.0` remain untouched. This repo's
convention is tag-only: there is no GitHub Release object.

## Deviations

- `app.tsx:4,30` and `lib/appearance.ts:6` still name `v1.0.0` as the platform
  version that introduced the consumed API. They are app-code comments and the
  task forbids app-code changes, so the pin files alone moved.
- The historical `CHANGELOG.md` v0.5.0 entry keeps `v1.0.0`; only the new
  v0.5.1 entry records the bump.

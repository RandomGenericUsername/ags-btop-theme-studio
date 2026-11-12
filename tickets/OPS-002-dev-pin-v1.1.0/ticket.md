---
id: OPS-002
title: "Bump the local dev tuple to ags-platform v1.1.0 / contracts v0.12.0"
kind: ops-task
status: in-progress
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

- [ ] `Makefile`, `.github/workflows/ci.yml` and
      `tests/app-contract.test.mjs` pin `ags-platform` `v1.1.0` /
      `contracts` `v0.12.0`; `gates` / `ci` target lists are unchanged.
- [ ] `README.md`, `AGENTS.md` and `CHANGELOG.md` name the new pin and the
      `.dev/ags-platform/v1.1.0` / `.dev/contracts/v0.12.0` paths.
- [ ] No app code, UI, handler/ack behavior, preview engine, generated widget,
      `style.css`, layout-token or lane-policy change.
- [ ] `make gates` passes with the requested local overrides.
- [ ] `v0.5.2` is tagged annotated after the fast-forward merge; `main` and
      the tag are pushed.

## Done-when

Every local platform pin is `v1.1.0` and every contracts pin is `v0.12.0`,
`make gates` passes, and `v0.5.2` is tagged and pushed.

## Evidence

Planning commit: this commit. Worktree `.worktrees/OPS-002/`, branch
`ticket/OPS-002-dev-pin-v1.1.0`.

`Evidence:` MISSING — fill after implementation and gates.

## Deviations

- MISSING — fill after implementation.

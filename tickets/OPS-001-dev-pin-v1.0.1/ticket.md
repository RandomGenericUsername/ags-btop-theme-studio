---
id: OPS-001
title: "Bump the local ags-platform dev pin to v1.0.1"
kind: ops-task
status: in-progress
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

## Done-when

Every local `v1.0.0` platform pin is `v1.0.1` while `contracts` remains
`v0.8.0`, `make gates` passes, and `v0.5.1` is tagged and pushed.

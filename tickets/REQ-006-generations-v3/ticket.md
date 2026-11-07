---
id: REQ-006
title: "Consume Generations v3 and pin platform v1.0.0 / contracts v0.8.0"
kind: requirement
status: in-progress
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

- [ ] `Makefile`, `.github/workflows/ci.yml` and
      `tests/app-contract.test.mjs` pin `ags-platform` v1.0.0 / `contracts`
      v0.8.0 and keep `make gates` = test + conformance + drift + bundle +
      typecheck.
- [ ] `app.tsx` keeps the module-scope
      `createAppearance({ configDir: "ags-btop-studio" })` and
      `appearance.apply()`, with exactly one v3
      `createAppearanceRefreshHandler(appearance, work)` whose pending-aware
      work returns `{ status: "applied" }`.
- [ ] `tests/unit.test.mjs` executes the generation-bound
      `appearance-refresh <genHash>` handler and no longer imports or asserts
      the retired `palette-refresh` protocol.
- [ ] The source gates assert the v3 handler/response contract and reject the
      old `palette-refresh` command.
- [ ] The preview engine, generated widgets, btop parsing, `style.css` and the
      natural panes are unchanged.
- [ ] `make gates` passes with the local platform/contracts overrides.
- [ ] `v0.5.0` is tagged after the fast-forward merge; `main` and the tag are
      pushed.

---
id: REQ-003
title: "Consume the app-scoped skin plane"
kind: requirement
status: in-progress
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

- [ ] `app.tsx` imports `createAppSkin`, declares one module-level
      `createAppSkin({ configDir: "ags-btop-studio" })`, and calls
      `skin.apply()` immediately after `theme.apply()` in `main()`.
- [ ] The existing pending-aware palette-refresh handler is unchanged and
      there is still exactly one `requestHandler`; no skin request command or
      skin-refresh path is added.
- [ ] `style.css` remains present as the bundled glass fallback; selectors,
      geometry, class vocabulary and behavior are unchanged.
- [ ] `Makefile` pins `ags-platform` `v0.8.0` / `contracts` `v0.6.0`; local
      pin assertions and docs agree.
- [ ] A source-level validation test asserts the theme-then-skin startup
      order, the `ags-btop-studio` config dir, the single request handler, and
      the retained `style.css` fallback.
- [ ] `make gates` passes on the branch with the local overrides.
- [ ] The branch merges fast-forward to `main`, the next minor tag is created,
      and the tag + gate evidence are recorded in this ticket.

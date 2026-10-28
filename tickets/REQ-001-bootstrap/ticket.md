---
id: REQ-001
title: "Bootstrap ags-btop-theme-studio from ags-apps v0.5.0"
kind: requirement
status: done
lane: 3
links:
  openspec: none
  bmad: none
worktree: none
branch: ticket/REQ-001-bootstrap
---

# Bootstrap ags-btop-theme-studio from ags-apps v0.5.0

## Requirement

Extract the `btop-theme-studio/` app package from `ags-apps` tag `v0.5.0` into
the standalone `ags-btop-theme-studio` repo, with the repo root as the app
package, the v0.5.0 pending-aware `palette-refresh` handler, and the standalone
dev flow.

## Identity

```text
app=btop-theme-studio  instance=btop-theme-studio  configDir=ags-btop-studio
mode=live              holdsUnsavedState=true
window=btop-theme-studio-window  launcher=btop-theme-studio
keybind="Open btop theme studio"
```

## Acceptance

- [x] App source extracted without dropping behavior: `app.tsx`, `lib/`,
      `ui/`, `tests/`, `tools/`, `live/`, `style.css`.
- [x] `app.manifest.json` matches `app.tsx` and the window/launcher/config dir.
- [x] `palette-refresh` is the real pending-aware refresh (Theme pointer then
      palette reload), one JSON-string response, idempotent by appearance hash,
      preserving pending edits/selection.
- [x] Dev flow present: `AGENTS.md`, tickets, worktree guard, `Makefile`, CI,
      `README.md`, tests, local platform/contracts symlinks.
- [x] `make test`, `make conformance`, `make drift`, `make typecheck`,
      `make bundle` pass; live engine tests run on the local stack.
- [x] Annotated tag `v0.1.0` created after the gates.

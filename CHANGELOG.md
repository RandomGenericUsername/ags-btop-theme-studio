# Changelog

## v0.1.0 — 2026-10-27

- Extract the btop Theme Studio from `ags-apps` v0.5.0 (`btop-theme-studio/`)
  into the standalone `ags-btop-theme-studio` repo; the repo root is the app
  package.
- Keep the identity tuple: app/instance `btop-theme-studio`, config dir
  `ags-btop-studio`, window `btop-theme-studio-window`, launcher
  `btop-theme-studio`, keybind “Open btop theme studio”, mode `live`,
  `holdsUnsavedState: true`.
- Implement the real v0.5.0 pending-aware `palette-refresh`: re-apply the
  Theme pointer, reload the runtime palette + generated base map, preserve
  staged edits/selection/scope/save target; idempotent by appearance hash.
- Copy the app's pure `lib/`, `ui/`, `tests/`, `tools/` (vendored btop v1.4.7
  sources + key→widget generator) and the real-pty `live/` preview engine
  without dropping behavior.
- Add the standalone dev flow (`AGENTS.md`, tickets, worktree guard, Makefile,
  CI, README, tests) and the manifest/handler/template conformance gate.
- Pin the local-only v0.3.0 `ags-platform`/`contracts` tuple via `.dev/`
  symlinks.

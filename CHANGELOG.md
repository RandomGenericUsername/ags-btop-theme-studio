# Changelog

## v0.1.2 — 2026-10-28

- Restore the **real btop live preview as the default center stage**; v0.1.1
  opened on the label-only Components pane and hid the real preview behind the
  Live tab, making the center look inert on launch.
- Render the live frame on launch and **debounce-refresh it when the effective
  theme changes** while Live is active (theme/key edits, Revert, palette
  refresh), without refreshing on selection/scope/target/control changes.
- Keep Components available with a `meterFill()`-driven sample meter so the
  load/fill controls have a visible effect in that pane.
- Restore the dedicated live scroller: the caption and Refresh control stay
  pinned, and each capture resets to the top instead of leaving the outer
  canvas on the blank end of the frame (the v0.1.1 tab refactor dropped it).
- Runtime audit: theme selection, New/Duplicate/Delete/Fork, Active, repo and
  installed saves, picker scopes, gradient, transparent, diagnosis, pending
  diff, preset/load, palette-refresh and window toggle all exercised against
  renamed source instances; v0.1.0 baseline compared for save/selection behavior.
- Pre-existing and unchanged: the `~/.dotfiles` repo-root default, the
  `ags run` warm-instance conflict, and the install-spine save path.

## v0.1.1 — 2026-10-28
 — 2026-10-28

- Visual/layout pass on the Studio shell to match mock v8:
  - header/intro strip and a 280 / 1fr / 320 three-column hierarchy;
  - left rail with save target, read-only palette/theme/config inputs, consumed
    `btop.conf`, theme library (star + kind/active badges) and the 48-key list
    with per-key colour dots;
  - center stage with a two-row load/fill controls bar, preset chips,
    generated-theme banner, Components/Live tabs, key-coverage card, diagnosis
    rows and a pending-edit diff panel;
  - right rail with selection key/value rows, "Where it shows", gradient stops,
    ramp / color0–15 / named-token palette grid, custom hex, edit scope and the
    sticky Save/Revert footer.
- The **real btop live preview** (`live/btop_live.py`) is preserved as the Live
  pane; the mock's fake schematic is not copied over it.
- `style.css` now expresses the mock-v8 panel/section vocabulary through the
  `@color_*` desktop tokens; `.canvas` and `.live-frame` remain content literals.
- Add the layout conformance test (“the studio shell keeps the mock-v8
  three-column hierarchy”) to `tests/app-contract.test.mjs`.

No state, pending-edit, save-target, fork/save or palette-refresh semantics
changed in this release.

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

---
id: FIX-001
title: "Align the Studio shell with mock v8 (three-column hierarchy, section chrome, panels)"
kind: bug
status: done
lane: direct
severity: S2
links:
  openspec: none
  bmad: none
worktree: .worktrees/FIX-001/
branch: ticket/FIX-001-visual-shell
repro: "ags run -d . (then compare the window with prototype/btop-theme-studio-v8.html)"
observed: "The shell is a flat 8px-padded three-box split: no header/intro strip, no section chrome or badges, ungrouped controls, a cramped schematic and live view stacked together, and unstyled selection/library rows."
expected: "A mock-v8 shell: header strip; 280px left rail with save target, read-only inputs, consumed btop.conf, theme library and the 48-key list; a center stage with the load/preset controls, Components/Live tabs (real btop kept as Live), diagnosis and pending diff; a 320px right rail with selection details, gradient, palette grid, edit scope and Save/Revert."
---

# Align the Studio shell with mock v8

## Repro

`ags run -d .` and compare with
`dotfiles-v3/openspec/changes/archive/2026-10-23-add-btop-theme-studio/prototype/btop-theme-studio-v8.html`.

## Observed

The window is a flat three-box split with 8px padding and 11px type everywhere.
There is no intro/header strip, no uppercase section headers, no read-only input
cards, no theme badges or key colour dots, and no active-row treatment. The
schematic and the live preview are stacked in the same center column, so both
are cramped; the controls bar is a single undifferentiated row and the right
rail has no visual grouping.

## Expected

Mock v8's hierarchy, implemented in GTK4/JSX/CSS:

- header/intro strip across the top;
- left rail: save target (Repo/Installed), read-only palette/theme/config paths,
  consumed `btop.conf`, theme library with badges, 48-key list with colour dots;
- center: load + fixed-fill controls, preset chips, Components/Live tabs (the
  real btop preview stays as Live), diagnosis rows, pending-edit diff;
- right: selection key/value rows, "Where it shows", gradient stops, ramp /
  color0–15 / named-token palette grid, custom hex, edit scope, Save/Revert;
- mock's spacing/typography/dark panel language, still bound to the desktop
  palette tokens.

## Fix notes

Root cause was presentation, not state: `ui/StudioWindow.tsx` built one flat
`Gtk.Box` per column with 8px padding, no section helper, no header/intro strip
and both preview panes appended to the center at once; `style.css` had no shell
or panel vocabulary. The pass adds the mock-v8 shell in the app's real GTK
stack:

- `ui/StudioWindow.tsx`: header strip, shared `section()`/`body()` chrome, left
  rail sections (save target, read-only inputs, consumed config, theme library,
  keys), two-row controls bar, preset bar, generated-theme banner, stage tabs
  with the real `live/btop_live.py` preview on Live, key-coverage card,
  diagnosis/diff panels, right rail selection/gradient/palette/scope/footer.
- `style.css`: mock-v8 dark panel vocabulary mapped onto the `@color_*` desktop
  tokens; content stages (`.canvas`, `.live-frame`) keep their deliberate
  literals.
- `tests/app-contract.test.mjs`: layout conformance test pinning the four
  regions and the preserved real live preview.

No state, pending-edit scope, save-target, fork/save or palette-refresh
semantics changed.

## Evidence

- `make gates` (worktree `.worktrees/FIX-001/`):
  - `make test` — all suites pass (`theme-keys`, `btop-conf`, `key-map`,
    `key-widgets-verify`, `theme-model`, `schematic`, `preview`, `targets`,
    `platform-consumption`; `unit.test.mjs` 7/7).
  - `make conformance` — 13/13, including the new
    “studio shell keeps the mock-v8 three-column hierarchy” test.
  - `make drift` — `OK: lib/key_widgets.json matches source (48 keys)`.
  - `make bundle` — `build/btop-theme-studio.js` (862332 bytes).
  - `make typecheck` — `OK: 0 errors in the ags-btop-theme-studio tree`.
- Visual check: ran the worktree app on the host display; window is 1400×900.
  Components shows the labelled schematic + key-coverage card; Live renders the
  real btop frame. Save/Revert, pending diff and palette picker unchanged.

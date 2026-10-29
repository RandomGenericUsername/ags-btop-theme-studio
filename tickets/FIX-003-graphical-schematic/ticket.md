---
id: FIX-003
title: "Render a real graphical btop schematic in the Components pane"
kind: bug
status: done
lane: direct
severity: S2
links:
  openspec: none
  bmad: none
worktree: .worktrees/FIX-003/
branch: ticket/FIX-003-graphical-schematic
repro: "Launch v0.1.2, open the Components tab and compare it against mock v8's btop schematic."
observed: "Components is a label-only grid: one uppercase box title plus one text line per schematic element. There are no box borders, meter bars, graph lines or live values, so the load / fixed-fill / preset / backdrop controls have no visible effect beyond a single sample meter in the key-coverage card."
expected: "Components reconstructs mock v8's btop schematic: the cpu, gpu, mem, net, disks and proc boxes with themed borders, titles, labels, values, meter bars and graph lines. Load / fixed fill / preset / backdrop visibly change it. Clicking a meter, graph or box header selects that element's theme key and drives the right-hand selection, picker and diagnosis; the real btop Live pane is unchanged."
---

# Render a real graphical btop schematic in the Components pane

## Repro

```bash
cd ags-btop-theme-studio
make gates
BT_INSTANCE=btop-fix003 ags run -d .   # select Components
```

Compare the Components pane with
`dotfiles-v3/openspec/changes/archive/2026-10-23-add-btop-theme-studio/prototype/btop-theme-studio-v8.html`.

## Observed

The Components pane is a label-only grid. Each box is an uppercase title plus
one text line per element (`cpu box outline`, `cpu total meter + graph`, …).
There are no borders, block meters, graph glyphs or values, so the load,
fixed-fill, preset and backdrop controls only affect the caption and a single
sample meter in the key-coverage card. The pane does not resemble btop or the
mock's `#btop` reconstruction.

## Expected

- Six btop boxes (cpu overview, gpu, mem, net, disks, cpu cores, proc) laid out
  as the mock does, filtered by the selected preset.
- Real graphical primitives: themed box borders, `┤ title ├` headers, dotted
  leaders, gradient meter bars (`█`) and graph lines (`▁▂▃▄▅▆▇█`), with labels
  and values.
- Colours resolved from the selected theme's map and palette ramp.
- Load / fixed-fill / preset / backdrop controls visibly change the schematic.
- Clicking a meter fill, meter background, graph, title or value selects its
  theme key and updates the right-hand selection, palette editor, pending diff
  and diagnosis.
- The Live pane remains the real `live/btop_live.py` capture.
- No text-only fallback: a missing value or colour becomes a drawn placeholder.

## Fix notes

Root cause: `renderSchematic()` only rendered `SchematicElement.label` into
`Gtk.Label`s. The model had the key associations, but the pane never turned
them into geometry.

The fix adds a pure `lib/schematic-graphics.ts` (gradient sampling, meter fill
counts, deterministic graph levels) and rewrites the Components renderer to
build the mock's btop tree from themed primitives. Every drawn element is a
button whose click selects its primary key; `highlight()` adds the themed
selection outline to every element painted by the picked key. The Live pane is
untouched.

## Evidence

Evidence: implementation commit on `ticket/FIX-003-graphical-schematic` (see
`git log`), tagged `v0.1.3`.

- `make gates` — PASS: test (all suites incl. `schematic-graphics`), conformance
  15/15, drift (48 keys), bundle (1,003,080 bytes), typecheck 0 in-tree errors.
  Log: `/tmp/opencode/fix003-gates.log`.
- `make live-tests` — 11 passed in 13.99 s (real btop on a pty). Log:
  `/tmp/opencode/fix003-live-tests.log`.
- Runtime audit (renamed instance `btop-fix003`, temp repo/install dirs, real
  state palette; AT-SPI drove the widgets):
  - Components renders cpu/gpu/mem/net/disks/proc with meters, graphs, borders
    and values: `/tmp/opencode/fix003-components.png`.
  - Clicking a `used_start` meter fill changed the right rail to `used_start`
    (`Value #575660`, `Resolved #575660`) and lit the used meters:
    `/tmp/opencode/fix003-components-selected.png`.
  - Load 35 → 80 changed the coverage label to `sample used meter · load 80%`
    and filled every meter/graph: `/tmp/opencode/fix003-components-load80.png`.
  - Fixed fill 25% changed the coverage label to `load 25%`:
    `/tmp/opencode/fix003-components-fill25.png`.
  - Preset 1 changed the caption to `boxes: cpu gpu proc`, hid mem/net/disks,
    and showed the hidden-module warning:
    `/tmp/opencode/fix003-components-preset1.png`.
  - Neutral backdrop repainted the stage and kept the selected key:
    `/tmp/opencode/fix003-components-backdrop.png`.
  - Live remains the real btop binary capture, with the caption and Refresh
    control pinned: `/tmp/opencode/fix003-live.png`.
- Limit: the schematic draws its primitives with Pango block glyphs (as btop
  and mock v8 do), so `meter_bg=""` cannot be literally transparent; the empty
  meter renders the `░` placeholder in `inactive_fg`. Live remains the truth for
  exact rendering.

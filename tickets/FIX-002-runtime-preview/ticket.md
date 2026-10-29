---
id: FIX-002
title: "Keep the real btop preview as the default stage and refresh it on theme changes"
kind: bug
status: done
lane: direct
severity: S2
links:
  openspec: none
  bmad: none
worktree: .worktrees/FIX-002/
branch: ticket/FIX-002-runtime-preview
repro: "Launch v0.1.1 from source in a renamed instance and inspect the initial center pane, then edit a colour and watch the center."
observed: "v0.1.0/source kept the real live btop preview in the center and always exposed its refresh action. v0.1.1 defaults to the Components pane, which is a label-only schematic with no meters, so the load/fill controls have no visible effect and the real preview is hidden until the user finds the Live tab. While Live is open, an edit leaves the captured frame stale until the user presses Refresh, so the primary preview is not integrated with edits."
expected: "The real btop preview is the default center stage (the Components tab remains available for the labelled schematic), it renders on launch, and theme edits while Live is active refresh it automatically after a short debounce. The Components sample meter responds to load/fill so those controls are visibly functional there too."
---

# Keep the real btop preview as the default stage

## Repro

See `tickets/FIX-001-visual-shell/ticket.md` for the visual pass. Runtime
reproduction used a renamed source instance so the installed v0.1.0 was not
disturbed; see **Evidence** below for the exact commands.

## Observed

- v0.1.0/source: the real `live/btop_live.py` frame sits in the center next to
  the schematic, and the refresh control is always present.
- v0.1.1: the window opens on **Components**; Comp is a label-only schematic
  with no meter graphics, so the load/fill controls appear inert and the center
  has a large dead area. The **Live** tab contains the real preview, but is not
  selected on launch.
- v0.1.1 while Live is active: changing a key/colour updates the pending diff
  but leaves the captured btop frame stale until **Refresh live preview** is
  pressed. The mock and the intended live-authoring loop expect the preview to
  follow edits.

## Expected

- Launch on **Live** (real btop), with **Components** still one click away.
- Render the live frame on launch.
- Debounce and re-render the live frame when the effective theme changes while
  Live is active; do not refresh on unrelated state (key selection, scope,
  target, load/highlight controls).
- Keep a visible sample meter in Components that uses `meterFill()` so the
  load/fill buttons have a visible effect without pretending to be btop's real
  geometry.

## Fix notes

The visual pass introduced this by making the two preview panes mutually
exclusive tabs and defaulting to the empty Components pane; v0.1.0 had the real
frame always in the center. The handlers themselves were not broken: the
runtime audit exercised theme actions, save targets, picker scopes, gradient,
transparency, fixes, diagnostics, diff, tabs, preset/load, live refresh, window
toggle and `palette-refresh`, all of which worked. The regression is the
preview's default/visibility and edit coupling.

The fix keeps the mock-v8 tabs but makes Live the default, renders it on launch,
and adds a debounced auto-refresh keyed on `currentId + serializeTheme(effective())`.
It also adds the Components sample meter.

Not caused by the visual pass and not changed here: the source-launch conflict
with a warm installed instance (`ags run -d .` forwards to the running
`btop-theme-studio` instance and exits with a malformed palette-refresh
response), the pre-existing `~/.dotfiles` repo-root default, and the pre-existing
`~/.local/share/dotfiles` install default. These are recorded for the parent
session; the visual pass did not touch them.

## Evidence

- Runtime audit (renamed temp instances, `/tmp/opencode/...`):
  - v0.1.1 handlers: theme selection, New/Duplicate/Delete/Fork, Active,
    generated repo/installed saves, authored save, ramp/color/named/transparent,
    all scopes, gradient add-middle, Reserve surface, Transparent meters,
    Revert, diagnosis, pending diff, preset 0, load 70/80, Live refresh,
    palette-refresh with pending edits, Escape hide, and `ags toggle` all
    executed without JS/GTK handler errors.
  - v0.1.0 baseline reproduced the same save files and selection behavior.
  - v0.1.1 default screenshot: `/tmp/opencode/audit-initial.png` (Components
    selected by default; real preview not visible).
  - v0.1.1 Live screenshot: `/tmp/opencode/audit-final.png` (real btop frame).
- v0.1.2 runtime (`/tmp/opencode/btop-fix002c` and `btop-v012-full`, renamed
  instances, temp repo/install dirs):
  - default pane is Live; initial status
    `Live preview rendered by the real btop binary (colors.btop).`
  - after a ramp edit the live-frame hash changed
    (`1916565302` → `2428434426`) without a manual refresh; after Revert it
    changed again (`3910954716`).
  - Components showed `sample used meter · load 35%` → `load 70%` → `load 50%`
    after the load/fill controls, proving those controls now have visible
    feedback.
  - full interaction audit: no `MISSING` or `ERROR` lines; all theme actions,
    saves, scopes, gradient, diagnosis, diff, tabs, preset/load, live refresh,
    palette-refresh and window toggle executed.
  - `make gates` — test/conformance (14/14)/drift/bundle/typecheck PASS.
- v0.1.1 is superseded: its primary preview was hidden behind the Live tab and
  its live frame lived in the outer canvas scroller, so after a refresh the
  outer scroll could land on the blank end of the capture and the caption /
  refresh controls scrolled away. v0.1.2 restores a dedicated live scroller and
  pins the controls.
